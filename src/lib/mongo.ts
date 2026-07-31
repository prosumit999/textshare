import { GridFSBucket, MongoClient, type Db } from "mongodb";
import { serverEnv } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var textShareMongoPromise:
    Promise<{ db: Db; bucket: GridFSBucket }> | undefined;
}

export function getMongo() {
  if (!globalThis.textShareMongoPromise) {
    const uri = serverEnv.MONGODB_URI || "mongodb://localhost:27017/textshare";
    globalThis.textShareMongoPromise = (async () => {
      const client = new MongoClient(uri, {
        maxPoolSize: 20,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
      });
      await client.connect();
      const dbName = new URL(uri).pathname.slice(1) || "textshare";
      const db = client.db(dbName);
      await Promise.all([
        db.collection("users").createIndex({ email: 1 }, { unique: true }),
        db
          .collection("sessions")
          .createIndex({ tokenHash: 1 }, { unique: true }),
        db
          .collection("sessions")
          .createIndex({ sessionId: 1 }, { unique: true, sparse: true }),
        db.collection("sessions").createIndex({ email: 1, expiresAt: 1 }),
        db
          .collection("sessions")
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db
          .collection("adminChallenges")
          .createIndex({ tokenHash: 1 }, { unique: true }),
        db
          .collection("adminChallenges")
          .createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 }),
        db
          .collection("adminRecoveryCodes")
          .createIndex({ email: 1, codeHash: 1 }, { unique: true }),
        db
          .collection("auditLogs")
          .createIndex({ sequence: 1 }, { unique: true }),
        db.collection("auditLogs").createIndex({ createdAt: -1 }),
        db.collection("shares").createIndex({ slug: 1 }, { unique: true }),
        db.collection("shares").createIndex({ owner: 1, createdAt: -1 }),
        db.collection("shares").createIndex({ expiryDate: 1 }),
        db.collection("blogImages").createIndex({ createdAt: -1 }),
        db
          .collection("uploadQuarantine")
          .createIndex(
            { createdAt: 1 },
            { expireAfterSeconds: 60 * 60 * 24 * 30 },
          ),
        db.collection("blogPosts").createIndex({ id: 1 }, { unique: true }),
        db.collection("blogPosts").createIndex({ slug: 1 }, { unique: true }),
        db.collection("blogPosts").createIndex({ status: 1, publishDate: -1 }),
        db.collection("systemAuditLogs").createIndex({ createdAt: -1 }),
        db
          .collection("systemAuditLogs")
          .createIndex({ runId: 1, createdAt: 1 }),
        db.collection("ipBlocks").createIndex({ ip: 1 }, { unique: true }),
        db
          .collection("ipBlocks")
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db
          .collection("trafficEvents")
          .createIndex(
            { createdAt: 1 },
            { expireAfterSeconds: 60 * 60 * 24 * 30 },
          ),
        db.collection("trafficEvents").createIndex({ ip: 1, createdAt: -1 }),
        db
          .collection("securitySignals")
          .createIndex(
            { createdAt: 1 },
            { expireAfterSeconds: 60 * 60 * 24 * 90 },
          ),
        db.collection("securitySignals").createIndex({ ip: 1, createdAt: -1 }),
        db
          .collection("workerLocks")
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ]);
      const validators: Record<string, Record<string, unknown>> = {
        users: {
          bsonType: "object",
          required: [
            "name",
            "email",
            "passwordHash",
            "createdAt",
            "plan",
            "isAdmin",
            "disabled",
          ],
          properties: {
            email: { bsonType: "string", maxLength: 254 },
            plan: { enum: ["free", "plus", "pro"] },
            isAdmin: { bsonType: "bool" },
            disabled: { bsonType: "bool" },
          },
        },
        sessions: {
          bsonType: "object",
          required: [
            "tokenHash",
            "email",
            "expiresAt",
            "createdAt",
            "adminVerified",
          ],
          properties: {
            tokenHash: { bsonType: "string", minLength: 64, maxLength: 64 },
            email: { bsonType: "string" },
            expiresAt: { bsonType: "date" },
            lastSeenAt: { bsonType: "date" },
            adminVerified: { bsonType: "bool" },
          },
        },
        blogPosts: {
          bsonType: "object",
          required: [
            "id",
            "title",
            "slug",
            "content",
            "status",
            "createdAt",
            "updatedAt",
          ],
          properties: {
            title: { bsonType: "string", minLength: 3, maxLength: 160 },
            slug: { bsonType: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
            status: { enum: ["draft", "published"] },
            content: { bsonType: "string", maxLength: 200000 },
          },
        },
        shares: {
          bsonType: "object",
          required: [
            "slug",
            "contentType",
            "expiryDate",
            "createdAt",
            "sizeBytes",
          ],
          properties: {
            slug: { bsonType: "string", pattern: "^[a-z0-9]{3,64}$" },
            contentType: { enum: ["text", "image"] },
            expiryDate: { bsonType: "date" },
            sizeBytes: {
              bsonType: ["int", "long", "double"],
              minimum: 0,
              maximum: 52428800,
            },
          },
        },
        auditLogs: {
          bsonType: "object",
          required: [
            "sequence",
            "keyId",
            "actor",
            "action",
            "resourceType",
            "resourceId",
            "createdAt",
            "signature",
          ],
          properties: {
            sequence: { bsonType: ["int", "long", "double"], minimum: 1 },
            signature: { bsonType: "string", minLength: 64, maxLength: 64 },
          },
        },
      };
      // Run with a temporary migration credential; the normal application user
      // should not have collMod/dbAdmin permission.
      if (serverEnv.APPLY_MONGO_VALIDATORS === "true")
        await Promise.all(
          Object.entries(validators).map(([collection, $jsonSchema]) =>
            db.command({
              collMod: collection,
              validator: { $jsonSchema },
              validationLevel: "moderate",
              validationAction: "error",
            }),
          ),
        );
      return {
        db,
        bucket: new GridFSBucket(db, { bucketName: "sharePayloads" }),
      };
    })().catch((error) => {
      globalThis.textShareMongoPromise = undefined;
      throw error;
    });
  }
  return globalThis.textShareMongoPromise;
}
