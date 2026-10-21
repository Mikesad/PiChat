import dotenv from "dotenv";
import Fastify from "fastify";

dotenv.config({ path: process.env.ENV_FILE ?? "../../.env" });

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
});

app.get("/internal/health", async () => ({
  status: "ok",
  service: "pichat-agent-runtime",
  timestamp: new Date().toISOString(),
}));

app.get("/internal/runtime", async () => ({
  service: "pichat-agent-runtime",
  piPackage: "@earendil-works/pi-coding-agent",
  capabilities: [
    "streaming",
    "tool-calling",
    "session-management",
    "context-compaction",
    "model-switching",
    "thinking-levels",
    "mcp",
  ],
}));

const port = Number(process.env.AGENT_RUNTIME_PORT ?? 3002);

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port, host: "0.0.0.0" });
