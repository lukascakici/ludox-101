import type { TileFace } from './tiles';
import { isOkeyTile, type OkeyMatch } from './okey';

/**
 * Meld (per) validation for Okey 101.
 *
 * Two meld kinds:
 *  - run (seri):   3+ tiles, same colour, consecutive values (no wrap-around).
 *  - group (grup): 3-4 tiles, same value, distinct colours.
 *
 * The ONLY wildcard is the okey tile (indicator + 1). The false joker (sahte
 * okey) is NOT a wildcard — it stands in for the okey's number value, i.e. it
 * melds as that concrete numbered tile. A meld needs at least one non-wild tile
 * to anchor its identity.
 *
 * Value convention: a run's jokers take the value of the position they fill;
 * extra jokers extend the run UPWARD (toward 13) to maximise its value.
 */

/** Minimum total meld value required to open (el açma) in non-doubling play. */
export const OPENING_MIN = 101;

/** Minimum number of pairs required to open with pairs (çift açma). */
export const PAIRS_MIN = 5;

export type MeldKind = 'run' | 'group' | 'pair';

export interface MeldInfo {
  kind: MeldKind;
  /** Total point value of the meld. */
  value: number;
}

type NumberFace = Extract<TileFace, { kind: 'number' }>;

/** The wildcard: the okey tile (indicator + 1). The false joker is NOT wild. */
export function isJoker(face: TileFace, okey: OkeyMatch | null): boolean {
  return isOkeyTile(face, okey);
}

/**
 * The face a tile contributes to a meld. A false joker (sahte okey) stands in
 * for the okey's number value, so it melds as that concrete numbered tile.
 */
export function meldFace(face: TileFace, okey: OkeyMatch | null): TileFace {
  if (face.kind === 'false-joker' && okey) {
    return { kind: 'number', color: okey.color, value: okey.value };
  }
  return face;
}

function tryGroup(naturals: NumberFace[], jokers: number): MeldInfo | null {
  const total = naturals.length + jokers;
  if (total < 3 || total > 4) return null;

  const value = naturals[0].value;
  if (!naturals.every((n) => n.value === value)) return null;

  const colors = new Set(naturals.map((n) => n.color));
  if (colors.size !== naturals.length) return null; // distinct colours

  // Up to 4 colours exist, and total <= 4, so jokers can fill the rest.
  return { kind: 'group', value: value * total };
}

function tryRun(naturals: NumberFace[], jokers: number): MeldInfo | null {
  const total = naturals.length + jokers;
  if (total < 3 || total > 13) return null;

  const color = naturals[0].color;
  if (!naturals.every((n) => n.color === color)) return null;

  const values = naturals.map((n) => n.value);
  if (new Set(values).size !== values.length) return null; // distinct values

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min > total - 1) return null; // naturals don't fit in a window

  // Highest-value consecutive window of length `total` that contains [min,max].
  const high = Math.min(13, min + total - 1);
  const low = high - total + 1;
  if (low < 1 || low > min || high < max) return null;

  const value = (total * (low + high)) / 2; // sum low..high
  return { kind: 'run', value };
}

/**
 * Classifies a set of tile faces as a valid meld (run or group) with its value,
 * or returns `null` if it isn't a valid meld.
 */
export function classifyMeld(
  faces: TileFace[],
  okey: OkeyMatch | null,
): MeldInfo | null {
  if (faces.length < 3) return null;

  const naturals: NumberFace[] = [];
  let jokers = 0;
  for (const face of faces) {
    if (isJoker(face, okey)) {
      jokers++; // the okey tile is the wildcard
      continue;
    }
    const resolved = meldFace(face, okey); // false joker -> okey number tile
    if (resolved.kind === 'number') naturals.push(resolved);
    else jokers++; // false joker with no okey (shouldn't happen) -> treat as wild
  }
  if (naturals.length === 0) return null; // need an anchor

  // A set of tiles can sometimes be read as either a group or a run (e.g. one
  // natural + jokers). Return the higher-value interpretation.
  const group = tryGroup(naturals, jokers);
  const run = tryRun(naturals, jokers);
  if (group && run) return group.value >= run.value ? group : run;
  return group ?? run;
}

/** Whether the faces form a valid meld. */
export function isValidMeld(faces: TileFace[], okey: OkeyMatch | null): boolean {
  return classifyMeld(faces, okey) !== null;
}

/**
 * Whether two faces form a valid pair (çift): two identical numbered tiles, or
 * any tile together with the okey (a joker stands in for its partner). A false
 * joker pairs as the okey's number tile.
 */
export function isPair(faces: TileFace[], okey: OkeyMatch | null): boolean {
  if (faces.length !== 2) return false;
  const [a, b] = faces;
  if (isJoker(a, okey) || isJoker(b, okey)) return true;
  const fa = meldFace(a, okey);
  const fb = meldFace(b, okey);
  return (
    fa.kind === 'number' &&
    fb.kind === 'number' &&
    fa.color === fb.color &&
    fa.value === fb.value
  );
}

/** Value of a valid meld, or 0 if invalid. */
export function meldValue(faces: TileFace[], okey: OkeyMatch | null): number {
  return classifyMeld(faces, okey)?.value ?? 0;
}
