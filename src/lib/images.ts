import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { quarantineUpload, scanUpload } from "./malware";
import { serverEnv } from "./env";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 6000;
const MAX_PIXELS = 36_000_000;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class UnsafeImageError extends Error {}

export async function sanitizeImage(
  file: File,
): Promise<{ dataUrl: string; mime: string; bytes: number }> {
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new UnsafeImageError("Image must be between 1 byte and 5 MB.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  const scan = await scanUpload(input);
  if (scan.status === "infected") {
    await quarantineUpload(input, `Malware detected: ${scan.signature || "unknown"}`);
    throw new UnsafeImageError("The image failed the security scan.");
  }
  if (scan.status === "unavailable" && serverEnv.CLAMAV_REQUIRED === "true") {
    await quarantineUpload(input, "Malware scanner unavailable");
    throw new UnsafeImageError("Image security scanning is temporarily unavailable.");
  }
  const detected = await fileTypeFromBuffer(input);
  if (!detected || !ALLOWED_TYPES.has(detected.mime)) {
    throw new UnsafeImageError(
      "Only verified PNG, JPEG, and WEBP images are allowed.",
    );
  }

  const decoder = sharp(input, {
    failOn: "warning",
    limitInputPixels: MAX_PIXELS,
    sequentialRead: true,
  });
  const metadata = await decoder.metadata();
  if (!metadata.width || !metadata.height)
    throw new UnsafeImageError("The image could not be decoded.");

  const width = Math.min(metadata.width, MAX_DIMENSION);
  const height = Math.min(metadata.height, MAX_DIMENSION);
  let pipeline = decoder
    .rotate()
    .resize({ width, height, fit: "inside", withoutEnlargement: true });
  let mime: string;

  if (detected.mime === "image/jpeg") {
    pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
    mime = "image/jpeg";
  } else if (detected.mime === "image/webp") {
    pipeline = pipeline.webp({ quality: 88 });
    mime = "image/webp";
  } else {
    pipeline = pipeline.png({ compressionLevel: 9 });
    mime = "image/png";
  }

  // Sharp does not retain EXIF/ICC metadata unless withMetadata() is requested.
  const output = await pipeline.toBuffer();
  if (output.length > MAX_IMAGE_BYTES)
    throw new UnsafeImageError("The sanitized image exceeds 5 MB.");

  return {
    dataUrl: `data:${mime};base64,${output.toString("base64")}`,
    mime,
    bytes: output.length,
  };
}
