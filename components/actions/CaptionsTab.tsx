"use client";

import { useCallback, useState, useEffect } from "react";
import { Loader2, Sparkles, Type, Download, Save, Trash2, Globe, Plus } from "lucide-react";
import { useEditorStore } from "@/lib/store";
import { CAPTION_LANGUAGES, POPULAR_FONTS } from "@/lib/utils";
import { extractAudioChunks } from "@/lib/audio";
import { downloadSrt } from "@/lib/srt";
import { loadGoogleFont } from "@/lib/fonts";
import type { Caption } from "@/lib/types";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { ProgressBar } from "@/components/ui/ProgressBar";

export function CaptionsTab() {
  const {
    project,
    setCaptionStyle,
    setCaptions,
    setJob,
    getJob,
    saveCaptionTrack,
    loadCaptionTrack,
    deleteCaptionTrack,
  } = useEditorStore();

  const style = project.captionStyle;
  const job = getJob("transcribe");
  const isProcessing = job?.status === "processing" || job?.status === "pending";
  const hasCaptions = project.captions.length > 0;
  const tracks = project.captionTracks || [];
  const [fontSearch, setFontSearch] = useState("");
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const [isCheckingFont, setIsCheckingFont] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);

  // Load the selected font dynamically
  useEffect(() => {
    if (style.fontFamily) {
      loadGoogleFont(style.fontFamily);
    }
  }, [style.fontFamily]);

  const allFonts: string[] = [...(POPULAR_FONTS as readonly string[]), ...customFonts.filter((f) => !(POPULAR_FONTS as readonly string[]).includes(f))];

  const filteredFonts = fontSearch
    ? allFonts.filter((f) =>
        f.toLowerCase().includes(fontSearch.toLowerCase())
      )
    : allFonts;

  // Show "add" button when search has 2+ chars and no exact match in list
  const searchIsCustom = fontSearch.length >= 2 && !allFonts.some((f) => f.toLowerCase() === fontSearch.toLowerCase());

  const handleAddCustomFont = useCallback(async () => {
    if (!fontSearch || isCheckingFont) return;
    setIsCheckingFont(true);
    setFontError(null);

    try {
      // Validate: fetch the CSS from Google Fonts
      const encoded = fontSearch.replace(/\s+/g, "+");
      const res = await fetch(`https://fonts.googleapis.com/css2?family=${encoded}&display=swap`);

      if (!res.ok) {
        setFontError(`"${fontSearch}" introuvable sur Google Fonts`);
        setIsCheckingFont(false);
        return;
      }

      // Check that the response actually contains font-face declarations
      const css = await res.text();
      if (!css.includes("@font-face")) {
        setFontError(`"${fontSearch}" introuvable sur Google Fonts`);
        setIsCheckingFont(false);
        return;
      }

      // Font exists — load it and add to list
      loadGoogleFont(fontSearch);
      setCustomFonts((prev) => [...prev, fontSearch]);
      setCaptionStyle({ fontFamily: fontSearch });
      setFontSearch("");
      setFontError(null);
    } catch {
      setFontError(`"${fontSearch}" introuvable sur Google Fonts`);
    }

    setIsCheckingFont(false);
  }, [fontSearch, isCheckingFont, setCaptionStyle]);

  const handleGenerate = useCallback(async () => {
    if (!project.videoUrl || isProcessing) return;

    setJob("transcribe", { status: "pending", progress: 0, error: null });

    try {
      // Step 1: Extract audio chunks from video (client-side)
      setJob("transcribe", { status: "processing", progress: 2 });

      const chunks = await extractAudioChunks(
        project.videoUrl,
        project.videoMeta?.duration || 0,
        (pct) => {
          // Audio extraction: 0-35% of total progress
          setJob("transcribe", { progress: Math.round(pct * 0.35) });
        }
      );

      // Step 2: Upload each chunk to R2, then transcribe via API
      const allCaptions: Caption[] = [];

      for (const chunk of chunks) {
        const chunkLabel =
          chunks.length > 1
            ? ` (partie ${chunk.index + 1}/${chunk.total})`
            : "";

        // Progress: 35-90% spread across chunks
        const chunkProgressBase = 35 + (chunk.index / chunk.total) * 55;

        // Step 2a: Get presigned URL for audio upload
        setJob("transcribe", { progress: Math.round(chunkProgressBase) });

        const presignRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: `audio-${chunk.index}.wav`,
            contentType: "audio/wav",
          }),
        });

        if (!presignRes.ok) {
          throw new Error(`Impossible de préparer l'upload audio${chunkLabel}`);
        }

        const { presignedUrl, publicUrl } = await presignRes.json();

        // Step 2b: Upload audio WAV directly to R2
        setJob("transcribe", { progress: Math.round(chunkProgressBase + 5) });

        const uploadRes = await fetch(presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": "audio/wav" },
          body: chunk.blob,
        });

        if (!uploadRes.ok) {
          throw new Error(`Échec de l'upload audio${chunkLabel}`);
        }

        // Step 2c: Call transcribe API with the R2 URL (no body size limit)
        setJob("transcribe", {
          progress: Math.round(chunkProgressBase + 15),
        });

        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioUrl: publicUrl,
            language: style.language,
          }),
        });

        if (!res.ok) {
          let errMsg = `Erreur de transcription${chunkLabel}`;
          try {
            const err = await res.json();
            errMsg = err.error || errMsg;
          } catch {
            errMsg = `Erreur serveur (${res.status})${chunkLabel}`;
          }
          throw new Error(errMsg);
        }

        const data = await res.json();

        // Offset timestamps by chunk start time
        const offsetCaptions: Caption[] = (data.captions || []).map(
          (c: Caption) => ({
            ...c,
            start: c.start + chunk.startTime,
            end: c.end + chunk.startTime,
            words: c.words.map((w) => ({
              ...w,
              start: w.start + chunk.startTime,
              end: w.end + chunk.startTime,
            })),
          })
        );

        allCaptions.push(...offsetCaptions);
      }

      // Step 3: Safety calibration
      // With the new audio extraction, WAV duration === video chunk duration,
      // so this should be a no-op (scale ≈ 1.0). Kept as safety net.
      const videoDuration = project.videoMeta?.duration || 0;
      const totalWavDuration = chunks.reduce((sum, c) => sum + c.duration, 0);
      
      if (allCaptions.length > 0 && videoDuration > 0 && totalWavDuration > 0) {
        const scale = videoDuration / totalWavDuration;
        const drift = Math.abs(1 - scale) * totalWavDuration;
        
        console.log(`[Captions] Video=${videoDuration.toFixed(2)}s, WAV total=${totalWavDuration.toFixed(2)}s, scale=${scale.toFixed(6)}, drift=${drift.toFixed(2)}s`);
        console.log(`[Captions] ${allCaptions.length} groupes, ${allCaptions.reduce((s, c) => s + c.words.length, 0)} mots`);
        
        if (allCaptions.length > 0) {
          const first = allCaptions[0];
          const last = allCaptions[allCaptions.length - 1];
          console.log(`[Captions] First: ${first.start.toFixed(2)}s "${first.text.substring(0, 30)}"`);
          console.log(`[Captions] Last: ${last.start.toFixed(2)}s-${last.end.toFixed(2)}s "${last.text.substring(0, 30)}"`);
        }

        // Only apply calibration if drift is significant (> 0.5s)
        if (drift > 0.5) {
          console.log(`[Captions] Applying calibration (drift=${drift.toFixed(1)}s)`);
          for (const cap of allCaptions) {
            cap.start = cap.start * scale;
            cap.end = cap.end * scale;
            for (const w of cap.words) {
              w.start = w.start * scale;
              w.end = w.end * scale;
            }
          }
        } else {
          console.log(`[Captions] No calibration needed (drift < 0.5s)`);
        }
      }

      setJob("transcribe", { progress: 95 });
      setCaptions(allCaptions);
      
      // Auto-save as a language track
      const langInfo = CAPTION_LANGUAGES.find((l) => l.code === style.language);
      saveCaptionTrack(style.language, langInfo?.label || style.language);
      
      setJob("transcribe", { status: "done", progress: 100 });
    } catch (err) {
      setJob("transcribe", {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }, [project.videoUrl, project.videoMeta, style.language, isProcessing, setJob, setCaptions, saveCaptionTrack]);

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Language */}
      <div>
        <label className="block text-xs text-txt-3 mb-1.5">Langue</label>
        <select
          value={style.language}
          onChange={(e) => setCaptionStyle({ language: e.target.value })}
          className="w-full bg-surface-2 text-xs text-txt-1 px-3 py-2 rounded-lg border border-border hover:border-border-hover outline-none appearance-none cursor-pointer"
        >
          {CAPTION_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Font */}
      <div>
        <label className="block text-xs text-txt-3 mb-1.5">Police</label>
        <input
          type="text"
          placeholder="Rechercher une police..."
          value={fontSearch}
          onChange={(e) => { setFontSearch(e.target.value); setFontError(null); }}
          className="w-full bg-surface-2 text-xs text-txt-2 px-3 py-2 rounded-lg border border-border hover:border-border-hover outline-none mb-1.5"
        />
        <div className="max-h-28 overflow-y-auto rounded-lg border border-border bg-surface-2">
          {filteredFonts.map((font) => (
            <button
              key={font}
              onClick={() => {
                loadGoogleFont(font);
                setCaptionStyle({ fontFamily: font });
                setFontSearch("");
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-3 transition-colors ${
                style.fontFamily === font
                  ? "text-accent font-medium"
                  : "text-txt-2"
              }`}
            >
              {font}
            </button>
          ))}
          {searchIsCustom && (
            <button
              onClick={handleAddCustomFont}
              disabled={isCheckingFont}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-accent hover:bg-surface-3 transition-colors disabled:opacity-50"
            >
              {isCheckingFont ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              {isCheckingFont ? "Vérification..." : `Ajouter « ${fontSearch} » depuis Google Fonts`}
            </button>
          )}
          {fontError && (
            <p className="px-3 py-1.5 text-2xs text-err">{fontError}</p>
          )}
        </div>
        <p className="text-2xs text-txt-3 mt-1">
          Sélectionnée : <span className="text-txt-2">{style.fontFamily}</span>
        </p>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-3">
        <ColorPicker
          label="Couleur texte"
          value={style.textColor}
          onChange={(c) => setCaptionStyle({ textColor: c })}
        />
        <ColorPicker
          label="Couleur highlight"
          value={style.highlightColor}
          onChange={(c) => setCaptionStyle({ highlightColor: c })}
        />
      </div>

      {/* Font size */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-txt-3">Taille</label>
          <span className="text-xs text-txt-2 font-mono">
            {style.fontSize}px
          </span>
        </div>
        <input
          type="range"
          min={20}
          max={80}
          step={1}
          value={style.fontSize}
          onChange={(e) =>
            setCaptionStyle({ fontSize: parseInt(e.target.value) })
          }
          className="w-full"
        />
      </div>

      {/* Position */}
      <div>
        <label className="block text-xs text-txt-3 mb-1.5">Position</label>
        <div className="grid grid-cols-3 gap-1">
          {(["top", "center", "bottom"] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => setCaptionStyle({ position: pos })}
              className={`text-xs py-1.5 rounded-md border transition-all ${
                style.position === pos
                  ? "bg-accent text-white border-accent"
                  : "bg-surface-2 text-txt-2 border-border hover:border-border-hover"
              }`}
            >
              {pos === "top" ? "Haut" : pos === "center" ? "Centre" : "Bas"}
            </button>
          ))}
        </div>
      </div>

      {/* Sync controls — only show when captions exist */}
      {hasCaptions && (
        <div className="space-y-3 p-3 rounded-lg bg-surface-2 border border-border">
          <p className="text-xs text-txt-3 font-medium">Synchronisation</p>
          
          {/* Offset slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-2xs text-txt-3">Décalage global</label>
              <span className="text-2xs text-txt-2 font-mono w-16 text-right">
                {(style.syncOffset || 0) >= 0 ? "+" : ""}{(style.syncOffset || 0).toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.1"
              value={style.syncOffset || 0}
              onChange={(e) => setCaptionStyle({ syncOffset: parseFloat(e.target.value) })}
              className="w-full accent-accent h-1"
            />
            <div className="flex justify-between text-2xs text-txt-3 mt-0.5">
              <span>-5s</span>
              <button 
                onClick={() => setCaptionStyle({ syncOffset: 0 })}
                className="text-2xs text-txt-3 hover:text-accent"
              >
                Reset
              </button>
              <span>+5s</span>
            </div>
          </div>

          {/* Stretch slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-2xs text-txt-3">Étirement (dérive)</label>
              <span className="text-2xs text-txt-2 font-mono w-16 text-right">
                {((style.syncStretch || 1) * 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="0.9"
              max="1.1"
              step="0.001"
              value={style.syncStretch || 1}
              onChange={(e) => setCaptionStyle({ syncStretch: parseFloat(e.target.value) })}
              className="w-full accent-accent h-1"
            />
            <div className="flex justify-between text-2xs text-txt-3 mt-0.5">
              <span>90%</span>
              <button 
                onClick={() => setCaptionStyle({ syncStretch: 1 })}
                className="text-2xs text-txt-3 hover:text-accent"
              >
                Reset
              </button>
              <span>110%</span>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="p-3 rounded-lg bg-surface-0 border border-border flex items-center justify-center min-h-[60px]">
        <p
          style={{
            fontFamily: style.fontFamily,
            fontSize: `${Math.round(style.fontSize * 0.35)}px`,
            color: style.textColor,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          Bonjour{" "}
          <span style={{ color: style.highlightColor }}>à tous</span>,{" "}
          bienvenue
        </p>
      </div>

      {/* Saved language tracks */}
      {tracks.length > 0 && (
        <div>
          <label className="block text-xs text-txt-3 mb-1.5">
            <Globe className="w-3 h-3 inline mr-1" />
            Pistes sauvegardées
          </label>
          <div className="space-y-1">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border group"
              >
                <span className="text-xs text-txt-1 font-medium flex-1 truncate">
                  {track.label}
                </span>
                <span className="text-2xs text-txt-3">
                  {track.captions.length} groupes
                </span>
                <button
                  onClick={() => loadCaptionTrack(track.id)}
                  className="text-2xs text-accent hover:text-accent-hover px-1.5 py-0.5 rounded hover:bg-surface-3 transition-colors"
                >
                  Charger
                </button>
                <button
                  onClick={() => {
                    const filename = `${project.title || "subtitles"}_${track.language}.srt`;
                    downloadSrt(track.captions, filename);
                  }}
                  className="p-1 text-txt-3 hover:text-txt-1 hover:bg-surface-3 rounded transition-colors"
                  title="Télécharger .srt"
                >
                  <Download className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Supprimer la piste "${track.label}" ?`)) {
                      deleteCaptionTrack(track.id);
                    }
                  }}
                  className="p-1 text-txt-3 hover:text-err hover:bg-surface-3 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Supprimer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SRT export for current captions */}
      {hasCaptions && (
        <button
          onClick={() => {
            const filename = `${project.title || "subtitles"}_${style.language}.srt`;
            downloadSrt(project.captions, filename);
          }}
          className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-txt-2 border border-border hover:border-border-hover hover:bg-surface-2 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Télécharger .SRT
        </button>
      )}

      {/* Processing status */}
      {job?.status === "processing" && (
        <ProgressBar
          progress={job.progress}
          label={
            job.progress < 40
              ? "Extraction audio..."
              : job.progress < 90
              ? "Transcription IA..."
              : "Finalisation..."
          }
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
        <button
          onClick={handleGenerate}
          disabled={!project.videoUrl || isProcessing}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-all"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Transcription...
            </>
          ) : hasCaptions ? (
            <>
              <Sparkles className="w-4 h-4" />
              Regénérer les sous-titres
            </>
          ) : (
            <>
              <Type className="w-4 h-4" />
              Générer les sous-titres
            </>
          )}
        </button>
      </div>
    </div>
  );
}
