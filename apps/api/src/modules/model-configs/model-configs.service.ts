import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Database, ModelConfig } from "@pichat/db";
import { modelConfigs } from "@pichat/db";
import type {
  CreateModelConfigRequest,
  ModelConfigSummary,
  SessionUser,
  UpdateModelConfigRequest,
} from "@pichat/shared";
import { and, desc, eq, ne } from "drizzle-orm";
import { conflict, notFound } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import type { ModelConfigCrypto } from "../../common/model-config-crypto";
import { MODEL_CONFIG_CRYPTO } from "./model-config-crypto.provider";

@Injectable()
export class ModelConfigsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MODEL_CONFIG_CRYPTO) private readonly crypto: ModelConfigCrypto,
  ) {}

  async list(principal: SessionUser): Promise<ModelConfigSummary[]> {
    const rows = await this.db
      .select()
      .from(modelConfigs)
      .where(
        and(eq(modelConfigs.tenantId, principal.tenantId), eq(modelConfigs.userId, principal.id)),
      )
      .orderBy(desc(modelConfigs.isDefault), desc(modelConfigs.updatedAt));

    return rows.map((row) => this.toSummary(row));
  }

  async create(
    principal: SessionUser,
    input: CreateModelConfigRequest,
  ): Promise<ModelConfigSummary> {
    const duplicate = await this.findByProviderModel(principal, input.provider, input.modelId);
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
            and(
              eq(modelConfigs.tenantId, principal.tenantId),
              eq(modelConfigs.userId, principal.id),
            ),
          );
      }

      await tx.insert(modelConfigs).values({
        id,
        tenantId: principal.tenantId,
        userId: principal.id,
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
        .where(
          and(
            eq(modelConfigs.id, id),
            eq(modelConfigs.tenantId, principal.tenantId),
            eq(modelConfigs.userId, principal.id),
          ),
        )
        .limit(1);
      return rows[0];
    });

    if (!row) {
      throw notFound();
    }
    return this.toSummary(row);
  }

  async update(
    principal: SessionUser,
    id: string,
    input: UpdateModelConfigRequest,
  ): Promise<ModelConfigSummary> {
    const existing = await this.findOwned(principal, id);
    if (!existing) {
      throw notFound();
    }

    const duplicate = await this.findByProviderModel(principal, input.provider, input.modelId, id);
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
            and(
              eq(modelConfigs.tenantId, principal.tenantId),
              eq(modelConfigs.userId, principal.id),
            ),
          );
      }

      await tx
        .update(modelConfigs)
        .set({
          provider: input.provider,
          modelId: input.modelId,
          displayName: input.displayName,
          baseUrl: input.baseUrl,
          encryptedApiKey,
          ...(makeDefault ? { isDefault: true } : {}),
        })
        .where(
          and(
            eq(modelConfigs.id, id),
            eq(modelConfigs.tenantId, principal.tenantId),
            eq(modelConfigs.userId, principal.id),
          ),
        );

      const rows = await tx
        .select()
        .from(modelConfigs)
        .where(
          and(
            eq(modelConfigs.id, id),
            eq(modelConfigs.tenantId, principal.tenantId),
            eq(modelConfigs.userId, principal.id),
          ),
        )
        .limit(1);
      return rows[0];
    });

    if (!row) {
      throw notFound();
    }
    return this.toSummary(row);
  }

  async remove(principal: SessionUser, id: string): Promise<void> {
    const result = await this.db
      .delete(modelConfigs)
      .where(
        and(
          eq(modelConfigs.id, id),
          eq(modelConfigs.tenantId, principal.tenantId),
          eq(modelConfigs.userId, principal.id),
        ),
      );
    if (result[0].affectedRows === 0) {
      throw notFound();
    }
  }

  async setDefault(principal: SessionUser, id: string): Promise<ModelConfigSummary> {
    const existing = await this.findOwned(principal, id);
    if (!existing) {
      throw notFound();
    }

    const row = await this.db.transaction(async (tx) => {
      await tx
        .update(modelConfigs)
        .set({ isDefault: false })
        .where(
          and(eq(modelConfigs.tenantId, principal.tenantId), eq(modelConfigs.userId, principal.id)),
        );

      await tx
        .update(modelConfigs)
        .set({ isDefault: true })
        .where(
          and(
            eq(modelConfigs.id, id),
            eq(modelConfigs.tenantId, principal.tenantId),
            eq(modelConfigs.userId, principal.id),
          ),
        );

      const rows = await tx
        .select()
        .from(modelConfigs)
        .where(
          and(
            eq(modelConfigs.id, id),
            eq(modelConfigs.tenantId, principal.tenantId),
            eq(modelConfigs.userId, principal.id),
          ),
        )
        .limit(1);
      return rows[0];
    });

    if (!row) {
      throw notFound();
    }
    return this.toSummary(row);
  }

  private async findOwned(principal: SessionUser, id: string): Promise<ModelConfig | null> {
    const rows = await this.db
      .select()
      .from(modelConfigs)
      .where(
        and(
          eq(modelConfigs.id, id),
          eq(modelConfigs.tenantId, principal.tenantId),
          eq(modelConfigs.userId, principal.id),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  private async findByProviderModel(
    principal: SessionUser,
    provider: string,
    modelId: string,
    excludeId?: string,
  ): Promise<ModelConfig | null> {
    const conditions = [
      eq(modelConfigs.tenantId, principal.tenantId),
      eq(modelConfigs.userId, principal.id),
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

  private toSummary(row: ModelConfig): ModelConfigSummary {
    const hasApiKey = Boolean(row.encryptedApiKey && row.encryptedApiKey.length > 0);
    let apiKeyMasked = "";
    if (hasApiKey && row.encryptedApiKey) {
      apiKeyMasked = this.crypto.mask(this.crypto.decrypt(row.encryptedApiKey));
    }

    return {
      id: row.id,
      provider: row.provider as ModelConfigSummary["provider"],
      modelId: row.modelId,
      displayName: row.displayName,
      baseUrl: row.baseUrl ?? "",
      isDefault: row.isDefault,
      hasApiKey,
      apiKeyMasked,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
