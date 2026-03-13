"use client";

import { useCallback, useState } from "react";
import {
  Loader2,
  Sparkles,
  BookOpen,
  Trash2,
  Edit3,
  Check,
} from "lucide-react";
import { useEditorStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/ProgressBar";

export function ChaptersTab() {
  const {
    project,
    chapterConfig,
    setChapterConfig,
    setChapters,
    updateChapter,
    deleteChapter,
    setJob,
    getJob,
    setCurrentTime,
  } = useEditorStore();

  const job = getJob("chapters");
  const isProcessing = job?.status === "processing" || job?.status === "pending";
  const hasChapters = project.chapters.length > 0;
  const hasCaptions = project.captions.length > 0;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");

  const handleGenerate = useCallback(async () => {
    if (!hasCaptions || isProcessing) return;

    setJob("chapters", { status: "pending", progress: 0, error: null });

    try {
      // Build transcript with timestamps
      const transcript = project.captions
        .map((c) => `[${formatTime(c.start)}] ${c.text}`)
        .join("\n");

      setJob("chapters", { status: "processing", progress: 30 });

      const res = await fetch("/api/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          duration: project.videoMeta?.duration || 0,
          count: chapterConfig.count,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur");
      }

      setJob("chapters", { progress: 80 });
      const data = await res.json();
      setChapters(data.chapters);
      setJob("chapters", { status: "done", progress: 100 });
    } catch (err) {
      setJob("chapters", {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }, [hasCaptions, isProcessing, project, chapterConfig, setJob, setChapters]);

  const startEdit = (id: string) => {
    const ch = project.chapters.find((c) => c.id === id);
    if (!ch) return;
    setEditingId(id);
    setEditTitle(ch.title);
    setEditStart(ch.start.toFixed(1));
  };

  const commitEdit = () => {
    if (!editingId) return;
    updateChapter(editingId, {
      title: editTitle,
      start: parseFloat(editStart) || 0,
    });
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Config: number of chapters */}
      <div>
        <label className="block text-xs text-txt-3 mb-1.5">
          Nombre de chapitres
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChapterConfig({ count: "auto" })}
            className={`flex-1 text-xs py-1.5 rounded-md border transition-all ${
              chapterConfig.count === "auto"
                ? "bg-accent text-white border-accent"
                : "bg-surface-2 text-txt-2 border-border hover:border-border-hover"
            }`}
          >
            Auto
          </button>
          <input
            type="range"
            min={3}
            max={20}
            step={1}
            value={
              typeof chapterConfig.count === "number" ? chapterConfig.count : 8
            }
            onChange={(e) =>
              setChapterConfig({ count: parseInt(e.target.value) })
            }
            className="flex-[2]"
          />
          <span className="text-xs text-txt-2 font-mono min-w-[24px] text-right">
            {chapterConfig.count === "auto" ? "—" : chapterConfig.count}
          </span>
        </div>
      </div>

      {/* Chapter list */}
      {hasChapters && (
        <div className="space-y-1">
          <span className="text-xs text-txt-3">
            {project.chapters.length} chapitres
          </span>
          {project.chapters.map((ch, i) => (
            <div
              key={ch.id}
              className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors"
            >
              <span className="text-2xs text-txt-3 font-mono w-5">{i + 1}</span>

              {editingId === ch.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 bg-surface-0 text-xs text-txt-1 px-2 py-1 rounded border border-border-hover outline-none"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    className="w-14 bg-surface-0 text-2xs text-txt-2 font-mono px-1.5 py-1 rounded border border-border-hover outline-none"
                    placeholder="0.0"
                  />
                  <button
                    onClick={commitEdit}
                    className="p-1 text-ok hover:text-ok"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setCurrentTime(ch.start)}
                    className="text-2xs text-accent font-mono min-w-[40px] hover:underline"
                  >
                    {formatTime(ch.start)}
                  </button>
                  <span className="flex-1 text-xs text-txt-1 truncate">
                    {ch.title}
                  </span>
                  <button
                    onClick={() => startEdit(ch.id)}
                    className="p-1 text-txt-3 opacity-0 group-hover:opacity-100 hover:text-txt-1 transition-all"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteChapter(ch.id)}
                    className="p-1 text-txt-3 opacity-0 group-hover:opacity-100 hover:text-err transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
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
          ) : hasChapters ? (
            <>
              <Sparkles className="w-4 h-4" />
              Regénérer
            </>
          ) : (
            <>
              <BookOpen className="w-4 h-4" />
              Détecter les chapitres
            </>
          )}
        </button>
      </div>
    </div>
  );
}
