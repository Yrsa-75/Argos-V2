const FFMPEG_URL = process.env.FFMPEG_SERVICE_URL!;
const FFMPEG_SECRET = process.env.FFMPEG_SERVICE_SECRET!;

interface FFmpegJobRequest {
  type: "crop" | "export" | "thumbnail" | "metadata";
  inputUrl: string;
  outputKey: string;
  params: Record<string, unknown>;
}

interface FFmpegJobResponse {
  jobId: string;
  status: "queued" | "processing" | "done" | "error";
  progress: number;
  outputUrl?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

async function ffmpegFetch(
  path: string,
  body?: unknown
): Promise<FFmpegJobResponse> {
  const res = await fetch(`${FFMPEG_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FFMPEG_SECRET}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FFmpeg service error (${res.status}): ${text}`);
  }

  return res.json();
}

/** Submit a new FFmpeg processing job */
export async function submitJob(
  request: FFmpegJobRequest
): Promise<FFmpegJobResponse> {
  return ffmpegFetch("/api/jobs", request);
}

/** Poll job status */
export async function getJobStatus(
  jobId: string
): Promise<FFmpegJobResponse> {
  return ffmpegFetch(`/api/jobs/${jobId}`);
}

/** Extract video metadata (duration, resolution, codec, fps) */
export async function extractMetadata(
  videoUrl: string
): Promise<FFmpegJobResponse> {
  return ffmpegFetch("/api/metadata", { url: videoUrl });
}

/** Generate thumbnail at specific timestamp */
export async function generateThumbnail(
  videoUrl: string,
  timestamp: number,
  outputKey: string
): Promise<FFmpegJobResponse> {
  return ffmpegFetch("/api/thumbnail", {
    url: videoUrl,
    timestamp,
    outputKey,
  });
}
