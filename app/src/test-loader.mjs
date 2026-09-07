// Test loader that:
// 1. Maps @/* tsconfig path alias to ./src/*
// 2. Replaces @/lib/db and @/lib/chain with mocks when TEST_MOCK_DB=1
// 3. Adds react-server condition so server-only resolves to empty.js
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./", import.meta.url));
const mockDb = process.env.TEST_MOCK_DB === "1";

export async function resolve(specifier, context, next) {
  if (typeof specifier === "string" && specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    if (mockDb && (rel === "lib/db" || rel === "lib/db.ts")) {
      return { url: new URL("./src/lib/db-mock.ts", root).href, shortCircuit: true };
    }
    if (mockDb && (rel === "lib/chain" || rel === "lib/chain.ts")) {
      return { url: new URL("./src/lib/chain-mock.ts", root).href, shortCircuit: true };
    }
    return next(new URL("./src/" + rel, root).href, context);
  }
  return next(specifier, context);
}
