import { recordAudit } from "./admin";
import { deletePersistentShare, listPersistentShares } from "./share-store";

export const MAX_SHARE_BYTES = 50 * 1024 * 1024;
let lastPersistentPrune = 0;

function measuredShareBytes(share: any) {
  const declared = Number(share?.sizeBytes || 0);
  const textBytes =
    typeof share?.textContent === "string"
      ? Buffer.byteLength(share.textContent, "utf8")
      : 0;
  let imageBytes = 0;
  if (
    typeof share?.imageSrc === "string" &&
    share.imageSrc.startsWith("data:")
  ) {
    const payload = share.imageSrc.split(",", 2)[1] || "";
    imageBytes = Math.floor(payload.length * 0.75);
  }
  if (Array.isArray(share?.imageSrcs) && share.imageSrcs.length > 1) {
    imageBytes = share.imageSrcs.reduce((total: number, source: unknown) => {
      if (typeof source !== "string" || !source.startsWith("data:"))
        return total;
      const payload = source.split(",", 2)[1] || "";
      return total + Math.floor(payload.length * 0.75);
    }, 0);
  }
  return Math.max(declared, textBytes, imageBytes);
}

export async function pruneOversizedShares() {
  const store = globalThis.textSharesStore as Map<string, any> | undefined;
  let removed = 0;
  for (const [slug, share] of store || []) {
    const bytes = measuredShareBytes(share);
    if (bytes <= MAX_SHARE_BYTES) continue;
    store.delete(slug);
    removed += 1;
    await recordAudit({
      actor: "system",
      action: "auto_kill_oversized",
      resourceType: "share",
      resourceId: slug,
      details: `${share?.contentType || "unknown"}; ${bytes} bytes; limit ${MAX_SHARE_BYTES} bytes`,
    });
  }
  if (Date.now() - lastPersistentPrune >= 60_000) {
    lastPersistentPrune = Date.now();
    try {
      for (const share of await listPersistentShares()) {
        const bytes = Number(share.sizeBytes || 0);
        if (bytes <= MAX_SHARE_BYTES) continue;
        if (await deletePersistentShare(share.slug)) {
          removed += 1;
          await recordAudit({
            actor: "system",
            action: "auto_kill_oversized",
            resourceType: "share",
            resourceId: share.slug,
            details: `${share.contentType || "unknown"}; ${bytes} bytes; limit ${MAX_SHARE_BYTES} bytes`,
          });
        }
      }
    } catch (error) {
      lastPersistentPrune = 0;
      if (import.meta.env.PROD) throw error;
    }
  }
  return removed;
}
