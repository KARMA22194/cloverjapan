// Logo = Clover-Japan-Markenzeichen (goldenes Torii-/Fuji-/Kirschblüten-Motiv
// auf schwarzer Kachel). Vollfarbig → als Bild gerendert (nicht als CSS-Maske).
export function Logo({
  height = 32,
  className = "",
}: {
  height?: number;
  priority?: boolean; // beibehalten für bestehende Aufrufer; hier ohne Wirkung
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/japan-mark.png"
      alt="Clover Japan"
      width={height}
      height={height}
      className={`inline-block rounded-lg ${className}`}
      style={{ width: height, height }}
    />
  );
}
