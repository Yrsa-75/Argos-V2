import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { audioUrl, language } = await request.json();

    if (!audioUrl) {
      return NextResponse.json({ error: "audioUrl requis" }, { status: 400 });
    }

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error("Impossible de télécharger le fichier audio");
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });

    if (audioBlob.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: `Fichier audio trop volumineux (${(audioBlob.size / 1024 / 1024).toFixed(1)} Mo). Limite : 25 Mo.` },
        { status: 400 }
      );
    }

    // Transcribe with Whisper — word-level timestamps
    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(audioBlob, "audio.wav", { type: "audio/wav" }),
      model: "whisper-1",
      language: language || "fr",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    const words: any[] = (transcription as any).words || [];

    if (words.length === 0) {
      return NextResponse.json({
        captions: [],
        rawTranscript: transcription.text || "",
      });
    }

    // Use Whisper's RAW words directly for timing — no GPT correction on individual words.
    // GPT correction can change word count (split/merge words), which shifts all timestamps.
    // Instead: use raw words for the timed captions, GPT corrects the full transcript separately.
    
    // Normalize unicode quotes/apostrophes to standard ASCII
    const normalizeText = (text: string): string => {
      return text
        .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'")  // curly single quotes → straight
        .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')   // curly double quotes → straight
        .replace(/\u2026/g, "...")                             // ellipsis → three dots
        .replace(/[\u2013\u2014]/g, "-")                       // en/em dash → hyphen
        .replace(/\u00A0/g, " ")                               // non-breaking space → space
        .trim();
    };
    
    // Build timed words — fill gaps between consecutive words
    const timedWords = words.map((w: any, idx: number) => {
      const nextWord = words[idx + 1];
      return {
        word: normalizeText(w.word as string),
        start: w.start as number,
        end: nextWord ? Math.max(w.end as number, nextWord.start as number) : (w.end as number),
      };
    });

    // Build caption groups (5-10 words, break on natural pauses > 0.3s or punctuation)
    const MIN_GROUP = 5;
    const MAX_GROUP = 10;
    const captions = [];
    let i = 0;

    while (i < timedWords.length) {
      const groupMaxEnd = Math.min(i + MAX_GROUP, timedWords.length);
      let bestBreak = -1;
      
      // Look for a natural break point between MIN and MAX:
      // 1. Pause > 0.3s between words (strongest signal)
      // 2. Punctuation at end of word
      for (let j = i + MIN_GROUP - 1; j < groupMaxEnd; j++) {
        const w = timedWords[j];
        const nextW = timedWords[j + 1];
        const hasPause = nextW && (nextW.start - w.end > 0.3);
        const hasPunctuation = /[.!?,;:…—–\-]$/.test(w.word);
        
        if (hasPause || hasPunctuation) {
          bestBreak = j + 1;
          break;
        }
      }

      const end = bestBreak > 0 ? bestBreak : Math.min(i + MAX_GROUP, timedWords.length);
      const groupWords = timedWords.slice(i, end);

      captions.push({
        id: crypto.randomUUID(),
        words: groupWords,
        start: groupWords[0].start,
        end: groupWords[groupWords.length - 1].end,
        text: groupWords.map((w) => w.word).join(" "),
      });

      i = end;
    }

    // GPT correction on full text only (for SRT export / transcript panel readability)
    const rawText = timedWords.map((w) => w.word).join(" ");
    let correctedTranscript = rawText;
    
    try {
      const correction = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Corrige ce texte de transcription automatique : ponctuation, casse, homophones, noms propres. Retourne uniquement le texte corrigé.`,
          },
          { role: "user", content: rawText },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      });
      correctedTranscript = correction.choices[0]?.message?.content?.trim() || rawText;
    } catch {
      // GPT correction failed — use raw text
    }

    return NextResponse.json({ captions, rawTranscript: correctedTranscript });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de la transcription" },
      { status: 500 }
    );
  }
}
