import {
  TILE_COLORS,
  type Tile,
  type TileColor,
  type TileFace,
} from './tiles';
import { classifyMeld, isJoker, meldFace, meldValue } from './melds';
import type { OkeyMatch } from './okey';

export interface Arrangement {
  /** Meld/pair groups, each a contiguous sequence to lay on the rack. */
  groups: Tile[][];
  /** Tiles that don't belong to a group. */
  loose: Tile[];
}

function key(color: TileColor, value: number): string {
  return `${color}-${value}`;
}

/** All k-sized subsets of `items`. */
function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const result: T[][] = [];
  const recurse = (start: number, combo: T[]) => {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]);
      recurse(i + 1, combo);
      combo.pop();
    }
  };
  recurse(0, []);
  return result;
}

/**
 * Orders a valid meld's tiles for display: runs are laid out by value with
 * jokers in the gap positions they fill (matching the value convention, which
 * extends a run upward). Groups keep their order.
 */
export function orderMeld(tiles: Tile[], okey: OkeyMatch | null): Tile[] {
  const info = classifyMeld(
    tiles.map((t) => t.face),
    okey,
  );
  if (!info || info.kind === 'group') return tiles;

  const naturals = tiles.filter((t) => !isJoker(t.face, okey));
  const jokers = tiles.filter((t) => isJoker(t.face, okey));
  const valueOf = (t: Tile): number => {
    const mf = meldFace(t.face, okey);
    return mf.kind === 'number' ? mf.value : 0;
  };
  const min = Math.min(...naturals.map(valueOf));
  const total = tiles.length;
  const high = Math.min(13, min + total - 1);
  const low = high - total + 1;

  const byValue = new Map<number, Tile>();
  naturals.forEach((t) => byValue.set(valueOf(t), t));

  const ordered: Tile[] = [];
  let jokerIndex = 0;
  for (let value = low; value <= high; value++) {
    const natural = byValue.get(value);
    if (natural) ordered.push(natural);
    else if (jokerIndex < jokers.length) ordered.push(jokers[jokerIndex++]);
  }
  while (jokerIndex < jokers.length) ordered.push(jokers[jokerIndex++]);
  return ordered;
}

/**
 * Arranges tiles into melds that MAXIMISE the total meld value — an exact
 * bitmask search with memoisation. Tiles are decided lowest-index first: each
 * is either left loose or placed into a meld containing it.
 */
export function arrangeBestMelds(
  hand: Tile[],
  okey: OkeyMatch | null,
): Arrangement {
  // Process naturals before wilds, so a meld anchored on a natural can still
  // pull in a wild that has a lower original index.
  const tiles = [
    ...hand.filter((t) => !isJoker(t.face, okey)),
    ...hand.filter((t) => isJoker(t.face, okey)),
  ];
  const n = tiles.length;
  if (n === 0) return { groups: [], loose: [] };

  const wild = tiles.map((t) => isJoker(t.face, okey));
  const faces = tiles.map((t) => meldFace(t.face, okey));

  const byCV = new Map<string, number[]>();
  const wildIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (wild[i]) {
      wildIndices.push(i);
    } else if (faces[i].kind === 'number') {
      const f = faces[i] as Extract<TileFace, { kind: 'number' }>;
      const k = key(f.color, f.value);
      const list = byCV.get(k);
      if (list) list.push(i);
      else byCV.set(k, [i]);
    }
  }

  const firstUnused = (list: number[], used: number): number => {
    for (const i of list) if ((used & (1 << i)) === 0) return i;
    return -1;
  };
  const naturalAt = (color: TileColor, value: number, used: number): number =>
    firstUnused(byCV.get(key(color, value)) ?? [], used);
  const unusedWilds = (used: number): number[] =>
    wildIndices.filter((i) => (used & (1 << i)) === 0);

  const valueCache = new Map<number, number>();
  const valueOfMask = (mask: number): number => {
    const cached = valueCache.get(mask);
    if (cached !== undefined) return cached;
    const f: TileFace[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) f.push(tiles[i].face);
    const value = meldValue(f, okey);
    valueCache.set(mask, value);
    return value;
  };

  // Valid melds containing natural tile `i`, among currently unused tiles.
  const meldsContaining = (i: number, used: number): number[] => {
    const f = faces[i];
    if (f.kind !== 'number') return [];
    const { color, value } = f;
    const wilds = unusedWilds(used);
    const masks: number[] = [];

    const others = TILE_COLORS.filter((c) => c !== color)
      .map((c) => naturalAt(c, value, used))
      .filter((x) => x >= 0);
    for (const size of [3, 4]) {
      for (let j = 0; j <= Math.min(others.length, size - 1); j++) {
        const wildsNeeded = size - 1 - j;
        if (wildsNeeded < 0 || wildsNeeded > wilds.length) continue;
        for (const subset of combinations(others, j)) {
          let mask = 1 << i;
          for (const t of subset) mask |= 1 << t;
          for (let w = 0; w < wildsNeeded; w++) mask |= 1 << wilds[w];
          if (valueOfMask(mask) > 0) masks.push(mask);
        }
      }
    }

    for (let a = Math.max(1, value - 12); a <= value; a++) {
      for (let b = value; b <= Math.min(13, a + 12); b++) {
        if (b - a < 2) continue;
        let mask = 0;
        let wildsUsed = 0;
        let ok = true;
        for (let v = a; v <= b; v++) {
          if (v === value) {
            mask |= 1 << i;
          } else {
            const ni = naturalAt(color, v, used);
            if (ni >= 0) {
              mask |= 1 << ni;
            } else if (wildsUsed < wilds.length) {
              mask |= 1 << wilds[wildsUsed++];
            } else {
              ok = false;
              break;
            }
          }
        }
        if (ok && valueOfMask(mask) > 0) masks.push(mask);
      }
    }

    return masks;
  };

  const FULL = (1 << n) - 1;
  const memo = new Map<number, number>();
  const choice = new Map<number, number>(); // meld mask for the lowest tile, 0 = loose

  const solve = (used: number): number => {
    if (used === FULL) return 0;
    const cached = memo.get(used);
    if (cached !== undefined) return cached;

    let i = 0;
    while (used & (1 << i)) i++;

    let best = solve(used | (1 << i)); // leave loose
    let bestMask = 0;
    if (!wild[i]) {
      for (const mask of meldsContaining(i, used)) {
        const total = valueOfMask(mask) + solve(used | mask);
        if (total > best) {
          best = total;
          bestMask = mask;
        }
      }
    }
    memo.set(used, best);
    choice.set(used, bestMask);
    return best;
  };
  solve(0);

  const groups: Tile[][] = [];
  let used = 0;
  while (used !== FULL) {
    let i = 0;
    while (used & (1 << i)) i++;
    const mask = choice.get(used) ?? 0;
    if (mask === 0) {
      used |= 1 << i;
    } else {
      const group: Tile[] = [];
      for (let x = 0; x < n; x++) if (mask & (1 << x)) group.push(tiles[x]);
      groups.push(orderMeld(group, okey));
      used |= mask;
    }
  }

  const grouped = new Set(groups.flat().map((t) => t.id));
  const loose = tiles.filter((t) => !grouped.has(t.id));
  return { groups, loose };
}

/** Whether a 2-tile group is a valid pair (identical tiles, or tile + joker). */
function isPair(group: Tile[], okey: OkeyMatch | null): boolean {
  if (group.length !== 2) return false;
  const [a, b] = group;
  if (isJoker(a.face, okey) || isJoker(b.face, okey)) return true;
  const fa = meldFace(a.face, okey);
  const fb = meldFace(b.face, okey);
  return (
    fa.kind === 'number' &&
    fb.kind === 'number' &&
    fa.color === fb.color &&
    fa.value === fb.value
  );
}

/**
 * Scores the current rack arrangement: total value of valid melds (for the 101
 * threshold) and number of valid pairs (for the 5-pairs opening).
 */
export function scoreArrangement(
  groups: Tile[][],
  okey: OkeyMatch | null,
): { series: number; pairs: number } {
  let series = 0;
  let pairs = 0;
  for (const group of groups) {
    const info = classifyMeld(
      group.map((t) => t.face),
      okey,
    );
    if (info) series += info.value;
    else if (isPair(group, okey)) pairs++;
  }
  return { series, pairs };
}

/**
 * Arranges tiles into pairs (çift): two identical tiles, or a tile + joker.
 */
export function arrangePairs(
  tiles: Tile[],
  okey: OkeyMatch | null,
): Arrangement {
  const jokers = tiles.filter((t) => isJoker(t.face, okey));
  const byKey = new Map<string, Tile[]>();
  for (const tile of tiles) {
    if (isJoker(tile.face, okey)) continue; // wild -> handled via jokers
    const mf = meldFace(tile.face, okey); // false joker -> okey number tile
    if (mf.kind === 'number') {
      const k = key(mf.color, mf.value);
      const list = byKey.get(k);
      if (list) list.push(tile);
      else byKey.set(k, [tile]);
    }
  }

  const groups: Tile[][] = [];
  const singles: Tile[] = [];
  for (const list of byKey.values()) {
    while (list.length >= 2) groups.push([list.shift()!, list.shift()!]);
    if (list.length) singles.push(list.shift()!);
  }

  const spareJokers = [...jokers];
  const loose: Tile[] = [];
  for (const single of singles) {
    const joker = spareJokers.shift();
    if (joker) groups.push([single, joker]);
    else loose.push(single);
  }
  loose.push(...spareJokers);

  return { groups, loose };
}
