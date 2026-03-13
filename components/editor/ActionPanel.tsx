"use client";

import { Type, BookOpen, Zap } from "lucide-react";
import { useEditorStore } from "@/lib/store";
import { CaptionsTab } from "@/components/actions/CaptionsTab";
import { ChaptersTab } from "@/components/actions/ChaptersTab";
import { ClipsTab } from "@/components/actions/ClipsTab";
import type { ActiveTab } from "@/lib/types";

const TABS: { key: ActiveTab; label: string; icon: typeof Type }[] = [
  { key: "captions", label: "Captions", icon: Type },
  { key: "chapters", label: "Chapitres", icon: BookOpen },
  { key: "clips", label: "Clips", icon: Zap },
];

export function ActionPanel() {
  const { activeTab, setActiveTab, project } = useEditorStore();

  const captionCount = project.captions.length;
  const chapterCount = project.chapters.length;
  const clipCount = project.clips.length;

  const badges: Record<ActiveTab, number> = {
    captions: captionCount,
    chapters: chapterCount,
    clips: clipCount,
  };

  return (
    <div className="flex flex-col h-full border-l border-border bg-surface-1">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          const count = badges[tab.key];

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium
                border-b-2 transition-all
                ${
                  isActive
                    ? "text-txt-1 border-accent"
                    : "text-txt-3 border-transparent hover:text-txt-2 hover:bg-surface-2"
                }
              `}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {count > 0 && (
                <span
                  className={`text-2xs px-1.5 py-0 rounded-full ${
                    isActive
                      ? "bg-accent-muted text-accent"
                      : "bg-surface-3 text-txt-3"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "captions" && <CaptionsTab />}
        {activeTab === "chapters" && <ChaptersTab />}
        {activeTab === "clips" && <ClipsTab />}
      </div>
    </div>
  );
}
