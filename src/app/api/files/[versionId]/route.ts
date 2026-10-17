import { getSessionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getVersionDownload } from "@/server/services/submissions";

export async function GET(_req: Request, ctx: { params: Promise<{ versionId: string }> }) {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { versionId } = await ctx.params;
    const { version, stream } = await getVersionDownload(user, versionId); // access is checked before private storage is read
    const ascii = version.originalName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    return new Response(stream, {
      headers: {
        "Content-Type": version.mimeType,
        "Content-Length": String(version.sizeBytes),
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(version.originalName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 400 });
    console.error("Document download failed.", e instanceof Error ? e.name : "Unknown error");
    return Response.json({ error: "Unable to download the file." }, { status: 500 });
  }
}
