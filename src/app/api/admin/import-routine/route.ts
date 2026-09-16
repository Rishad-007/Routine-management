import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

interface ImportReport {
  imported_classes?: number;
  imported_sections?: number;
  imported_rooms?: number;
  imported_subjects?: number;
  imported_teachers?: number;
  routine_slots?: number;
  primary_assignments?: number;
  tag_assignments?: number;
  [key: string]: unknown;
}

function isRoutinePayload(p: unknown): p is { meta: unknown; teachers: unknown[] } {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  return typeof obj.meta === "object" && obj.meta !== null && Array.isArray(obj.teachers);
}

/**
 * POST /api/admin/import-routine
 * Receives the offline `teacher_routines.json` payload and runs the
 * transactional `import_routine_from_json` DB function (JSON wins —
 * routine + master data are rebuilt; admins & adjustment history kept).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let text: string;
  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body." }, { status: 400 });
  }
  if (text.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File is too large (max 5 MB)." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isRoutinePayload(payload)) {
    return NextResponse.json(
      { error: 'Invalid file structure: expected an object with a "meta" object and a "teachers" array.' },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("import_routine_from_json", {
    payload,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Import failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ report: (data as ImportReport) ?? {} });
}