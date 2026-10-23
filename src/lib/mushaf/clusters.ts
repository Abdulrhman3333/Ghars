/** base letter + its combining marks stay together (port of clusterize() from the prototype) */
export function clusterize(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) {
    if (out.length && /\p{M}|\u200D/u.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
