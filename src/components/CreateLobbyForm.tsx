import { useState, type FormEvent, type ReactNode } from 'react';
import {
  GameMode,
  GameType,
  type CreateLobbyInput,
  type LobbySettings,
  type Okey101Rules,
  type TurnDuration,
} from '@/types/lobby';
import {
  availableGameTypes,
  bestOfLabels,
  bestOfOptions,
  createDefaultLobbySettings,
  gameModeLabels,
  gameTypeLabels,
  MAX_ROUNDS_PER_SET,
  MIN_ROUNDS_PER_SET,
  turnDurationOptions,
} from '@/constants/lobby';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

interface CreateLobbyFormProps {
  /** Called with validated form data. Persistence is wired in a later phase. */
  onSubmit: (input: CreateLobbyInput) => void;
}

/** Section wrapper: a Turkish label above its control. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {label}
      </span>
      {children}
    </div>
  );
}

/** A two-option on/off rule, rendered as a segmented control. */
function RuleToggle({
  label,
  onLabel,
  offLabel,
  value,
  onChange,
}: {
  label: string;
  onLabel: string;
  offLabel: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Field label={label}>
      <SegmentedControl
        ariaLabel={label}
        value={value ? 'on' : 'off'}
        onChange={(v) => onChange(v === 'on')}
        options={[
          { value: 'on', label: onLabel },
          { value: 'off', label: offLabel },
        ]}
      />
    </Field>
  );
}

const DEFAULTS = createDefaultLobbySettings();

function clampRounds(value: number): number {
  if (Number.isNaN(value)) return MIN_ROUNDS_PER_SET;
  return Math.min(MAX_ROUNDS_PER_SET, Math.max(MIN_ROUNDS_PER_SET, value));
}

/**
 * Create Lobby form. Holds each setting as independent local state, then
 * assembles `MatchFormat` and the game-specific `Okey101Rules` on submit.
 */
export function CreateLobbyForm({ onSubmit }: CreateLobbyFormProps) {
  const [name, setName] = useState('');
  const [gameType, setGameType] = useState<GameType>(DEFAULTS.gameType);
  const [gameMode, setGameMode] = useState<GameMode>(DEFAULTS.gameMode);
  const [roundsPerSet, setRoundsPerSet] = useState<number>(
    DEFAULTS.matchFormat.roundsPerSet,
  );
  const [bestOf, setBestOf] = useState<number>(DEFAULTS.matchFormat.bestOf);
  const [floorPenalty, setFloorPenalty] = useState<boolean>(
    DEFAULTS.gameRules.floorPenalty,
  );
  const [rekorPenalty, setRekorPenalty] = useState<boolean>(
    DEFAULTS.gameRules.rekorPenalty,
  );
  const [doubling, setDoubling] = useState<boolean>(DEFAULTS.gameRules.doubling);
  const [turnDuration, setTurnDuration] = useState<TurnDuration>(
    DEFAULTS.turnDuration,
  );
  const [isPrivate, setIsPrivate] = useState<boolean>(DEFAULTS.isPrivate);
  const [password, setPassword] = useState('');

  const trimmedName = name.trim();
  const isPasswordMissing = isPrivate && password.trim().length === 0;
  const canSubmit = trimmedName.length > 0 && !isPasswordMissing;

  // When bestOf is 1 the match is a single flat set, so the rounds input means
  // "total rounds"; otherwise it means "rounds per set".
  const isSeries = bestOf > 1;
  const roundsLabel = isSeries ? 'Set Başına Tur' : 'Tur Sayısı';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const gameRules: Okey101Rules = { floorPenalty, rekorPenalty, doubling };

    const settings: LobbySettings = {
      gameType,
      gameMode,
      matchFormat: { roundsPerSet: clampRounds(roundsPerSet), bestOf },
      turnDuration,
      isPrivate,
      gameRules,
    };

    // Only include `password` when relevant (exactOptionalPropertyTypes-safe).
    const input: CreateLobbyInput = {
      name: trimmedName,
      settings,
      ...(isPrivate ? { password: password.trim() } : {}),
    };

    onSubmit(input);
  }

  const inputClasses =
    'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-felt-800 dark:bg-felt-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-felt-700';

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-felt-800 dark:bg-felt-900"
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Lobi Oluştur</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Oyun ayarlarını seç ve yeni bir masa aç.
        </p>
      </div>

      <Field label="Lobi Adı">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Örn. Akşam Okeyi"
          className={inputClasses}
        />
      </Field>

      <Field label="Oyun">
        <SegmentedControl
          ariaLabel="Oyun türü"
          value={gameType}
          onChange={setGameType}
          options={(Object.values(GameType) as GameType[]).map((type) => ({
            value: type,
            label: availableGameTypes.includes(type)
              ? gameTypeLabels[type]
              : `${gameTypeLabels[type]} (yakında)`,
            disabled: !availableGameTypes.includes(type),
          }))}
        />
      </Field>

      <Field label="Mod">
        <SegmentedControl
          ariaLabel="Oyun modu"
          value={gameMode}
          onChange={setGameMode}
          options={(Object.values(GameMode) as GameMode[]).map((mode) => ({
            value: mode,
            label: gameModeLabels[mode],
          }))}
        />
      </Field>

      <Field label="Maç Tipi">
        <SegmentedControl
          ariaLabel="Maç tipi"
          value={bestOf}
          onChange={setBestOf}
          options={bestOfOptions.map((count) => ({
            value: count,
            label: bestOfLabels[count] ?? `Best of ${count}`,
          }))}
        />
      </Field>

      <Field label={roundsLabel}>
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            min={MIN_ROUNDS_PER_SET}
            max={MAX_ROUNDS_PER_SET}
            value={roundsPerSet}
            onChange={(e) => setRoundsPerSet(Number(e.target.value))}
            onBlur={() => setRoundsPerSet((r) => clampRounds(r))}
            className={`${inputClasses} w-24`}
          />
          <div className="flex gap-2">
            {[5, 7, 11].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRoundsPerSet(preset)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-felt-800 dark:text-zinc-300 dark:hover:bg-felt-800"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {isSeries
            ? `Her set ${clampRounds(roundsPerSet)} turdan oluşur, ${bestOf} setin çoğunluğunu kazanan maçı alır.`
            : `Tek sette ${clampRounds(roundsPerSet)} tur oynanır, sonunda kazanan belli olur.`}
        </p>
      </Field>

      <RuleToggle
        label="Ceza Sistemi"
        onLabel="Cezalı"
        offLabel="Cezasız"
        value={floorPenalty}
        onChange={setFloorPenalty}
      />

      <RuleToggle
        label="Rekor Cezası"
        onLabel="Rekorlu"
        offLabel="Rekorsuz"
        value={rekorPenalty}
        onChange={setRekorPenalty}
      />

      <RuleToggle
        label="Katlama"
        onLabel="Katlamalı"
        offLabel="Katlamasız"
        value={doubling}
        onChange={setDoubling}
      />

      <Field label="Hamle Süresi">
        <SegmentedControl
          ariaLabel="Hamle süresi"
          value={turnDuration}
          onChange={setTurnDuration}
          options={turnDurationOptions.map((duration) => ({
            value: duration,
            label: `${duration} sn`,
          }))}
        />
      </Field>

      <Field label="Gizlilik">
        <SegmentedControl
          ariaLabel="Lobi gizliliği"
          value={isPrivate ? 'private' : 'public'}
          onChange={(v) => setIsPrivate(v === 'private')}
          options={[
            { value: 'public', label: 'Herkese Açık' },
            { value: 'private', label: 'Şifreli' },
          ]}
        />
      </Field>

      {isPrivate && (
        <Field label="Şifre">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={32}
            placeholder="Lobi şifresi"
            className={inputClasses}
          />
        </Field>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Lobi Oluştur
      </button>
    </form>
  );
}
