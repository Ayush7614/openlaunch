// Decorative token identities, not authenticity checks. Address-only identity
// preserves the same token's appearance across chains, symbols, and surfaces.
// Primary, secondary, light background, dark background. Pair the solid
// backplate separately in each theme so both existing mosaic inks stay legible.
const PALETTES = [
  [220, 175, 175, 220],
  [275, 345, 345, 275],
  [160, 85, 85, 160],
  [35, 335, 35, 335],
  [200, 265, 200, 265],
  [325, 18, 18, 325],
  [245, 165, 165, 245],
  [10, 45, 45, 10],
] as const;
const TILES = [
  "M5.5 0a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11Z",
  "M0 11V5.5a5.5 5.5 0 0 1 11 0V11Z",
  "M0 0H11A11 11 0 0 1 0 11Z",
  "M2 0H9Q11 0 11 2V9Q11 11 9 11H2Q0 11 0 9V2Q0 0 2 0Z",
] as const;

function tokenSeed(address: string): number {
  let seed = 2166136261;
  for (const char of address.trim().toLowerCase()) {
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return seed;
}

/** The primary hue also remains available to callers of TokenAvatar.hueOf. */
export function tokenHue(address: string): number {
  return PALETTES[(tokenSeed(address) >>> 16) % PALETTES.length][0];
}

export function tokenIdentity(address: string) {
  const seed = tokenSeed(address);
  const [primaryHue, secondaryHue, lightBackground, darkBackground] = PALETTES[(seed >>> 16) % PALETTES.length];
  let state = seed || 0x9e3779b9;
  const cells = Array.from({ length: 9 }, (_, index) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const bits = state >>> 0;
    return {
      x: 6 + (index % 3) * 12,
      y: 6 + Math.floor(index / 3) * 12,
      path: TILES[bits % TILES.length],
      rotation: ((bits >>> 4) % 4) * 90,
      // Keep both colors visible, even for unusually repetitive seeds.
      tone: (index === 0 ? "primary" : index === 1 ? "secondary" : bits & 256 ? "primary" : "secondary") as "primary" | "secondary",
    };
  });
  return { primaryHue, secondaryHue, backgroundHue: { light: lightBackground, dark: darkBackground }, cells };
}
