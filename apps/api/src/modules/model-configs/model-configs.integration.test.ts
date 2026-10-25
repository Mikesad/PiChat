import { randomUUID } from "node:crypto";
import { createDatabase, type Database, modelConfigs, tenants, users } from "@pichat/db";
import type { SessionUser } from "@pichat/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModelConfigCrypto } from "../../common/model-config-crypto";
import { ModelConfigsService } from "./model-configs.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("model configs service", () => {
  const crypto = new ModelConfigCrypto(Buffer.alloc(32, 3));
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const adminId = randomUUID();
  const memberId = randomUUID();
  const otherAdminId = randomUUID();

  const admin: SessionUser = {
    id: adminId,
    tenantId,
    email: "model-admin@test.local",
    displayName: "Model Admin",
    role: "tenant_admin",
    departmentId: null,
  };
  const member: SessionUser = {
    id: memberId,
    tenantId,
    email: "model-member@test.local",
    displayName: "Model Member",
    role: "member",
    departmentId: null,
  };
  const otherAdmin: SessionUser = {
    id: otherAdminId,
    tenantId: otherTenantId,
    email: "model-other@test.local",
    displayName: "Other Admin",
    role: "tenant_admin",
    departmentId: null,
  };

  let db: Database;
  let service: ModelConfigsService;
  let firstId: string;
  let secondId: string;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    service = new ModelConfigsService(db, crypto);

    await db.insert(tenants).values([
      { id: tenantId, name: "Model Test", slug: tenantId },
      { id: otherTenantId, name: "Model Other", slug: otherTenantId },
    ]);
    await db.insert(users).values([
      {
        id: adminId,
        tenantId,
        email: admin.email,
        passwordHash: "scrypt$00$00",
        displayName: admin.displayName,
        role: "tenant_admin",
      },
      {
        id: memberId,
        tenantId,
        email: member.email,
        passwordHash: "scrypt$00$00",
        displayName: member.displayName,
        role: "member",
      },
      {
        id: otherAdminId,
        tenantId: otherTenantId,
        email: otherAdmin.email,
        passwordHash: "scrypt$00$00",
        displayName: otherAdmin.displayName,
        role: "tenant_admin",
      },
    ]);
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(tenants).where(eq(tenants.id, otherTenantId));
    await db.$client.end();
  });

  it("creates encrypted configs, masks keys and keeps one default per tenant", async () => {
    const first = await service.create(admin, {
      kind: "chat",
      provider: "opencode-go",
      modelId: "deepseek-v4.1-flash",
      displayName: "Flash",
      baseUrl: "https://opencode.ai/zen/go/v1",
      apiKey: "sk-aaaa-1111",
      makeDefault: true,
    });
    firstId = first.id;

    const second = await service.create(admin, {
      kind: "chat",
      provider: "deepseek",
      modelId: "deepseek-chat",
      displayName: "DeepSeek Chat",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-bbbb-2222",
      makeDefault: true,
    });
    secondId = second.id;

    expect(first.apiKeyMasked).toBe("****1111");
    expect(first.hasApiKey).toBe(true);
    expect(first.createdByUserId).toBe(adminId);
    expect(first.createdByName).toBe(admin.displayName);
    expect(JSON.stringify(first)).not.toContain("sk-aaaa-1111");
    expect(JSON.stringify(first)).not.toContain("encryptedApiKey");

    const list = await service.list(admin);
    expect(list).toHaveLength(2);
    expect(list.filter((config) => config.isDefault)).toHaveLength(1);
    expect(list.find((config) => config.isDefault)?.id).toBe(secondId);

    const rows = await db.select().from(modelConfigs).where(eq(modelConfigs.tenantId, tenantId));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.encryptedApiKey).toBeTruthy();
      expect(row.encryptedApiKey).not.toContain("sk-");
      expect(crypto.decrypt(row.encryptedApiKey ?? "")).toMatch(/^sk-/);
    }
  });

  it("rejects duplicate provider/model pairs across the tenant", async () => {
    await expect(
      service.create(admin, {
        kind: "chat",
        provider: "deepseek",
        modelId: "deepseek-chat",
        displayName: "Duplicate",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "sk-cccc-3333",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps the stored key when an update omits apiKey", async () => {
    const before = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, firstId))
      .then((rows) => rows[0]);

    const updated = await service.update(admin, firstId, {
      kind: "chat",
      provider: "opencode-go",
      modelId: "deepseek-v4.1-flash",
      displayName: "Flash renamed",
      baseUrl: "https://opencode.ai/zen/go/v1",
    });
    expect(updated.displayName).toBe("Flash renamed");
    expect(updated.apiKeyMasked).toBe("****1111");
    expect(updated.createdByUserId).toBe(adminId);

    const after = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, firstId))
      .then((rows) => rows[0]);
    expect(after?.encryptedApiKey).toBe(before?.encryptedApiKey);
  });

  it("shares configs with tenant members but blocks member writes", async () => {
    const list = await service.list(member);
    expect(list.map((config) => config.id).sort()).toEqual([firstId, secondId].sort());
    await expect(service.resolveForRun(member)).resolves.toMatchObject({
      id: secondId,
      provider: "deepseek",
    });

    await expect(
      service.create(member, {
        kind: "chat",
        provider: "deepseek",
        modelId: "deepseek-reasoner",
        displayName: "Reasoner",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "sk-member",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.update(member, firstId, {
        kind: "chat",
        provider: "opencode-go",
        modelId: "deepseek-v4.1-flash",
        displayName: "Hijack",
        baseUrl: "https://opencode.ai/zen/go/v1",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.setDefault(member, firstId)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.remove(member, firstId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("isolates configs between tenants", async () => {
    expect(await service.list(otherAdmin)).toEqual([]);
    await expect(service.resolveForRun(otherAdmin)).rejects.toMatchObject({ code: "conflict" });
    await expect(service.resolveOptionalForKind(otherAdmin, "chat", firstId)).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(
      service.update(otherAdmin, firstId, {
        kind: "chat",
        provider: "opencode-go",
        modelId: "deepseek-v4.1-flash",
        displayName: "Hijack",
        baseUrl: "https://opencode.ai/zen/go/v1",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(service.setDefault(otherAdmin, firstId)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.remove(otherAdmin, firstId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps defaults per kind and only resolves chat configs for runs", async () => {
    const embedding = await service.create(admin, {
      kind: "embedding",
      provider: "siliconflow",
      modelId: "BAAI/bge-m3@SILICONFLOW",
      displayName: "BGE-M3",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "sk-sf-embedding",
      makeDefault: true,
    });

    const embeddingList = await service.list(admin, "embedding");
    expect(embeddingList.map((config) => config.id)).toEqual([embedding.id]);
    expect(embeddingList[0]?.isDefault).toBe(true);

    const chatList = await service.list(admin, "chat");
    expect(chatList.some((config) => config.id === embedding.id)).toBe(false);

    await expect(service.resolveForRun(admin)).resolves.toMatchObject({
      id: secondId,
      provider: "deepseek",
    });
    await expect(service.resolveForRun(member)).resolves.toMatchObject({
      id: secondId,
      provider: "deepseek",
    });
    expect(await service.findActiveModelId(member, "embedding")).toBe("BAAI/bge-m3@SILICONFLOW");
  });

  it("sets a single default and deletes shared configs", async () => {
    const updated = await service.setDefault(admin, firstId);
    expect(updated.isDefault).toBe(true);

    const list = await service.list(admin, "chat");
    expect(list.filter((config) => config.isDefault).map((config) => config.id)).toEqual([firstId]);

    await service.remove(admin, secondId);
    expect((await service.list(admin, "chat")).map((config) => config.id)).toEqual([firstId]);
    await expect(service.remove(admin, secondId)).rejects.toMatchObject({ code: "not_found" });
  });
});
