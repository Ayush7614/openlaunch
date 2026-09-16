import "server-only";
import { BridgeApiError, isRequestId, parseBridgeRequest, parseRelayStatus, validateRelayChains, validateRelayQuote } from "./validation";
import { bridgeCurrency, type BridgeQuote, type BridgeQuoteRequest, type BridgeStatusResponse } from "./types";

const RELAY_API = "https://api.relay.link";
const UPSTREAM_TIMEOUT_MS = 12_000;
export const BRIDGE_PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store" };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Count streamed bytes, not Content-Length alone; cap reads even for chunked bodies. */
export async function readBridgeJson(body: ReadableStream<Uint8Array> | null, maxBytes: number, timeoutMs = 8_000): Promise<unknown> {
  if (!body) throw new BridgeApiError("Invalid JSON body.", 400);
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BridgeApiError("The bridge request timed out. Please try again.", 504)), timeoutMs); });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new BridgeApiError("The request is too large.", 413);
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof BridgeApiError) throw error;
    throw new BridgeApiError("Invalid JSON body.", 400);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

async function relayJson(path: string, init: RequestInit, maxBytes: number, fetcher: Fetcher): Promise<unknown> {
  try {
    const response = await fetcher(`${RELAY_API}${path}`, {
      ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", ...(process.env.RELAY_API_KEY ? { "x-api-key": process.env.RELAY_API_KEY } : {}) },
    });
    if (response.status === 429) throw new BridgeApiError("The bridge is busy. Please try again shortly.", 429);
    if (response.status === 404) throw new BridgeApiError("Bridge status is not available yet. Please try again.", 404);
    if (!response.ok) throw new BridgeApiError("No bridge quote is available for this amount. Please try again.", response.status >= 500 ? 503 : 422);
    return await readBridgeJson(response.body, maxBytes, UPSTREAM_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof BridgeApiError && [429, 404, 422, 503].includes(error.status)) throw error;
    throw new BridgeApiError("The bridge service is unavailable. Please try again.", 502);
  }
}

export async function getBridgeQuote(request: BridgeQuoteRequest, fetcher: Fetcher = fetch, now: () => number = Date.now): Promise<BridgeQuote> {
  const input = parseBridgeRequest(request);
  const [chains, quote] = await Promise.all([
    relayJson("/chains", { method: "GET" }, 2_000_000, fetcher),
    relayJson("/quote/v2", { method: "POST", body: JSON.stringify({
      user: input.address, recipient: input.address, refundTo: input.address, originChainId: input.originChainId,
      destinationChainId: input.destinationChainId, originCurrency: bridgeCurrency(input.originChainId, input.originAsset, "input").address,
      destinationCurrency: bridgeCurrency(input.destinationChainId, input.destinationAsset, "output").address, amount: input.amount, tradeType: "EXACT_INPUT",
      explicitDeposit: true, includeProtocolData: true, slippageTolerance: "50",
    }) }, 128_000, fetcher),
  ]);
  try {
    return validateRelayQuote(quote, input, validateRelayChains(chains, input), now());
  } catch (error) {
    if (error instanceof BridgeApiError && error.status === 422) throw error;
    throw new BridgeApiError("The bridge returned an unverifiable quote. Please try again.");
  }
}

export async function getBridgeStatus(requestId: string, fetcher: Fetcher = fetch): Promise<BridgeStatusResponse> {
  if (!isRequestId(requestId)) throw new BridgeApiError("Invalid bridge request ID.", 400);
  const response = await relayJson(`/intents/status/v3?requestId=${encodeURIComponent(requestId)}`, { method: "GET" }, 32_000, fetcher);
  try { return parseRelayStatus(response); }
  catch { throw new BridgeApiError("The bridge returned an unreadable status. Please try again."); }
}

export function bridgeErrorResponse(error: unknown): Response {
  const known = error instanceof BridgeApiError ? error : new BridgeApiError("The bridge service is unavailable. Please try again.");
  return Response.json({ error: known.message }, { status: known.status, headers: { ...BRIDGE_PRIVATE_HEADERS, ...(known.status === 429 ? { "Retry-After": "5" } : {}) } });
}
