"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Trash2, FileDown, GripVertical } from "lucide-react";
import { useEditorStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";

export function TranscriptPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const {
    project,
    currentTime,
    setCurrentTime,
    selectedCaptionId,
    setSelectedCaption,
    updateCaption,
    deleteCaption,
  } = useEditorStore();

  const captions = project.captions;
  const hasContent = captions.length > 0 || project.synthes.length > 0;
  const syncOffset = project.captionStyle.syncOffset || 0;
  const syncStretch = project.captionStyle.syncStretch || 1;
  const syncTime = currentTime * syncStretch + syncOffset;

  // Auto-scroll to active caption
  useEffect(() => {
    if (!scrollRef.current) return;
    const active = scrollRef.current.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentTime]);

  const handleDoubleClick = useCallback(
    (captionId: string) => {
      const caption = captions.find((c) => c.id === captionId);
      if (!caption) return;
      setEditingId(captionId);
      setEditText(caption.text);
      setEditStart(caption.start.toFixed(2));
      setEditEnd(caption.end.toFixed(2));
    },
    [captions]
  );

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const caption = captions.find((c) => c.id === editingId);
    if (!caption) return;

    const newStart = parseFloat(editStart);
    const newEnd = parseFloat(editEnd);

    updateCaption(editingId, {
      text: editText,
      start: isNaN(newStart) ? caption.start : newStart,
      end: isNaN(newEnd) ? caption.end : newEnd,
      words: editText.split(/\s+/).map((word, i, arr) => {
        const s = isNaN(newStart) ? caption.start : newStart;
        const e = isNaN(newEnd) ? caption.end : newEnd;
        const dur = e - s;
        return {
          word,
          start: s + (dur / arr.length) * i,
          end: s + (dur / arr.length) * (i + 1),
        };
      }),
    });
    setEditingId(null);
  }, [editingId, editText, editStart, editEnd, captions, updateCaption]);

  const handleExportSRT = useCallback(() => {
    if (captions.length === 0) return;

    const srt = captions
      .map((c, i) => {
        const startStr = formatSRTTime(c.start);
        const endStr = formatSRTTime(c.end);
        return `${i + 1}\n${startStr} --> ${endStr}\n${c.text}\n`;
      })
      .join("\n");

    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title || "subtitles"}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [captions, project.title]);

  if (!hasContent) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-txt-3 text-center">
          Générez des sous-titres depuis le panneau de droite pour voir le
          transcript ici.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-txt-2">
          Transcript · {captions.length} blocs
        </span>
        {captions.length > 0 && (
          <button
            onClick={handleExportSRT}
            className="flex items-center gap-1 text-2xs text-accent hover:text-accent-hover transition-colors"
          >
            <FileDown className="w-3 h-3" />
            Exporter .SRT
          </button>
        )}
      </div>

      {/* Caption list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {captions.map((caption) => {
          const isActive =
            syncTime >= caption.start - 0.1 && syncTime <= caption.end + 0.2;
          const isSelected = selectedCaptionId === caption.id;
          const isEditing = editingId === caption.id;

          return (
            <div
              key={caption.id}
              data-active={isActive}
              onClick={() => {
                setSelectedCaption(caption.id);
                setCurrentTime(caption.start);
              }}
              onDoubleClick={() => handleDoubleClick(caption.id)}
              className={`
                group flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all
                ${isActive ? "bg-accent-muted" : "hover:bg-surface-2"}
                ${isSelected ? "ring-1 ring-accent/30" : ""}
              `}
            >
              {/* Grip handle */}
              <GripVertical className="w-3 h-3 mt-1 text-txt-3 opacity-0 group-hover:opacity-50 shrink-0" />

              {/* Timestamp */}
              <span className="text-2xs text-txt-3 font-mono min-w-[40px] mt-0.5 shrink-0">
                {formatTime(caption.start)}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          commitEdit();
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full bg-surface-2 text-xs text-txt-1 px-2 py-1.5 rounded border border-border-hover outline-none resize-none"
                      rows={2}
                    />
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-2xs text-txt-3">Début:</span>
                        <input
                          type="text"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="w-16 bg-surface-2 text-2xs text-txt-2 font-mono px-1.5 py-0.5 rounded border border-border-hover outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-2xs text-txt-3">Fin:</span>
                        <input
                          type="text"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                          className="w-16 bg-surface-2 text-2xs text-txt-2 font-mono px-1.5 py-0.5 rounded border border-border-hover outline-none"
                        />
                      </div>
                      <button
                        onClick={commitEdit}
                        className="text-2xs text-accent hover:text-accent-hover ml-auto"
                      >
                        Valider
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-txt-1 leading-relaxed">
                    {caption.words.map((w, i) => {
                      // Find closest word instead of exact range match
                      let isWordActive = false;
                      if (isActive) {
                        const exactMatch = syncTime >= w.start - 0.05 && syncTime <= w.end + 0.05;
                        if (exactMatch) {
                          isWordActive = true;
                        } else {
                          // Check if this is the closest word
                          const mid = (w.start + w.end) / 2;
                          const dist = Math.abs(syncTime - mid);
                          const isClosest = caption.words.every((other, j) => {
                            if (j === i) return true;
                            return Math.abs(syncTime - (other.start + other.end) / 2) >= dist;
                          });
                          isWordActive = isClosest && dist < 1;
                        }
                      }
                      return (
                        <span
                          key={i}
                          className={`transition-colors ${
                            isWordActive
                              ? "text-warn font-medium"
                              : ""
                          }`}
                        >
                          {w.word}{" "}
                        </span>
                      );
                    })}
                  </p>
                )}
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCaption(caption.id);
                }}
                className="p-1 text-txt-3 opacity-0 group-hover:opacity-100 hover:text-err transition-all shrink-0"
                title="Supprimer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SRT time format ───────────────────────────────────────

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  const pad3 = (n: number) => n.toString().padStart(3, "0");
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}
