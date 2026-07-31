import { ObjectId } from "mongodb";
import { getMongo } from "./mongo";

export async function saveBlogImage(input: {
  dataUrl: string;
  mime: string;
  bytes: number;
  uploadedBy: string;
}) {
  const { db } = await getMongo();
  const result = await db
    .collection("blogImages")
    .insertOne({ ...input, createdAt: new Date() });
  const id = result.insertedId.toHexString();
  return { id, url: `/api/blog-images/${id}` };
}

export async function getBlogImage(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const { db } = await getMongo();
  return await db.collection("blogImages").findOne({ _id: new ObjectId(id) });
}

export async function deleteBlogImageFromUrl(url: string) {
  const id = url.match(/^\/api\/blog-images\/([a-f0-9]{24})$/)?.[1];
  if (!id) return false;
  const { db } = await getMongo();
  return (
    (await db.collection("blogImages").deleteOne({ _id: new ObjectId(id) }))
      .deletedCount > 0
  );
}
