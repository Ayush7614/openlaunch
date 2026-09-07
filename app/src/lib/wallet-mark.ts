/** Decorative wallet fingerprint, not a checksum or verified identity. */
export function walletMark(address: string): { x: number; y: number }[] {
  let seed = 2166136261;
  for (const char of address.toLowerCase()) {
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      // Keep the centre populated even for a sparse hash.
      if ((seed >>> (row * 3 + col)) & 1 || (row === 2 && col === 2)) {
        cells.push({ x: 9 + col * 4.5, y: 9 + row * 4.5 });
        if (col < 2) cells.push({ x: 9 + (4 - col) * 4.5, y: 9 + row * 4.5 });
      }
    }
  }
  return cells;
}
