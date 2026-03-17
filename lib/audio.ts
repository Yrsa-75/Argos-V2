"use client";

export interface AudioChunk {
  blob: Blob;
  startTime: number; // seconds — exact video time
  duration: number; // seconds — exact video segment duration
  index: number;
  total: number;
}

const CHUNK_DURATION_SEC = 10 * 60; // 10 min per chunk
const TARGET_RATE = 16000; // 16kHz for Whisper

/**
 * Extract audio from a video URL as WAV chunks with EXACT video timing.
 * 
 * Key insight: we create each WAV with exactly `segmentDuration * 16000` samples.
 * This means the WAV duration === the video segment duration. 
 * So Whisper timestamps are directly in video time — no drift, no calibration needed.
 */
export async function extractAudioChunks(
  videoUrl: string,
  videoDuration?: number,
  onProgress?: (pct: number) => void
): Promise<AudioChunk[]> {
  onProgress?.(2);

  // Step 1: Fetch the video
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error("Impossible de télécharger la vidéo");

  const contentLength = Number(response.headers.get("content-length") || 0);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Streaming non supporté");

  const rawChunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawChunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      onProgress?.(2 + Math.round((received / contentLength) * 28));
    }
  }

  const videoBuffer = new Uint8Array(received);
  let pos = 0;
  for (const chunk of rawChunks) {
    videoBuffer.set(chunk, pos);
    pos += chunk.length;
  }
  onProgress?.(32);

  // Step 2: Decode the full audio track
  const audioCtx = new AudioContext();
  let fullAudio: AudioBuffer;
  try {
    fullAudio = await audioCtx.decodeAudioData(videoBuffer.buffer);
  } catch {
    audioCtx.close();
    throw new Error("Impossible de décoder l'audio. Format non supporté.");
  }

  const origRate = fullAudio.sampleRate;
  const origDuration = fullAudio.duration;
  const realDuration = videoDuration && videoDuration > 0 ? videoDuration : origDuration;
  
  audioCtx.close();
  onProgress?.(40);

  // Step 3: Split into chunks, resample each to 16kHz with EXACT duration
  const totalChunks = Math.ceil(realDuration / CHUNK_DURATION_SEC);
  const chunks: AudioChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkStartSec = i * CHUNK_DURATION_SEC;
    const chunkEndSec = Math.min(chunkStartSec + CHUNK_DURATION_SEC, realDuration);
    const chunkDuration = chunkEndSec - chunkStartSec;

    // Calculate source sample range
    // Map video time → audio buffer time proportionally (handles any duration mismatch)
    const audioStartSec = (chunkStartSec / realDuration) * origDuration;
    const audioEndSec = (chunkEndSec / realDuration) * origDuration;
    const startSample = Math.floor(audioStartSec * origRate);
    const endSample = Math.min(Math.ceil(audioEndSec * origRate), fullAudio.length);
    const numSamples = endSample - startSample;

    if (numSamples <= 0) continue;

    // Create a buffer with just this segment's audio
    const tempCtx = new AudioContext();
    const segBuffer = tempCtx.createBuffer(
      fullAudio.numberOfChannels,
      numSamples,
      origRate
    );
    for (let ch = 0; ch < fullAudio.numberOfChannels; ch++) {
      const src = fullAudio.getChannelData(ch);
      const dst = segBuffer.getChannelData(ch);
      for (let s = 0; s < numSamples; s++) {
        dst[s] = src[startSample + s] || 0;
      }
    }
    tempCtx.close();

    // Resample to 16kHz mono with EXACT target duration
    // CRITICAL: targetSamples = chunkDuration * 16000
    // This ensures WAV duration === video chunk duration (no drift)
    const targetSamples = Math.round(chunkDuration * TARGET_RATE);
    const offlineCtx = new OfflineAudioContext(1, targetSamples, TARGET_RATE);
    const source = offlineCtx.createBufferSource();
    source.buffer = segBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const wavBlob = float32ToWav(rendered.getChannelData(0), TARGET_RATE);

    chunks.push({
      blob: wavBlob,
      startTime: chunkStartSec,
      duration: chunkDuration,
      index: i,
      total: totalChunks,
    });

    onProgress?.(40 + Math.round(((i + 1) / totalChunks) * 45));
  }

  onProgress?.(85);
  return chunks;
}

// ─── WAV encoding ──────────────────────────────────────────

function float32ToWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2;
  const totalSize = 44 + dataSize;
  const buf = new ArrayBuffer(totalSize);
  const v = new DataView(buf);

  writeStr(v, 0, "RIFF");
  v.setUint32(4, totalSize - 8, true);
  writeStr(v, 8, "WAVE");
  writeStr(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(v, 36, "data");
  v.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

function writeStr(v: DataView, o: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
}
