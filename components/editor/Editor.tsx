"use client";

import { useEditorStore } from "@/lib/store";
import { Header } from "./Header";
import { VideoPlayer } from "./VideoPlayer";
import { TranscriptPanel } from "./TranscriptPanel";
import { ActionPanel } from "./ActionPanel";
import { UploadZone } from "@/components/ui/UploadZone";

export function Editor() {
  const { project } = useEditorStore();
  const hasVideo = !!project.videoUrl;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Header */}
      <Header />

      {/* Main content */}
      {hasVideo ? (
        <div className="flex-1 flex min-h-0">
          {/* Left: Video + Transcript */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Video player */}
            <div className="flex-shrink-0" style={{ height: "50%" }}>
              <VideoPlayer />
            </div>

            {/* Transcript panel */}
            <div className="flex-1 min-h-0 border-t border-border flex flex-col">
              <TranscriptPanel />
            </div>
          </div>

          {/* Right: Action panel */}
          <div className="w-[280px] shrink-0">
            <ActionPanel />
          </div>
        </div>
      ) : (
        <UploadZone />
      )}
    </div>
  );
}
