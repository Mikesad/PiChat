import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import type { Database, SearchConfig } from "@pichat/db";
import { searchConfigs, users } from "@pichat/db";
import type {
  CreateSearchConfigRequest,
  SearchConfigSummary,
  SearchEngineProviderId,
  SessionUser,
  TestSearchConfigRequest,
  TestSearchConfigResponse,
  UpdateSearchConfigRequest,
} from "@pichat/shared";
import { searchEngineProviders } from "@pichat/shared";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { conflict, forbidden, notFound } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import type { ModelConfigCrypto } from "../../common/model-config-crypto";
import { canManageSharedConfigs } from "../../common/permissions";
import { MODEL_CONFIG_CRYPTO } from "../model-configs/model-config-crypto.provider";

const execFileAsync = promisify(execFile);

export interface ResolvedSearchConfig {
  id: string;
  provider: SearchEngineProviderId;
  name: string;
  apiKey: string;
  proxy: string;
}

@Injectable()
export class SearchConfigsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MODEL_CONFIG_CRYPTO) private readonly crypto: ModelConfigCrypto,
  ) {}

  async list(principal: SessionUser): Promise<SearchConfigSummary[]> {
    const rows = await this.db
      .select()
      .from(searchConfigs)
      .where(eq(searchConfigs.tenantId, principal.tenantId))
      .orderBy(desc(searchConfigs.isDefault), desc(searchConfigs.updatedAt));
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
    input: CreateSearchConfigRequest,
  ): Promise<SearchConfigSummary> {
    this.assertCanManage(principal);

    const existing = await this.db
      .select({ id: searchConfigs.id })
      .from(searchConfigs)
      .where(eq(searchConfigs.tenantId, principal.tenantId))
      .limit(1);
    const makeDefault = input.makeDefault === true || existing.length === 0;

    const id = randomUUID();
    const row = await this.db.transaction(async (tx) => {
      if (makeDefault) {
        await tx
          .update(searchConfigs)
          .set({ isDefault: false })
          .where(eq(searchConfigs.tenantId, principal.tenantId));
      }

      await tx.insert(searchConfigs).values({
        id,
        tenantId: principal.tenantId,
        userId: principal.id,
        provider: input.provider,
        name: input.name,
        remark: input.remark?.trim() || null,
        encryptedApiKey: this.crypto.encrypt(input.apiKey),
        proxy: input.proxy?.trim() || null,
        isDefault: makeDefault,
      });

      const rows = await tx
        .select()
        .from(searchConfigs)
        .where(and(eq(searchConfigs.id, id), eq(searchConfigs.tenantId, principal.tenantId)))
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
    input: UpdateSearchConfigRequest,
  ): Promise<SearchConfigSummary> {
    this.assertCanManage(principal);

    const existing = await this.findById(principal, id);
    if (!existing) {
      throw notFound();
    }

    const encryptedApiKey =
      input.apiKey && input.apiKey.trim().length > 0
        ? this.crypto.encrypt(input.apiKey.trim())
        : existing.encryptedApiKey;
    const makeDefault = input.makeDefault === true;

    const row = await this.db.transaction(async (tx) => {
      if (makeDefault) {
        await tx
          .update(searchConfigs)
          .set({ isDefault: false })
          .where(eq(searchConfigs.tenantId, principal.tenantId));
      }

      await tx
        .update(searchConfigs)
        .set({
          provider: input.provider,
          name: input.name,
          remark: input.remark?.trim() || null,
          encryptedApiKey,
          proxy: input.proxy?.trim() || null,
          ...(makeDefault ? { isDefault: true } : {}),
        })
        .where(and(eq(searchConfigs.id, id), eq(searchConfigs.tenantId, principal.tenantId)));

      const rows = await tx
        .select()
        .from(searchConfigs)
        .where(and(eq(searchConfigs.id, id), eq(searchConfigs.tenantId, principal.tenantId)))
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

    const existing = await this.findById(principal, id);
    if (!existing) {
      throw notFound();
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(searchConfigs)
        .where(and(eq(searchConfigs.id, id), eq(searchConfigs.tenantId, principal.tenantId)));

      if (!existing.isDefault) {
        return;
      }

      const rows = await tx
        .select({ id: searchConfigs.id })
        .from(searchConfigs)
        .where(and(eq(searchConfigs.tenantId, principal.tenantId), ne(searchConfigs.id, id)))
        .orderBy(desc(searchConfigs.updatedAt))
        .limit(1);
      if (rows[0]) {
        await tx
          .update(searchConfigs)
          .set({ isDefault: true })
          .where(
            and(eq(searchConfigs.id, rows[0].id), eq(searchConfigs.tenantId, principal.tenantId)),
          );
      }
    });
  }

  async setDefault(principal: SessionUser, id: string): Promise<SearchConfigSummary> {
    this.assertCanManage(principal);

    const existing = await this.findById(principal, id);
    if (!existing) {
      throw notFound();
    }

    const row = await this.db.transaction(async (tx) => {
      await tx
        .update(searchConfigs)
        .set({ isDefault: false })
        .where(eq(searchConfigs.tenantId, principal.tenantId));

      await tx
        .update(searchConfigs)
        .set({ isDefault: true })
        .where(and(eq(searchConfigs.id, id), eq(searchConfigs.tenantId, principal.tenantId)));

      const rows = await tx
        .select()
        .from(searchConfigs)
        .where(and(eq(searchConfigs.id, id), eq(searchConfigs.tenantId, principal.tenantId)))
        .limit(1);
      return rows[0];
    });

    if (!row) {
      throw notFound();
    }
    return this.toSummaryWithCreator(row);
  }

  async resolveForRun(principal: SessionUser): Promise<ResolvedSearchConfig | null> {
    const defaultRows = await this.db
      .select()
      .from(searchConfigs)
      .where(
        and(
          eq(searchConfigs.tenantId, principal.tenantId),
          eq(searchConfigs.isDefault, true),
          eq(searchConfigs.enabled, true),
        ),
      )
      .limit(1);
    const row =
      defaultRows[0] ??
      (
        await this.db
          .select()
          .from(searchConfigs)
          .where(
            and(eq(searchConfigs.tenantId, principal.tenantId), eq(searchConfigs.enabled, true)),
          )
          .orderBy(desc(searchConfigs.updatedAt))
          .limit(1)
      )[0] ??
      null;

    if (!row?.encryptedApiKey) {
      return null;
    }

    return {
      id: row.id,
      provider: row.provider as SearchEngineProviderId,
      name: row.name,
      apiKey: this.crypto.decrypt(row.encryptedApiKey),
      proxy: row.proxy ?? "",
    };
  }

  async test(
    principal: SessionUser,
    input: TestSearchConfigRequest,
  ): Promise<TestSearchConfigResponse> {
    this.assertCanManage(principal);

    let apiKey = input.apiKey?.trim() ?? "";
    let proxy = input.proxy?.trim() ?? "";

    if (input.id) {
      const existing = await this.findById(principal, input.id);
      if (!existing) {
        throw notFound();
      }
      if (!apiKey && existing.encryptedApiKey) {
        apiKey = this.crypto.decrypt(existing.encryptedApiKey);
      }
      if (!proxy) {
        proxy = existing.proxy ?? "";
      }
    }
    if (!apiKey) {
      throw conflict("请先填写 API Key");
    }

    const provider = searchEngineProviders[input.provider];
    if (!provider) {
      throw conflict("不支持的搜索引擎");
    }

    const startedAt = Date.now();
    try {
      await requestTavilyTest(apiKey, proxy);
      return {
        ok: true,
        message: "连接成功，Tavily 搜索接口可访问",
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return {
        ok: false,
        message: proxy
          ? "连接失败，请检查 API Key、HTTP 代理或网络"
          : "连接失败，请检查 API Key 或网络",
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async findById(principal: SessionUser, id: string): Promise<SearchConfig | null> {
    const rows = await this.db
      .select()
      .from(searchConfigs)
      .where(and(eq(searchConfigs.id, id), eq(searchConfigs.tenantId, principal.tenantId)))
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

  private async toSummaryWithCreator(row: SearchConfig): Promise<SearchConfigSummary> {
    const creatorNames = await this.loadCreatorNames(row.tenantId, row.userId ? [row.userId] : []);
    return this.toSummary(row, row.userId ? (creatorNames.get(row.userId) ?? null) : null);
  }

  private assertCanManage(principal: SessionUser): void {
    if (!canManageSharedConfigs(principal.role)) {
      throw forbidden("只有企业管理员可以维护共享搜索引擎配置");
    }
  }

  private toSummary(row: SearchConfig, createdByName: string | null): SearchConfigSummary {
    const hasApiKey = Boolean(row.encryptedApiKey && row.encryptedApiKey.length > 0);
    const apiKeyMasked =
      hasApiKey && row.encryptedApiKey
        ? this.crypto.mask(this.crypto.decrypt(row.encryptedApiKey))
        : "";

    return {
      id: row.id,
      provider: row.provider as SearchEngineProviderId,
      name: row.name,
      remark: row.remark ?? "",
      proxy: row.proxy ?? "",
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

async function requestTavilyTest(apiKey: string, proxy: string): Promise<void> {
  const url = "https://api.tavily.com/search";
  const body = JSON.stringify({
    query: "PiChat connectivity test",
    max_results: 1,
    search_depth: "basic",
  });

  if (!proxy) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error("search request failed");
    }
    return;
  }

  const { stdout } = await execFileAsync(
    "curl",
    [
      "-sS",
      "--max-time",
      "15",
      "-x",
      proxy,
      "-H",
      `Authorization: Bearer ${apiKey}`,
      "-H",
      "Content-Type: application/json",
      "--data",
      body,
      url,
    ],
    { timeout: 20_000, windowsHide: true },
  );
  const parsed = JSON.parse(stdout) as { results?: unknown };
  if (!Array.isArray(parsed.results)) {
    throw new Error("search request failed");
  }
}
