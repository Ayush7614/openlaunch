import "server-only";

/**
 * Fonts for next/og (satori needs TTF/OTF/WOFF, not woff2). Space Mono uses
 * pinned gstatic URLs (same as ads); Inter and Unbounded are resolved through
 * the Google Fonts CSS endpoint with a legacy UA so it hands back TTF/WOFF.
 * All best-effort: an OG image with system fallbacks beats a broken one.
 */
export type OgFont = { name: string; data: ArrayBuffer; style: "normal"; weight: 400 | 500 | 600 | 700 | 800 | 900 };

const SPACE_MONO_400 = "https://fonts.gstatic.com/s/spacemono/v17/i7dPIFZifjKcF5UAWdDRUEY.ttf";
const SPACE_MONO_700 = "https://fonts.gstatic.com/s/spacemono/v17/i7dMIFZifjKcF5UAWdDRaPpZYFI.ttf";

async function fetchBuf(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 86400 } });
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function googleTtf(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0" },
      next: { revalidate: 86400 },
    });
    if (!css.ok) return null;
    const text = await css.text();
    const m = /src:\s*url\(([^)]+\.(?:ttf|otf|woff))\)/.exec(text);
    return m ? fetchBuf(m[1]) : null;
  } catch {
    return null;
  }
}

export async function loadOgFonts(): Promise<OgFont[]> {
  const [m400, m700, u700, i500, i700] = await Promise.all([
    fetchBuf(SPACE_MONO_400),
    fetchBuf(SPACE_MONO_700),
    googleTtf("Unbounded", 700),
    googleTtf("Inter", 500),
    googleTtf("Inter", 700),
  ]);
  const fonts: OgFont[] = [];
  if (m400) fonts.push({ name: "Space Mono", data: m400, style: "normal", weight: 400 });
  if (m700) fonts.push({ name: "Space Mono", data: m700, style: "normal", weight: 700 });
  if (u700) fonts.push({ name: "Unbounded", data: u700, style: "normal", weight: 700 });
  if (i500) fonts.push({ name: "Inter", data: i500, style: "normal", weight: 500 });
  if (i700) fonts.push({ name: "Inter", data: i700, style: "normal", weight: 700 });
  return fonts;
}
