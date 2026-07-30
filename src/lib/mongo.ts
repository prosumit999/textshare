import { GridFSBucket, MongoClient, type Db } from 'mongodb';
import { serverEnv } from './env';

declare global {
  // eslint-disable-next-line no-var
  var textShareMongoPromise: Promise<{ db: Db; bucket: GridFSBucket }> | undefined;
}

export function getMongo() {
  if (!globalThis.textShareMongoPromise) {
    const uri = serverEnv.MONGODB_URI || 'mongodb://localhost:27017/textshare';
    globalThis.textShareMongoPromise = (async () => {
      const client = new MongoClient(uri, { maxPoolSize: 20, minPoolSize: 1, serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const dbName = new URL(uri).pathname.slice(1) || 'textshare';
      const db = client.db(dbName);
      await Promise.all([
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('shares').createIndex({ slug: 1 }, { unique: true }),
        db.collection('shares').createIndex({ owner: 1, createdAt: -1 }),
        db.collection('shares').createIndex({ expiryDate: 1 }),
        db.collection('blogImages').createIndex({ createdAt: -1 })
      ]);
      return { db, bucket: new GridFSBucket(db, { bucketName: 'sharePayloads' }) };
    })().catch((error) => {
      globalThis.textShareMongoPromise = undefined;
      throw error;
    });
  }
  return globalThis.textShareMongoPromise;
}
