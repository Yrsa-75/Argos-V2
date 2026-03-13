import type { Caption } from "./types";

/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm
 */
function toSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/**
 * Convert captions to SRT format string
 */
export function captionsToSrt(captions: Caption[]): string {
  return captions
    .map((cap, i) => {
      const index = i + 1;
      const start = toSrtTime(cap.start);
      const end = toSrtTime(cap.end);
      return `${index}\n${start} --> ${end}\n${cap.text}\n`;
    })
    .join("\n");
}

/**
 * Trigger download of an SRT file
 */
export function downloadSrt(captions: Caption[], filename: string = "subtitles.srt") {
  const srt = captionsToSrt(captions);
  const blob = new Blob([srt], { type: "text/srt;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
