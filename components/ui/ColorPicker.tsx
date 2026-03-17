"use client";

import { useCallback, useRef } from "react";

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div>
      <span className="block text-xs text-txt-3 mb-1.5">{label}</span>
      <button
        type="button"
        onClick={handleClick}
        className="relative w-full h-8 rounded-lg border border-border hover:border-border-hover transition-colors overflow-hidden cursor-pointer"
      >
        <div
          className="absolute inset-0"
          style={{ backgroundColor: value }}
        />
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </button>
    </div>
  );
}
