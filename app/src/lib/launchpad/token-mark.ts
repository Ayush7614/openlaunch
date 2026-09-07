/** Decorative identity, not a checksum or authenticity signal. Keep stable across surfaces. */
export function tokenMark(chain: string, address: string) {
  let seed = 2166136261;
  for (const character of `${chain.trim().toLowerCase()}:${address.trim().toLowerCase()}`) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const family = seed % 4;
  const cut = 2 + ((seed >>> 5) % 4);
  let polygons: string[];

  if (family === 0) {
    // Exploded prism: one cap and two separated, substantial facets.
    polygons = [
      "24,7 38,15 24,23 10,15",
      `10,19 21,25 21,${40 - cut} 10,${34 - cut}`,
      `27,25 38,19 38,${34 - cut} 27,${40 - cut}`,
    ];
  } else if (family === 1) {
    // A precision-cut aperture; broad facets survive the 28px activity-feed size.
    const sides = 5 + ((seed >>> 7) % 2);
    const point = (angle: number, radius: number) => {
      const rad = angle * Math.PI / 180;
      return `${(24 + Math.cos(rad) * radius).toFixed(2)},${(24 + Math.sin(rad) * radius).toFixed(2)}`;
    };
    polygons = Array.from({ length: sides }, (_, index) => {
      const start = -90 + index * 360 / sides + 4;
      const end = -90 + (index + 1) * 360 / sides - 4;
      return [point(start, 17), point(end, 17), point(end, 6 + cut / 2), point(start, 6 + cut / 2)].join(" ");
    });
  } else if (family === 2) {
    // Two folded ribbons, separated by a diagonal channel.
    polygons = [
      "9,15 25,7 39,15 30,20 25,17 18,21",
      `9,19 18,24 9,29 9,${35 - cut} 25,27 25,23`,
      "39,19 39,33 23,41 9,33 18,28 23,31 30,27 30,24",
    ];
  } else {
    // Four kite-shaped cuts with an offset, open centre.
    polygons = [
      `24,7 35,18 27,18 24,${23 - cut} 21,18 13,18`,
      `41,24 30,35 30,27 ${25 + cut},24 30,21 30,13`,
      `24,41 13,30 21,30 24,${25 + cut} 27,30 35,30`,
      `7,24 18,13 18,21 ${23 - cut},24 18,27 18,35`,
    ];
  }
  const accent = (seed >>> 11) % polygons.length;
  return {
    family,
    rotation: ((seed >>> 15) % 4) * 90,
    parts: polygons.map((points, index) => ({ points, tone: index === accent ? "accent" as const : index % 2 ? "body" as const : "ink" as const })),
    ticks: Array.from({ length: 5 }, (_, index) => 1 + ((seed >>> (19 + index * 2)) & 3)),
  };
}
