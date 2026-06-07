import type { TileFace } from './tiles';
import { isOkeyTile, type OkeyMatch } from './okey';

/**
 * Meld (per) validation for Okey 101.
 *
 * Two meld kinds:
 *  - run (seri):   3+ tiles, same colour, consecutive values (no wrap-around).
 *  - group (grup): 3-4 tiles, same value, distinct colours.
 *
 * Jokers are wildcards: a false joker (sahte okey) OR a tile matching the okey
 * (indicator + 1). A meld needs at least one natural (non-joker) tile to anchor
 * its identity.
 *
 * Value convention: a run's jokers take the value of the position they fill;
 * extra jokers extend the run UPWARD (toward 13) to maximise its value.
 */

/** Minimum total meld value required to open (el açma) in non-doubling play. */
export const OPENING_MIN = 101;

export type MeldKind = 'run' | 'group';

export interface MeldInfo {
  kind: MeldKind;
  /** Total point value of the meld. */
  value: number;
}

type NumberFace = Extract<TileFace, { kind: 'number' }>;

/** A wildcard: the false joker, or a tile that equals the okey. */
export function isJoker(face: TileFace, okey: OkeyMatch | null): boolean {
  return face.kind === 'false-joker' || isOkeyTile(face, okey);
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

  const naturals = faces.filter(
    (face): face is NumberFace => face.kind === 'number' && !isJoker(face, okey),
  );
  const jokers = faces.length - naturals.length;
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

/** Value of a valid meld, or 0 if invalid. */
export function meldValue(faces: TileFace[], okey: OkeyMatch | null): number {
  return classifyMeld(faces, okey)?.value ?? 0;
}
