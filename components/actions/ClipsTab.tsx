"use client";

import { useCallback, useState } from "react";
import {
  Loader2,
  Sparkles,
  Zap,
  Trash2,
  Play,
  TrendingUp,
  Download,
  Globe,
} from "lucide-react";
import { useEditorStore } from "@/lib/store";
import { formatTime, CAPTION_LANGUAGES } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ClipDurationPreset, ViralClip, Caption } from "@/lib/types";

const DURATION_LABELS: Record<ClipDurationPreset, string> = {
  short: "Court (15-30s)",
  medium: "Moyen (25-50s)",
  long: "Long (45-90s)",
};

export function ClipsTab() {
  const {
    project,
    clipConfig,
    setClipConfig,
    setClips,
    deleteClip,
    setJob,
    getJob,
    setCurrentTime,
    setIsPlaying,
    setActiveClipId,
  } = useEditorStore();

  const [exportingClipId, setExportingClipId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportLang, setExportLang] = useState<string>("current"); // "current" or a track id

  const job = getJob("viral-clips");
  const isProcessing = job?.status === "processing" || job?.status === "pending";
  const hasClips = project.clips.length > 0;
  const hasCaptions = project.captions.length > 0;
  const tracks = project.captionTracks || [];

  const handleGenerate = useCallback(async () => {
    if (!project.videoUrl || isProcessing) return;

    setJob("viral-clips", { status: "pending", progress: 0, error: null });

    try {
      let transcript = "";

      if (hasCaptions) {
        // Use existing captions for precise timestamps
        transcript = project.captions
          .map((c) => `[${c.start.toFixed(1)}s - ${c.end.toFixed(1)}s] ${c.text}`)
          .join("\n");
      } else {
        // No captions — send video duration for GPT to suggest time-based clips
        const duration = project.videoMeta?.duration || 0;
        transcript = `[Vidéo de ${Math.round(duration)} secondes sans transcript disponible. Suggère des clips basés sur la durée totale en répartissant les segments uniformément sur la vidéo.]`;
      }

      setJob("viral-clips", { status: "processing", progress: 20 });

      const res = await fetch("/api/viral-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          count: clipConfig.count,
          duration: clipConfig.duration,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur");
      }

      setJob("viral-clips", { progress: 80 });
      const data = await res.json();
      setClips(data.clips);
      setJob("viral-clips", { status: "done", progress: 100 });
    } catch (err) {
      setJob("viral-clips", {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }, [hasCaptions, isProcessing, project, clipConfig, setJob, setClips]);

  const handleExportClip = useCallback(async (clip: ViralClip) => {
    if (exportingClipId || !project.videoUrl) return;
    setExportingClipId(clip.id);
    setExportError(null);

    try {
      // Get the right captions — either current, from a saved track, or none
      let sourceCaptions: Caption[] = [];
      if (exportLang === "none") {
        sourceCaptions = [];
      } else if (exportLang === "current") {
        sourceCaptions = project.captions;
      } else {
        const track = tracks.find((t) => t.id === exportLang);
        if (track) sourceCaptions = track.captions;
      }

      // Build word-level caption data for the clip's segments
      // Each caption within a segment gets remapped to clip-relative time
      const clipCaptions: { words: { word: string; start: number; end: number }[]; text: string; start: number; end: number }[] = [];
      let clipOffset = 0;

      for (const seg of clip.segments) {
        const segCaps = sourceCaptions.filter(
          (c) => c.start >= seg.start - 0.5 && c.end <= seg.end + 0.5
        );
        for (const cap of segCaps) {
          clipCaptions.push({
            text: cap.text,
            start: clipOffset + (cap.start - seg.start),
            end: clipOffset + (cap.end - seg.start),
            words: cap.words.map((w) => ({
              word: w.word,
              start: clipOffset + (w.start - seg.start),
              end: clipOffset + (w.end - seg.start),
            })),
          });
        }
        clipOffset += seg.end - seg.start;
      }

      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: project.videoUrl,
          segments: clip.segments,
          format: "9:16",
          clipTitle: clip.title.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim(),
          captions: clipCaptions.length > 0 ? clipCaptions : undefined,
          captionStyle: project.captionStyle,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
        throw new Error(err.error || "Erreur d'export");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${clip.title.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim() || "clip"}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Erreur d'export");
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setExportingClipId(null);
    }
  }, [exportingClipId, project.videoUrl, project.captions, project.captionStyle, exportLang, tracks]);

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Number of clips */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-txt-3">Nombre de clips</label>
          <span className="text-xs text-txt-2 font-mono">{clipConfig.count}</span>
        </div>
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={clipConfig.count}
          onChange={(e) => setClipConfig({ count: parseInt(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Duration preset */}
      <div>
        <label className="block text-xs text-txt-3 mb-1.5">Durée</label>
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(DURATION_LABELS) as ClipDurationPreset[]).map((key) => (
            <button
              key={key}
              onClick={() => setClipConfig({ duration: key })}
              className={`text-2xs py-1.5 rounded-md border transition-all ${
                clipConfig.duration === key
                  ? "bg-accent text-white border-accent"
                  : "bg-surface-2 text-txt-2 border-border hover:border-border-hover"
              }`}
            >
              {key === "short" ? "Court" : key === "medium" ? "Moyen" : "Long"}
            </button>
          ))}
        </div>
        <p className="text-2xs text-txt-3 mt-1">
          {DURATION_LABELS[clipConfig.duration]}
        </p>
      </div>

      {/* Format info */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border">
        <span className="text-2xs text-txt-3">Format de sortie :</span>
        <span className="text-2xs text-txt-2 font-medium">
          9:16 vertical · Face tracking
        </span>
      </div>

      {/* Subtitle language for export */}
      {(hasCaptions || tracks.length > 0) && (
        <div>
          <label className="flex items-center gap-1 text-xs text-txt-3 mb-1.5">
            <Globe className="w-3 h-3" />
            Sous-titres des clips
          </label>
          <select
            value={exportLang}
            onChange={(e) => setExportLang(e.target.value)}
            className="w-full bg-surface-2 text-xs text-txt-1 px-3 py-2 rounded-lg border border-border hover:border-border-hover outline-none appearance-none cursor-pointer"
          >
            {hasCaptions && (
              <option value="current">Sous-titres actuels ({project.captionStyle.language.toUpperCase()})</option>
            )}
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.captions.length} groupes)
              </option>
            ))}
            <option value="none">Sans sous-titres</option>
          </select>
        </div>
      )}

      {/* Clip list */}
      {hasClips && (
        <div className="space-y-1.5">
          <span className="text-xs text-txt-3">
            {project.clips.length} clips générés
          </span>
          {project.clips.map((clip, i) => (
            <div
              key={clip.id}
              className="group p-3 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xs text-txt-3 font-mono">
                      #{i + 1}
                    </span>
                    <span className="text-xs text-txt-1 font-medium truncate">
                      {clip.title}
                    </span>
                    {clip.segments.length > 1 && (
                      <span className="text-2xs bg-accent/20 text-accent px-1 rounded">
                        {clip.segments.length} seq
                      </span>
                    )}
                  </div>

                  {/* Segments timeline */}
                  <div className="space-y-0.5 mb-1">
                    {clip.segments.map((seg, si) => (
                      <button
                        key={si}
                        onClick={() => {
                          setActiveClipId(clip.id);
                          setCurrentTime(seg.start);
                        }}
                        className="flex items-center gap-1.5 text-2xs text-accent font-mono hover:underline"
                      >
                        <span className="text-txt-3">{clip.segments.length > 1 ? `S${si + 1}` : ""}</span>
                        {formatTime(seg.start)} → {formatTime(seg.end)}
                        <span className="text-txt-3">({Math.round(seg.end - seg.start)}s)</span>
                        {seg.label && <span className="text-txt-3 font-sans">{seg.label}</span>}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-2xs text-txt-3">
                    <span>Total : {Math.round(clip.totalDuration)}s</span>
                  </div>

                  <p className="text-2xs text-txt-3 mt-1 line-clamp-2">
                    {clip.reason}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-warn" />
                    <span className="text-xs text-warn font-medium font-mono">
                      {clip.viralityScore}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setActiveClipId(clip.id);
                        if (clip.segments.length > 0) {
                          setCurrentTime(clip.segments[0].start);
                        }
                        setIsPlaying(true);
                      }}
                      className="p-1 text-txt-3 hover:text-accent transition-colors"
                      title="Lire dans le lecteur"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleExportClip(clip)}
                      disabled={exportingClipId === clip.id}
                      className="p-1 text-txt-3 hover:text-ok transition-colors disabled:opacity-40"
                      title="Exporter en 9:16 HD"
                    >
                      {exportingClipId === clip.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => deleteClip(clip.id)}
                      className="p-1 text-txt-3 opacity-0 group-hover:opacity-100 hover:text-err transition-all"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status */}
      {job?.status === "processing" && (
        <ProgressBar
          progress={job.progress}
          label="Analyse en cours..."
          variant="accent"
        />
      )}

      {job?.status === "error" && (
        <div className="px-3 py-2 rounded-lg bg-err-muted text-xs text-err">
          {job.error}
        </div>
      )}

      {exportError && (
        <div className="px-3 py-2 rounded-lg bg-err-muted text-xs text-err">
          Export : {exportError}
        </div>
      )}

      {/* Generate button */}
      <div className="mt-auto pt-2">
        {!hasCaptions && project.videoUrl && (
          <p className="text-2xs text-txt-3 text-center mb-2">
            Les clips seront basés sur la durée de la vidéo. Génère d&apos;abord les sous-titres pour de meilleurs résultats.
          </p>
        )}
        <button
          onClick={handleGenerate}
          disabled={!project.videoUrl || isProcessing}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-all"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Détection...
            </>
          ) : hasClips ? (
            <>
              <Sparkles className="w-4 h-4" />
              Regénérer
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Trouver les clips viraux
            </>
          )}
        </button>
      </div>
    </div>
  );
}
