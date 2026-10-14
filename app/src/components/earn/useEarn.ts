"use client";

import { useRef, useState } from "react";
import { useBalance, useConfig, useReadContract, useReadContracts, useSwitchChain } from "wagmi";
import { getCapabilities, getPublicClient, getWalletClient, sendCalls, waitForCallsStatus } from "wagmi/actions";
import type { Address, Hex } from "viem";
import { useHydratedAccount } from "@/lib/useHydratedAccount";
import { BUILDER_DATA_SUFFIX, CHAINS } from "@/lib/chainPublic";
import { ERC20_MIN_ABI } from "@/lib/launchpad/abi";
import { EARN_VAULT_ABI } from "@/lib/earn/abi";
import { EARN_BATCH_CAPABILITIES, approveCall, canBatch, depositCall, redeemCall, withdrawCall, type EarnCall } from "@/lib/earn/calls";
import { cleanAmountInput, depositProblem, fmtAmount, maxInput, parseAmount, withdrawPlan, withdrawProblem } from "@/lib/earn/math";
import { pausedCopy, readTerms, termsCheck, type TermsCheck } from "@/lib/earn/terms";
import type { EarnVault } from "@/lib/earn/vaults";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/components/launchpad/TxToasts";

/**
 * Earn's state and its two actions, for one vault and the connected wallet.
 *
 * Reads (balance, allowance, shares, what the shares redeem for) go through the same-origin RPC proxy like every other
 * read in the app. Writes follow TradePanel: a synchronous lock before the first await, a network switch if needed, a
 * simulation before every signature, then the receipt. Every write is credited to openlaunch's builder code
 * (lib/earn/calls.ts): one-at-a-time wallets via `dataSuffix`, batching smart wallets via `sendCalls` with the suffix on
 * each call and as the `dataSuffix` capability. Approvals are for the exact amount, never unlimited.
 */
export type EarnTab = "deposit" | "withdraw";
export type EarnPhase =
  | { k: "idle" }
  | { k: "preparing" }
  | { k: "approving" }
  | { k: "signing" }
  | { k: "sent"; hash: Hex | null }
  | { k: "done"; hash: Hex | null; tab: EarnTab; amount: bigint }
  | { k: "error"; message: string };

/** The wallet's USDC, its vault shares and what they redeem for now. Shared by the /me card and the dialog. */
export function useEarnPosition(vault: EarnVault, address: Address | undefined) {
  const chainId = CHAINS[vault.chain].id;
  const on = Boolean(address);
  const usdc = useReadContract({ address: vault.asset, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: address ? [address] : undefined, chainId, query: { enabled: on, refetchInterval: 15_000 } });
  const shares = useReadContract({ address: vault.address, abi: EARN_VAULT_ABI, functionName: "balanceOf", args: address ? [address] : undefined, chainId, query: { enabled: on, refetchInterval: 15_000 } });
  const held = shares.data;
  const redeem = useReadContract({ address: vault.address, abi: EARN_VAULT_ABI, functionName: "previewRedeem", args: held !== undefined ? [held] : undefined, chainId, query: { enabled: on && held !== undefined && held > 0n, refetchInterval: 15_000 } });
  const allowance = useReadContract({ address: vault.asset, abi: ERC20_MIN_ABI, functionName: "allowance", args: address ? [address, vault.address] : undefined, chainId, query: { enabled: on, refetchInterval: 15_000 } });
  return {
    balance: usdc.data,
    shares: held,
    /** What every share redeems for right now (0 with no shares, undefined while reading). */
    position: held === undefined ? undefined : held === 0n ? 0n : redeem.data,
    allowance: allowance.data,
    unreadable: Boolean(usdc.error || shares.error || redeem.error),
    refetch: () => Promise.all([usdc.refetch(), shares.refetch(), redeem.refetch(), allowance.refetch()]),
  };
}

/** Earn's form state, its reads and its two actions for one vault and the connected wallet (see the file comment). */
export default function useEarn(vault: EarnVault, initialTab: EarnTab) {
  const config = useConfig();
  const chainId = CHAINS[vault.chain].id;
  const { address, isConnected, chainId: walletChain } = useHydratedAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const position = useEarnPosition(vault, address);
  const gas = useBalance({ address, chainId, query: { enabled: Boolean(address), refetchInterval: 30_000 } });
  const [tab, setTabState] = useState<EarnTab>(initialTab);
  const [text, setText] = useState("");
  // "Withdraw all" stays all even as interest grows the position after the tap, so no dust share is left behind
  const [all, setAll] = useState(false);
  const [phase, setPhase] = useState<EarnPhase>({ k: "idle" });
  const lock = useRef(false);
  // The vault's terms, re-read every minute while the card is open (one multicall). The pause is derived from this on
  // every render (lib/earn/terms.ts depositPause), never stored, so it lifts by itself when the terms are back.
  const at = { address: vault.address, abi: EARN_VAULT_ABI, chainId } as const;
  const terms = useReadContracts({
    contracts: [
      { ...at, functionName: "asset" },
      { ...at, functionName: "performanceFee" },
      { ...at, functionName: "managementFee" },
      { ...at, functionName: "receiveSharesGate" },
      { ...at, functionName: "sendSharesGate" },
      { ...at, functionName: "receiveAssetsGate" },
      { ...at, functionName: "sendAssetsGate" },
    ],
    allowFailure: false,
    query: { refetchInterval: 60_000 },
  });
  const t = terms.data;
  const liveTerms: TermsCheck | null = t ? termsCheck(vault, { asset: t[0], performanceFee: t[1], managementFee: t[2], gates: [t[3], t[4], t[5], t[6]] }) : null;

  const decimals = vault.assetDecimals;
  const typed = parseAmount(text, decimals);
  const amount = tab === "withdraw" && all ? (position.position ?? null) : typed;
  const busy = phase.k === "preparing" || phase.k === "approving" || phase.k === "signing" || phase.k === "sent";
  const onChain = walletChain === chainId;
  const problem = tab === "deposit" ? depositProblem({ amount, balance: position.balance }) : withdrawProblem({ amount, shares: position.shares, position: position.position });
  const needsApproval = tab === "deposit" && amount !== null && position.allowance !== undefined ? position.allowance < amount : null;

  /** An edit clears a finished or failed result, so the form reads fresh. */
  const settle = () => { if (phase.k === "done" || phase.k === "error") setPhase({ k: "idle" }); };
  /** Switches between Deposit and Withdraw with an empty amount; ignored while a transaction is in flight. */
  function setTab(next: EarnTab) {
    if (busy) return;
    setTabState(next);
    setText("");
    setAll(false);
    settle();
  }
  /** The amount field's text, cleaned (lib/earn/math.ts cleanAmountInput); typing ends a "withdraw all". */
  function setAmount(raw: string) {
    setText(cleanAmountInput(raw, decimals));
    setAll(false);
    settle();
  }
  /** Max: the whole wallet balance on Deposit; on Withdraw, the whole position as "withdraw all". */
  function setMax() {
    if (tab === "deposit") setText(maxInput(position.balance ?? 0n, decimals));
    else {
      setText(maxInput(position.position ?? 0n, decimals));
      setAll(true);
    }
    settle();
  }

  /** The explicit "Switch to Base" step, before the form offers to send anything. */
  async function switchToVaultChain() {
    try {
      await switchChainAsync({ chainId });
    } catch (err) {
      setPhase({ k: "error", message: friendlyError(err) });
    }
  }

  /** Whether this wallet already executes atomic batches; any doubt means the one-at-a-time path. */
  async function batching(account: Address): Promise<boolean> {
    try {
      return canBatch(await getCapabilities(config, { account, chainId }));
    } catch {
      return false;
    }
  }

  /** Sends through the wallet's batch API with the builder-code capability; resolves to the last transaction hash. */
  async function sendBatch(account: Address, calls: EarnCall[]): Promise<Hex | null> {
    setPhase({ k: "signing" });
    const { id } = await sendCalls(config, { account, chainId, calls, capabilities: EARN_BATCH_CAPABILITIES, forceAtomic: true });
    setPhase({ k: "sent", hash: null });
    const result = await waitForCallsStatus(config, { id, timeout: 180_000 });
    const receipts = result.receipts ?? [];
    if (result.status !== "success" || receipts.some((r) => r.status !== "success")) throw new Error("Your wallet reports the transaction failed. Check its activity before trying again.");
    return receipts.at(-1)?.transactionHash ?? null;
  }

  /** Deposits the amount: fresh terms and balance checks, an exact approval only if short, simulate, send, receipt. */
  async function deposit() {
    if (!address || amount === null || problem || busy || lock.current) return;
    // Lock before the first await, including the network switch and the vault check.
    lock.current = true;
    setPhase({ k: "preparing" });
    try {
      if (!onChain) await switchChainAsync({ chainId });
      const pub = getPublicClient(config, { chainId })!;
      // authoritative: read fresh at send time, whatever the polled terms said
      const check = termsCheck(vault, await readTerms(pub, vault));
      if (!check.ok) {
        void terms.refetch(); // the form shows the pause now, not at the next poll
        throw new Error(pausedCopy(check.reason));
      }
      const [balance, allowance] = await Promise.all([
        pub.readContract({ address: vault.asset, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [address] }),
        pub.readContract({ address: vault.asset, abi: ERC20_MIN_ABI, functionName: "allowance", args: [address, vault.address] }),
      ]);
      if (amount > balance) throw new Error("That is more USDC than this wallet holds.");
      let hash: Hex | null;
      if (await batching(address)) {
        // one prompt; atomic, so a failed deposit takes the approval back with it
        hash = await sendBatch(address, allowance < amount ? [approveCall(vault, amount), depositCall(vault, amount, address)] : [depositCall(vault, amount, address)]);
      } else {
        const wallet = await getWalletClient(config, { chainId });
        if (allowance < amount) {
          setPhase({ k: "approving" });
          const approval = await wallet.writeContract({ address: vault.asset, abi: ERC20_MIN_ABI, functionName: "approve", args: [vault.address, amount], dataSuffix: BUILDER_DATA_SUFFIX });
          const rc = await pub.waitForTransactionReceipt({ hash: approval });
          if (rc.status !== "success") throw new Error("The approval reverted on-chain. Nothing was deposited.");
        }
        const { request } = await pub.simulateContract({ address: vault.address, abi: EARN_VAULT_ABI, functionName: "deposit", args: [amount, address], account: address, dataSuffix: BUILDER_DATA_SUFFIX });
        setPhase({ k: "signing" });
        hash = await wallet.writeContract(request);
        setPhase({ k: "sent", hash });
        const rc = await pub.waitForTransactionReceipt({ hash });
        if (rc.status !== "success") throw new Error("The deposit reverted on-chain.");
      }
      setPhase({ k: "done", hash, tab: "deposit", amount });
      toast({ kind: "info", title: `Deposited ${fmtAmount(amount, decimals)} ${vault.assetSymbol}`, sub: `Into ${vault.name}` });
      setText("");
      void position.refetch();
    } catch (err) {
      setPhase({ k: "error", message: friendlyError(err) });
    } finally {
      lock.current = false;
    }
  }

  /** Withdraws per withdrawPlan: every share for "withdraw all", else exactly the amount; simulate, send, receipt. */
  async function withdraw() {
    const plan = withdrawPlan({ amount, shares: position.shares, position: position.position });
    if (!address || !plan || problem || busy || lock.current) return;
    lock.current = true;
    setPhase({ k: "preparing" });
    try {
      if (!onChain) await switchChainAsync({ chainId });
      const pub = getPublicClient(config, { chainId })!;
      // "withdraw all" redeems the shares held at this moment, not the count from the last poll
      const held = await pub.readContract({ address: vault.address, abi: EARN_VAULT_ABI, functionName: "balanceOf", args: [address] });
      if (held <= 0n) throw new Error("Nothing is deposited from this wallet.");
      const call = plan.fn === "redeem" ? redeemCall(vault, held, address) : withdrawCall(vault, plan.assets, address);
      let hash: Hex | null;
      if (await batching(address)) {
        hash = await sendBatch(address, [call]);
      } else {
        const wallet = await getWalletClient(config, { chainId });
        if (plan.fn === "redeem") {
          const { request } = await pub.simulateContract({ address: vault.address, abi: EARN_VAULT_ABI, functionName: "redeem", args: [held, address, address], account: address, dataSuffix: BUILDER_DATA_SUFFIX });
          setPhase({ k: "signing" });
          hash = await wallet.writeContract(request);
        } else {
          const { request } = await pub.simulateContract({ address: vault.address, abi: EARN_VAULT_ABI, functionName: "withdraw", args: [plan.assets, address, address], account: address, dataSuffix: BUILDER_DATA_SUFFIX });
          setPhase({ k: "signing" });
          hash = await wallet.writeContract(request);
        }
        setPhase({ k: "sent", hash });
        const rc = await pub.waitForTransactionReceipt({ hash });
        if (rc.status !== "success") throw new Error("The withdrawal reverted on-chain.");
      }
      setPhase({ k: "done", hash, tab: "withdraw", amount: plan.assets });
      toast({ kind: "info", title: `Withdrew ${plan.fn === "redeem" ? "everything" : `${fmtAmount(plan.assets, decimals)} ${vault.assetSymbol}`}`, sub: `From ${vault.name}` });
      setText("");
      setAll(false);
      void position.refetch();
    } catch (err) {
      setPhase({ k: "error", message: friendlyError(err) });
    } finally {
      lock.current = false;
    }
  }

  return {
    vault,
    address,
    isConnected,
    onChain,
    switching,
    tab,
    setTab,
    text,
    setAmount,
    setMax,
    all,
    amount,
    problem,
    needsApproval,
    /** The live vault against the reviewed terms; null until the first read lands (or if it fails). */
    liveTerms,
    phase,
    busy,
    reset: () => { if (!busy) setPhase({ k: "idle" }); },
    balance: position.balance,
    shares: position.shares,
    position: position.position,
    unreadable: position.unreadable,
    noGas: gas.data !== undefined && gas.data.value === 0n,
    switchToVaultChain,
    submit: () => (tab === "deposit" ? deposit() : withdraw()),
  };
}

export type Earn = ReturnType<typeof useEarn>;
