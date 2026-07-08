export function ProjectBadge({
  name,
  code,
  color,
}: {
  name: string;
  code: string;
  color: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="font-medium text-slate-800 dark:text-slate-100">{name}</span>
      <span className="text-xs text-slate-400 dark:text-slate-500">{code}</span>
    </span>
  );
}
