import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Format seconds to MM:SS or HH:MM:SS */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

/** Format bytes to human-readable string */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Accepted video MIME types */
export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
];

/** File extensions display */
export const ACCEPTED_EXTENSIONS = ["MP4", "MOV", "MKV", "WebM"];

/** Check if a file is an accepted video */
export function isAcceptedVideo(file: File): boolean {
  return ACCEPTED_VIDEO_TYPES.includes(file.type);
}

/** Generate a unique key for R2 storage */
export function generateVideoKey(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "mp4";
  const id = crypto.randomUUID();
  return `videos/${id}.${ext}`;
}

/** Supported languages for captions */
export const CAPTION_LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "ru", label: "Русский" },
  { code: "tr", label: "Türkçe" },
] as const;

/** Popular Google Fonts for quick access */
export const POPULAR_FONTS = [
  "Montserrat",
  "Poppins",
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Oswald",
  "Raleway",
  "Merriweather",
  "Playfair Display",
  "Ubuntu",
  "Nunito",
  "Source Sans 3",
  "PT Sans",
  "Libre Baskerville",
  "Bebas Neue",
  "Anton",
  "DM Sans",
  "Outfit",
  "Space Grotesk",
] as const;
