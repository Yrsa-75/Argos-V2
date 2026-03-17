import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl, getPublicUrl } from "@/lib/r2";
import { generateVideoKey } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "filename et contentType requis" },
        { status: 400 }
      );
    }

    const key = generateVideoKey(filename);
    const presignedUrl = await getPresignedUploadUrl(key, contentType);
    const publicUrl = getPublicUrl(key);

    return NextResponse.json({
      presignedUrl,
      publicUrl,
      key,
    });
  } catch (error) {
    console.error("Upload presign error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du lien d'upload" },
      { status: 500 }
    );
  }
}
