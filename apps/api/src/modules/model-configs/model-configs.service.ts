import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Database, ModelConfig } from "@pichat/db";
import { modelConfigs, users } from "@pichat/db";
import type {
  CreateModelConfigRequest,
  ModelConfigSummary,
  ModelKind,
  ModelProviderId,
  SessionUser,
  UpdateModelConfigRequest,
} from "@pichat/shared";
import { modelProviders } from "@pichat/shared";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { conflict, forbidden, notFound } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import type { ModelConfigCrypto } from "../../common/model-config-crypto";
import { canManageSharedConfigs } from "../../common/permissions";
import { MODEL_CONFIG_CRYPTO } from "./model-config-crypto.provider";

export interface ResolvedModelConfig {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
}

@Injectable()
export class ModelConfigsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MODEL_CONFIG_CRYPTO) private readonly crypto: ModelConfigCrypto,
  ) {}

  async list(principal: SessionUser, kind?: ModelKind): Promise<ModelConfigSummary[]> {
    const conditions = [eq(modelConfigs.tenantId, principal.tenantId)];
    if (kind) {
      conditions.push(eq(modelConfigs.kind, kind));
    }

    const rows = await this.db
      .select()
      .from(modelConfigs)
      .where(and(...conditions))
      .orderBy(desc(modelConfigs.isDefault), desc(modelConfigs.updatedAt));
    const creatorNames = await this.loadCreatorNames(
      principal.tenantId,
      rows.map((row) => row.userId),
    );

    return rows.map((row) =>
      this.toSummary(row, row.userId ? (creatorNames.get(row.userId) ?? null) : null),
    );
  }

  async create(
    principal: SessionUser,
    input: CreateModelConfigRequest,
  ): Promise<ModelConfigSummary> {
    this.assertCanManage(principal);

    const duplicate = await this.findByProviderModel(
      principal,
      input.kind,
      input.provider,
      input.modelId,
    );
    if (duplicate) {
      throw conflict("同一服务商与模型已存在配置");
    }

    const id = randomUUID();
    const encryptedApiKey = this.crypto.encrypt(input.apiKey);
    const makeDefault = input.makeDefault === true;

    const row = await this.db.transaction(async (tx) => {
      if (makeDefault) {
        await tx
          .update(modelConfigs)
          .set({ isDefault: false })
          .where(
            and(eq(modelConfigs.tenantId, principal.tenantId), eq(modelConfigs.kind, input.kind)),
          );
      }

      await tx.insert(modelConfigs).values({
        id,
        tenantId: principal.tenantId,
        userId: principal.id,
        kind: input.kind,
        provider: input.provider,
        modelId: input.modelId,
        displayName: input.displayName,
        baseUrl: input.baseUrl,
        encryptedApiKey,
        isDefault: makeDefault,
      });

      const rows = await tx
        .select()
        .from(modelConfigs)
        .where(and(eq(modelConfigs.id, id), eq(modelConfigs.tenantId, principal.tenantId)))
        .limit(1);
      return rows[0];
    });

    if (!row) {
      throw notFound();
    }
    return this.toSummaryWithCreator(row);
  }

  async update(
    principal: SessionUser,
    id: string,
    input: UpdateModelConfigRequest,
  ): Promise<ModelConfigSummary> {
    this.assertCanManage(principal);

    const existing = await this.findById(principal, id);
    if (!existing) {
      throw notFound();
    }

    const duplicate = await this.findByProviderModel(
      principal,
      input.kind,
      input.provider,
      input.modelId,
      id,
    );
    if (duplicate) {
      throw conflict("同一服务商与模型已存在配置");
    }

    const encryptedApiKey =
      input.apiKey && input.apiKey.trim().length > 0
        ? this.crypto.encrypt(input.apiKey.trim())
        : existing.encryptedApiKey;
    const makeDefault = input.makeDefault === true;

    const row = await this.db.transaction(async (tx) => {
      if (makeDefault) {
        await tx
          .update(modelConfigs)
          .set({ isDefault: false })
          .where(
            and(eq(modelConfigs.tenantId, principal.tenantId), eq(modelConfigs.kind, input.kind)),
          );
      }

      await tx
        .update(modelConfigs)
        .set({
          kind: input.kind,
          provider: input.provider,
          modelId: input.modelId,
          displayName: input.displayName,
          baseUrl: input.baseUrl,
          encryptedApiKey,
          ...(makeDefault ? { isDefault: true } : {}),
        })
        .where(and(eq(modelConfigs.id, id), eq(modelConfigs.tenantId, principal.tenantId)));

      const rows = await tx
        .select()
        .from(modelConfigs)
        .where(and(eq(modelConfigs.id, id), eq(modelConfigs.tenantId, principal.tenantId)))
        .limit(1);
      return rows[0];
    });

    if (!row) {
      throw notFound();
    }
    return this.toSummaryWithCreator(row);
  }

  async remove(principal: SessionUser, id: string): Promise<void> {
    this.assertCanManage(principal);

    const result = await this.db
      .delete(modelConfigs)
      .where(and(eq(modelConfigs.id, id), eq(modelConfigs.tenantId, principal.tenantId)));
    if (result[0].affectedRows === 0) {
      throw notFound();
    }
  }

  async setDefault(principal: SessionUser, id: string): Promise<ModelConfigSummary> {
    this.assertCanManage(principal);

    const existing = await this.findById(principal, id);
    if (!existing) {
      throw notFound();
    }

    const row = await this.db.transaction(async (tx) => {
      await tx
        .update(modelConfigs)
        .set({ isDefault: false })
        .where(
          and(eq(modelConfigs.tenantId, principal.tenantId), eq(modelConfigs.kind, existing.kind)),
        );

      await tx
        .update(modelConfigs)
        .set({ isDefault: true })
        .where(and(eq(modelConfigs.id, id), eq(modelConfigs.tenantId, principal.tenantId)));

      const rows = await tx
        .select()
        .from(modelConfigs)
        .where(and(eq(modelConfigs.id, id), eq(modelConfigs.tenantId, principal.tenantId)))
        .limit(1);
      return rows[0];
    });

    if (!row) {
      throw notFound();
    }
    return this.toSummaryWithCreator(row);
  }

  async resolveForRun(
    principal: SessionUser,
    modelConfigId?: string,
  ): Promise<ResolvedModelConfig> {
    const resolved = await this.resolveOptionalForKind(principal, "chat", modelConfigId);
    if (!resolved) {
      throw conflict("尚未配置可用模型，请联系企业管理员");
    }
    return resolved;
  }

  async resolveOptionalForKind(
    principal: SessionUser,
    kind: ModelKind,
    modelConfigId?: string,
  ): Promise<ResolvedModelConfig | null> {
    let row: ModelConfig | null = null;

    if (modelConfigId) {
      row = await this.findById(principal, modelConfigId);
      if (!row || row.kind !== kind) {
        throw notFound();
      }
    } else {
      row = await this.findActiveByKind(principal, kind);
    }
    if (!row) {
      return null;
    }
    if (!row.enabled) {
      throw conflict("模型配置已停用，请重新启用");
    }
    if (!row.encryptedApiKey) {
      throw conflict("模型配置缺少 API Key，请重新保存");
    }

    const provider = row.provider as ModelProviderId;
    const fallbackBaseUrl =
      provider in modelProviders ? modelProviders[provider].defaultBaseUrl : "";
    const baseUrl = (row.baseUrl ?? "").trim() || fallbackBaseUrl;
    if (!/^https?:\/\//i.test(baseUrl)) {
      throw conflict("模型 Base URL 无效，请重新保存");
    }

    return {
      id: row.id,
      provider: row.provider,
      modelId: row.modelId,
      displayName: row.displayName,
      baseUrl,
      apiKey: this.crypto.decrypt(row.encryptedApiKey),
    };
  }

  async findActiveModelId(principal: SessionUser, kind: ModelKind): Promise<string | null> {
    const row = await this.findActiveByKind(principal, kind);
    return row?.modelId ?? null;
  }

  private async findActiveByKind(
    principal: SessionUser,
    kind: ModelKind,
  ): Promise<ModelConfig | null> {
    const defaultRows = await this.db
      .select()
      .from(modelConfigs)
      .where(
        and(
          eq(modelConfigs.tenantId, principal.tenantId),
          eq(modelConfigs.kind, kind),
          eq(modelConfigs.isDefault, true),
          eq(modelConfigs.enabled, true),
        ),
      )
      .limit(1);
    if (defaultRows[0]) {
      return defaultRows[0];
    }

    const fallbackRows = await this.db
      .select()
      .from(modelConfigs)
      .where(
        and(
          eq(modelConfigs.tenantId, principal.tenantId),
          eq(modelConfigs.kind, kind),
          eq(modelConfigs.enabled, true),
        ),
      )
      .orderBy(desc(modelConfigs.updatedAt))
      .limit(1);
    return fallbackRows[0] ?? null;
  }

  private async findById(principal: SessionUser, id: string): Promise<ModelConfig | null> {
    const rows = await this.db
      .select()
      .from(modelConfigs)
      .where(and(eq(modelConfigs.id, id), eq(modelConfigs.tenantId, principal.tenantId)))
      .limit(1);
    return rows[0] ?? null;
  }

  private async findByProviderModel(
    principal: SessionUser,
    kind: ModelKind,
    provider: string,
    modelId: string,
    excludeId?: string,
  ): Promise<ModelConfig | null> {
    const conditions = [
      eq(modelConfigs.tenantId, principal.tenantId),
      eq(modelConfigs.kind, kind),
      eq(modelConfigs.provider, provider),
      eq(modelConfigs.modelId, modelId),
    ];
    if (excludeId) {
      conditions.push(ne(modelConfigs.id, excludeId));
    }

    const rows = await this.db
      .select()
      .from(modelConfigs)
      .where(and(...conditions))
      .limit(1);
    return rows[0] ?? null;
  }

  private async loadCreatorNames(
    tenantId: string,
    userIds: Array<string | null>,
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), inArray(users.id, uniqueIds)));
    return new Map(rows.map((row) => [row.id, row.displayName] as const));
  }

  private async toSummaryWithCreator(row: ModelConfig): Promise<ModelConfigSummary> {
    const creatorNames = await this.loadCreatorNames(row.tenantId, row.userId ? [row.userId] : []);
    return this.toSummary(row, row.userId ? (creatorNames.get(row.userId) ?? null) : null);
  }

  private assertCanManage(principal: SessionUser): void {
    if (!canManageSharedConfigs(principal.role)) {
      throw forbidden("只有企业管理员可以维护共享模型配置");
    }
  }

  private toSummary(row: ModelConfig, createdByName: string | null): ModelConfigSummary {
    const hasApiKey = Boolean(row.encryptedApiKey && row.encryptedApiKey.length > 0);
    let apiKeyMasked = "";
    if (hasApiKey && row.encryptedApiKey) {
      apiKeyMasked = this.crypto.mask(this.crypto.decrypt(row.encryptedApiKey));
    }

    return {
      id: row.id,
      kind: row.kind as ModelConfigSummary["kind"],
      provider: row.provider as ModelConfigSummary["provider"],
      modelId: row.modelId,
      displayName: row.displayName,
      baseUrl: row.baseUrl ?? "",
      isDefault: row.isDefault,
      hasApiKey,
      apiKeyMasked,
      createdByUserId: row.userId,
      createdByName,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
