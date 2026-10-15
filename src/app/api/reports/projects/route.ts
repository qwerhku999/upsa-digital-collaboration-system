import { getSessionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { projectReportCsv } from "@/server/services/reports";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const csv = await projectReportCsv(user);
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="project-status-report.csv"', "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.code === "FORBIDDEN" ? 403 : 400 });
    console.error(e);
    return Response.json({ error: "Unable to generate the report." }, { status: 500 });
  }
}
