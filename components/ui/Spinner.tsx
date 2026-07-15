// Small, theme-aware spinner used across loading states.
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

// A labelled inline loader: spinner + text. Good for buttons and banners.
export function LoadingRow({ label, size = 16 }: { label: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Spinner size={size} />
      <span>{label}</span>
    </span>
  );
}
