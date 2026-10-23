import { describe, expect, it } from 'vitest';
import { planLetter, planWord, type MarkRow } from '@/lib/mushaf/plan';

const row = (over: Partial<MarkRow>): MarkRow => ({
  id: 'r1',
  location: '2:255:3',
  letterIndex: null,
  typeId: 1,
  subtypeId: null,
  readonly: false,
  ...over,
});

describe('planWord', () => {
  it('inserts a whole-word mark on an unmarked word', () => {
    expect(planWord([], '2:255:3', 1, null)).toEqual({
      location: '2:255:3',
      removeIds: [],
      insert: { typeId: 1, subtypeId: null, letterIndex: null },
    });
  });

  it('toggles off when the same type is tapped again', () => {
    const rows = [row({ id: 'a', typeId: 1 })];
    expect(planWord(rows, '2:255:3', 1, null)).toEqual({ location: '2:255:3', removeIds: ['a'], insert: null });
  });

  it('replaces a different word-level type instead of stacking', () => {
    const rows = [row({ id: 'a', typeId: 1 })];
    const plan = planWord(rows, '2:255:3', 3, null);
    expect(plan.removeIds).toEqual(['a']);
    expect(plan.insert).toEqual({ typeId: 3, subtypeId: null, letterIndex: null });
  });

  it('treats a different tajweed subtype as a distinct mark', () => {
    const rows = [row({ id: 'a', typeId: 3, subtypeId: 1 })];
    const plan = planWord(rows, '2:255:3', 3, 2);
    expect(plan.removeIds).toEqual(['a']);
    expect(plan.insert).toEqual({ typeId: 3, subtypeId: 2, letterIndex: null });
  });

  it('erases every editable row of the word, including letter marks', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', letterIndex: 2 }), row({ id: 'x', location: '2:255:4' })];
    expect(planWord(rows, '2:255:3', 'erase', null)).toEqual({
      location: '2:255:3',
      removeIds: ['a', 'b'],
      insert: null,
    });
  });

  it('never touches accepted (read-only) marks', () => {
    const rows = [row({ id: 'acc', readonly: true })];
    expect(planWord(rows, '2:255:3', 'erase', null).removeIds).toEqual([]);
    expect(planWord(rows, '2:255:3', 1, null).removeIds).toEqual([]);
  });
});

describe('planLetter', () => {
  it('marks a single letter independently of the word', () => {
    const plan = planLetter([], '2:255:3', 4, 2, null);
    expect(plan.insert).toEqual({ typeId: 2, subtypeId: null, letterIndex: 4 });
  });

  it('gives a letter at most one type: a new type replaces the old one', () => {
    const rows = [row({ id: 'l4', letterIndex: 4, typeId: 1 })];
    const plan = planLetter(rows, '2:255:3', 4, 2, null);
    expect(plan.removeIds).toEqual(['l4']);
    expect(plan.insert).toEqual({ typeId: 2, subtypeId: null, letterIndex: 4 });
  });

  it('does not touch other letters of the same word', () => {
    const rows = [row({ id: 'l1', letterIndex: 1 })];
    expect(planLetter(rows, '2:255:3', 4, 1, null).removeIds).toEqual([]);
  });

  it('clears a letter when the same type is tapped again', () => {
    const rows = [row({ id: 'l4', letterIndex: 4, typeId: 2 })];
    expect(planLetter(rows, '2:255:3', 4, 2, null)).toEqual({ location: '2:255:3', removeIds: ['l4'], insert: null });
  });
});
