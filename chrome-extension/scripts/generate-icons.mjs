import sharp from "../../node_modules/sharp/dist/index.mjs";
import { fileURLToPath } from "node:url";

// Source the extension icons from the site's favicon so they stay in sync.
const source = fileURLToPath(
  new URL("../../public/favicon.png", import.meta.url),
);
for (const size of [16, 32, 48, 128]) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(
      fileURLToPath(new URL(`../assets/icon-${size}.png`, import.meta.url)),
    );
}
