import { randomUUID } from 'node:crypto';
import type { ObjectId } from 'mongodb';
import { getMongo } from './mongo';
import { getBlogPosts, recordAudit } from './admin';
import { MAX_SHARE_BYTES } from './shares';

const LOCK_ID = 'expiration-worker';
const LOCK_TTL_MS = 10 * 60_000;
const BLOG_ORPHAN_GRACE_MS = 24 * 60 * 60_000;
const GRIDFS_ORPHAN_GRACE_MS = 60 * 60_000;
const MAX_RECORDS_PER_RUN = 2_000;

export type CleanupReport = {
  runId: string; startedAt: Date; finishedAt?: Date; skipped: boolean;
  expiredShares: number; oversizedShares: number; expiredGuestShares: number;
  oversizedGuestShares: number; orphanedPayloads: number; orphanedBlogImages: number; failures: number;
};

function memoryShareBytes(share: any) {
  const declared = Number(share?.sizeBytes || 0);
  const text = typeof share?.textContent === 'string' ? Buffer.byteLength(share.textContent, 'utf8') : 0;
  const sources = Array.isArray(share?.imageSrcs) && share.imageSrcs.length ? share.imageSrcs : [share?.imageSrc];
  const images = sources.reduce((total: number, source: unknown) => {
    if (typeof source !== 'string' || !source.startsWith('data:')) return total;
    return total + Math.floor((source.split(',', 2)[1] || '').length * .75);
  }, 0);
  return Math.max(declared, text, images);
}

export async function runCleanupWorker(): Promise<CleanupReport> {
  const { db, bucket } = await getMongo();
  const runId = randomUUID();
  const startedAt = new Date();
  const report: CleanupReport = { runId, startedAt, skipped: false, expiredShares: 0, oversizedShares: 0, expiredGuestShares: 0, oversizedGuestShares: 0, orphanedPayloads: 0, orphanedBlogImages: 0, failures: 0 };
  const locks = db.collection('workerLocks');
  const lockUntil = new Date(startedAt.getTime() + LOCK_TTL_MS);
  let acquired = await locks.findOneAndUpdate({ _id: LOCK_ID as any, expiresAt: { $lte: startedAt } }, { $set: { owner: runId, acquiredAt: startedAt, expiresAt: lockUntil } }, { returnDocument: 'after' });
  if (!acquired) {
    try {
      await locks.insertOne({ _id: LOCK_ID as any, owner: runId, acquiredAt: startedAt, expiresAt: lockUntil });
      acquired = { _id: LOCK_ID, owner: runId } as any;
    } catch {
      report.skipped = true;
      report.finishedAt = new Date();
      return report;
    }
  }

  const durableAudit = async (action: string, resourceType: string, resourceId: string, details: string) => {
    const entry = { runId, actor: 'system:expiration-worker', action, resourceType, resourceId, details, createdAt: new Date() };
    await db.collection('systemAuditLogs').insertOne(entry);
    await recordAudit({ actor: entry.actor, action, resourceType, resourceId, details });
  };

  try {
    const memoryStore = globalThis.textSharesStore as Map<string, any> | undefined;
    for (const [slug, share] of memoryStore || []) {
      const expired = new Date(share.expiryDate).getTime() <= startedAt.getTime();
      const bytes = memoryShareBytes(share);
      const oversized = bytes > MAX_SHARE_BYTES;
      if (!expired && !oversized) continue;
      memoryStore!.delete(slug);
      if (expired) report.expiredGuestShares += 1; else report.oversizedGuestShares += 1;
      await durableAudit(expired ? 'expire_guest_share' : 'auto_kill_oversized_guest', 'share', slug, `${share.contentType}; ${bytes} bytes`);
    }

    const candidates = await db.collection('shares').find({ $or: [{ expiryDate: { $lte: startedAt } }, { sizeBytes: { $gt: MAX_SHARE_BYTES } }] }).sort({ expiryDate: 1 }).limit(MAX_RECORDS_PER_RUN).toArray();
    for (const share of candidates) {
      const expired = new Date(share.expiryDate).getTime() <= startedAt.getTime();
      try {
        const fileId = share.contentFileId as ObjectId;
        if (fileId && await db.collection('sharePayloads.files').findOne({ _id: fileId }, { projection: { _id: 1 } })) await bucket.delete(fileId);
        await db.collection('shares').deleteOne({ _id: share._id });
        if (expired) report.expiredShares += 1; else report.oversizedShares += 1;
        await durableAudit(expired ? 'expire_share' : 'auto_kill_oversized', 'share', String(share.slug), `${share.contentType}; ${Number(share.sizeBytes || 0)} bytes; GridFS payload removed`);
      } catch (error) {
        report.failures += 1;
        await durableAudit('cleanup_failure', 'share', String(share.slug), error instanceof Error ? error.message : 'Unknown cleanup failure');
      }
    }

    const orphanCutoff = new Date(startedAt.getTime() - GRIDFS_ORPHAN_GRACE_MS);
    const oldFiles = await db.collection('sharePayloads.files').find({ uploadDate: { $lte: orphanCutoff } }).limit(MAX_RECORDS_PER_RUN).toArray();
    for (const file of oldFiles) {
      if (await db.collection('shares').findOne({ contentFileId: file._id }, { projection: { _id: 1 } })) continue;
      try {
        await bucket.delete(file._id as ObjectId);
        report.orphanedPayloads += 1;
        await durableAudit('delete_orphaned_payload', 'gridfs_payload', String(file._id), String(file.filename || 'encrypted share payload'));
      } catch (error) {
        report.failures += 1;
        await durableAudit('cleanup_failure', 'gridfs_payload', String(file._id), error instanceof Error ? error.message : 'Unknown cleanup failure');
      }
    }

    const referencedBlogImages = new Set((await getBlogPosts()).map((post) => post.coverImage.match(/^\/api\/blog-images\/([a-f0-9]{24})$/)?.[1]).filter(Boolean));
    const blogCutoff = new Date(startedAt.getTime() - BLOG_ORPHAN_GRACE_MS);
    const blogImages = await db.collection('blogImages').find({ createdAt: { $lte: blogCutoff } }, { projection: { _id: 1, bytes: 1 } }).limit(MAX_RECORDS_PER_RUN).toArray();
    for (const image of blogImages) {
      if (referencedBlogImages.has(String(image._id))) continue;
      await db.collection('blogImages').deleteOne({ _id: image._id });
      report.orphanedBlogImages += 1;
      await durableAudit('delete_orphaned_blog_image', 'blog_image', String(image._id), `${Number(image.bytes || 0)} bytes; older than grace period`);
    }

    report.finishedAt = new Date();
    await durableAudit('cleanup_run_complete', 'worker_run', runId, JSON.stringify(report));
    return report;
  } finally {
    await locks.deleteOne({ _id: LOCK_ID as any, owner: runId }).catch(() => undefined);
  }
}
