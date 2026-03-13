import { NextRequest, NextResponse } from "next/server";
import { submitJob, getJobStatus } from "@/lib/ffmpeg";

export const maxDuration = 30;

// POST /api/process — submit a new processing job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, inputUrl, outputKey, params } = body;

    if (!type || !inputUrl) {
      return NextResponse.json(
        { error: "type et inputUrl requis" },
        { status: 400 }
      );
    }

    const result = await submitJob({
      type,
      inputUrl,
      outputKey: outputKey || `output/${crypto.randomUUID()}.mp4`,
      params: params || {},
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Process submit error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la soumission du job",
      },
      { status: 500 }
    );
  }
}

// GET /api/process?jobId=xxx — poll job status
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId requis" },
        { status: 400 }
      );
    }

    const result = await getJobStatus(jobId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Process status error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la vérification du statut",
      },
      { status: 500 }
    );
  }
}
