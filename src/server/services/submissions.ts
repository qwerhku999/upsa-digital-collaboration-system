import type { Prisma, SubmissionStatus } from "@prisma/client";
import { conflict, forbidden, invalid, isUniqueViolation, notFound } from "@/lib/errors";
import { validateUpload, type UploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile, readStoredFile, saveFile } from "@/lib/storage";
import { parse, submissionMetaSchema } from "@/server/validation";
import { accessibleProjectsWhere, getProjectAccess, isStudentLevel, type Actor } from "./access";
import { logActivity } from "./activity";
import { PAGE_SIZE, paginate } from "./audit";
import { notify } from "./notifications";

export async function createSubmission(actor: Actor, projectId: string, meta: unknown, file: UploadedFile) {
  const { project, level } = await getProjectAccess(actor, projectId);
  if (!isStudentLevel(level)) throw forbidden("Only project members can submit documents.");
  const d = parse(submissionMetaSchema, meta);
  const info = validateUpload(file);
  const storageKey = await saveFile(file.buffer, info.ext);
  try {
    return await prisma.$transaction(async (tx) => {
      const s = await tx.submission.create({
        data: {
          projectId, title: d.title, description: d.description, createdById: actor.id,
          versions: { create: { versionNumber: 1, originalName: info.displayName, storageKey, mimeType: info.mime, sizeBytes: info.sizeBytes, sha256: info.sha256, note: d.note, uploadedById: actor.id } },
        },
      });
      await logActivity(tx, projectId, actor.id, "submission.created", `${actor.name} submitted "${s.title}" (version 1).`);
      if (project.supervisorId) {
        await notify(tx, [project.supervisorId], { type: "SUBMISSION", projectId, link: `/submissions/${s.id}`, title: "New document submitted", message: `${actor.name} submitted "${s.title}" in "${project.title}".` });
      }
      return s;
    });
  } catch (e) {
    await deleteStoredFile(storageKey); // no orphan files if the database write fails
    throw e;
  }
}

/** A resubmission is a NEW immutable version; earlier versions and their feedback are never changed or deleted. */
export async function addVersion(actor: Actor, submissionId: string, note: string | null, file: UploadedFile) {
  const sub = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!sub) throw notFound("Submission not found.");
  const { project, level } = await getProjectAccess(actor, sub.projectId);
  if (!isStudentLevel(level)) throw forbidden("Only project members can upload new versions.");
  if (sub.status !== "REVISION_REQUIRED") throw invalid("A new version can only be uploaded after the supervisor requests a revision.");
  const info = validateUpload(file);
  const storageKey = await saveFile(file.buffer, info.ext);
  try {
    return await prisma.$transaction(async (tx) => {
      const last = await tx.submissionVersion.aggregate({ where: { submissionId }, _max: { versionNumber: true } });
      const versionNumber = (last._max.versionNumber ?? 0) + 1;
      const v = await tx.submissionVersion.create({
        data: { submissionId, versionNumber, originalName: info.displayName, storageKey, mimeType: info.mime, sizeBytes: info.sizeBytes, sha256: info.sha256, note: note?.trim().slice(0, 1000) || null, uploadedById: actor.id },
      });
      await tx.submission.update({ where: { id: submissionId }, data: { status: "SUBMITTED" } });
      await logActivity(tx, sub.projectId, actor.id, "submission.version", `${actor.name} uploaded version ${versionNumber} of "${sub.title}".`);
      if (project.supervisorId) {
        await notify(tx, [project.supervisorId], { type: "SUBMISSION", projectId: sub.projectId, link: `/submissions/${submissionId}`, title: "Revised document submitted", message: `Version ${versionNumber} of "${sub.title}" is ready for review.` });
      }
      return v;
    });
  } catch (e) {
    await deleteStoredFile(storageKey);
    if (isUniqueViolation(e)) throw conflict("Another upload happened at the same time. Please try again.");
    throw e;
  }
}

export async function listSubmissions(actor: Actor, opts: { projectId?: string; status?: SubmissionStatus; page?: number } = {}) {
  const where: Prisma.SubmissionWhereInput = {
    project: { ...accessibleProjectsWhere(actor), ...(opts.projectId ? { id: opts.projectId } : {}) },
    ...(opts.status ? { status: opts.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.submission.findMany({
      where, orderBy: { updatedAt: "desc" }, ...paginate(opts.page ?? 1),
      include: { project: { select: { id: true, title: true } }, createdBy: { select: { name: true } }, _count: { select: { versions: true } } },
    }),
    prisma.submission.count({ where }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getSubmission(actor: Actor, id: string) {
  const sub = await prisma.submission.findUnique({ where: { id }, select: { projectId: true } });
  if (!sub) throw notFound("Submission not found.");
  const { project, level } = await getProjectAccess(actor, sub.projectId);
  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      versions: { orderBy: { versionNumber: "desc" }, include: { uploadedBy: { select: { name: true } } } },
      feedback: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } }, version: { select: { versionNumber: true } } } },
    },
  });
  return { submission, project: { id: project.id, title: project.title }, level };
}

/** Authorization is re-checked on every download; file names on disk are random and never exposed. */
export async function getVersionDownload(actor: Actor, versionId: string) {
  const v = await prisma.submissionVersion.findUnique({ where: { id: versionId }, include: { submission: { select: { projectId: true } } } });
  if (!v) throw notFound("File not found.");
  await getProjectAccess(actor, v.submission.projectId);
  let buffer: Buffer;
  try {
    buffer = await readStoredFile(v.storageKey);
  } catch {
    throw notFound("The stored file is missing.");
  }
  return { version: v, buffer };
}
