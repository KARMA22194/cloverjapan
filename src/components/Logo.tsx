import Image from "next/image";

// etikett.de-Logo (self-hosted, public/brand). Seitenverhältnis ~3.25:1.
export function Logo({
  height = 32,
  priority = false,
  className = "",
}: {
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  const width = Math.round(height * 3.251);
  return (
    <Image
      src="/brand/logo-etikett.png"
      alt="etikett.de"
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
