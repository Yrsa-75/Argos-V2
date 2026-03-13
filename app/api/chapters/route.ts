import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { transcript, duration, count } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "transcript requis" },
        { status: 400 }
      );
    }

    const countInstruction =
      count === "auto"
        ? "Détermine automatiquement le nombre de chapitres approprié selon les changements de sujet."
        : `Génère exactement ${count} chapitres.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es un spécialiste du découpage vidéo en chapitres. On te donne le transcript complet d'une vidéo avec les timestamps de chaque segment.

Ton rôle :
1. Identifie les moments où le sujet change ou évolue significativement
2. Propose un titre court et descriptif pour chaque chapitre (max 6 mots)
3. ${countInstruction}
4. Le premier chapitre commence toujours à 0 secondes
5. Le dernier chapitre se termine à la fin de la vidéo

Retourne UNIQUEMENT un JSON valide, sans markdown, sans backticks, avec ce format exact :
[
  { "title": "Introduction", "start": 0, "end": 45.2 },
  { "title": "Le problème principal", "start": 45.2, "end": 120.5 }
]

Durée totale de la vidéo : ${duration} secondes.`,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "[]";

    // Parse JSON safely (remove potential markdown backticks)
    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const chapters = parsed.map((ch: any) => ({
      id: crypto.randomUUID(),
      title: ch.title,
      start: Number(ch.start),
      end: Number(ch.end),
    }));

    return NextResponse.json({ chapters });
  } catch (error) {
    console.error("Chapters error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la détection des chapitres",
      },
      { status: 500 }
    );
  }
}
