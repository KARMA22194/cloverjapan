function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "");
  return s.toUpperCase() || "?";
}

/** Deterministische Farbe aus dem Namen (gleicher Name → gleiche Farbe). */
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 52% 45%)`;
}

/** Profilbild oder Initialen-Kreis als Fallback. Plain component (Server/Client). */
export function Avatar({
  name,
  image,
  size = 32,
  className = "",
}: {
  name: string;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={image}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: colorFor(name),
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials(name)}
    </span>
  );
}
