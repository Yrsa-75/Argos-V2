import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoUrl, segments, format = "9:16", clipTitle, captions, captionStyle } = body;

    if (!videoUrl || !segments || segments.length === 0) {
      return NextResponse.json({ error: "videoUrl et segments requis" }, { status: 400 });
    }

    const ffmpegUrl = process.env.FFMPEG_SERVICE_URL;
    const ffmpegSecret = process.env.FFMPEG_SERVICE_SECRET;

    if (!ffmpegUrl || ffmpegUrl === "http://localhost:4000") {
      return NextResponse.json(
        { error: "Le service FFmpeg n'est pas configuré. Déployez-le sur Railway et ajoutez FFMPEG_SERVICE_URL dans Vercel." },
        { status: 503 }
      );
    }

    // Call FFmpeg service
    const res = await fetch(`${ffmpegUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ffmpegSecret}`,
      },
      body: JSON.stringify({ videoUrl, segments, format, captions, captionStyle }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `FFmpeg service error ${res.status}` }));
      throw new Error(err.error || "Erreur du service FFmpeg");
    }

    // Stream the video back to the client
    const headers = new Headers();
    headers.set("Content-Type", "video/mp4");
    headers.set("Content-Disposition", `attachment; filename="${clipTitle || "clip"}.mp4"`);
    if (res.headers.get("content-length")) {
      headers.set("Content-Length", res.headers.get("content-length")!);
    }

    return new NextResponse(res.body, { status: 200, headers });
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur de traitement" },
      { status: 500 }
    );
  }
}
