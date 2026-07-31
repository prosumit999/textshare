import "dotenv/config";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/textshare";
const keys = (process.env.AUDIT_LOG_KEYS || process.env.AUDIT_LOG_SECRET || "").split(",").map((v) => v.trim()).filter(Boolean);
if (!keys.length) throw new Error("AUDIT_LOG_KEYS is required.");
const keyring = new Map(keys.map((key) => [createHash("sha256").update(key).digest("hex").slice(0, 12), key]));
const outputPath = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);
const output = outputPath ? createWriteStream(outputPath, { flags: "wx", mode: 0o600 }) : null;
const client = new MongoClient(uri); await client.connect();
const db = client.db(new URL(uri).pathname.slice(1) || "textshare");
let checked = 0; let expectedSequence = 1;
for await (const row of db.collection("auditLogs").find({}).sort({ sequence: 1 })) {
  if (Number(row.sequence) !== expectedSequence) throw new Error(`Audit sequence gap at ${expectedSequence}.`);
  const key = keyring.get(row.keyId); if (!key) throw new Error(`Missing audit key ${row.keyId}.`);
  const canonical = JSON.stringify({ sequence: row.sequence, keyId: row.keyId, id: row.id, createdAt: new Date(row.createdAt).toISOString(), actor: row.actor, action: row.action, resourceType: row.resourceType, resourceId: row.resourceId, details: row.details });
  const actual = Buffer.from(row.signature, "hex"); const expected = Buffer.from(createHmac("sha256", key).update(canonical).digest("hex"), "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error(`Invalid signature at sequence ${row.sequence}.`);
  output?.write(`${JSON.stringify(row)}\n`); checked += 1; expectedSequence += 1;
}
output?.end(); await client.close(); console.log(`Verified ${checked} audit records${outputPath ? ` and exported to ${outputPath}` : ""}.`);
