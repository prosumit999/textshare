import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { ObjectId } from "mongodb";
import { getMongo } from "./mongo";
import { serverEnv } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var textSharesStore: Map<string, StoredShare> | undefined;
}

export type StoredShare = {
  contentType: "text" | "image";
  textContent: string;
  imageSrc: string | null;
  imageSrcs?: string[];
  expiryDate: Date;
  burnAfterReading: boolean;
  language: string;
  passwordHash: string | null;
  owner: string | null;
  guestIp: string | null;
  sizeBytes: number;
  createdAt: Date;
  viewCount: number;
};

function encryptionKeys() {
  const configured = (
    serverEnv.SHARE_ENCRYPTION_KEYS ||
    serverEnv.SHARE_ENCRYPTION_KEY ||
    ""
  )
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (!configured.length && import.meta.env.PROD)
    throw new Error("SHARE_ENCRYPTION_KEYS is required in production.");
  const developmentFallback =
    serverEnv.ADMIN_PASSWORD || "textshare-development-only";
  return (configured.length ? configured : [developmentFallback]).map((key) =>
    createHash("sha256").update(key).digest(),
  );
}

function encryptPayload(share: StoredShare) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeys()[0], iv);
  const plaintext = Buffer.from(
    JSON.stringify({
      textContent: share.textContent,
      imageSrc: share.imageSrc,
      imageSrcs: share.imageSrcs || [],
    }),
    "utf8",
  );
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptPayload(payload: Buffer) {
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  for (const key of encryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([
          decipher.update(payload.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      ) as {
        textContent: string;
        imageSrc: string | null;
        imageSrcs?: string[];
      };
    } catch {
      /* try the previous rotation key */
    }
  }
  throw new Error(
    "Unable to decrypt share payload with the configured keyring.",
  );
}

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function hasPersistentShare(slug: string) {
  const { db } = await getMongo();
  return Boolean(
    await db.collection("shares").findOne({ slug }, { projection: { _id: 1 } }),
  );
}

export async function savePersistentShare(slug: string, share: StoredShare) {
  const { db, bucket } = await getMongo();
  const encrypted = encryptPayload(share);
  const upload = bucket.openUploadStream(`${slug}.enc`, {
    metadata: { slug, encrypted: true },
  });
  upload.end(encrypted);
  await new Promise<void>((resolve, reject) =>
    upload.on("finish", resolve).on("error", reject),
  );
  try {
    await db.collection("shares").insertOne({
      slug,
      contentFileId: upload.id,
      contentType: share.contentType,
      expiryDate: share.expiryDate,
      burnAfterReading: share.burnAfterReading,
      language: share.language,
      passwordHash: share.passwordHash,
      owner: share.owner,
      guestIp: share.guestIp,
      sizeBytes: share.sizeBytes,
      createdAt: share.createdAt,
      viewCount: share.viewCount,
    });
  } catch (error) {
    await bucket.delete(upload.id).catch(() => undefined);
    throw error;
  }
}

export async function getPersistentShare(
  slug: string,
): Promise<StoredShare | null> {
  const { db, bucket } = await getMongo();
  const document = await db.collection("shares").findOne({ slug });
  if (!document) return null;
  const payload = decryptPayload(
    await streamToBuffer(
      bucket.openDownloadStream(document.contentFileId as ObjectId),
    ),
  );
  return {
    ...document,
    ...payload,
    expiryDate: document.expiryDate,
    createdAt: document.createdAt,
  } as unknown as StoredShare;
}

export async function deletePersistentShare(slug: string, owner?: string) {
  const { db, bucket } = await getMongo();
  const query = owner ? { slug, owner } : { slug };
  const document = await db.collection("shares").findOne(query);
  if (!document) return false;
  await db.collection("shares").deleteOne({ _id: document._id });
  await bucket
    .delete(document.contentFileId as ObjectId)
    .catch(() => undefined);
  return true;
}

/**
 * Atomically claims and removes a burn-after-reading share. The caller must
 * already have rendered the payload before invoking this, so its first reader
 * can finish loading while every later request finds the room unavailable.
 */
export async function consumePersistentBurnShare(slug: string) {
  const { db, bucket } = await getMongo();
  const claimed = await db.collection("shares").findOneAndDelete({
    slug,
    burnAfterReading: true,
  });
  if (!claimed) return false;
  await bucket
    .delete(claimed.contentFileId as ObjectId)
    .catch(() => undefined);
  return true;
}

export async function listPersistentShares(owner?: string) {
  const { db } = await getMongo();
  const documents = await db
    .collection("shares")
    .find(owner ? { owner } : {})
    .sort({ createdAt: -1 })
    .limit(1000)
    .toArray();
  return documents.map(
    ({ contentFileId: _contentFileId, ...document }) => document,
  );
}

export async function incrementPersistentShareViews(slug: string) {
  const { db } = await getMongo();
  await db.collection("shares").updateOne({ slug }, { $inc: { viewCount: 1 } });
}

let guestMigrationReady: Promise<void> | null = null;
function ensureGuestShareMigration() {
  if (!guestMigrationReady)
    guestMigrationReady = (async () => {
      const legacy = (globalThis.textSharesStore ??= new Map<
        string,
        StoredShare
      >());
      for (const [slug, share] of legacy) {
        if (!(await hasPersistentShare(slug)))
          await savePersistentShare(slug, share);
        legacy.delete(slug);
      }
    })().catch((error) => {
      guestMigrationReady = null;
      throw error;
    });
  return guestMigrationReady;
}

export async function hasShare(slug: string) {
  await ensureGuestShareMigration();
  return hasPersistentShare(slug);
}

export async function saveShare(slug: string, share: StoredShare) {
  await ensureGuestShareMigration();
  return savePersistentShare(slug, share);
}

export async function getShare(slug: string) {
  await ensureGuestShareMigration();
  return getPersistentShare(slug);
}

export async function deleteShare(slug: string, owner?: string) {
  await ensureGuestShareMigration();
  return deletePersistentShare(slug, owner);
}

export async function consumeBurnShare(slug: string) {
  await ensureGuestShareMigration();
  return consumePersistentBurnShare(slug);
}

export async function listShares(owner?: string) {
  await ensureGuestShareMigration();
  return listPersistentShares(owner);
}

export async function incrementShareViews(slug: string) {
  await ensureGuestShareMigration();
  await incrementPersistentShareViews(slug);
}
