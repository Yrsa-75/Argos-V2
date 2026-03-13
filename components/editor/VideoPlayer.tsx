"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { useEditorStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isSeeking, setIsSeeking] = useState(false);

  const {
    project,
    currentTime,
    isPlaying,
    playbackRate,
    volume,
    setCurrentTime,
    setIsPlaying,
    setPlaybackRate,
    setVolume,
  } = useEditorStore();

  const duration = project.videoMeta?.duration || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Sync video element with store
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(video.currentTime);
      }
    };
    const onEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [isSeeking, setCurrentTime, setIsPlaying]);

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

  // Playback rate sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // Volume sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = pct * duration;
      if (videoRef.current) videoRef.current.currentTime = time;
      setCurrentTime(time);
    },
    [duration, setCurrentTime]
  );

  const cycleSpeed = useCallback(() => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const idx = speeds.indexOf(playbackRate);
    const next = speeds[(idx + 1) % speeds.length];
    setPlaybackRate(next);
  }, [playbackRate, setPlaybackRate]);

  const toggleMute = useCallback(() => {
    setVolume(volume === 0 ? 1 : 0);
  }, [volume, setVolume]);

  // Keyboard shortcuts for video
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newTime = Math.max(0, currentTime - 5);
        if (videoRef.current) videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const newTime = Math.min(duration, currentTime + 5);
        if (videoRef.current) videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, currentTime, duration, setCurrentTime]);

  // Get current caption for overlay — apply sync offset + stretch
  const syncOffset = project.captionStyle.syncOffset || 0;
  const syncStretch = project.captionStyle.syncStretch || 1;
  // Map video time to caption time: stretch adjusts progressive drift, offset shifts globally
  const syncTime = currentTime * syncStretch + syncOffset;
  const currentCaption = project.captions.find(
    (c) => syncTime >= c.start - 0.1 && syncTime <= c.end + 0.2
  );

  // Find the active word index within the current caption
  // Instead of exact range matching, find the closest word to avoid skips
  const getActiveWordIndex = (caption: typeof currentCaption) => {
    if (!caption) return -1;
    const words = caption.words;
    
    // First try exact match
    const exactIdx = words.findIndex(
      (w) => syncTime >= w.start - 0.05 && syncTime <= w.end + 0.05
    );
    if (exactIdx >= 0) return exactIdx;

    // If no exact match, find the closest word by time
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < words.length; i++) {
      const mid = (words[i].start + words[i].end) / 2;
      const dist = Math.abs(syncTime - mid);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    // Only highlight if we're reasonably close (within 1 second)
    return closestDist < 1 ? closestIdx : -1;
  };

  const activeWordIndex = getActiveWordIndex(currentCaption);

  return (
    <div className="flex flex-col bg-black relative">
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
              <div
                className={`absolute left-0 right-0 flex justify-center px-4 pointer-events-none ${
                  project.captionStyle.position === "top"
                    ? "top-6"
                    : project.captionStyle.position === "center"
                    ? "top-1/2 -translate-y-1/2"
                    : "bottom-14"
                }`}
              >
                <p
                  style={{
                    fontFamily: project.captionStyle.fontFamily,
                    fontSize: `${Math.round(project.captionStyle.fontSize * 0.5)}px`,
                    color: project.captionStyle.textColor,
                    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                    fontWeight: 700,
                    textAlign: "center",
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    alignItems: "baseline",
                    gap: "0 4px",
                  }}
                >
                  {currentCaption.words.map((w, i) => {
                    const isActive = i === activeWordIndex;
                    return (
                      <span
                        key={i}
                        style={{
                          color: isActive
                            ? project.captionStyle.highlightColor
                            : project.captionStyle.textColor,
                          transform: isActive ? "scale(1.2)" : "scale(1)",
                          marginLeft: isActive ? "4px" : "0",
                          marginRight: isActive ? "4px" : "0",
                          transition: "color 0.15s ease, transform 0.15s ease, margin 0.15s ease",
                          transformOrigin: "center bottom",
                        }}
                      >
                        {w.word}
                      </span>
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

      {/* Controls bar */}
      <div className="h-10 px-3 flex items-center gap-3 bg-surface-1 border-t border-border">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="p-1 text-txt-2 hover:text-txt-1 transition-colors"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" fill="currentColor" />
          ) : (
            <Play className="w-4 h-4" fill="currentColor" />
          )}
        </button>

        {/* Timeline */}
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          className="flex-1 h-6 flex items-center cursor-pointer group"
        >
          <div className="relative w-full h-1 bg-surface-3 rounded-full group-hover:h-1.5 transition-all">
            {/* Chapter markers */}
            {project.chapters.map((ch) => {
              const pct = duration > 0 ? (ch.start / duration) * 100 : 0;
              return (
                <div
                  key={ch.id}
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-warn rounded-full z-10"
                  style={{ left: `${pct}%` }}
                  title={ch.title}
                />
              );
            })}
            {/* Progress */}
            <div
              className="absolute inset-y-0 left-0 bg-accent rounded-full"
              style={{ width: `${progress}%` }}
            />
            {/* Playhead */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent rounded-full border-2 border-surface-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progress}%`, marginLeft: "-6px" }}
            />
          </div>
        </div>

        {/* Time display */}
        <span className="text-2xs text-txt-3 font-mono min-w-[80px] text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Volume */}
        <button
          onClick={toggleMute}
          className="p-1 text-txt-3 hover:text-txt-1 transition-colors"
        >
          {volume === 0 ? (
            <VolumeX className="w-3.5 h-3.5" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Speed */}
        <button
          onClick={cycleSpeed}
          className="px-1.5 py-0.5 text-2xs text-txt-3 hover:text-txt-1 font-mono rounded border border-border hover:border-border-hover transition-colors"
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
}
