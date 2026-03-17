// ─── Video & Project ───────────────────────────────────────

export interface VideoMeta {
  duration: number; // seconds
  width: number;
  height: number;
  codec: string;
  fps: number;
  fileSize: number; // bytes
}

export interface Project {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  videoMeta: VideoMeta | null;
  captions: Caption[];
  captionTracks: CaptionTrack[];
  chapters: Chapter[];
  clips: ViralClip[];
  synthes: Synthe[];
  captionStyle: CaptionStyle;
  createdAt: string;
  updatedAt: string;
}

// ─── Captions ──────────────────────────────────────────────

export interface CaptionWord {
  word: string;
  start: number; // seconds
  end: number;
}

export interface Caption {
  id: string;
  words: CaptionWord[];
  start: number; // seconds (first word start)
  end: number; // seconds (last word end)
  text: string; // full text of the caption group
}

export interface CaptionTrack {
  id: string;
  language: string; // language code (fr, en, es, etc.)
  label: string; // display name (Français, English, etc.)
  captions: Caption[];
  createdAt: string;
}

export interface CaptionStyle {
  language: string;
  fontFamily: string;
  fontSize: number; // px
  textColor: string; // hex
  highlightColor: string; // hex
  position: "top" | "center" | "bottom";
  syncOffset: number; // seconds — positive = delay subtitles, negative = advance
  syncStretch: number; // multiplier — >1 = slow down (stretch), <1 = speed up (compress)
}

// ─── Chapters ──────────────────────────────────────────────

export interface Chapter {
  id: string;
  title: string;
  start: number; // seconds
  end: number; // seconds
}

// ─── Synthés (Lower Thirds) ────────────────────────────────

export interface Synthe {
  id: string;
  text: string;
  start: number; // seconds
  end: number; // seconds
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  position: "bottom-left" | "bottom-center" | "bottom-right";
}

// ─── Viral Clips ───────────────────────────────────────────

export interface ClipSegment {
  start: number; // seconds
  end: number; // seconds
  label?: string; // optional description for this segment
}

export interface ViralClip {
  id: string;
  title: string;
  segments: ClipSegment[]; // one or more segments from the source video
  totalDuration: number; // sum of all segment durations
  viralityScore: number; // 0-100
  reason: string;
  status: "pending" | "processing" | "done" | "error";
  outputUrl: string | null;
  focusPoint: "left" | "center" | "right" | "face-track";
  synthes: Synthe[]; // recreated synthés for this clip
}

// ─── Processing Jobs ───────────────────────────────────────

export type JobType =
  | "transcribe"
  | "chapters"
  | "viral-clips"
  | "smart-crop"
  | "export";

export type JobStatus = "idle" | "pending" | "processing" | "done" | "error";

export interface ProcessingJob {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number; // 0-100
  error: string | null;
}

// ─── Upload ────────────────────────────────────────────────

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

// ─── UI State ──────────────────────────────────────────────

export type ActiveTab = "captions" | "chapters" | "clips";

export type ClipDurationPreset = "short" | "medium" | "long";

export interface ClipConfig {
  count: number; // 1-8
  duration: ClipDurationPreset;
}

export interface ChapterConfig {
  count: number | "auto"; // 3-20 or auto
}
