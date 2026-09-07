// Mock @/lib/chain for tests. publicClient returns a fake client whose verifyMessage
// behavior is driven by the global mock state from db-mock.ts.
import type { ChainKey } from "./chainPublic.ts";
import { getMock } from "./db-mock.ts";

export * from "./chainPublic.ts";

export function rpcUrl(_key: ChainKey): string | undefined {
  return undefined;
}

export function b20RpcUrl(): string {
  return "http://mock";
}

export function publicClient(_key: ChainKey): any {
  return {
    verifyMessage: async (_args: any): Promise<boolean> => {
      const m = getMock();
      if (m.verifyShouldThrow) throw new Error("mock RPC error");
      return m.verifyResult;
    },
  };
}
