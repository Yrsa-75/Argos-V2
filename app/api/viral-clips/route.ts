import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 120;

const DURATION_RANGES = {
  short: { min: 15, max: 30 },
  medium: { min: 25, max: 50 },
  long: { min: 45, max: 90 },
};

export async function POST(request: NextRequest) {
  try {
    const { transcript, count, duration: durationType } = await request.json();

    if (!transcript) {
      return NextResponse.json({ error: "transcript requis" }, { status: 400 });
    }

    const range = DURATION_RANGES[durationType as keyof typeof DURATION_RANGES] || DURATION_RANGES.medium;
    const isLong = durationType === "long";

    const multiSegmentInstructions = isLong
      ? `
MULTI-SÉQUENCES (autorisé pour les clips longs) :
- Tu PEUX combiner 2-3 séquences de différents endroits de la vidéo
- Chaque segment doit faire MINIMUM 20 secondes
- Maximum 3 segments par clip
- Les segments doivent avoir un lien narratif logique`
      : `
MONO-SÉQUENCE OBLIGATOIRE :
- Chaque clip DOIT être UN SEUL segment continu (un seul objet dans "segments")
- Le segment doit raconter une micro-histoire complète`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es un expert en montage viral pour TikTok, Instagram Reels et YouTube Shorts.

Identifie les ${count} meilleurs clips viraux dans ce transcript.

DURÉE STRICTE : chaque clip DOIT durer entre ${range.min} et ${range.max} secondes au total. C'est NON NÉGOCIABLE.
- Si un clip fait ${range.min - 5}s, il est TROP COURT → étends-le
- Si un clip fait ${range.max + 10}s, il est TROP LONG → coupe-le
- Vérifie la durée de chaque clip avant de le proposer : end - start doit être >= ${range.min} et <= ${range.max}

${multiSegmentInstructions}

RÈGLES CRITIQUES :
1. Ne coupe JAMAIS en milieu de phrase
2. Chaque clip raconte quelque chose de complet
3. Score de viralité 0-100
4. Diversifie les types de moments

Retourne UNIQUEMENT un JSON valide, sans markdown :
[
  {
    "title": "Titre accrocheur (max 60 car.)",
    "segments": [
      { "start": 10.2, "end": 35.5, "label": "Description" }
    ],
    "viralityScore": 85,
    "reason": "Pourquoi ce clip est viral"
  }
]

Classe par score décroissant.`,
        },
        { role: "user", content: transcript },
      ],
      temperature: 0.5,
      max_tokens: 3000,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "[]";
    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Post-process: validate and fix durations
    const clips = parsed
      .map((clip: any) => {
        const segments = (clip.segments || [{ start: clip.start, end: clip.end }]).map((s: any) => ({
          start: Number(s.start),
          end: Number(s.end),
          label: s.label || undefined,
        }));

        const totalDuration = segments.reduce((sum: number, s: any) => sum + (s.end - s.start), 0);

        return {
          id: crypto.randomUUID(),
          title: clip.title,
          segments,
          totalDuration: Math.round(totalDuration * 10) / 10,
          viralityScore: Number(clip.viralityScore),
          reason: clip.reason,
          status: "pending" as const,
          outputUrl: null,
          focusPoint: "face-track" as const,
          synthes: [],
        };
      })
      // Filter out clips with invalid durations
      .filter((clip: any) => {
        const dur = clip.totalDuration;
        // Allow 20% tolerance
        const minAllowed = range.min * 0.8;
        const maxAllowed = range.max * 1.2;
        return dur >= minAllowed && dur <= maxAllowed;
      });

    return NextResponse.json({ clips });
  } catch (error) {
    console.error("Viral clips error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de la détection des clips viraux" },
      { status: 500 }
    );
  }
}
