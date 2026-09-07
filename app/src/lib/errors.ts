import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/** Friendly wallet / contract error text for the UI. */
const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  SaltUsed: "This salt was already used. Try again (a fresh salt is generated).",
  BadFee: "Fee out of range (max 3%).",
  BadTick: "Start price out of range.",
  BadSupply: "Supply too large.",
  QuoteOrdering: "Token address must sort above the quote. Try again with a new salt.",
  NoLiquidity: "Supply too small to seed liquidity.",
  UnknownPosition: "Unknown launch.",
  BadRecipients: "Beneficiary shares must add up to 100%.",
};

export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "You cancelled in your wallet.";
    const rev = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = rev?.data?.errorName;
    if (name && CONTRACT_ERROR_MESSAGES[name]) return CONTRACT_ERROR_MESSAGES[name];
    if (name) return `Reverted: ${name}`;
    const short = err.shortMessage || err.message;
    if (/insufficient funds/i.test(short)) return "Not enough ETH for this transaction plus gas.";
    if (/slippage|amountOutMinimum|TooLittleReceived|V4TooLittleReceived/i.test(short)) return "Price moved more than 1%. Try again.";
    return short.length > 200 ? `${short.slice(0, 200)}…` : short;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
