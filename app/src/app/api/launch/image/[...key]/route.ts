import { NextResponse } from "next/server";
import { readImage } from "@/lib/launchpad/imageStore";

export const dynamic = "force-dynamic";

/** Serve a stored logo by key from whichever store is active (bucket or local folder). Immutable: keys are random and never rewritten. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const buf = await readImage(key.join("/"));
  if (!buf) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
}
