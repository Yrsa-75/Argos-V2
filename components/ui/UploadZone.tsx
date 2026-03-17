"use client";

import { useCallback, useState } from "react";
import { Upload, Film, AlertCircle } from "lucide-react";
import { useEditorStore } from "@/lib/store";
import {
  isAcceptedVideo,
  ACCEPTED_EXTENSIONS,
  formatFileSize,
} from "@/lib/utils";

export function UploadZone() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    isUploading,
    uploadProgress,
    setIsUploading,
    setUploadProgress,
    setVideoUrl,
    setVideoMeta,
    setThumbnailUrl,
    updateProject,
  } = useEditorStore();

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!isAcceptedVideo(file)) {
        setError(
          `Format non supporté. Formats acceptés : ${ACCEPTED_EXTENSIONS.join(", ")}`
        );
        return;
      }

      // Check file size (max 5GB)
      const MAX_SIZE = 5 * 1024 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        setError("Le fichier est trop volumineux (max 5 Go)");
        return;
      }

      setIsUploading(true);
      setUploadProgress({ loaded: 0, total: file.size, percentage: 0 });

      try {
        // Step 1: Get presigned URL
        const presignRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
          }),
        });

        if (!presignRes.ok) {
          throw new Error("Impossible d'obtenir le lien d'upload");
        }

        const { presignedUrl, publicUrl } = await presignRes.json();

        // Step 2: Upload directly to R2 with progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              setUploadProgress({
                loaded: e.loaded,
                total: e.total,
                percentage: Math.round((e.loaded / e.total) * 100),
              });
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload échoué (${xhr.status})`));
            }
          });

          xhr.addEventListener("error", () => reject(new Error("Erreur réseau")));
          xhr.addEventListener("abort", () => reject(new Error("Upload annulé")));

          xhr.open("PUT", presignedUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });

        // Step 3: Extract metadata from the video element locally
        const meta = await extractLocalMeta(file);

        // Step 4: Generate thumbnail locally
        const thumbnailDataUrl = await generateLocalThumbnail(file);

        // Step 5: Update store
        setVideoUrl(publicUrl);
        setVideoMeta(meta);
        if (thumbnailDataUrl) setThumbnailUrl(thumbnailDataUrl);
        updateProject({ title: file.name.replace(/\.[^/.]+$/, "") });
      } catch (err) {
        console.error("Upload error:", err);
        setError(
          err instanceof Error ? err.message : "Erreur lors de l'upload"
        );
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
      }
    },
    [setIsUploading, setUploadProgress, setVideoUrl, setVideoMeta, setThumbnailUrl, updateProject]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="flex items-center justify-center h-full w-full p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center gap-4
          w-full max-w-lg p-12 rounded-xl border-2 border-dashed
          transition-all duration-200 cursor-pointer
          ${isDragOver
            ? "border-accent bg-accent-muted scale-[1.02]"
            : "border-border hover:border-border-hover hover:bg-surface-1"
          }
          ${isUploading ? "pointer-events-none" : ""}
        `}
        onClick={() => {
          if (!isUploading) {
            document.getElementById("file-input")?.click();
          }
        }}
      >
        <input
          id="file-input"
          type="file"
          accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
          onChange={handleFileInput}
          className="hidden"
        />

        {isUploading ? (
          <>
            <div className="w-12 h-12 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-txt-1">
                Upload en cours...
              </p>
              {uploadProgress && (
                <p className="text-xs text-txt-3 mt-1">
                  {formatFileSize(uploadProgress.loaded)} /{" "}
                  {formatFileSize(uploadProgress.total)}
                </p>
              )}
            </div>
            {uploadProgress && (
              <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress.percentage}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center">
              <Film className="w-6 h-6 text-txt-3" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-txt-1">
                Glissez votre vidéo ici
              </p>
              <p className="text-xs text-txt-3 mt-1">
                ou cliquez pour sélectionner un fichier
              </p>
            </div>
            <p className="text-2xs text-txt-3">
              {ACCEPTED_EXTENSIONS.join(", ")} · 5 min à 90 min · Max 5 Go
            </p>
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-err-muted">
            <AlertCircle className="w-4 h-4 text-err shrink-0" />
            <p className="text-xs text-err">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Local metadata extraction via <video> element ─────────

function extractLocalMeta(
  file: File
): Promise<{
  duration: number;
  width: number;
  height: number;
  codec: string;
  fps: number;
  fileSize: number;
}> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        codec: file.type,
        fps: 30, // Default, can't easily extract from browser
        fileSize: file.size,
      });
      URL.revokeObjectURL(video.src);
    };

    video.onerror = () => {
      resolve({
        duration: 0,
        width: 1920,
        height: 1080,
        codec: file.type,
        fps: 30,
        fileSize: file.size,
      });
      URL.revokeObjectURL(video.src);
    };

    video.src = URL.createObjectURL(file);
  });
}

// ─── Local thumbnail generation ────────────────────────────

function generateLocalThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;

    video.onloadeddata = () => {
      // Seek to 10% of video for a good thumbnail
      video.currentTime = video.duration * 0.1;
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = Math.round(320 * (video.videoHeight / video.videoWidth));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } else {
        resolve(null);
      }
      URL.revokeObjectURL(video.src);
    };

    video.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(video.src);
    };

    video.src = URL.createObjectURL(file);
  });
}
