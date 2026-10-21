import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const envDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(envDir, "../../.env"), quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://pichat:pichat_dev@localhost:3307/pichat",
  },
  verbose: true,
  strict: true,
});
