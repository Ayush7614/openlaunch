import { canonicalImageUrl } from "./images";
import { imagePublicBase } from "./imageStore";
import "server-only";
import { isAddress, type Address, type Hex } from "viem";
import { publicClient } from "@/lib/chain";
import { SITE_URL, chainIdOf, isChainKey, type ChainKey } from "@/lib/chainPublic";
import { maybeDb } from "@/lib/db";
import { LAUNCH_FACTORY_ABI } from "./abi";
import { DEFAULT_SUPPLY, launchpad } from "./config";

/**
 * Off-chain launch metadata. The form stores it BEFORE sending the launch tx,
 * keyed by the token address the factory will produce (predictToken is a pure
 * view), and passes `metadataURI = ${SITE_URL}/api/launch/meta/<token>` on-chain.
 * If the tx never lands the row is harmless (no launch row joins to it).
 */
export type MetaInput = { chain: ChainKey; launcher: string; salt: Hex; name: string; symbol: string; description?: string; image_url?: string; website?: string; x_handle?: string };

export const LIMITS = { name: 32, symbol: 10, description: 280 } as const;

export function validateMeta(m: Partial<MetaInput>): { ok: true; value: MetaInput } | { ok: false; error: string } {
  const name = (m.name ?? "").trim();
  const symbol = (m.symbol ?? "").trim().toUpperCase();
  if (!name || name.length > LIMITS.name) return { ok: false, error: `name: 1–${LIMITS.name} characters` };
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return { ok: false, error: "symbol: 1–10 letters or digits" };
  if (!isChainKey(m.chain)) return { ok: false, error: "chain: base | robinhood" };
  if (!m.launcher || !isAddress(m.launcher)) return { ok: false, error: "launcher: bad address" };
  if (!m.salt || !/^0x[0-9a-fA-F]{64}$/.test(m.salt)) return { ok: false, error: "salt: bad bytes32" };
  const description = (m.description ?? "").trim().slice(0, LIMITS.description) || undefined;
  const url = (v?: string) => {
    const s = (v ?? "").trim();
    if (!s) return undefined;
    try {
      const u = new URL(s);
      if (u.protocol !== "https:") return null;
      return u.toString().slice(0, 300);
    } catch {
      return null;
    }
  };
  const image_url = url(m.image_url);
  const website = url(m.website);
  if (image_url === null) return { ok: false, error: "image: https URL only" };
  if (website === null) return { ok: false, error: "website: https URL only" };
  const x_handle = (m.x_handle ?? "").trim().replace(/^@/, "").slice(0, 15) || undefined;
  if (x_handle && !/^[A-Za-z0-9_]{1,15}$/.test(x_handle)) return { ok: false, error: "x: letters, digits, _" };
  return { ok: true, value: { chain: m.chain, launcher: m.launcher, salt: m.salt as Hex, name, symbol, description, image_url, website, x_handle } };
}

export function metaUri(token: string): string {
  return `${SITE_URL}/api/launch/meta/${token.toLowerCase()}`;
}

/** Predict the token address for these params (metadataURI is part of the CREATE2 init hash, so it must be the final URI). */
export async function predictToken(m: MetaInput, uri: string): Promise<Address> {
  const factory = launchpad(m.chain).factory;
  if (!factory) throw new Error(`launchpad unconfigured on ${m.chain}`);
  return publicClient(m.chain).readContract({
    address: factory,
    abi: LAUNCH_FACTORY_ABI,
    functionName: "predictToken",
    args: [m.launcher as Address, m.salt, m.name, m.symbol, DEFAULT_SUPPLY, uri],
  });
}

/**
 * The URI must be known before the address (it is hashed in), and the address
 * before the URI (it is the key) — so the URI is keyed by the launcher's
 * (address, salt) pair instead, which is unique per launch by construction.
 */
export function metaUriFor(launcher: string, salt: Hex): string {
  return `${SITE_URL}/api/launch/meta/${launcher.toLowerCase()}/${salt.toLowerCase()}`;
}

export async function saveMeta(m: MetaInput): Promise<{ uri: string; token: Address }> {
  const db = maybeDb();
  if (!db) throw new Error("db unconfigured");
  const uri = metaUriFor(m.launcher, m.salt);
  const token = (await predictToken(m, uri)).toLowerCase() as Address;
  const cid = chainIdOf(m.chain);
  await db`
    INSERT INTO bb_launch_meta (chain_id, token, launcher, name, symbol, description, image_url, website, x_handle)
    VALUES (${cid}, ${token}, ${m.launcher.toLowerCase()}, ${m.name}, ${m.symbol}, ${m.description ?? null}, ${m.image_url ?? null}, ${m.website ?? null}, ${m.x_handle ?? null})
    ON CONFLICT (chain_id, token) DO UPDATE SET description = EXCLUDED.description, image_url = EXCLUDED.image_url, website = EXCLUDED.website, x_handle = EXCLUDED.x_handle
    WHERE bb_launch_meta.launcher = EXCLUDED.launcher AND NOT EXISTS (SELECT 1 FROM bb_launches l WHERE l.chain_id = bb_launch_meta.chain_id AND l.token = bb_launch_meta.token)`;
  return { uri, token };
}

export type MetaJson = { name: string; symbol: string; description?: string; image?: string; external_url?: string; x?: string; token?: string };

export async function readMeta(where: { chain?: ChainKey; token?: string; launcher?: string; salt?: string }): Promise<MetaJson | null> {
  const db = maybeDb();
  if (!db) return null;
  const chainCond = where.chain ? db`AND m.chain_id = ${chainIdOf(where.chain)}` : db``;
  const rows = where.token
    ? await db<{ token: string; name: string; symbol: string; description: string | null; image_url: string | null; website: string | null; x_handle: string | null }[]>`
        SELECT m.token, m.name, m.symbol, m.description, m.image_url, m.website, m.x_handle FROM bb_launch_meta m WHERE m.token = ${where.token.toLowerCase()} ${chainCond} ORDER BY m.created_at DESC LIMIT 1`
    : await db<{ token: string; name: string; symbol: string; description: string | null; image_url: string | null; website: string | null; x_handle: string | null }[]>`
        SELECT m.token, m.name, m.symbol, m.description, m.image_url, m.website, m.x_handle FROM bb_launch_meta m
        JOIN bb_launches l ON l.chain_id = m.chain_id AND l.token = m.token
        WHERE m.launcher = ${(where.launcher ?? "").toLowerCase()} AND l.metadata_uri = ${metaUriFor(where.launcher ?? "", (where.salt ?? "0x") as Hex)} LIMIT 1`;
  const r = rows[0];
  if (!r) return null;
  return { name: r.name, symbol: r.symbol, description: r.description ?? undefined, image: canonicalImageUrl(r.image_url, imagePublicBase()) ?? undefined, external_url: r.website ?? undefined, x: r.x_handle ?? undefined, token: r.token };
}
