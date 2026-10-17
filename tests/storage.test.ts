import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobSdk = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@vercel/blob", () => blobSdk);

import { deleteStoredFile, readStoredFile, saveFile } from "@/lib/storage";

describe("private Vercel Blob storage", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uploads using private access and stores only a pathname reference", async () => {
    blobSdk.put.mockResolvedValue({ pathname: "documents/123e4567-e89b-12d3-a456-426614174000.pdf" });

    const key = await saveFile(Buffer.from("%PDF"), "pdf", "application/pdf");

    expect(blobSdk.put).toHaveBeenCalledWith(
      expect.stringMatching(/^documents\/[0-9a-f-]{36}\.pdf$/),
      Buffer.from("%PDF"),
      expect.objectContaining({ access: "private", token: "test-token", contentType: "application/pdf", allowOverwrite: false }),
    );
    expect(key).toBe("vercel-blob:documents/123e4567-e89b-12d3-a456-426614174000.pdf");
    expect(key).not.toContain("blob.vercel-storage.com");
  });

  it("gets a private blob as a stream and deletes by pathname", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("%PDF"));
        controller.close();
      },
    });
    blobSdk.get.mockResolvedValue({ statusCode: 200, stream });

    const key = "vercel-blob:documents/123e4567-e89b-12d3-a456-426614174000.pdf";
    expect(await readStoredFile(key)).toBe(stream);
    expect(blobSdk.get).toHaveBeenCalledWith("documents/123e4567-e89b-12d3-a456-426614174000.pdf", {
      access: "private",
      token: "test-token",
    });

    await deleteStoredFile(key);
    expect(blobSdk.del).toHaveBeenCalledWith("documents/123e4567-e89b-12d3-a456-426614174000.pdf", { token: "test-token" });
  });

  it("returns null for a blob that no longer exists", async () => {
    blobSdk.get.mockResolvedValue(null);
    await expect(readStoredFile("vercel-blob:documents/123e4567-e89b-12d3-a456-426614174000.pdf")).resolves.toBeNull();
  });

  it("fails clearly when the production Blob token is missing", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(saveFile(Buffer.from("%PDF"), "pdf")).rejects.toThrow("BLOB_READ_WRITE_TOKEN is required");
    expect(blobSdk.put).not.toHaveBeenCalled();
  });

  it("keeps non-production uploads on local storage", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL", "1");
    const key = await saveFile(Buffer.from("%PDF"), "pdf");
    expect(key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(blobSdk.put).not.toHaveBeenCalled();
    await deleteStoredFile(key);
  });
});
