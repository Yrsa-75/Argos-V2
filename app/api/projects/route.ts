import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getKeyFromPublicUrl, deleteR2Object } from "@/lib/r2";

// GET /api/projects?id=xxx — load a project
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (id) {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    // List all projects
    const { data, error } = await supabase
      .from("projects")
      .select("id, title, thumbnail_url, video_duration, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Projects GET error:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement du projet" },
      { status: 500 }
    );
  }
}

// POST /api/projects — save a project
export async function POST(request: NextRequest) {
  try {
    const project = await request.json();

    // Validate and sanitize the ID (must be a valid UUID)
    let projectId = project.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!projectId || !uuidRegex.test(projectId)) {
      projectId = crypto.randomUUID();
      project.id = projectId;
    }

    // Sanitize video_duration (must be integer or null)
    let duration = project.videoMeta?.duration;
    if (typeof duration === "number" && isFinite(duration)) {
      duration = Math.round(duration);
    } else {
      duration = null;
    }

    const row = {
      id: projectId,
      title: project.title || "Sans titre",
      video_url: project.videoUrl || null,
      video_duration: duration,
      video_resolution: project.videoMeta
        ? `${project.videoMeta.width || 0}x${project.videoMeta.height || 0}`
        : null,
      thumbnail_url: project.thumbnailUrl || null,
      state: project,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("projects")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("Supabase upsert error:", JSON.stringify(error));
      return NextResponse.json(
        { error: `Erreur Supabase: ${error.message || error.code}` },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Projects POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la sauvegarde du projet",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/projects?id=xxx — delete a project and its R2 files
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID du projet requis" },
        { status: 400 }
      );
    }

    // Get the project to find associated files for R2 cleanup
    const { data: project } = await supabase
      .from("projects")
      .select("video_url, state")
      .eq("id", id)
      .single();

    // Delete the project from Supabase (processing_jobs cascade automatically)
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Supabase delete error:", JSON.stringify(error));
      return NextResponse.json(
        { error: `Erreur Supabase: ${error.message || error.code}` },
        { status: 500 }
      );
    }

    // Clean up R2 files (don't block the response if this fails)
    let deletedFiles = 0;
    try {
      // Delete the video file from R2
      if (project?.video_url) {
        const videoKey = getKeyFromPublicUrl(project.video_url);
        if (videoKey) {
          await deleteR2Object(videoKey);
          deletedFiles++;
          console.log(`R2: deleted video ${videoKey}`);
        }
      }

      // Delete the thumbnail if it exists
      const state = project?.state;
      if (state?.thumbnailUrl) {
        const thumbKey = getKeyFromPublicUrl(state.thumbnailUrl);
        if (thumbKey) {
          await deleteR2Object(thumbKey);
          deletedFiles++;
        }
      }
    } catch (r2Error) {
      // Don't fail the request if R2 cleanup fails
      console.error("R2 cleanup error (non-blocking):", r2Error);
    }

    return NextResponse.json({ deleted: true, filesRemoved: deletedFiles });
  } catch (error) {
    console.error("Projects DELETE error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la suppression du projet",
      },
      { status: 500 }
    );
  }
}
