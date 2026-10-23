/**
 * Pure planners for mark actions: given the current rows, decide which rows to remove
 * and what to insert. The server action applies the plan; the UI stays free of rules.
 */

export type MarkRow = {
  id: string;
  location: string;
  letterIndex: number | null;
  typeId: number;
  subtypeId: number | null;
  readonly: boolean;
};

export type Tool = number | 'erase';

export type MarkPlan = {
  location: string;
  removeIds: string[];
  insert: { typeId: number; subtypeId: number | null; letterIndex: number | null } | null;
};

/** Whole-word action: tapping the same type again removes it; a different type replaces the word color. */
export function planWord(rows: MarkRow[], loc: string, tool: Tool, subtypeId: number | null): MarkPlan {
  const own = rows.filter((r) => r.location === loc && !r.readonly);
  if (tool === 'erase') return { location: loc, removeIds: own.map((r) => r.id), insert: null };

  const wordRows = own.filter((r) => r.letterIndex === null);
  const same = wordRows.find((r) => r.typeId === tool && r.subtypeId === subtypeId);
  if (same) return { location: loc, removeIds: [same.id], insert: null };

  return {
    location: loc,
    removeIds: wordRows.map((r) => r.id),
    insert: { typeId: tool, subtypeId, letterIndex: null },
  };
}

/** Letter action: one letter carries at most one type; tapping the same type again clears it. */
export function planLetter(
  rows: MarkRow[],
  loc: string,
  index: number,
  tool: Tool,
  subtypeId: number | null,
): MarkPlan {
  const letterRows = rows.filter((r) => r.location === loc && !r.readonly && r.letterIndex === index);
  if (tool === 'erase') return { location: loc, removeIds: letterRows.map((r) => r.id), insert: null };

  const same = letterRows.find((r) => r.typeId === tool);
  if (same) return { location: loc, removeIds: [same.id], insert: null };

  return {
    location: loc,
    removeIds: letterRows.map((r) => r.id),
    insert: { typeId: tool, subtypeId, letterIndex: index },
  };
}
