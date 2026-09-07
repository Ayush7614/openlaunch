import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/launchpad/editServer";
import { IMAGE_MAX_BYTES, IMAGE_UPLOADS_PER_HOUR, checkUpload, isWalletParam, randomImageKey } from "@/lib/launchpad/images";
import { toLogoWebp } from "@/lib/launchpad/imageProcess";
import { imageUploadsEnabled, putImage } from "@/lib/launchpad/imageStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOUR = 60 * 60_000;

/**
 * POST multipart {wallet, file} → {url}. Token logo upload for the launch form / edit sheet.
 * Order: wallet + rate limits → size (Content-Length, then real bytes) → magic bytes → sharp re-encode
 * to a 512² WebP (metadata stripped; the decoder is the validator) → random key → public bucket.
 * The URL then flows through the normal metadata path (https-only rule, signed edits) unchanged.
 */
export async function POST(req: Request) {
  if (!imageUploadsEnabled()) return NextResponse.json({ error: "uploads not configured" }, { status: 503 });
  const ip = (req.headers.get("fly-client-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
  if (rateLimited(`img:ip:${ip}`, IMAGE_UPLOADS_PER_HOUR * 2, HOUR)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > IMAGE_MAX_BYTES + 16 * 1024) return NextResponse.json({ error: "image must be ≤ 2 MB" }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad form" }, { status: 400 });
  }
  const wallet = form.get("wallet");
  const file = form.get("file");
  if (!isWalletParam(wallet)) return NextResponse.json({ error: "connect a wallet first" }, { status: 400 });
  if (!(file instanceof Blob)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (rateLimited(`img:wallet:${wallet.toLowerCase()}`, IMAGE_UPLOADS_PER_HOUR, HOUR)) return NextResponse.json({ error: "upload limit reached, try later" }, { status: 429 });
  if (file.size > IMAGE_MAX_BYTES) return NextResponse.json({ error: "image must be ≤ 2 MB" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pre = checkUpload(bytes);
  if (!pre.ok) return NextResponse.json({ error: pre.error }, { status: pre.status });

  let out: Buffer;
  try {
    out = await toLogoWebp(bytes);
  } catch (e) {
    const msg = e instanceof Error && /too small/.test(e.message) ? e.message : "not a valid image";
    return NextResponse.json({ error: msg }, { status: 415 });
  }
  try {
    const url = await putImage(randomImageKey(), out);
    return NextResponse.json({ url, bytes: out.length }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.warn("[image] store failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "storage error, try again" }, { status: 502 });
  }
}
