import sharp from "../../node_modules/sharp/dist/index.mjs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../assets/icon.svg", import.meta.url));
for (const size of [16, 32, 48, 128]) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(
      fileURLToPath(new URL(`../assets/icon-${size}.png`, import.meta.url)),
    );
}
