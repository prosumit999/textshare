import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { sanitizeImage, UnsafeImageError } from "../../src/lib/images";

describe("image sanitization", () => {
  it("decodes and re-encodes verified images without metadata", async () => {
    const input = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#008f68" } }).jpeg().withMetadata({ exif: { IFD0: { Artist: "secret" } } }).toBuffer();
    const result = await sanitizeImage(new File([input], "safe.jpg", { type: "image/jpeg" }));
    expect(result.mime).toBe("image/jpeg"); expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    const output = Buffer.from(result.dataUrl.split(",")[1], "base64");
    expect((await sharp(output).metadata()).exif).toBeUndefined();
  });
  it("rejects files whose declared type is not their real type", async () => {
    await expect(sanitizeImage(new File(["not an image"], "fake.png", { type: "image/png" }))).rejects.toBeInstanceOf(UnsafeImageError);
  });
});
