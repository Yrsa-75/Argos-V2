import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 300; // 5 minutes max for this route

export async function POST(request: NextRequest) {
  try {
    const { audioUrl, language, expectedDuration } = await request.json();

    if (!audioUrl) {
      return NextResponse.json(
        { error: "audioUrl requis" },
        { status: 400 }
      );
    }

    // Step 1: Download audio from R2 (server-to-server — no body size limit)
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error("Impossible de télécharger le fichier audio");
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });

    // Check file size (Whisper limit: 25MB)
    if (audioBlob.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: `Le fichier audio est trop volumineux (${(audioBlob.size / 1024 / 1024).toFixed(1)} Mo). Limite : 25 Mo.`,
        },
        { status: 400 }
      );
    }

    // Step 2: Transcribe with Whisper (word-level timestamps)
    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(audioBlob, "audio.wav", { type: "audio/wav" }),
      model: "whisper-1",
      language: language || "fr",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    const words = (transcription as any).words || [];

    if (words.length === 0) {
      return NextResponse.json({
        captions: [],
        rawTranscript: transcription.text || "",
      });
    }

    // Step 3: GPT-4o correction for semantic errors
    // (No timestamp calibration here — the client handles it with the real video duration)
    const rawText = words.map((w: any) => w.word).join(" ");

    const correction = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es un correcteur de transcription automatique. On te donne un texte brut issu de la reconnaissance vocale (Whisper). 

Ton rôle :
1. Corrige les erreurs sémantiques évidentes (homophones, noms propres mal transcrits, termes techniques)
2. Corrige la ponctuation et la casse
3. Ne modifie PAS la structure ou l'ordre des mots — chaque mot doit rester à sa position
4. Retourne UNIQUEMENT le texte corrigé, rien d'autre
5. Si un mot est correct, ne le change pas

Exemples d'erreurs typiques :
- "pains maritimes" → "pins maritimes"
- "intelligence artificiel" → "intelligence artificielle"
- "il faut qu'on parle de ça" → pas de changement (déjà correct)`,
        },
        {
          role: "user",
          content: rawText,
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    });

    const correctedText =
      correction.choices[0]?.message?.content?.trim() || rawText;
    const correctedWords = correctedText.split(/\s+/);

    // Step 5: Build caption groups (5-10 words, break on punctuation)
    const MIN_GROUP = 5;
    const MAX_GROUP = 10;
    const PUNCTUATION = /[.!?,;:…—–\-]$/;

    const captions = [];
    let i = 0;

    while (i < words.length) {
      const groupEnd = Math.min(i + MAX_GROUP, words.length);
      
      // Try to find a punctuation break between MIN and MAX
      let bestBreak = -1;
      for (let j = i + MIN_GROUP - 1; j < groupEnd; j++) {
        const word = correctedWords[j] || words[j].word;
        if (PUNCTUATION.test(word)) {
          bestBreak = j + 1;
          break;
        }
      }

      const end = bestBreak > 0 
        ? bestBreak 
        : Math.min(i + MAX_GROUP, words.length);

      const groupWords = words.slice(i, end);
      
      // Build word list with small overlap between words to avoid gaps
      const captionWords = groupWords.map((w: any, idx: number) => {
        const nextWord = groupWords[idx + 1];
        // Extend each word's end to the start of the next word (fill gaps)
        const adjustedEnd = nextWord ? nextWord.start : w.end;
        return {
          word: correctedWords[i + idx] || w.word,
          start: w.start,
          end: Math.max(w.end, adjustedEnd),
        };
      });

      // Extend caption group timing: start slightly early, end slightly late
      const groupStart = Math.max(0, captionWords[0].start - 0.05);
      const groupEnd2 = captionWords[captionWords.length - 1].end + 0.1;

      captions.push({
        id: crypto.randomUUID(),
        words: captionWords,
        start: groupStart,
        end: groupEnd2,
        text: captionWords.map((w: any) => w.word).join(" "),
      });

      i = end;
    }

    return NextResponse.json({
      captions,
      rawTranscript: correctedText,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la transcription",
      },
      { status: 500 }
    );
  }
}
