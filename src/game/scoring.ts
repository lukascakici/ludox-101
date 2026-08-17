import type { OkeyMatch } from './okey';
import type { Tile, TileFace } from './tiles';

/**
 * Okey 101 round scoring (penalty-based — LOWER total wins the match).
 *
 * At the end of a round each player is scored:
 *  - the finisher (el kapatan): a flat bonus, -101 normally and -200 for a
 *    special finish (see `FinishFlags`). The finisher's bonus is NEVER
 *    multiplied — a bigger finish hurts the opponents, it doesn't pay more.
 *  - a player who never opened: a fixed penalty of 202,
 *  - a player who opened but still holds tiles: the sum of their held values.
 * Everyone except the finisher is then multiplied by `opponentMultiplier`,
 * which the special finishes stack up (see `opponentMultiplierOf`).
 *
 * Eşli/paired note: the finisher's PARTNER scores 0 — their held tiles and
 * openings stop counting the moment their team closes the hand. On the losing
 * side a non-opener simply scores 202 before multipliers, so when BOTH of them
 * fail to open their TEAM total is naturally 404 (202 + 202). (Set scoring
 * combines team totals.)
 */

export const NOT_OPENED_PENALTY = 202;
/** Flat bonus for an ordinary finish (opened on an earlier turn, then went out). */
export const FINISH_BONUS = -101;
/** Flat bonus for elden bitme / kafa atma / çift bitme. */
export const HAND_FINISH_BONUS = -200;

/* Floor-penalty (ceza) amounts. The take-to-open penalty is tile-value based
 * (×10 series / ×20 pairs) and lives in the service; these are the flat ones. */
/** Discarding the okey tile without finishing. */
export const PENALTY_DISCARD_OKEY = 101;
/** Discarding a tile that fits (could be işle'd onto) an open meld on the table. */
export const PENALTY_DISCARD_PROCESSABLE = 101;
/** Still holding the okey at round end despite having opened. */
export const PENALTY_HELD_OKEY = 101;
/** Attempting an invalid opening (unassisted mode): move rejected, penalty written. */
export const PENALTY_WRONG_OPEN = 101;
/** Attempting an invalid process (unassisted mode): move rejected, penalty written. */
export const PENALTY_WRONG_PROCESS = 101;

/* Rekor (rekorlu) — a REWARD, not a floor penalty. Triggered by a big opening,
 * granted only if the rekor opener also finishes the round. */
/** First-open meld total at/above which the opening is a rekor. */
export const REKOR_MIN_TOTAL = 153;
/** Number of pairs in a first open at/above which it is a rekor. */
export const REKOR_MIN_PAIRS = 7;
/** Reward applied to a rekor opener who finishes the round (negative = improves). */
export const REKOR_BONUS = -101;

/** Penalty value a single held tile contributes at round end. */
export function tileValue(face: TileFace, okey: OkeyMatch | null): number {
  // A false joker stands for the okey's number; the okey tile is itself a
  // numbered tile, so numbered tiles just count their face value.
  if (face.kind === 'false-joker') return okey ? okey.value : 0;
  return face.value;
}

/** Total held-tile value of a hand. */
export function handValueOf(tiles: Tile[], okey: OkeyMatch | null): number {
  return tiles.reduce((sum, tile) => sum + tileValue(tile.face, okey), 0);
}

/* -------------------------------------------------------------------------- */
/*  Finish kinds                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What kind of finish ended the round. Not mutually exclusive — `okey` in
 * particular rides on top of any of the others.
 */
export interface FinishFlags {
  /**
   * Elden bitme: the finisher made their FIRST opening on the very turn they
   * went out, and processed (işledi) no tile onto a meld along the way.
   */
  hand: boolean;
  /** Kafa atma: elden bitme while no OPPONENT had opened. Implies `hand`. */
  headShot: boolean;
  /** Çift bitme: the finisher's opening was a pairs opening. */
  pairs: boolean;
  /** The winning discard was the okey tile. */
  okey: boolean;
}

/** An ordinary finish (or a deck-exhausted round, where nothing applies). */
export const NO_FINISH: FinishFlags = {
  hand: false,
  headShot: false,
  pairs: false,
  okey: false,
};

/**
 * Derives the finish kind from public game state. `openedThisTurn` is the
 * elden-bitme marker written by `openMelds` / `layPairs` and cleared by any
 * process or discard, so `openedThisTurn === uid` at the winning discard means
 * exactly "opened this turn, processed nothing".
 */
export function finishFlagsOf(input: {
  uid: string;
  playerOrder: string[];
  opened: Record<string, boolean>;
  openedWith: Record<string, 'meld' | 'pair'>;
  openedThisTurn?: string;
  /** Team per player in eşli mode; absent in solo. A partner is not an opponent. */
  teams?: Record<string, 0 | 1>;
  /** Whether the winning discard was the okey (caller resolves the tile). */
  okeyDiscard: boolean;
}): FinishFlags {
  const hand = input.openedThisTurn === input.uid;
  // Kafa atma only cares about the OPPOSING side: in eşli mode a partner who
  // has opened doesn't spoil it. Solo has no teams, so everyone is an opponent.
  const myTeam = input.teams?.[input.uid];
  const headShot =
    hand &&
    input.playerOrder.every(
      (player) =>
        player === input.uid ||
        (input.teams != null && input.teams[player] === myTeam) ||
        input.opened[player] !== true,
    );
  return {
    hand,
    headShot,
    pairs: input.openedWith[input.uid] === 'pair',
    okey: input.okeyDiscard,
  };
}

/** The finisher's flat score. Never multiplied. */
export function finishBonusOf(flags: FinishFlags): number {
  return flags.hand || flags.pairs ? HAND_FINISH_BONUS : FINISH_BONUS;
}

/**
 * The multiplier applied to everyone EXCEPT the finisher. Each qualifying
 * condition doubles again — there is no cap. Note `hand` alone does not
 * multiply (plain elden bitme just pays -200); only kafa atma does.
 *
 * Reachable values are 1, 2 and 4: `hand` and `pairs` cannot co-occur, because
 * a pairs opener sheds tiles two at a time and must process at least once to
 * reach an empty hand — which clears the elden marker.
 */
export function opponentMultiplierOf(flags: FinishFlags): number {
  return (
    2 ** (Number(flags.headShot) + Number(flags.pairs) + Number(flags.okey))
  );
}

/* -------------------------------------------------------------------------- */
/*  Round scoring                                                              */
/* -------------------------------------------------------------------------- */

export interface RoundScoreContext {
  playerOrder: string[];
  opened: Record<string, boolean>;
  /** How each player opened. A PAIR opener's own score is always doubled. */
  openedWith: Record<string, 'meld' | 'pair'>;
  /** Public held-tile value per player (maintained as tiles move). */
  handValue: Record<string, number>;
  /** The finisher uid, or undefined for a deck-exhausted (no-winner) end. */
  winner?: string;
  /** Team per player in eşli mode; absent in solo. Drives the partner rule. */
  teams?: Record<string, 0 | 1>;
  /** The finisher's flat score — see `finishBonusOf`. Unused without a winner. */
  finishBonus: number;
  /** Multiplier on every non-finisher — see `opponentMultiplierOf`. 1 = none. */
  opponentMultiplier: number;
}

/**
 * Computes each player's hand points for one finished round.
 *
 * The finisher takes `finishBonus` flat. In eşli mode their PARTNER scores a
 * straight 0 — once your team has closed the hand, neither what you held nor
 * whether you opened matters. Everyone else is multiplied twice over: by 2 if
 * they themselves opened with pairs (a doubled commitment, win or lose), and by
 * the round's `opponentMultiplier`. These stack, so a non-opener in a kafa atma
 * + okey round can reach 202 × 4 = 808.
 *
 * Floor penalties are NOT part of this — they are added to the round delta
 * afterwards, and the winner's partner still owes any they incurred.
 */
export function scoreRound(ctx: RoundScoreContext): Record<string, number> {
  // 0 is a valid team key, so every check here is against null, not falsiness.
  const winnerTeam =
    ctx.winner != null ? ctx.teams?.[ctx.winner] : undefined;
  const result: Record<string, number> = {};
  for (const uid of ctx.playerOrder) {
    if (uid === ctx.winner) {
      result[uid] = ctx.finishBonus;
      continue;
    }
    if (winnerTeam != null && ctx.teams?.[uid] === winnerTeam) {
      result[uid] = 0;
      continue;
    }
    const base = !ctx.opened[uid]
      ? NOT_OPENED_PENALTY
      : (ctx.handValue[uid] ?? 0);
    const ownDouble = ctx.openedWith[uid] === 'pair' ? 2 : 1;
    result[uid] = base * ownDouble * ctx.opponentMultiplier;
  }
  return result;
}

/** The uid with the lowest total (the leader / would-be winner). Ties → first. */
export function lowestScorer(
  playerOrder: string[],
  totals: Record<string, number>,
): string | undefined {
  let best: string | undefined;
  let bestValue = Infinity;
  for (const uid of playerOrder) {
    const value = totals[uid] ?? 0;
    if (value < bestValue) {
      bestValue = value;
      best = uid;
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/*  Set / match progression                                                    */
/* -------------------------------------------------------------------------- */

/** Sets needed to win a bestOf match (a strict majority). bestOf 1→1, 3→2, 5→3. */
export function setMajority(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

/**
 * The side that won the set: the one with the lowest set total. `sides` lists
 * the competing keys — player uids in solo mode, team keys ('0','1') in paired
 * mode — and `totals` is keyed the same way. Ties resolve to the first side.
 */
export function setWinnerOf(
  sides: string[],
  totals: Record<string, number>,
): string | undefined {
  return lowestScorer(sides, totals);
}

/** The side that has won the most sets so far (match leader). Ties → first. */
export function matchLeader(
  sides: string[],
  setsWon: Record<string, number>,
): string | undefined {
  let best: string | undefined;
  let bestValue = -Infinity;
  for (const side of sides) {
    const value = setsWon[side] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = side;
    }
  }
  return best;
}
