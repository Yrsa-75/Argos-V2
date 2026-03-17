"use client";

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  variant?: "accent" | "warn" | "ok";
  size?: "sm" | "md";
}

export function ProgressBar({
  progress,
  label,
  variant = "accent",
  size = "sm",
}: ProgressBarProps) {
  const colors = {
    accent: "bg-accent",
    warn: "bg-warn",
    ok: "bg-ok",
  };

  const heights = {
    sm: "h-1",
    md: "h-1.5",
  };

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-txt-3">{label}</span>
          <span className="text-xs text-txt-2 font-mono">
            {Math.round(progress)}%
          </span>
        </div>
      )}
      <div
        className={`w-full ${heights[size]} bg-surface-3 rounded-full overflow-hidden`}
      >
        <div
          className={`${heights[size]} ${colors[variant]} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}
