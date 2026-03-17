"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, X, Download, Loader2 } from "lucide-react";
import { useEditorStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import { loadGoogleFont } from "@/lib/fonts";
import type { ClipSegment, Caption } from "@/lib/types";

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [currentSegmentIdx, setCurrentSegmentIdx] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const {
    project,
    currentTime,
    isPlaying,
    playbackRate,
    volume,
    activeClipId,
    setCurrentTime,
    setIsPlaying,
    setPlaybackRate,
    setVolume,
    setActiveClipId,
  } = useEditorStore();

  const activeClip = activeClipId
    ? project.clips.find((c) => c.id === activeClipId) || null
    : null;

  const segments: ClipSegment[] = activeClip?.segments || [];
  const fullDuration = project.videoMeta?.duration || 0;
  const clipTotalDuration = activeClip?.totalDuration || 0;

  // Compute the "clip elapsed time" — how far we are into the multi-segment clip
  const clipElapsed = useMemo(() => {
    if (!activeClip || segments.length === 0) return 0;
    let elapsed = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (i < currentSegmentIdx) {
        elapsed += seg.end - seg.start;
      } else if (i === currentSegmentIdx) {
        elapsed += Math.max(0, Math.min(currentTime - seg.start, seg.end - seg.start));
        break;
      }
    }
    return elapsed;
  }, [activeClip, segments, currentSegmentIdx, currentTime]);

  const displayTime = activeClip ? clipElapsed : currentTime;
  const displayDuration = activeClip ? clipTotalDuration : fullDuration;
  const progress = displayDuration > 0 ? (displayTime / displayDuration) * 100 : 0;

  // requestAnimationFrame for smooth time tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId: number;
    let lastReportedTime = -1;
    const tick = () => {
      if (!isSeeking && video && !video.paused) {
        const t = video.currentTime;
        if (Math.abs(t - lastReportedTime) > 0.03) {
          lastReportedTime = t;
          setCurrentTime(t);

          // Multi-segment: auto-advance to next segment
          if (activeClip && segments.length > 0) {
            const seg = segments[currentSegmentIdx];
            if (seg && t >= seg.end - 0.05) {
              const nextIdx = currentSegmentIdx + 1;
              if (nextIdx < segments.length) {
                // Jump to next segment
                video.currentTime = segments[nextIdx].start;
                setCurrentSegmentIdx(nextIdx);
              } else {
                // End of last segment — pause
                video.pause();
                setIsPlaying(false);
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const onEnded = () => setIsPlaying(false);
    const onSeeked = () => {
      lastReportedTime = video.currentTime;
      setCurrentTime(video.currentTime);
    };
    const onPause = () => {
      lastReportedTime = video.currentTime;
      setCurrentTime(video.currentTime);
    };

    video.addEventListener("ended", onEnded);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("pause", onPause);
    return () => {
      cancelAnimationFrame(rafId);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("pause", onPause);
    };
  }, [isSeeking, setCurrentTime, setIsPlaying, activeClip, segments, currentSegmentIdx]);

  // When switching to a clip, seek to first segment start
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (activeClip && segments.length > 0) {
      video.currentTime = segments[0].start;
      setCurrentTime(segments[0].start);
      setCurrentSegmentIdx(0);
    }
  }, [activeClipId]);

  // Play/pause sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }, [isPlaying, setIsPlaying]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  // Load caption font dynamically
  useEffect(() => {
    if (project.captionStyle.fontFamily) {
      loadGoogleFont(project.captionStyle.fontFamily);
    }
  }, [project.captionStyle.fontFamily]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // If clip ended, restart from beginning
    if (activeClip && segments.length > 0) {
      const lastSeg = segments[segments.length - 1];
      if (video.currentTime >= lastSeg.end - 0.1) {
        video.currentTime = segments[0].start;
        setCurrentTime(segments[0].start);
        setCurrentSegmentIdx(0);
      }
    }

    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying, activeClip, segments, setCurrentTime]);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timelineRef.current || !displayDuration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      if (activeClip && segments.length > 0) {
        // Map click position to multi-segment time
        const targetElapsed = pct * clipTotalDuration;
        let elapsed = 0;
        for (let i = 0; i < segments.length; i++) {
          const segDur = segments[i].end - segments[i].start;
          if (elapsed + segDur >= targetElapsed) {
            const offset = targetElapsed - elapsed;
            const videoTime = segments[i].start + offset;
            if (videoRef.current) videoRef.current.currentTime = videoTime;
            setCurrentTime(videoTime);
            setCurrentSegmentIdx(i);
            return;
          }
          elapsed += segDur;
        }
      } else {
        const time = pct * fullDuration;
        if (videoRef.current) videoRef.current.currentTime = time;
        setCurrentTime(time);
      }
    },
    [displayDuration, activeClip, segments, clipTotalDuration, fullDuration, setCurrentTime]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newTime = Math.max(0, currentTime - 5);
        if (videoRef.current) videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const newTime = Math.min(fullDuration, currentTime + 5);
        if (videoRef.current) videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, currentTime, fullDuration, setCurrentTime]);

  // Caption overlay
  const syncOffset = project.captionStyle.syncOffset || 0;
  const syncStretch = project.captionStyle.syncStretch || 1;
  const syncTime = currentTime * syncStretch + syncOffset;
  const currentCaption = project.captions.find(
    (c) => syncTime >= c.start - 0.1 && syncTime <= c.end + 0.2
  );

  const getActiveWordIndex = (caption: typeof currentCaption) => {
    if (!caption) return -1;
    const words = caption.words;
    const exactIdx = words.findIndex(
      (w) => syncTime >= w.start - 0.05 && syncTime <= w.end + 0.05
    );
    if (exactIdx >= 0) return exactIdx;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < words.length; i++) {
      const mid = (words[i].start + words[i].end) / 2;
      const dist = Math.abs(syncTime - mid);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    }
    return closestDist < 1 ? closestIdx : -1;
  };

  const activeWordIndex = getActiveWordIndex(currentCaption);

  // Export the current active clip as MP4 HD
  const handleExportClip = useCallback(async () => {
    if (!activeClip || isExporting || !project.videoUrl) return;
    setIsExporting(true);
    setExportError(null);

    try {
      // Build word-level captions remapped to clip-relative time
      const sourceCaptions: Caption[] = project.captions;
      const clipCaptions: any[] = [];
      let clipOffset = 0;

      for (const seg of activeClip.segments) {
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
          segments: activeClip.segments,
          format: "original",
          clipTitle: activeClip.title,
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
      a.download = `${(activeClip.title || "clip").replace(/[^a-zA-Z0-9\-_\s]/g, "").trim()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Erreur d'export");
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setIsExporting(false);
    }
  }, [activeClip, isExporting, project.videoUrl, project.captions, project.captionStyle]);

  return (
    <div className="flex flex-col bg-black relative">
      {/* Tabs */}
      {project.clips.length > 0 && (
        <div className="flex items-center gap-0 bg-surface-1 border-b border-border px-2 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveClipId(null)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              !activeClipId ? "border-accent text-accent" : "border-transparent text-txt-3 hover:text-txt-1"
            }`}
          >
            Vidéo complète
          </button>
          {project.clips.map((clip, i) => (
            <div key={clip.id} className={`flex items-center gap-1 border-b-2 transition-colors ${
              activeClipId === clip.id ? "border-accent" : "border-transparent"
            }`}>
              <button
                onClick={() => setActiveClipId(clip.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeClipId === clip.id ? "text-accent" : "text-txt-3 hover:text-txt-1"
                }`}
              >
                <span className="text-2xs opacity-60">#{i + 1}</span>
                <span className="max-w-[120px] truncate">{clip.title}</span>
                {clip.segments.length > 1 && (
                  <span className="text-2xs bg-accent/20 text-accent px-1 rounded">{clip.segments.length} seq</span>
                )}
              </button>
              {activeClipId === clip.id && (
                <button onClick={() => setActiveClipId(null)} className="p-0.5 text-txt-3 hover:text-txt-1 mr-1">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Clip info bar */}
      {activeClip && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-accent/10 border-b border-accent/20 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xs text-accent font-medium">{activeClip.title}</span>
            <span className="text-2xs text-txt-3">·</span>
            <span className="text-2xs text-txt-3">
              {segments.length} séquence{segments.length > 1 ? "s" : ""} · {Math.round(clipTotalDuration)}s
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xs text-txt-3">Score : {activeClip.viralityScore}/100</span>
            <button
              onClick={handleExportClip}
              disabled={isExporting}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-2xs font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-all"
            >
              {isExporting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              {isExporting ? "Export..." : "Exporter MP4 HD"}
            </button>
          </div>
        </div>
      )}

      {/* Export error */}
      {exportError && (
        <div className="px-3 py-1 bg-err/10 border-b border-err/20 shrink-0">
          <span className="text-2xs text-err">{exportError}</span>
        </div>
      )}

      {/* Video element */}
      <div className="relative flex-1 flex items-center justify-center min-h-[240px] bg-surface-0">
        {project.videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={project.videoUrl}
              className="max-h-full max-w-full object-contain"
              playsInline
              preload="auto"
              onClick={togglePlay}
            />
            {/* Caption overlay */}
            {currentCaption && (
              <div className={`absolute left-0 right-0 flex justify-center px-4 pointer-events-none ${
                project.captionStyle.position === "top" ? "top-6"
                  : project.captionStyle.position === "center" ? "top-1/2 -translate-y-1/2"
                  : "bottom-14"
              }`}>
                <p style={{
                  fontFamily: project.captionStyle.fontFamily,
                  fontSize: `${Math.round(project.captionStyle.fontSize * 0.5)}px`,
                  color: project.captionStyle.textColor,
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                  fontWeight: 700, textAlign: "center",
                  display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline",
                  gap: "4px 4px",
                  maxWidth: "90%",
                  lineHeight: 1.4,
                  overflowWrap: "break-word" as any,
                }}>
                  {currentCaption.words.map((w, i) => {
                    const isActive = i === activeWordIndex;
                    return (
                      <span key={i} style={{
                        color: isActive ? project.captionStyle.highlightColor : project.captionStyle.textColor,
                        transform: isActive ? "scale(1.2)" : "scale(1)",
                        marginLeft: isActive ? "8px" : "0", marginRight: isActive ? "8px" : "0",
                        transition: "color 0.15s ease, transform 0.15s ease, margin 0.15s ease",
                        transformOrigin: "center bottom",
                      }}>{w.word}</span>
                    );
                  })}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="text-txt-3 text-sm">Aucune vidéo chargée</div>
        )}
      </div>

      {/* Controls */}
      {project.videoUrl && (
        <div className="px-3 py-2 bg-surface-1 border-t border-border shrink-0">
          {/* Timeline */}
          <div
            ref={timelineRef}
            onClick={handleTimelineClick}
            onMouseDown={() => setIsSeeking(true)}
            onMouseUp={() => setIsSeeking(false)}
            className="group relative h-1.5 bg-surface-3 rounded-full cursor-pointer mb-2 hover:h-2.5 transition-all"
          >
            <div className="absolute inset-y-0 left-0 bg-accent rounded-full" style={{ width: `${Math.min(progress, 100)}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent rounded-full border-2 border-surface-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progress}%`, marginLeft: "-6px" }}
            />

            {/* Segment markers for multi-segment clips */}
            {activeClip && segments.length > 1 && (() => {
              let elapsed = 0;
              return segments.slice(0, -1).map((seg, i) => {
                elapsed += seg.end - seg.start;
                const pct = (elapsed / clipTotalDuration) * 100;
                return (
                  <div key={i} className="absolute top-0 bottom-0 w-0.5 bg-accent/40" style={{ left: `${pct}%` }} />
                );
              });
            })()}

            {/* Chapter markers on main video */}
            {!activeClip && project.chapters.map((ch) => (
              <div key={ch.id} className="absolute top-0 bottom-0 w-0.5 bg-warn/60"
                style={{ left: `${fullDuration > 0 ? (ch.start / fullDuration) * 100 : 0}%` }} />
            ))}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={togglePlay} className="p-1 text-txt-1 hover:text-accent transition-colors">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <span className="text-2xs text-txt-2 font-mono min-w-[80px]">
                {formatTime(Math.max(0, displayTime))} / {formatTime(displayDuration)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setVolume(volume > 0 ? 0 : 1)} className="p-1 text-txt-3 hover:text-txt-1 transition-colors">
                {volume > 0 ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
              <select value={playbackRate} onChange={(e) => setPlaybackRate(Number(e.target.value))}
                className="bg-transparent text-2xs text-txt-3 cursor-pointer outline-none">
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
