import { useState } from 'react';
import {
  devAddProcessableTile,
  devBotOpen,
  devEmptyDeck,
  devGiveHand,
  devMarkOpened,
  devRandomHand,
  devGiveOkeyTile,
  devRedeal,
  devSetMyTurn,
  devSetupTakeOpen,
  type DevHandKind,
} from '@/services/firebase/devTools';
import { resolveTurnTimeout } from '@/services/firebase/gameService';

interface DevPanelProps {
  lobbyId: string;
  uid: string;
}

/**
 * Dev-only cheat panel (rendered only under `import.meta.env.DEV`). Lets a
 * tester set up scenarios instantly — jump the turn, load preset hands, re-deal,
 * make a bot open, etc. — without waiting for the right deal.
 */
export function DevPanel({ lobbyId, uid }: DevPanelProps) {
  const [open, setOpen] = useState(false);

  if (!import.meta.env.DEV) return null;

  const run = (fn: () => Promise<void>) => () => {
    fn().catch((err) => console.error('dev cheat failed:', err));
  };
  const give = (kind: DevHandKind) => run(() => devGiveHand(lobbyId, uid, kind));

  return (
    <div className="fixed left-2 top-2 z-50 select-none text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-amber-400/60 bg-black/70 px-2 py-1 font-mono font-semibold text-amber-300"
      >
        DEV {open ? '▾' : '▸'}
      </button>

      {open && (
        <div className="mt-1 flex max-h-[80vh] w-44 flex-col gap-1 overflow-auto rounded-md border border-amber-400/40 bg-black/80 p-2 text-stone-100 shadow-xl">
          <Label>Sıra & dağıt</Label>
          <Btn onClick={run(() => devSetMyTurn(lobbyId, uid))}>Sıra bana</Btn>
          <Btn onClick={run(() => resolveTurnTimeout(lobbyId, uid))}>
            Süremi doldur
          </Btn>
          <Btn onClick={run(() => devRedeal(lobbyId))}>Yeni dağıt</Btn>
          <Btn onClick={run(() => devRandomHand(lobbyId, uid))}>Rastgele el</Btn>

          <Label>El ver</Label>
          <Btn onClick={give('meld101')}>101 eli ver</Btn>
          <Btn onClick={give('meld153')}>Rekor eli (153+ açış)</Btn>
          <Btn onClick={give('pairs')}>Çift eli ver</Btn>
          <Btn onClick={give('rekor')}>Rekor eli (7 çift)</Btn>
          <Btn onClick={give('finish')}>Bitir (1 taş)</Btn>
          <Btn onClick={give('elden')}>Elden bitme eli (22 taş)</Btn>

          <Label>Masa kur</Label>
          <Btn onClick={run(() => devMarkOpened(lobbyId, uid, 'meld'))}>
            Beni aç (per)
          </Btn>
          <Btn onClick={run(() => devMarkOpened(lobbyId, uid, 'pair'))}>
            Beni aç (çift)
          </Btn>
          <Btn onClick={run(() => devBotOpen(lobbyId, uid, 'meld'))}>
            Bot per açsın
          </Btn>
          <Btn onClick={run(() => devBotOpen(lobbyId, uid, 'pair'))}>
            Bot çift açsın
          </Btn>
          <Btn onClick={run(() => devAddProcessableTile(lobbyId, uid))}>
            İşlenebilir taş
          </Btn>
          <Btn onClick={run(() => devEmptyDeck(lobbyId))}>Deste bitir</Btn>

          <Label>Ceza</Label>
          <Btn onClick={run(() => devSetupTakeOpen(lobbyId, uid))}>
            Soldan-açma kur
          </Btn>
          <Btn onClick={run(() => devGiveOkeyTile(lobbyId, uid))}>
            Okey taşı ver
          </Btn>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400/70 first:mt-0">
      {children}
    </span>
  );
}

function Btn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-stone-100/20 px-2 py-1 text-left font-medium transition-colors hover:bg-white/10"
    >
      {children}
    </button>
  );
}
