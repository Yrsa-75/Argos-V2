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
      return NextResponse.json(
        { error: "transcript requis" },
        { status: 400 }
      );
    }

    const range = DURATION_RANGES[durationType as keyof typeof DURATION_RANGES] || DURATION_RANGES.medium;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es un expert en contenu viral pour les réseaux sociaux (TikTok, Instagram Reels, YouTube Shorts). On te donne le transcript complet d'une vidéo longue avec les timestamps.

Ton rôle :
1. Identifie les ${count} moments les plus "viraux" : surprise, émotion forte, information choc, humour, citation mémorable, moment d'enseignement puissant
2. Chaque clip doit durer entre ${range.min} et ${range.max} secondes
3. RÈGLE CRITIQUE : ne coupe JAMAIS en milieu de phrase. Les timestamps de début et fin doivent correspondre au début/fin de phrases complètes
4. Les clips ne doivent pas se chevaucher de plus de 20%
5. Attribue un score de viralité de 0 à 100 à chaque clip
6. Diversifie les types de moments (pas que de l'humour, pas que du choc)

Retourne UNIQUEMENT un JSON valide, sans markdown, sans backticks :
[
  {
    "title": "Titre accrocheur du clip",
    "start": 45.2,
    "end": 72.8,
    "viralityScore": 85,
    "reason": "Moment de révélation surprenante avec une formulation mémorable"
  }
]

Classe les clips par score de viralité décroissant.`,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      temperature: 0.5,
      max_tokens: 2048,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "[]";
    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const clips = parsed.map((clip: any) => ({
      id: crypto.randomUUID(),
      title: clip.title,
      start: Number(clip.start),
      end: Number(clip.end),
      viralityScore: Number(clip.viralityScore),
      reason: clip.reason,
      status: "pending" as const,
      outputUrl: null,
      focusPoint: "face-track" as const,
      synthes: [],
    }));

    return NextResponse.json({ clips });
  } catch (error) {
    console.error("Viral clips error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la détection des clips viraux",
      },
      { status: 500 }
    );
  }
}
