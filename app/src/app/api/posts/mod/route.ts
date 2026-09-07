import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/launchpad/editServer";
import { moderate } from "@/lib/launchpad/postsServer";

export const dynamic = "force-dynamic";

/** POST {action: hide|unhide|mute|unmute, target: post:<id> | token:<chain>:<addr>, wallet, nonce, ts, signature} */
export async function POST(req: Request) {
  const ip = (req.headers.get("fly-client-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
  if (rateLimited(`mod:ip:${ip}`, 30)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (typeof b.wallet !== "string") return NextResponse.json({ error: "bad params" }, { status: 400 });
  const r = await moderate({ action: b.action, target: b.target, wallet: b.wallet, nonce: b.nonce, ts: b.ts, signature: b.signature });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
