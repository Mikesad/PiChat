import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type CreateDatasetInput,
  RAGFlowClient,
  type RAGFlowDataset,
} from "@pichat/ragflow-client";
import { serviceUnavailable } from "../../common/api-error";

export interface KnowledgeBaseRemote {
  createDataset(input: CreateDatasetInput): Promise<RAGFlowDataset>;
  deleteDataset(datasetId: string): Promise<void>;
  deleteDocument(datasetId: string, documentId: string): Promise<void>;
}

@Injectable()
export class KnowledgeBaseRemoteService implements KnowledgeBaseRemote {
  private readonly client: RAGFlowClient | null;
  private readonly defaultEmbeddingModel: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const baseUrl = config.get<string>("RAGFLOW_BASE_URL")?.trim();
    const apiKey = config.get<string>("RAGFLOW_API_KEY")?.trim();
    const timeoutMs = Number(config.get<string>("RAGFLOW_TIMEOUT_MS") ?? 30_000);
    this.defaultEmbeddingModel =
      config.get<string>("RAGFLOW_DEFAULT_EMBEDDING_MODEL")?.trim() ?? "";
    this.client =
      baseUrl && apiKey
        ? new RAGFlowClient({
            baseUrl,
            apiKey,
            timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
          })
        : null;
  }

  async createDataset(input: CreateDatasetInput): Promise<RAGFlowDataset> {
    if (!this.client) {
      throw serviceUnavailable("RAGFlow 未配置，无法创建知识库");
    }

    const embeddingModel = input.embeddingModel.trim() || this.defaultEmbeddingModel;
    if (!embeddingModel) {
      throw serviceUnavailable(
        "缺少 RAGFLOW_DEFAULT_EMBEDDING_MODEL，请配置默认 embedding 模型或显式指定",
      );
    }

    try {
      return await this.client.createDataset({ ...input, embeddingModel });
    } catch (cause) {
      throw serviceUnavailable(`创建 RAGFlow 数据集失败：${toMessage(cause)}`);
    }
  }

  async deleteDataset(datasetId: string): Promise<void> {
    if (!this.client) {
      throw new Error("RAGFlow 未配置");
    }
    await this.client.deleteDataset(datasetId);
  }

  async deleteDocument(datasetId: string, documentId: string): Promise<void> {
    if (!this.client) {
      throw new Error("RAGFlow 未配置");
    }
    await this.client.deleteDocument(datasetId, documentId);
  }
}

function toMessage(cause: unknown): string {
  return cause instanceof Error && cause.message.trim().length > 0
    ? cause.message.slice(0, 300)
    : "未知错误";
}
