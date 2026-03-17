import { create } from "zustand";
import type {
  Project,
  Caption,
  CaptionTrack,
  Chapter,
  ViralClip,
  Synthe,
  CaptionStyle,
  VideoMeta,
  ProcessingJob,
  JobType,
  ActiveTab,
  UploadProgress,
  ClipConfig,
  ChapterConfig,
} from "./types";

// ─── Helper ────────────────────────────────────────────────

const uid = () => crypto.randomUUID();

const defaultCaptionStyle: CaptionStyle = {
  language: "fr",
  fontFamily: "Montserrat",
  fontSize: 42,
  textColor: "#ffffff",
  highlightColor: "#f59e0b",
  position: "bottom",
  syncOffset: 0,
  syncStretch: 1,
};

const createEmptyProject = (): Project => ({
  id: uid(),
  title: "Nouveau projet",
  videoUrl: "",
  thumbnailUrl: null,
  videoMeta: null,
  captions: [],
  captionTracks: [],
  chapters: [],
  clips: [],
  synthes: [],
  captionStyle: { ...defaultCaptionStyle },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// ─── Store types ───────────────────────────────────────────

interface EditorState {
  // Project
  project: Project;
  hasUnsavedChanges: boolean;

  // Playback
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;

  // UI
  activeTab: ActiveTab;
  activeClipId: string | null; // clip being previewed in the player
  selectedCaptionId: string | null;
  selectedChapterId: string | null;
  selectedClipId: string | null;
  selectedSyntheId: string | null;

  // Upload
  isUploading: boolean;
  uploadProgress: UploadProgress | null;

  // Processing
  jobs: ProcessingJob[];

  // Config
  clipConfig: ClipConfig;
  chapterConfig: ChapterConfig;

  // Undo/Redo
  undoStack: Project[];
  redoStack: Project[];
}

interface EditorActions {
  // Project
  setProject: (project: Project) => void;
  updateProject: (partial: Partial<Project>) => void;
  setTitle: (title: string) => void;
  resetProject: () => void;

  // Video
  setVideoUrl: (url: string) => void;
  setVideoMeta: (meta: VideoMeta) => void;
  setThumbnailUrl: (url: string) => void;

  // Playback
  setCurrentTime: (t: number) => void;
  setIsPlaying: (v: boolean) => void;
  setPlaybackRate: (r: number) => void;
  setVolume: (v: number) => void;

  // UI
  setActiveTab: (tab: ActiveTab) => void;
  setActiveClipId: (id: string | null) => void;
  setSelectedCaption: (id: string | null) => void;
  setSelectedChapter: (id: string | null) => void;
  setSelectedClip: (id: string | null) => void;
  setSelectedSynthe: (id: string | null) => void;

  // Upload
  setIsUploading: (v: boolean) => void;
  setUploadProgress: (p: UploadProgress | null) => void;

  // Captions
  setCaptions: (captions: Caption[]) => void;
  updateCaption: (id: string, partial: Partial<Caption>) => void;
  deleteCaption: (id: string) => void;
  setCaptionStyle: (partial: Partial<CaptionStyle>) => void;

  // Caption Tracks (multi-language)
  saveCaptionTrack: (language: string, label: string) => void;
  loadCaptionTrack: (trackId: string) => void;
  deleteCaptionTrack: (trackId: string) => void;

  // Chapters
  setChapters: (chapters: Chapter[]) => void;
  updateChapter: (id: string, partial: Partial<Chapter>) => void;
  deleteChapter: (id: string) => void;
  setChapterConfig: (config: Partial<ChapterConfig>) => void;

  // Clips
  setClips: (clips: ViralClip[]) => void;
  updateClip: (id: string, partial: Partial<ViralClip>) => void;
  deleteClip: (id: string) => void;
  setClipConfig: (config: Partial<ClipConfig>) => void;

  // Synthes
  setSynthes: (synthes: Synthe[]) => void;
  addSynthe: (synthe: Synthe) => void;
  updateSynthe: (id: string, partial: Partial<Synthe>) => void;
  deleteSynthe: (id: string) => void;

  // Jobs
  setJob: (type: JobType, partial: Partial<ProcessingJob>) => void;
  getJob: (type: JobType) => ProcessingJob | undefined;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  pushUndo: () => void;

  // Save
  markSaved: () => void;
}

// ─── Store ─────────────────────────────────────────────────

const MAX_UNDO = 20;

export const useEditorStore = create<EditorState & EditorActions>(
  (set, get) => ({
    // ── Initial state ──────────────────────────────────────
    project: createEmptyProject(),
    hasUnsavedChanges: false,

    currentTime: 0,
    isPlaying: false,
    playbackRate: 1,
    volume: 1,

    activeTab: "captions",
    activeClipId: null,
    selectedCaptionId: null,
    selectedChapterId: null,
    selectedClipId: null,
    selectedSyntheId: null,

    isUploading: false,
    uploadProgress: null,

    jobs: [],

    clipConfig: { count: 3, duration: "medium" },
    chapterConfig: { count: "auto" },

    undoStack: [],
    redoStack: [],

    // ── Project ────────────────────────────────────────────
    setProject: (project) =>
      set({ project, hasUnsavedChanges: false, undoStack: [], redoStack: [] }),

    updateProject: (partial) =>
      set((s) => ({
        project: { ...s.project, ...partial, updatedAt: new Date().toISOString() },
        hasUnsavedChanges: true,
      })),

    setTitle: (title) => get().updateProject({ title }),

    resetProject: () =>
      set({
        project: createEmptyProject(),
        hasUnsavedChanges: false,
        undoStack: [],
        redoStack: [],
        jobs: [],
      }),

    // ── Video ──────────────────────────────────────────────
    setVideoUrl: (url) => get().updateProject({ videoUrl: url }),
    setVideoMeta: (meta) => get().updateProject({ videoMeta: meta }),
    setThumbnailUrl: (url) => get().updateProject({ thumbnailUrl: url }),

    // ── Playback ───────────────────────────────────────────
    setCurrentTime: (t) => set({ currentTime: t }),
    setIsPlaying: (v) => set({ isPlaying: v }),
    setPlaybackRate: (r) => set({ playbackRate: r }),
    setVolume: (v) => set({ volume: v }),

    // ── UI ─────────────────────────────────────────────────
    setActiveTab: (tab) => set({ activeTab: tab }),
    setActiveClipId: (id) => set({ activeClipId: id }),
    setSelectedCaption: (id) => set({ selectedCaptionId: id }),
    setSelectedChapter: (id) => set({ selectedChapterId: id }),
    setSelectedClip: (id) => set({ selectedClipId: id }),
    setSelectedSynthe: (id) => set({ selectedSyntheId: id }),

    // ── Upload ─────────────────────────────────────────────
    setIsUploading: (v) => set({ isUploading: v }),
    setUploadProgress: (p) => set({ uploadProgress: p }),

    // ── Captions ───────────────────────────────────────────
    setCaptions: (captions) => {
      get().pushUndo();
      get().updateProject({ captions });
    },

    updateCaption: (id, partial) => {
      get().pushUndo();
      const captions = get().project.captions.map((c) =>
        c.id === id ? { ...c, ...partial } : c
      );
      get().updateProject({ captions });
    },

    deleteCaption: (id) => {
      get().pushUndo();
      const captions = get().project.captions.filter((c) => c.id !== id);
      get().updateProject({ captions });
    },

    setCaptionStyle: (partial) =>
      get().updateProject({
        captionStyle: { ...get().project.captionStyle, ...partial },
      }),

    // ── Caption Tracks ─────────────────────────────────────
    saveCaptionTrack: (language, label) => {
      const captions = get().project.captions;
      if (captions.length === 0) return;
      
      const existingTracks = get().project.captionTracks || [];
      // Replace existing track for this language, or add new one
      const existingIdx = existingTracks.findIndex((t) => t.language === language);
      const track: CaptionTrack = {
        id: existingIdx >= 0 ? existingTracks[existingIdx].id : uid(),
        language,
        label,
        captions: structuredClone(captions),
        createdAt: new Date().toISOString(),
      };

      const newTracks = existingIdx >= 0
        ? existingTracks.map((t, i) => (i === existingIdx ? track : t))
        : [...existingTracks, track];

      get().updateProject({ captionTracks: newTracks });
    },

    loadCaptionTrack: (trackId) => {
      const track = (get().project.captionTracks || []).find((t) => t.id === trackId);
      if (!track) return;
      get().pushUndo();
      get().updateProject({
        captions: structuredClone(track.captions),
        captionStyle: { ...get().project.captionStyle, language: track.language },
      });
    },

    deleteCaptionTrack: (trackId) => {
      const tracks = (get().project.captionTracks || []).filter((t) => t.id !== trackId);
      get().updateProject({ captionTracks: tracks });
    },

    // ── Chapters ───────────────────────────────────────────
    setChapters: (chapters) => {
      get().pushUndo();
      get().updateProject({ chapters });
    },

    updateChapter: (id, partial) => {
      get().pushUndo();
      const chapters = get().project.chapters.map((c) =>
        c.id === id ? { ...c, ...partial } : c
      );
      get().updateProject({ chapters });
    },

    deleteChapter: (id) => {
      get().pushUndo();
      const chapters = get().project.chapters.filter((c) => c.id !== id);
      get().updateProject({ chapters });
    },

    setChapterConfig: (config) =>
      set((s) => ({ chapterConfig: { ...s.chapterConfig, ...config } })),

    // ── Clips ──────────────────────────────────────────────
    setClips: (clips) => {
      get().pushUndo();
      get().updateProject({ clips });
    },

    updateClip: (id, partial) => {
      get().pushUndo();
      const clips = get().project.clips.map((c) =>
        c.id === id ? { ...c, ...partial } : c
      );
      get().updateProject({ clips });
    },

    deleteClip: (id) => {
      get().pushUndo();
      const clips = get().project.clips.filter((c) => c.id !== id);
      get().updateProject({ clips });
    },

    setClipConfig: (config) =>
      set((s) => ({ clipConfig: { ...s.clipConfig, ...config } })),

    // ── Synthes ────────────────────────────────────────────
    setSynthes: (synthes) => {
      get().pushUndo();
      get().updateProject({ synthes });
    },

    addSynthe: (synthe) => {
      get().pushUndo();
      get().updateProject({ synthes: [...get().project.synthes, synthe] });
    },

    updateSynthe: (id, partial) => {
      get().pushUndo();
      const synthes = get().project.synthes.map((s) =>
        s.id === id ? { ...s, ...partial } : s
      );
      get().updateProject({ synthes });
    },

    deleteSynthe: (id) => {
      get().pushUndo();
      const synthes = get().project.synthes.filter((s) => s.id !== id);
      get().updateProject({ synthes });
    },

    // ── Jobs ───────────────────────────────────────────────
    setJob: (type, partial) =>
      set((s) => {
        const existing = s.jobs.find((j) => j.type === type);
        if (existing) {
          return {
            jobs: s.jobs.map((j) =>
              j.type === type ? { ...j, ...partial } : j
            ),
          };
        }
        return {
          jobs: [
            ...s.jobs,
            {
              id: uid(),
              type,
              status: "idle",
              progress: 0,
              error: null,
              ...partial,
            } as ProcessingJob,
          ],
        };
      }),

    getJob: (type) => get().jobs.find((j) => j.type === type),

    // ── Undo/Redo ──────────────────────────────────────────
    pushUndo: () =>
      set((s) => ({
        undoStack: [...s.undoStack.slice(-MAX_UNDO + 1), structuredClone(s.project)],
        redoStack: [],
      })),

    undo: () =>
      set((s) => {
        if (s.undoStack.length === 0) return s;
        const prev = s.undoStack[s.undoStack.length - 1];
        return {
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, structuredClone(s.project)],
          project: prev,
          hasUnsavedChanges: true,
        };
      }),

    redo: () =>
      set((s) => {
        if (s.redoStack.length === 0) return s;
        const next = s.redoStack[s.redoStack.length - 1];
        return {
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, structuredClone(s.project)],
          project: next,
          hasUnsavedChanges: true,
        };
      }),

    // ── Save ───────────────────────────────────────────────
    markSaved: () => set({ hasUnsavedChanges: false }),
  })
);
