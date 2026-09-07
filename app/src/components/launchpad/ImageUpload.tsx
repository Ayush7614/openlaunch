"use client";

import { useId, useRef, useState } from "react";
import { helper, input as inputCls } from "@/components/ui";
import { IMAGE_MAX_BYTES, sniffImage } from "@/lib/launchpad/images";
import { Spinner } from "@/components/Skeleton";

/**
 * Token logo picker: drop zone / tap-to-browse → POST /api/launch/image → https URL into `value`.
 * The URL field stays available for people who already host a logo. Wallet must be connected
 * (uploads are rate-limited per wallet server-side).
 */
export default function ImageUpload({ value, onChange, wallet, compact = false }: { value: string; onChange: (url: string) => void; wallet: string | undefined; compact?: boolean }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const preview = /^https?:\/\//.test(value.trim()) ? value.trim() : null;

  async function upload(file: File) {
    setErr(null);
    if (!wallet) return setErr("Connect a wallet to upload.");
    if (file.size > IMAGE_MAX_BYTES) return setErr("Max 2 MB.");
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!sniffImage(head)) return setErr("PNG, JPEG, WebP or GIF only.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("wallet", wallet);
      fd.set("file", file, "logo");
      const r = await fetch("/api/launch/image", { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error || `upload failed (${r.status})`);
      onChange(j.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  const tile = compact ? 64 : 88;
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload token image"
        onClick={() => !busy && fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        className={`flex items-center gap-4 rounded-2xl border border-dashed px-4 py-3 cursor-pointer transition-colors select-none ${over ? "border-brand bg-brand-soft" : "border-line hover:border-ink/40 bg-paper"} ${busy ? "opacity-70 cursor-progress" : ""}`}
      >
        <div className="shrink-0 rounded-2xl overflow-hidden bg-card border border-line flex items-center justify-center" style={{ width: tile, height: tile }}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" width={tile} height={tile} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : busy ? (
            <Spinner size={20} className="text-brand" />
          ) : (
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="text-muted" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <circle cx="9" cy="10" r="2" />
              <path d="M21 16l-5-5-8 8" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{busy ? "Uploading…" : preview ? "Change image" : "Upload image"}</p>
          <p className={`${helper} mt-0.5`}>{busy ? "Resizing to 512×512" : "PNG, JPEG, WebP or GIF · max 2 MB · drop it here or tap"}</p>
        </div>
        <input
          ref={fileRef}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>
      {err ? <p className="text-xs text-red-600 mt-1.5">{err}</p> : null}
      <details className="mt-2">
        <summary className={`${helper} cursor-pointer select-none`}>or paste an image URL</summary>
        <input className={`${inputCls} mt-2`} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…/logo.png" inputMode="url" aria-label="Image URL" />
      </details>
    </div>
  );
}
