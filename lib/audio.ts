"use client";

/**
 * Audio chunk with its time offset for timestamp correction after transcription.
 */
export interface AudioChunk {
  blob: Blob;
  startTime: number; // seconds offset in WAV time (from start of full audio)
  duration: number; // seconds (WAV duration of this chunk)
  index: number;
  total: number;
}

// 10 minutes per chunk — safe margin under Whisper's 25MB limit
// 16kHz mono 16-bit = 32,000 bytes/sec → 10 min = ~19 MB (limit = 25 MB)
const CHUNK_DURATION_SEC = 10 * 60;
const TARGET_SAMPLE_RATE = 16000;

/**
 * Extract the audio track from a video URL and return it as WAV chunks.
 * Each chunk is under 25MB (Whisper's limit).
 * Short videos (< 10 min) return a single chunk.
 * All timestamps are in WAV time — the caller must calibrate to video time.
 */
export async function extractAudioChunks(
  videoUrl: string,
  _videoDuration?: number,
  onProgress?: (pct: number) => void
): Promise<AudioChunk[]> {
  onProgress?.(2);

  // Step 1: Fetch the video as an ArrayBuffer
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error("Impossible de télécharger la vidéo");

  const contentLength = Number(response.headers.get("content-length") || 0);
  const reader = response.body?.getReader();

  if (!reader) throw new Error("Streaming non supporté");

  const rawChunks: Uint8Array[] = [];
  let receivedLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawChunks.push(value);
    receivedLength += value.length;
    if (contentLength > 0) {
      onProgress?.(2 + Math.round((receivedLength / contentLength) * 28));
    }
  }

  const videoBuffer = new Uint8Array(receivedLength);
  let pos = 0;
  for (const chunk of rawChunks) {
    videoBuffer.set(chunk, pos);
    pos += chunk.length;
  }

  onProgress?.(32);

  // Step 2: Decode audio
  const audioCtx = new AudioContext();
  let audioBuffer: AudioBuffer;

  try {
    audioBuffer = await audioCtx.decodeAudioData(videoBuffer.buffer);
  } catch {
    audioCtx.close();
    throw new Error(
      "Impossible de décoder l'audio de la vidéo. Format non supporté."
    );
  }

  audioCtx.close();
  onProgress?.(45);

  // Step 3: Resample to 16kHz mono
  const totalSamples = Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE);
  const offlineCtx = new OfflineAudioContext(1, totalSamples, TARGET_SAMPLE_RATE);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  onProgress?.(60);

  // Step 4: Split into chunks and encode each as WAV
  // All timestamps use WAV time — the client will calibrate to real video time
  const fullSamples = renderedBuffer.getChannelData(0);
  const samplesPerChunk = CHUNK_DURATION_SEC * TARGET_SAMPLE_RATE;
  const totalChunks = Math.ceil(fullSamples.length / samplesPerChunk);
  const chunks: AudioChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const startSample = i * samplesPerChunk;
    const endSample = Math.min(startSample + samplesPerChunk, fullSamples.length);
    const chunkSamples = fullSamples.slice(startSample, endSample);

    // All times in WAV-seconds (consistent time base)
    const chunkStartTime = startSample / TARGET_SAMPLE_RATE;
    const chunkDuration = (endSample - startSample) / TARGET_SAMPLE_RATE;

    const wavBlob = float32ToWav(chunkSamples, TARGET_SAMPLE_RATE);

    chunks.push({
      blob: wavBlob,
      startTime: chunkStartTime,
      duration: chunkDuration,
      index: i,
      total: totalChunks,
    });

    onProgress?.(60 + Math.round(((i + 1) / totalChunks) * 25));
  }

  onProgress?.(85);

  return chunks;
}

// ─── WAV encoding ──────────────────────────────────────────

function float32ToWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * blockAlign;
  const totalSize = 44 + dataSize;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  // RIFF header
  writeStr(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeStr(view, 8, "WAVE");

  // fmt chunk
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buf], { type: "audio/wav" });
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
