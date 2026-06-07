import { useState, type FormEvent, type ReactNode } from 'react';
import {
  GameMode,
  type CreateLobbyInput,
  type LobbySettings,
  type Okey101Rules,
  type TurnDuration,
} from '@/types/lobby';
import {
  bestOfLabels,
  bestOfOptions,
  createDefaultLobbySettings,
  gameModeLabels,
  MAX_ROUNDS_PER_SET,
  MIN_ROUNDS_PER_SET,
  turnDurationOptions,
} from '@/constants/lobby';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Input } from '@/components/ui/Input';

type LobbyFormMode = 'create' | 'edit';

interface LobbyFormProps {
  mode: LobbyFormMode;
  /** Pre-fill values (edit mode). Defaults are used when omitted (create mode). */
  initialName?: string;
  initialSettings?: LobbySettings;
  /** Called with validated form data; may run async persistence. */
  onSubmit: (input: CreateLobbyInput) => Promise<void> | void;
  /** Shown as a secondary action in edit mode (e.g. to close the editor). */
  onCancel?: () => void;
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

function clampRounds(value: number): number {
  if (Number.isNaN(value)) return MIN_ROUNDS_PER_SET;
  return Math.min(MAX_ROUNDS_PER_SET, Math.max(MIN_ROUNDS_PER_SET, value));
}

/**
 * Reusable lobby form for both creating a lobby and editing its settings.
 * Holds each setting as independent local state, then assembles `MatchFormat`
 * and `Okey101Rules` on submit.
 */
export function LobbyForm({
  mode,
  initialName,
  initialSettings,
  onSubmit,
  onCancel,
}: LobbyFormProps) {
  const defaults = initialSettings ?? createDefaultLobbySettings();
  const wasPrivate = initialSettings?.isPrivate ?? false;

  const [name, setName] = useState(initialName ?? '');
  const [gameMode, setGameMode] = useState<GameMode>(defaults.gameMode);
  const [roundsPerSet, setRoundsPerSet] = useState<number>(
    defaults.matchFormat.roundsPerSet,
  );
  const [bestOf, setBestOf] = useState<number>(defaults.matchFormat.bestOf);
  const [floorPenalty, setFloorPenalty] = useState<boolean>(
    defaults.gameRules.floorPenalty,
  );
  const [rekorPenalty, setRekorPenalty] = useState<boolean>(
    defaults.gameRules.rekorPenalty,
  );
  const [doubling, setDoubling] = useState<boolean>(defaults.gameRules.doubling);
  const [turnDuration, setTurnDuration] = useState<TurnDuration>(
    defaults.turnDuration,
  );
  const [isPrivate, setIsPrivate] = useState<boolean>(defaults.isPrivate);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  // A password is required only when making a lobby private without an existing
  // one (i.e. on create, or when switching public -> private while editing).
  const passwordRequired = isPrivate && (mode === 'create' || !wasPrivate);
  const isPasswordMissing = passwordRequired && password.trim().length === 0;
  const canSubmit = trimmedName.length > 0 && !isPasswordMissing;

  // When bestOf is 1 the match is a single flat set, so the rounds input means
  // "total rounds"; otherwise it means "rounds per set".
  const isSeries = bestOf > 1;
  const roundsLabel = isSeries ? 'Set Başına Tur' : 'Tur Sayısı';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    const gameRules: Okey101Rules = { floorPenalty, rekorPenalty, doubling };

    const settings: LobbySettings = {
      gameMode,
      matchFormat: { roundsPerSet: clampRounds(roundsPerSet), bestOf },
      turnDuration,
      isPrivate,
      gameRules,
    };

    // Include `password` only when one was actually entered. In edit mode a
    // blank password on an already-private lobby keeps the existing one.
    const input: CreateLobbyInput = {
      name: trimmedName,
      settings,
      ...(isPrivate && password.trim() ? { password: password.trim() } : {}),
    };

    try {
      setSubmitting(true);
      await onSubmit(input);
    } finally {
      setSubmitting(false);
    }
  }

  const isEdit = mode === 'edit';
  const passwordPlaceholder =
    isEdit && wasPrivate ? 'Boş bırakırsan mevcut şifre korunur' : 'Lobi şifresi';

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-felt-800 dark:bg-felt-900"
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          {isEdit ? 'Ayarları Düzenle' : 'Lobi Oluştur'}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {isEdit
            ? 'Oyun başlamadan ayarları güncelleyebilirsin.'
            : 'Oyun ayarlarını seç ve yeni bir masa aç.'}
        </p>
      </div>

      <Field label="Lobi Adı">
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Örn. Akşam Okeyi"
        />
      </Field>

      <Field label="Mod">
        <SegmentedControl
          ariaLabel="Oyun modu"
          value={gameMode}
          onChange={setGameMode}
          options={(Object.values(GameMode) as GameMode[]).map((m) => ({
            value: m,
            label: gameModeLabels[m],
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
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_ROUNDS_PER_SET}
            max={MAX_ROUNDS_PER_SET}
            value={roundsPerSet}
            onChange={(e) => setRoundsPerSet(Number(e.target.value))}
            onBlur={() => setRoundsPerSet((r) => clampRounds(r))}
            className="w-24"
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
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={32}
            placeholder={passwordPlaceholder}
          />
        </Field>
      )}

      <div className="flex gap-3">
        {isEdit && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-felt-700 dark:text-zinc-200 dark:hover:bg-felt-800"
          >
            Vazgeç
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {submitting
            ? isEdit
              ? 'Kaydediliyor…'
              : 'Oluşturuluyor…'
            : isEdit
              ? 'Kaydet'
              : 'Lobi Oluştur'}
        </button>
      </div>
    </form>
  );
}
