import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { ChatRunModel } from "@pichat/shared";
import type { RuntimeConfig } from "../config.js";

export interface RunModel {
  runtime: ModelRuntime;
  model: NonNullable<ReturnType<ModelRuntime["getModel"]>>;
  providerId: string;
  dispose(): Promise<void>;
}

export async function createRunModel(
  input: ChatRunModel,
  config: RuntimeConfig,
): Promise<RunModel> {
  const authDir = await mkdtemp(join(tmpdir(), "pichat-model-auth-"));
  const providerId = `pichat-${randomUUID()}`;

  try {
    const runtime = await ModelRuntime.create({
      authPath: join(authDir, "auth.json"),
      modelsPath: null,
      refreshOnCreate: false,
    });

    runtime.registerProvider(providerId, {
      name: "PiChat",
      baseUrl: input.baseUrl,
      api: "openai-completions",
      models: [
        {
          id: input.modelId,
          name: input.displayName,
          api: "openai-completions",
          input: ["text"],
          reasoning: true,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: config.model.contextWindow,
          maxTokens: config.model.maxTokens,
        },
      ],
    });
    await runtime.setRuntimeApiKey(providerId, input.apiKey);

    const model = runtime.getModel(providerId, input.modelId);
    if (!model) {
      throw new Error("model_not_available");
    }

    return {
      runtime,
      model,
      providerId,
      async dispose() {
        await runtime.removeRuntimeApiKey(providerId).catch(() => {});
        await rm(authDir, { recursive: true, force: true }).catch(() => {});
      },
    };
  } catch (error) {
    await rm(authDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
