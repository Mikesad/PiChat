import dotenv from "dotenv";
import { buildRuntimeApp } from "./app.js";
import { loadRuntimeConfig } from "./config.js";

dotenv.config({ path: process.env.ENV_FILE ?? "../../.env" });

const config = loadRuntimeConfig();
const app = await buildRuntimeApp({ config });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: "0.0.0.0" });
