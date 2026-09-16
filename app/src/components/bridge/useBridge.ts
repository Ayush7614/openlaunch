"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAccount, useBalance, useConfig, useReadContract, useSwitchChain } from "wagmi";
import { getAccount, getPublicClient, getWalletClient } from "wagmi/actions";
import { estimateTotalFee } from "viem/op-stack";
import { erc20Abi, parseEther, TransactionReceiptNotFoundError, type Address } from "viem";
import { BRIDGE_WALLET_CHAINS } from "@/lib/bridge/chains";
import { BRIDGE_CHAINS, bridgeCurrency, defaultBridgeAsset, isBridgeAssetSupported, isBridgeChainId, type BridgeAsset, type BridgeChainId, type BridgeQuote } from "@/lib/bridge/types";
import { bridgeGasBudget, bridgeRequest, bridgeRequestKey, changeBridgeRoute, hasMatchingDepositEvent, isHash, isMatchingSourceDeposit, mergeBridgeStatus, nativeSourceAmount, RELAY_DEPOSITORY, submitBridgeDeposit, transferIsTerminal, transferPhase, validateBridgeQuote, validateBridgeStatus, type BridgePhase, type BridgeRouteChange, type BridgeRouteInputs, type TrackedBridgeTransfer } from "@/lib/bridge/client";
import { BRIDGE_STORAGE_PREFIX, createBridgeTransferStore } from "@/lib/bridge/client-storage";
import { APPROVAL_STORAGE_PREFIX, approvalBlocksSubmission, createApprovalStore, hasMatchingApprovalEvent, isMatchingApprovalTransaction, reconcileApproval, submitExactApproval, validateApprovalMetadata } from "@/lib/bridge/approval";

export type { BridgePhase, TrackedBridgeTransfer } from "@/lib/bridge/client";

// Created without touching window: the server snapshot and first client render
// are neutral. Storage is loaded after hydration and is scoped to the account.
const transfers = createBridgeTransferStore(() => window.localStorage);
const approvals = createApprovalStore(() => window.localStorage);
type QuoteEnvelope = { quote: BridgeQuote; key: string; walletChainId?: number; requestedAt: number };
type Issue = { key: string; message: string } | null;
const messageOf = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const transferLockName = (address: Address) => `openlaunch:bridge:${address.toLowerCase()}`;

async function responseBody(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "The bridge service is temporarily unavailable. Try again.";
    throw new Error(message);
  }
  return body;
}

/** Mount once above the dialog so closing it never interrupts transfer recovery. */
export function useBridge() {
  const config = useConfig();
  const { address, chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [route, setRoute] = useState<BridgeRouteInputs>({ originChainId: 8453, destinationChainId: 4663, originAsset: "ETH", destinationAsset: "ETH", amount: "" });
  const { originChainId, destinationChainId, amount } = route;
  const originAsset = route.originAsset ?? defaultBridgeAsset(originChainId);
  const destinationAsset = route.destinationAsset ?? defaultBridgeAsset(destinationChainId);
  const inputCurrency = bridgeCurrency(originChainId, originAsset, "input");
  const inputIsToken = !/^0x0{40}$/.test(inputCurrency.address);
  const [envelope, setEnvelope] = useState<QuoteEnvelope | null>(null);
  const [activity, setActivity] = useState<{ key: string; phase: "idle" | "quoting" | "switching" | "confirming" }>({ key: "", phase: "idle" });
  const [issue, setIssue] = useState<Issue>(null);
  const [quoteIssue, setQuoteIssue] = useState<Issue>(null);
  const [statusIssue, setStatusIssue] = useState<Issue>(null);
  const [expiredId, setExpiredId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pollRevision, setPollRevision] = useState(0);
  const [approvalPollRevision, setApprovalPollRevision] = useState(0);
  const [approvalSending, setApprovalSending] = useState(false);
  const [approvalIssue, setApprovalIssue] = useState<Issue>(null);
  const [allowanceResult, setAllowanceResult] = useState<{ key: string; value: bigint | null; error: string | null } | null>(null);
  const actionLock = useRef(false);
  const quoteSequence = useRef(0);
  const quoteAbort = useRef<AbortController | null>(null);
  const inputs = useRef<BridgeRouteInputs>({ originChainId: 8453, destinationChainId: 4663, originAsset: "ETH", destinationAsset: "ETH", amount: "" });
  const snapshot = useSyncExternalStore(transfers.subscribe, transfers.getSnapshot, transfers.getServerSnapshot);
  const approvalSnapshot = useSyncExternalStore(approvals.subscribe, approvals.getSnapshot, approvals.getServerSnapshot);
  const walletKey = address?.toLowerCase() ?? "";
  const tracked = snapshot.transfers[walletKey] ?? null;
  const approval = approvalSnapshot.approvals[walletKey] ?? null;
  const approvalPending = approvalBlocksSubmission(approval);
  const storageError = snapshot.errors[walletKey] ?? approvalSnapshot.errors[walletKey] ?? null;
  const request = bridgeRequest(address, originChainId, amount, destinationChainId, originAsset, destinationAsset);
  const requestKey = bridgeRequestKey(request);
  const quote = envelope?.key === requestKey && envelope.walletChainId === walletChainId ? envelope.quote : null;
  const quoteExpired = !!quote && expiredId === quote.requestId;
  const allowanceLoading = !!quote?.approval && allowanceResult?.key !== quote.requestId;
  const approvalRequired = !!quote?.approval && (allowanceResult?.key !== quote.requestId || allowanceResult.value === null || allowanceResult.value < BigInt(quote.approval.amount));
  const sourceBalance = useBalance({ address, chainId: originChainId, query: { enabled: !!address, refetchInterval: 15_000 } });
  const tokenBalance = useReadContract({ address: inputCurrency.address, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, chainId: originChainId, query: { enabled: !!address && inputIsToken, refetchInterval: 15_000 } });
  const cancelQuote = useCallback(() => { quoteSequence.current++; quoteAbort.current?.abort(); }, []);

  useEffect(() => {
    if (!address) return;
    const refresh = () => {
      try { transfers.read(address); } catch { /* surfaced in the store */ }
      try { approvals.read(address); } catch { /* surfaced in the store */ }
    };
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === `${BRIDGE_STORAGE_PREFIX}${address.toLowerCase()}` || event.key === `${APPROVAL_STORAGE_PREFIX}${address.toLowerCase()}`) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [address]);

  // Existing quotes are hidden immediately by their wallet-chain key. Abort
  // in-flight responses as well; an old account's response cannot reappear.
  useEffect(() => cancelQuote, [address, walletChainId, cancelQuote]);

  useEffect(() => {
    if (!quote) return;
    const timer = window.setTimeout(() => setExpiredId(quote.requestId), Math.max(0, quote.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [quote]);

  useEffect(() => {
    if (!quote?.approval) return;
    let stopped = false;
    const pub = getPublicClient(config, { chainId: quote.originChainId });
    if (!pub) return;
    void Promise.all([pub.getChainId(), pub.readContract({ address: quote.approval.token, abi: erc20Abi, functionName: "allowance", args: [quote.address, RELAY_DEPOSITORY] })]).then(([chainId, value]) => {
      if (chainId !== quote.originChainId) throw new Error("The approval RPC reported a different network.");
      if (!stopped) setAllowanceResult({ key: quote.requestId, value, error: null });
    }).catch((error) => {
      if (!stopped) setAllowanceResult({ key: quote.requestId, value: null, error: messageOf(error, "Could not read USDC allowance. Request a new quote.") });
    });
    return () => { stopped = true; };
  }, [quote, config]);

  const approvalId = approval?.createdAt;
  const approvalHash = approval?.approvalHash;
  useEffect(() => {
    // An unknown broadcast cannot be resolved from allowance alone. Wait for
    // a wallet-returned or manually verified hash before polling its source chain.
    if (!address || !approvalId || !approvalHash) return;
    let stopped = false;
    let active = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped || active) return;
      active = true;
      clearTimeout(timer);
      try {
        const observed = approvals.getSnapshot().approvals[address.toLowerCase()];
        if (!observed || observed.createdAt !== approvalId || observed.approvalHash !== approvalHash) return;
        const pub = getPublicClient(config, { chainId: observed.chainId });
        if (!pub) throw new Error("Could not connect to the source network to check the approval.");
        const [chainId, allowance, receipt] = await Promise.all([
          pub.getChainId(),
          pub.readContract({ address: observed.token, abi: erc20Abi, functionName: "allowance", args: [address, RELAY_DEPOSITORY] }),
          pub.getTransactionReceipt({ hash: approvalHash }).catch((error) => {
            if (error instanceof TransactionReceiptNotFoundError) return null;
            throw error;
          }),
        ]);
        const apply = (persist: boolean) => {
          const current = approvals.read(address);
          if (stopped || !current || current.createdAt !== approvalId || current.approvalHash !== approvalHash || current.amount !== observed.amount) return;
          const next = reconcileApproval(current, { chainId, allowance, receipt });
          if (persist) {
            try { approvals.save(next); } catch { /* memory retains the receipt result */ }
          } else approvals.remember(next);
          setApprovalIssue(null);
        };
        if (navigator.locks) await navigator.locks.request(transferLockName(address), { ifAvailable: true }, (lock) => { if (lock) apply(true); });
        else apply(false);
      } catch (error) {
        if (!stopped) setApprovalIssue({ key: address.toLowerCase(), message: messageOf(error, "Approval status is temporarily unavailable. Checking will retry.") });
      } finally {
        active = false;
        const current = approvals.getSnapshot().approvals[address.toLowerCase()];
        if (!stopped && current?.createdAt === approvalId && current.approvalHash === approvalHash && approvalBlocksSubmission(current)) timer = setTimeout(() => void poll(), 8_000);
      }
    };
    void poll();
    const focus = () => { void poll(); };
    window.addEventListener("focus", focus);
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener("focus", focus); };
  }, [address, approvalId, approvalHash, approvalPollRevision, config]);

  const trackedId = tracked?.requestId;
  const settled = transferIsTerminal(tracked);
  useEffect(() => {
    if (!address || !trackedId || settled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let active = false;
    let failures = 0;
    const poll = async () => {
      if (stopped || active) return;
      active = true;
      clearTimeout(timer);
      controller = new AbortController();
      try {
        const observed = transfers.getSnapshot().transfers[address.toLowerCase()];
        const pub = observed ? getPublicClient(config, { chainId: observed.originChainId }) : undefined;
        const [provider, receipt] = await Promise.allSettled([
          fetch(`/api/bridge/status?requestId=${encodeURIComponent(trackedId)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) }).then(responseBody).then(validateBridgeStatus),
          observed?.sourceHash && pub ? Promise.all([pub.getChainId(), pub.getTransactionReceipt({ hash: observed.sourceHash })]).then(([chainId, result]) => chainId === observed.originChainId ? result : null) : Promise.resolve(null),
        ]);
        if (stopped) return;
        const applyStatus = async (persist: boolean) => {
          let current = transfers.read(address);
          if (stopped || !current || current.requestId !== trackedId || transferIsTerminal(current)) return;
          let next: TrackedBridgeTransfer;
          if (receipt.status === "fulfilled" && receipt.value?.status === "reverted" && receipt.value.transactionHash.toLowerCase() === current.sourceHash?.toLowerCase()) {
            next = { ...current, status: "failure", failureReason: "source-reverted" };
          } else {
            if (provider.status === "rejected") throw provider.reason;
            const status = provider.value;
            if (!current.sourceHash && status.inTxHashes[0] && pub) {
              const candidate = status.inTxHashes[0];
              const [chainId, transaction] = await Promise.all([pub.getChainId(), pub.getTransaction({ hash: candidate })]);
              if (chainId !== current.originChainId) throw new Error("The source RPC reported a different network. Tracking will retry.");
              const matched = isMatchingSourceDeposit(current, transaction) || hasMatchingDepositEvent(current, await pub.getTransactionReceipt({ hash: candidate }));
              if (!matched) throw new Error("Relay's source transaction could not be matched to this deposit. Tracking will retry.");
              current = { ...current, sourceHash: candidate };
            }
            next = mergeBridgeStatus(current, status);
          }
          if (stopped) return;
          if (persist) {
            try { transfers.save(next); } catch { /* retained in memory; pre-send recovery remains durable */ }
          } else transfers.remember(next);
          setStatusIssue(null);
          failures = 0;
        };
        if (navigator.locks) {
          await navigator.locks.request(transferLockName(address), { ifAvailable: true }, async (lock) => { if (lock) await applyStatus(true); });
        } else await applyStatus(false); // read-only recovery remains available in older browsers
      } catch (error) {
        if (stopped) return;
        failures++;
        setStatusIssue({ key: trackedId, message: messageOf(error, "Could not refresh transfer status. Tracking will retry.") });
      } finally {
        active = false;
        const current = transfers.getSnapshot().transfers[address.toLowerCase()];
        if (!stopped && current?.requestId === trackedId && !transferIsTerminal(current)) timer = setTimeout(() => void poll(), Math.min(30_000, 6_000 * 2 ** Math.min(failures, 3)));
      }
    };
    void poll();
    const focus = () => { void poll(); };
    window.addEventListener("focus", focus);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); window.removeEventListener("focus", focus); };
  }, [address, trackedId, settled, pollRevision, config]);

  function invalidateQuote() {
    cancelQuote();
    setEnvelope(null);
    setExpiredId(null);
    setQuoteIssue(null);
    setIssue(null);
    setActivity({ key: "", phase: "idle" });
  }

  function updateRoute(change: BridgeRouteChange) {
    if (actionLock.current || approvalPending || (tracked && !transferIsTerminal(tracked))) return;
    const next = changeBridgeRoute(inputs.current, change);
    inputs.current = next;
    setRoute(next);
    invalidateQuote();
  }

  function setOriginChainId(chainId: BridgeChainId) {
    if (isBridgeChainId(chainId)) updateRoute({ side: "origin", chainId });
  }

  function setDestinationChainId(chainId: BridgeChainId) {
    if (isBridgeChainId(chainId)) updateRoute({ side: "destination", chainId });
  }

  function setOriginAsset(asset: BridgeAsset) {
    if (isBridgeAssetSupported(inputs.current.originChainId, asset)) updateRoute({ side: "origin-asset", asset });
  }

  function setDestinationAsset(asset: BridgeAsset) {
    if (isBridgeAssetSupported(inputs.current.destinationChainId, asset)) updateRoute({ side: "destination-asset", asset });
  }

  function reverseRoute() { updateRoute({ side: "reverse" }); }

  function setAmount(value: string) {
    if (actionLock.current || approvalPending || (tracked && !transferIsTerminal(tracked))) return;
    const next = { ...inputs.current, amount: value };
    inputs.current = next;
    setRoute(next);
    invalidateQuote();
  }

  async function requestQuote() {
    if (actionLock.current || approvalPending || (tracked && !transferIsTerminal(tracked))) return;
    const connected = getAccount(config);
    const current = bridgeRequest(connected.address, inputs.current.originChainId, inputs.current.amount, inputs.current.destinationChainId, inputs.current.originAsset, inputs.current.destinationAsset);
    if (!current) {
      const currency = bridgeCurrency(inputs.current.originChainId, inputs.current.originAsset, "input");
      setQuoteIssue({ key: requestKey, message: !connected.address ? "Connect your wallet to get a quote." : `Enter a ${currency.symbol} amount greater than zero, with at most ${currency.decimals} decimal places.` });
      return;
    }
    const key = bridgeRequestKey(current);
    const sequence = ++quoteSequence.current;
    const requestedAt = Date.now();
    quoteAbort.current?.abort();
    const abort = new AbortController();
    quoteAbort.current = abort;
    setEnvelope(null);
    setExpiredId(null);
    setIssue(null);
    setQuoteIssue(null);
    setApprovalIssue(null);
    setActivity({ key, phase: "quoting" });
    try {
      if (approvalBlocksSubmission(approvals.read(current.address))) throw new Error("An approval is still being tracked. Wait for its confirmation before requesting a new quote.");
      const response = await fetch("/api/bridge/quote", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current), cache: "no-store",
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
      });
      const next = validateBridgeQuote(await responseBody(response), current, Date.now());
      const wallet = getAccount(config);
      if (sequence !== quoteSequence.current || wallet.address?.toLowerCase() !== current.address.toLowerCase() || wallet.chainId !== connected.chainId) return;
      setEnvelope({ quote: next, key, walletChainId: connected.chainId, requestedAt });
    } catch (error) {
      if (sequence !== quoteSequence.current || abort.signal.aborted) return;
      setQuoteIssue({ key, message: messageOf(error, "Could not get a quote. Try again.") });
    } finally {
      if (sequence === quoteSequence.current) setActivity({ key, phase: "idle" });
    }
  }

  async function approve() {
    if (actionLock.current || !quote?.approval || quoteExpired || approvalPending || (tracked && !transferIsTerminal(tracked))) return;
    actionLock.current = true;
    setApprovalSending(true);
    setApprovalIssue(null);
    const reviewed = quote;
    const operationKey = bridgeRequestKey(reviewed);
    setEnvelope(null);
    try {
      validateBridgeQuote(reviewed, reviewed, Date.now());
      const request = validateApprovalMetadata(reviewed.approval, reviewed.address, reviewed.originChainId);
      if (!navigator.locks) throw new Error("This browser cannot safely coordinate approvals between tabs. Use a current browser.");
      await navigator.locks.request(transferLockName(reviewed.address), { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error("A bridge or approval request is open in another tab. Check that tab before continuing.");
        const pub = getPublicClient(config, { chainId: reviewed.originChainId });
        if (!pub) throw new Error("Could not connect to the source network. Request a new quote.");
        let wallet: Awaited<ReturnType<typeof getWalletClient>> | undefined;
        const currentRequest = () => {
          const current = bridgeRequest(getAccount(config).address, inputs.current.originChainId, inputs.current.amount, inputs.current.destinationChainId, inputs.current.originAsset, inputs.current.destinationAsset);
          const deposit = transfers.read(reviewed.address);
          if (Date.now() >= reviewed.expiresAt || bridgeRequestKey(current) !== operationKey || (deposit && !transferIsTerminal(deposit))) return null;
          return request;
        };
        const result = await submitExactApproval(request, {
          now: Date.now,
          currentRequest,
          readWallet: async () => {
            if (!getAccount(config).address) return {};
            wallet = await getWalletClient(config);
            const [accounts, chainId] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
            return { address: getAccount(config).address?.toLowerCase() === accounts[0]?.toLowerCase() ? accounts[0] : undefined, chainId };
          },
          switchChain: (chainId) => switchChainAsync({ chainId }),
          prepare: async (owner, transaction) => {
            const call = { account: owner.address, to: transaction.to, data: transaction.data, value: transaction.value };
            const [chainId, balance, estimate, fees, allowance, selectedBalance, additional] = await Promise.all([
              pub.getChainId(), pub.getBalance({ address: owner.address }), pub.estimateGas(call), pub.estimateFeesPerGas(),
              pub.readContract({ address: transaction.to, abi: erc20Abi, functionName: "allowance", args: [owner.address, RELAY_DEPOSITORY] }),
              pub.readContract({ address: transaction.to, abi: erc20Abi, functionName: "balanceOf", args: [owner.address] }),
              reviewed.originChainId === 8453 ? estimateTotalFee(pub, call) : Promise.resolve(0n),
            ]);
            if (chainId !== reviewed.originChainId) throw new Error("The source RPC reported a different network.");
            if (selectedBalance < BigInt(owner.amount)) throw new Error("Not enough USDC for this approval amount. Reduce the amount and request a new quote.");
            if (allowance >= BigInt(owner.amount)) throw new Error("USDC allowance is already sufficient. Request a new quote to review the deposit.");
            if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined) throw new Error("Could not estimate approval fees. Request a new quote.");
            // Arc's token shares its gas balance; Base USDC has a separate ETH
            // gas balance. Reserve approval and quoted deposit costs in native units.
            const budget = bridgeGasBudget(nativeSourceAmount(reviewed), balance, estimate, fees.maxFeePerGas, parseEther(reviewed.sourceGas) + additional, BRIDGE_CHAINS[reviewed.originChainId].symbol);
            return { gas: budget.gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
          },
          readApproval: (owner) => approvals.read(owner),
          saveApproval: (record) => approvals.save(record),
          removeApproval: (owner) => approvals.remove(owner),
          send: (owner, transaction, gas) => {
            const connected = getAccount(config);
            if (!wallet || !currentRequest() || connected.address?.toLowerCase() !== owner.address.toLowerCase() || connected.chainId !== transaction.chainId) throw new Error("Wallet changed before approval submission");
            return wallet.sendTransaction({ account: owner.address, chain: BRIDGE_WALLET_CHAINS[transaction.chainId], to: transaction.to, data: transaction.data, value: 0n, ...gas });
          },
          phase: (phase) => setActivity({ key: operationKey, phase }),
        });
        if (result.kind === "rejected") setApprovalIssue({ key: reviewed.address.toLowerCase(), message: "You declined the approval. No bridge deposit was requested. Request a new quote when ready." });
        if (result.kind === "uncertain") setApprovalIssue({ key: reviewed.address.toLowerCase(), message: "The wallet did not return an approval hash. Check this approval before trying again; no bridge deposit was requested." });
      });
    } catch (error) {
      setApprovalIssue({ key: reviewed.address.toLowerCase(), message: messageOf(error, "Could not prepare USDC approval. Request a new quote.") });
    } finally {
      actionLock.current = false;
      setApprovalSending(false);
      setActivity({ key: operationKey, phase: "idle" });
      void sourceBalance.refetch();
      if (inputIsToken) void tokenBalance.refetch();
    }
  }

  async function recoverApproval(hash: string) {
    if (actionLock.current || !address || !approval || approval.approvalHash || approval.status !== "uncertain") return;
    if (!isHash(hash) || /^0x0+$/.test(hash)) {
      setApprovalIssue({ key: address.toLowerCase(), message: "Enter the approval transaction hash from your wallet or its source explorer." });
      return;
    }
    actionLock.current = true;
    setApprovalSending(true);
    setApprovalIssue(null);
    try {
      if (!navigator.locks) throw new Error("Open this page in a current browser to safely recover the approval.");
      await navigator.locks.request(transferLockName(address), { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error("A bridge request is open in another tab. Check it before recovering this approval.");
        const current = approvals.read(address);
        if (!current || current.createdAt !== approval.createdAt || current.approvalHash) throw new Error("The saved approval changed. Review its current status.");
        const pub = getPublicClient(config, { chainId: current.chainId });
        if (!pub) throw new Error("Could not connect to the approval's network. Try checking again.");
        const [chainId, transaction, receipt, allowance] = await Promise.all([
          pub.getChainId(), pub.getTransaction({ hash }), pub.getTransactionReceipt({ hash }),
          pub.readContract({ address: current.token, abi: erc20Abi, functionName: "allowance", args: [address, RELAY_DEPOSITORY] }),
        ]);
        if (chainId !== current.chainId || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error("The transaction could not be verified on the approval's network.");
        const block = await pub.getBlock({ blockNumber: receipt.blockNumber });
        const blockTime = Number(block.timestamp) * 1000;
        // Approvals have no unique order ID. Do not adopt a historical matching
        // approval; allow only a bounded clock difference from this wallet call.
        if (blockTime < current.createdAt - 30_000 || blockTime > Date.now() + 30_000) throw new Error("This transaction predates the saved approval or your clock differs from the network. Check the hash and device clock.");
        if (!isMatchingApprovalTransaction(current, transaction) && !hasMatchingApprovalEvent(current, receipt)) throw new Error("That transaction does not match this wallet's exact USDC approval.");
        const next = reconcileApproval({ ...current, approvalHash: hash }, { chainId, allowance, receipt });
        approvals.save(next);
      });
    } catch (error) {
      setApprovalIssue({ key: address.toLowerCase(), message: messageOf(error, "Could not verify that approval. Nothing was submitted; check again.") });
    } finally {
      actionLock.current = false;
      setApprovalSending(false);
    }
  }

  async function confirm() {
    if (actionLock.current || !quote || quoteExpired || approvalPending || allowanceLoading || approvalRequired || (tracked && !transferIsTerminal(tracked))) return;
    actionLock.current = true;
    setSending(true);
    setIssue(null);
    const reviewed = quote;
    const reviewedAt = envelope?.requestedAt ?? 0;
    const operationKey = bridgeRequestKey(reviewed);
    setActivity({ key: operationKey, phase: "switching" });
    // Never reuse this review after an interrupted/rejected confirmation.
    setEnvelope(null);
    try {
      const execute = async () => {
        const approvalRecord = approvals.read(reviewed.address);
        if (approvalBlocksSubmission(approvalRecord)) throw new Error("An approval is still being tracked. Check it before depositing.");
        if (reviewed.approval && approvalRecord && reviewedAt <= approvalRecord.createdAt) throw new Error("Request and review a new quote after the approval before depositing.");
        let wallet: Awaited<ReturnType<typeof getWalletClient>> | undefined;
        const result = await submitBridgeDeposit(reviewed, {
          now: Date.now,
          currentRequest: () => bridgeRequest(getAccount(config).address, inputs.current.originChainId, inputs.current.amount, inputs.current.destinationChainId, inputs.current.originAsset, inputs.current.destinationAsset),
          readWallet: async () => {
            const connected = getAccount(config);
            if (!connected.address) return {};
            wallet = await getWalletClient(config);
            const [accounts, chainId] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
            // Both Wagmi and the provider must still identify the reviewed account.
            const latest = getAccount(config);
            return { address: latest.address?.toLowerCase() === accounts[0]?.toLowerCase() ? accounts[0] : undefined, chainId };
          },
          switchChain: (chainId) => switchChainAsync({ chainId }),
          prepare: async (q) => {
            const pub = getPublicClient(config, { chainId: q.originChainId });
            if (!pub) throw new Error("Could not connect to the source network. Try again.");
            const transaction = { account: q.address, to: q.transaction.to, data: q.transaction.data, value: BigInt(q.transaction.value) };
            const [rpcChain, balance, estimate, fees, additional, allowance, selectedBalance] = await Promise.all([
              pub.getChainId(), pub.getBalance({ address: q.address }), pub.estimateGas(transaction), pub.estimateFeesPerGas(),
              // Base charges L1 data/operator fees in addition to execution gas.
              // Reserving the total estimate here is intentionally conservative.
              q.originChainId === 8453 ? estimateTotalFee(pub, transaction) : Promise.resolve(0n),
              q.approval ? pub.readContract({ address: q.approval.token, abi: erc20Abi, functionName: "allowance", args: [q.address, RELAY_DEPOSITORY] }) : Promise.resolve(null),
              q.approval ? pub.readContract({ address: q.approval.token, abi: erc20Abi, functionName: "balanceOf", args: [q.address] }) : Promise.resolve(null),
            ]);
            if (rpcChain !== q.originChainId) throw new Error("The source RPC reported a different network. Try again later.");
            if (q.approval && (allowance === null || allowance < BigInt(q.amount))) throw new Error("USDC allowance is no longer sufficient. Request a new quote and approve the exact amount.");
            if (q.approval && (selectedBalance === null || selectedBalance < BigInt(q.amount))) throw new Error("Not enough USDC for this deposit. Reduce the amount and request a new quote.");
            if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined) throw new Error("Could not estimate network fees. Try again.");
            const budget = bridgeGasBudget(nativeSourceAmount(q), balance, estimate, fees.maxFeePerGas, additional, BRIDGE_CHAINS[q.originChainId].symbol);
            return { gas: budget.gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
          },
          readTransfer: (owner) => transfers.read(owner),
          saveTransfer: (transfer) => transfers.save(transfer),
          removeTransfer: (owner) => transfers.remove(owner),
          send: (q, gas) => {
            const connected = getAccount(config);
            if (!wallet || connected.address?.toLowerCase() !== q.address.toLowerCase() || connected.chainId !== q.originChainId) throw new Error("Wallet changed before submission");
            return wallet.sendTransaction({ account: q.address, chain: BRIDGE_WALLET_CHAINS[q.originChainId], to: q.transaction.to, data: q.transaction.data, value: BigInt(q.transaction.value), ...gas });
          },
          phase: (phase) => setActivity({ key: operationKey, phase }),
        });
        if (result.kind === "rejected") setIssue({ key: reviewed.address.toLowerCase(), message: "You declined the wallet request. No transfer was submitted. Request a new quote when you're ready." });
        if (result.kind === "uncertain") setIssue({ key: reviewed.address.toLowerCase(), message: "The wallet did not return a transaction hash. The transfer may have been submitted. Keep tracking this request before trying again." });
      };
      // Keep the lock across the wallet prompt: two tabs must never replace
      // one another's recovery record or prompt for two deposits.
      if (navigator.locks) {
        await navigator.locks.request(transferLockName(reviewed.address), { ifAvailable: true }, async (lock) => {
          if (!lock) throw new Error("A bridge request is already open in another tab. Check that tab before continuing.");
          await execute();
        });
      } else throw new Error("This browser cannot safely coordinate bridge requests between tabs. Open Openlaunch in a current browser to continue.");
    } catch (error) {
      setIssue({ key: reviewed.address.toLowerCase(), message: messageOf(error, "Could not prepare the transfer. Request a new quote and try again.") });
    } finally {
      actionLock.current = false;
      setSending(false);
      setActivity({ key: operationKey, phase: "idle" });
      void sourceBalance.refetch();
      if (inputIsToken) void tokenBalance.refetch();
    }
  }

  function reset() {
    if (actionLock.current || approvalPending || (tracked && !transferIsTerminal(tracked))) return;
    if (address && tracked) {
      const requestId = tracked.requestId;
      if (!navigator.locks) return;
      void navigator.locks.request(transferLockName(address), { ifAvailable: true }, (lock) => {
        if (!lock) return;
        try {
          const current = transfers.read(address);
          if (current?.requestId !== requestId || !transferIsTerminal(current)) return;
          transfers.remove(address);
          invalidateQuote();
          setStatusIssue(null);
        } catch { /* storage warning is exposed in the store */ }
      });
    } else { invalidateQuote(); setStatusIssue(null); }
  }

  const retryStatus = useCallback(() => setPollRevision((value) => value + 1), []);
  const retryApproval = useCallback(() => setApprovalPollRevision((value) => value + 1), []);
  const activePhase = activity.key === requestKey ? activity.phase : "idle";
  const phase: BridgePhase = sending && (activePhase === "switching" || activePhase === "confirming") ? activePhase : tracked ? transferPhase(tracked) : activePhase === "quoting" ? "quoting" : quote ? "review" : "idle";
  return {
    address, walletChainId, originChainId, destinationChainId, originAsset, destinationAsset, setOriginAsset, setDestinationAsset, setOriginChainId, setDestinationChainId, reverseRoute, amount, setAmount,
    balance: inputIsToken ? tokenBalance.data : sourceBalance.data?.value,
    nativeBalance: sourceBalance.data?.value,
    balanceLoading: !!address && (inputIsToken ? tokenBalance.isPending : sourceBalance.isPending),
    balanceError: (inputIsToken ? tokenBalance.isError : sourceBalance.isError) ? "Could not read your source balance. It will be checked again before submission." : null,
    quote, phase, error: tracked?.failureReason === "source-reverted" ? "The source transaction reverted on-chain. The deposit was not made; network gas was still charged." : issue?.key === walletKey ? issue.message : null,
    quoteError: quoteIssue?.key === requestKey ? quoteIssue.message : null,
    quoteExpired, requestQuote, confirm, reset, tracked,
    approval, approvalRequired, allowanceLoading, approvalBusy: approvalSending,
    approvalError: approvalIssue?.key === walletKey ? approvalIssue.message : quote && allowanceResult?.key === quote.requestId ? allowanceResult.error : null,
    approve, retryApproval, recoverApproval,
    statusError: statusIssue && statusIssue.key === trackedId ? statusIssue.message : null,
    retryStatus, storageError, busy: sending || approvalSending || approvalPending || activePhase === "quoting",
    canReset: !sending && !approvalSending && !approvalPending && (!tracked || transferIsTerminal(tracked)),
  };
}

export default useBridge;
