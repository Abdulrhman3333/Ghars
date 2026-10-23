/**
 * Per-line width fitting (port of fitLines() in error-hilighter.html).
 * Only text items count toward the width; markers are excluded via data-fit="no".
 */

const SLACK = 2;
const MIN_FONT = 11;

function measureRow(row: HTMLElement) {
  const cs = getComputedStyle(row);
  const gap = Math.ceil(parseFloat(cs.columnGap) || 0);
  let nat = 0;
  let fixed = 0;
  let nFlex = 0;
  let nFixed = 0;
  for (const k of Array.from(row.children) as HTMLElement[]) {
    const kcs = getComputedStyle(k);
    const m = Math.ceil((parseFloat(kcs.marginLeft) || 0) + (parseFloat(kcs.marginRight) || 0));
    const w = Math.ceil(k.getBoundingClientRect().width) + m;
    if (k.dataset.fit === 'no') {
      fixed += w;
      nFixed++;
    } else {
      nat += w;
      nFlex++;
    }
  }
  nat += Math.max(0, nFlex - 1) * gap;
  fixed += nFixed * gap;
  return { nat, fixed };
}

function rowOverflowPx(row: HTMLElement): number {
  const rowRect = row.getBoundingClientRect();
  let maxRight = 0;
  let minLeft = Infinity;
  for (const k of Array.from(row.children)) {
    const r = k.getBoundingClientRect();
    if (r.width === 0) continue;
    maxRight = Math.max(maxRight, r.right);
    minLeft = Math.min(minLeft, r.left);
  }
  return Math.max(0, maxRight - rowRect.right, rowRect.left - minLeft);
}

export function fitLines(container: HTMLElement) {
  const base = Math.round(Math.min(42, Math.max(17, (container.clientWidth || 320) * 0.075)));
  container.style.fontSize = `${base}px`;

  container.querySelectorAll<HTMLElement>('.mline').forEach((row) => {
    row.style.fontSize = `${base}px`;
    const m0 = measureRow(row);
    const avail0 = row.clientWidth - m0.fixed - SLACK;
    let f = m0.nat > avail0 && m0.nat > 0 ? Math.max(MIN_FONT, base * (avail0 / m0.nat) * 0.985) : base;

    for (let it = 0; it < 6; it++) {
      row.style.fontSize = `${f.toFixed(2)}px`;
      const m = measureRow(row);
      const avail = row.clientWidth - m.fixed - SLACK;
      if (m.nat <= avail) break;
      f = Math.max(MIN_FONT, f * (avail / m.nat) * 0.97);
    }

    row.style.fontSize = `${f.toFixed(2)}px`;
    for (let guard = 0; guard < 10 && rowOverflowPx(row) > 0.5; guard++) {
      const m = measureRow(row);
      const avail = row.clientWidth - m.fixed - SLACK;
      const natTrue = m.nat + rowOverflowPx(row);
      f = Math.max(MIN_FONT, f * (avail / natTrue) * 0.98);
      row.style.fontSize = `${f.toFixed(2)}px`;
    }
  });
}
