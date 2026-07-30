import 'dotenv/config';

// Server secrets must be read at runtime. Using import.meta.env would let Vite
// substitute their plaintext values into generated server bundles.
export const serverEnv = process.env;
