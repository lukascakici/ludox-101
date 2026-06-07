/**
 * Full-screen overlay shown only on small screens held in portrait, asking the
 * player to rotate to landscape. Pure CSS visibility (portrait + max-md).
 */
export function RotateDevicePrompt() {
  return (
    <div className="fixed inset-0 z-50 hidden flex-col items-center justify-center gap-4 bg-felt-950 p-8 text-center portrait:max-md:flex">
      <div className="h-10 w-16 rounded-md border-2 border-stone-200" />
      <p className="text-base font-medium text-stone-100">
        Daha iyi bir deneyim için telefonu yan çevir.
      </p>
      <p className="text-sm text-stone-400">Oyun yatay modda oynanır.</p>
    </div>
  );
}
