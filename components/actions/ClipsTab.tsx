"use client";

import { useCallback } from "react";
import {
  Loader2,
  Sparkles,
  Zap,
  Trash2,
  Play,
  TrendingUp,
} from "lucide-react";
import { useEditorStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ClipDurationPreset } from "@/lib/types";

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
  } = useEditorStore();

  const job = getJob("viral-clips");
  const isProcessing = job?.status === "processing" || job?.status === "pending";
  const hasClips = project.clips.length > 0;
  const hasCaptions = project.captions.length > 0;

  const handleGenerate = useCallback(async () => {
    if (!hasCaptions || isProcessing) return;

    setJob("viral-clips", { status: "pending", progress: 0, error: null });

    try {
      const transcript = project.captions
        .map((c) => `[${c.start.toFixed(1)}s - ${c.end.toFixed(1)}s] ${c.text}`)
        .join("\n");

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
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setCurrentTime(clip.start)}
                      className="text-2xs text-accent font-mono hover:underline"
                    >
                      {formatTime(clip.start)} → {formatTime(clip.end)}
                    </button>
                    <span className="text-2xs text-txt-3">
                      {Math.round(clip.end - clip.start)}s
                    </span>
                  </div>

                  <p className="text-2xs text-txt-3 mt-1 line-clamp-2">
                    {clip.reason}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  {/* Virality score */}
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-warn" />
                    <span className="text-xs text-warn font-medium font-mono">
                      {clip.viralityScore}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentTime(clip.start)}
                      className="p-1 text-txt-3 hover:text-txt-1 transition-colors"
                      title="Prévisualiser"
                    >
                      <Play className="w-3 h-3" />
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

      {/* Generate button */}
      <div className="mt-auto pt-2">
        {!hasCaptions && (
          <p className="text-2xs text-txt-3 text-center mb-2">
            Les sous-titres doivent être générés d&apos;abord
          </p>
        )}
        <button
          onClick={handleGenerate}
          disabled={!hasCaptions || isProcessing}
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
