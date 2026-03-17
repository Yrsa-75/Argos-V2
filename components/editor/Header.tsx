"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  Loader2,
  X,
  Clock,
  Film,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEditorStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";

interface ProjectListItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  video_duration: number | null;
  created_at: string;
  updated_at: string;
}

export function Header() {
  const {
    project,
    hasUnsavedChanges,
    undoStack,
    redoStack,
    undo,
    redo,
    markSaved,
    setProject,
    updateProject,
    resetProject,
  } = useEditorStore();

  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [projectList, setProjectList] = useState<ProjectListItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
          e.preventDefault();
          redo();
        } else if (e.key === "s") {
          e.preventDefault();
          handleSave();
        }
      }
      if (e.key === "Escape" && showOpenModal) {
        setShowOpenModal(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, showOpenModal]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
        throw new Error(errData.error || "Échec de la sauvegarde");
      }
      markSaved();
      setSaveError(null);
    } catch (err) {
      console.error("Save error:", err);
      setSaveError(err instanceof Error ? err.message : "Erreur de sauvegarde");
      // Clear error after 5 seconds
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      setIsSaving(false);
    }
  }, [project, isSaving, markSaved]);

  const handleOpenModal = useCallback(async () => {
    setShowOpenModal(true);
    setIsLoadingList(true);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      const data = await res.json();
      setProjectList(data);
    } catch (err) {
      console.error("Load projects error:", err);
      setProjectList([]);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  const handleLoadProject = useCallback(
    async (id: string) => {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          "Le projet en cours n'est pas sauvegardé. Voulez-vous continuer ?"
        );
        if (!confirmed) return;
      }
      setIsLoadingProject(id);
      try {
        const res = await fetch(`/api/projects?id=${id}`);
        if (!res.ok) throw new Error("Load failed");
        const data = await res.json();
        if (data.state) {
          setProject(data.state);
          setShowOpenModal(false);
        }
      } catch (err) {
        console.error("Load project error:", err);
      } finally {
        setIsLoadingProject(null);
      }
    },
    [setProject, hasUnsavedChanges]
  );

  const handleNewProject = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "Le projet en cours n'est pas sauvegardé. Voulez-vous continuer et perdre les modifications ?"
      );
      if (!confirmed) return;
    }
    resetProject();
  }, [hasUnsavedChanges, resetProject]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);

    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    if (diffH < 24) return `Il y a ${diffH}h`;
    if (diffD < 7) return `Il y a ${diffD}j`;
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: diffD > 365 ? "numeric" : undefined,
    });
  };

  return (
    <>
      <header className="flex items-center justify-between h-12 px-4 border-b border-border bg-surface-1 shrink-0">
        {/* Left: New project + Title + status */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleNewProject}
            className="p-1.5 rounded-md text-txt-3 hover:text-txt-1 hover:bg-surface-2 transition-colors shrink-0"
            title="Nouveau projet"
          >
            <Plus className="w-4 h-4" />
          </button>

          {isEditing ? (
            <input
              autoFocus
              type="text"
              value={project.title}
              onChange={(e) => updateProject({ title: e.target.value })}
              onBlur={() => setIsEditing(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setIsEditing(false);
              }}
              className="bg-surface-2 text-sm font-medium px-2 py-1 rounded border border-border-hover outline-none text-txt-1 max-w-[240px]"
            />
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-txt-1 hover:text-accent truncate max-w-[280px] transition-colors group"
            >
              <span className="truncate">{project.title}</span>
              <Pencil className="w-3 h-3 text-txt-3 group-hover:text-accent shrink-0 transition-colors" />
            </button>
          )}

          {hasUnsavedChanges && (
            <span className="shrink-0 text-2xs px-2 py-0.5 rounded-full bg-warn-muted text-warn font-medium">
              Non sauvegardé
            </span>
          )}
        </div>

        {/* Center: Undo/Redo */}
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="p-1.5 rounded-md text-txt-3 hover:text-txt-1 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Annuler (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="p-1.5 rounded-md text-txt-3 hover:text-txt-1 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Refaire (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-txt-2 border border-border hover:border-border-hover hover:bg-surface-2 disabled:opacity-40 transition-all"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Sauvegarder
          </button>

          {saveError && (
            <span className="text-2xs text-err px-2 py-1 rounded bg-err-muted max-w-[200px] truncate" title={saveError}>
              {saveError}
            </span>
          )}

          <button
            onClick={handleOpenModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-txt-2 border border-border hover:border-border-hover hover:bg-surface-2 transition-all"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Ouvrir
          </button>
        </div>
      </header>

      {/* Open Project Modal */}
      {showOpenModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowOpenModal(false);
          }}
        >
          <div className="bg-surface-1 border border-border rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col animate-slide-up shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-medium text-txt-1">
                  Ouvrir un projet
                </h2>
                <p className="text-2xs text-txt-3 mt-0.5">
                  {projectList.length} projet{projectList.length !== 1 ? "s" : ""} sauvegardé{projectList.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setShowOpenModal(false)}
                className="p-1.5 rounded-lg text-txt-3 hover:text-txt-1 hover:bg-surface-2 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoadingList ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-txt-3 animate-spin" />
                </div>
              ) : projectList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FolderOpen className="w-8 h-8 text-txt-3 mb-2" />
                  <p className="text-sm text-txt-2">Aucun projet sauvegardé</p>
                  <p className="text-2xs text-txt-3 mt-1">
                    Uploadez une vidéo et cliquez sur Sauvegarder
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {projectList.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-surface-2 transition-all group"
                    >
                      {/* Clickable area for loading */}
                      <button
                        onClick={() => handleLoadProject(p.id)}
                        disabled={isLoadingProject === p.id}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-60"
                      >
                        {/* Thumbnail */}
                        <div className="w-16 h-10 rounded bg-surface-3 shrink-0 overflow-hidden flex items-center justify-center">
                          {p.thumbnail_url ? (
                            <img
                              src={p.thumbnail_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Film className="w-4 h-4 text-txt-3" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-txt-1 font-medium truncate group-hover:text-accent transition-colors">
                            {p.title}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5">
                            {p.video_duration && (
                              <span className="text-2xs text-txt-3 flex items-center gap-1">
                                <Film className="w-3 h-3" />
                                {formatTime(p.video_duration)}
                              </span>
                            )}
                            <span className="text-2xs text-txt-3 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(p.updated_at)}
                            </span>
                          </div>
                        </div>

                        {/* Loading indicator */}
                        {isLoadingProject === p.id && (
                          <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
                        )}
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Supprimer le projet "${p.title}" et sa vidéo ?`)) return;
                          try {
                            const res = await fetch(`/api/projects?id=${p.id}`, { method: "DELETE" });
                            if (res.ok) {
                              setProjectList((prev) => prev.filter((proj) => proj.id !== p.id));
                            }
                          } catch (err) {
                            console.error("Delete error:", err);
                          }
                        }}
                        className="p-1.5 rounded-lg text-txt-3 hover:text-err hover:bg-surface-2 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="Supprimer le projet"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
