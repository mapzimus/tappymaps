// TopoJSON -> SVG path data.
//
// The legacy app grew four near-identical copies of this: one in the editor's
// renderStatesFromTopology, one in arcadeBuildMap, one in draftBuildMap (twice,
// counting Territory), one in the Hub's decorative map, and a fifth server-side
// in api/render.js. They drifted — different winding handling, different
// precision, different treatment of MultiPolygon — which is why an export and
// an OG image could disagree about the same map.
//
// One implementation, used by every surface including the server renderer.

/**
 * Convert a GeoJSON geometry (already projected — us-atlas albers-10m bakes
 * the projection into the coordinates) into an SVG `d` string.
 *
 * @param {object} geometry  Polygon or MultiPolygon
 * @param {number} [precision=1]  decimal places; 1 is visually lossless at
 *                                this viewBox and meaningfully smaller
 */
export function geometryToPath(geometry, precision = 1) {
  if (!geometry) return '';
  const rings =
    geometry.type === 'Polygon' ? geometry.coordinates
    : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat()
    : [];

  const round = (n) => {
    const r = Number(n.toFixed(precision));
    return Object.is(r, -0) ? 0 : r;
  };

  let d = '';
  for (const ring of rings) {
    if (!ring || ring.length < 2) continue;
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = ring[i];
      d += (i === 0 ? 'M' : 'L') + round(x) + ',' + round(y);
    }
    d += 'Z';
  }
  return d;
}

/**
 * Bounding box of a projected geometry, in viewBox units.
 * Used for zoom-to-region and for measuring whether a small state is big
 * enough to be a legitimate tap target.
 */
export function geometryBounds(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const rings =
    geometry?.type === 'Polygon' ? geometry.coordinates
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates.flat()
    : [];
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Union of several bounding boxes, with optional padding in viewBox units. */
export function unionBounds(boxes, pad = 0) {
  const real = boxes.filter(Boolean);
  if (!real.length) return null;
  const minX = Math.min(...real.map((b) => b.x));
  const minY = Math.min(...real.map((b) => b.y));
  const maxX = Math.max(...real.map((b) => b.x + b.width));
  const maxY = Math.max(...real.map((b) => b.y + b.height));
  return {
    x: minX - pad,
    y: minY - pad,
    width: (maxX - minX) + pad * 2,
    height: (maxY - minY) + pad * 2,
  };
}

/**
 * The map's fixed viewBox. us-atlas states-albers-10m is authored for
 * 975x610; the legacy app used a slightly padded frame so the title, legend
 * and logo have room, and every export ratio derives from it. Changing this
 * changes every exported image, so it lives in exactly one place.
 */
export const VIEWBOX = { x: -20, y: -30, width: 1010, height: 710 };
export const VIEWBOX_STRING = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`;
export const ASPECT = VIEWBOX.width / VIEWBOX.height;

/**
 * Where the map content actually sits inside a container, accounting for the
 * letterboxing `preserveAspectRatio="xMidYMid meet"` introduces when the
 * container's aspect ratio differs from the viewBox's.
 *
 * The legacy legend bug came from anchoring to container bounds instead: on a
 * portrait phone the legend landed in the empty band below the map. Anything
 * positioned relative to the map must go through this.
 */
export function contentRect(containerWidth, containerHeight) {
  const containerAspect = containerWidth / containerHeight;
  let width, height, x, y;
  if (containerAspect > ASPECT) {
    // Container is wider than the map: bars left and right.
    height = containerHeight;
    width = height * ASPECT;
    x = (containerWidth - width) / 2;
    y = 0;
  } else {
    // Container is taller: bars top and bottom.
    width = containerWidth;
    height = width / ASPECT;
    x = 0;
    y = (containerHeight - height) / 2;
  }
  return { x, y, width, height };
}
