import { randomUUID } from "node:crypto";
import { getMongo } from "./mongo";
import { sanitizeBlogHtml } from "./blog-content";

export type HomeHeroSection = {
  id: string;
  title: string;
  content: string;
  coverImage: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export const defaultHomeHeroTitle = "Why developers choose TextShare";
export const defaultHomeHeroContent = `<p>TextShare is engineered to eliminate the friction of sharing sensitive code and logs. Chat tools index messages permanently, email chains are vulnerable to data leakage, and generic pastebins are bloated with trackers. TextShare provides an instantaneous, ad-free environment where your shared content remains strictly private, formatted perfectly, and auto-destroyed exactly when you specify.</p>
<h2>How to convert JSON to YAML</h2>
<ul>
  <li><strong>Add your JSON.</strong> Paste it into the editor or select a JSON file from your device.</li>
  <li><strong>Review the result.</strong> The tool validates your input and creates YAML automatically.</li>
  <li><strong>Use your YAML.</strong> Copy the result or download it for your project.</li>
</ul>
<h2>Everything you need in one simple tool</h2>
<ul>
  <li><strong>Upload JSON:</strong> Select a local file and load it directly into the editor.</li>
  <li><strong>Format JSON:</strong> Make compressed JSON easier to read and debug.</li>
  <li><strong>Copy YAML:</strong> Copy the converted output with one click.</li>
</ul>
<h2>Private and practical</h2>
<p>Your conversion runs locally in your browser, so the JSON you enter is not uploaded to our servers.</p>
<p><img src="https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=600&auto=format&fit=crop" alt="Coding Illustration" /></p>`;

let heroReady: Promise<void> | null = null;

/**
 * Seeds the first home hero section once per process. If the original single
 * SEO block was ever customized through Site Settings, that exact content is
 * migrated into the new collection so the homepage keeps it. Otherwise the
 * built-in default section is created.
 */
function ensureHomeHeroSections() {
  if (!heroReady)
    heroReady = (async () => {
      const { db } = await getMongo();
      const collection = db.collection<HomeHeroSection>("homeHeroSections");
      if ((await collection.countDocuments()) > 0) return;
      const settingsDoc = await db
        .collection("siteSettings")
        .findOne({ id: "global" });
      const legacyTitle = String(settingsDoc?.seoTitle || "").trim();
      const legacyContent = String(settingsDoc?.seoContent || "").trim();
      await collection.insertOne({
        id: randomUUID(),
        title: legacyTitle || defaultHomeHeroTitle,
        content: sanitizeBlogHtml(legacyContent || defaultHomeHeroContent),
        coverImage: "",
        enabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    })().catch((error) => {
      heroReady = null;
      throw error;
    });
  return heroReady;
}

function cleanSection(
  input: Omit<HomeHeroSection, "id" | "createdAt" | "updatedAt">,
) {
  return {
    title: input.title.trim().slice(0, 160),
    content: sanitizeBlogHtml(input.content),
    coverImage: input.coverImage.trim(),
    enabled: Boolean(input.enabled),
    sortOrder: Math.max(0, Number(input.sortOrder) || 0),
  };
}

export async function listHomeHeroSections() {
  await ensureHomeHeroSections();
  const { db } = await getMongo();
  return db
    .collection<HomeHeroSection>("homeHeroSections")
    .find({})
    .sort({ sortOrder: 1, updatedAt: -1 })
    .toArray();
}

export async function getEnabledHomeHeroSections() {
  await ensureHomeHeroSections();
  const { db } = await getMongo();
  return db
    .collection<HomeHeroSection>("homeHeroSections")
    .find({ enabled: true })
    .sort({ sortOrder: 1, updatedAt: -1 })
    .toArray();
}

export async function getHomeHeroSection(id: string) {
  await ensureHomeHeroSections();
  const { db } = await getMongo();
  return db.collection<HomeHeroSection>("homeHeroSections").findOne({ id });
}

export async function saveHomeHeroSection(
  input: Omit<HomeHeroSection, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
) {
  const now = new Date();
  await ensureHomeHeroSections();
  const { db } = await getMongo();
  const collection = db.collection<HomeHeroSection>("homeHeroSections");
  const existing = input.id
    ? await collection.findOne({ id: input.id })
    : null;
  const clean = cleanSection(input);
  const section: HomeHeroSection = {
    ...clean,
    id: existing?.id || randomUUID(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await collection.replaceOne({ id: section.id }, section, { upsert: true });
  return section;
}

export async function deleteHomeHeroSection(id: string) {
  await ensureHomeHeroSections();
  const { db } = await getMongo();
  return (
    (await db.collection<HomeHeroSection>("homeHeroSections").deleteOne({ id }))
      .deletedCount > 0
  );
}