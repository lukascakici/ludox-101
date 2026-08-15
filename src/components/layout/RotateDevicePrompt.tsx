/**
 * Full-screen overlay shown only on small screens held in portrait, asking the
 * player to rotate to landscape. Visibility is pure CSS (portrait + max-md), so
 * it costs nothing on desktop and needs no orientation listener.
 *
 * Mounted by RootLayout (for signed-in app screens) and by GamePage, which sits
 * outside that layout.
 *
 * The phone outline tips a quarter turn on a loop — the motion says "turn me"
 * faster than the sentence under it does.
 */
export function RotateDevicePrompt() {
  return (
    <div className="fixed inset-0 z-50 hidden flex-col items-center justify-center gap-6 bg-felt-950 p-8 text-center portrait:max-md:flex">
      <div className="rotate-hint flex h-24 w-14 flex-col justify-between rounded-xl border-2 border-stone-200 p-1.5">
        {/* Earpiece and home bar, so the shape reads as a phone at a glance. */}
        <span className="mx-auto h-1 w-5 rounded-full bg-stone-400" />
        <span className="mx-auto h-1 w-6 rounded-full bg-stone-500" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-stone-100">
          Telefonu yan çevir.
        </p>
        <p className="text-sm text-stone-400">Oyun yatay modda oynanır.</p>
      </div>
    </div>
  );
}
