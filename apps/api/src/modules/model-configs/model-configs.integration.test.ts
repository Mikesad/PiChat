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
  const userAId = randomUUID();
  const userBId = randomUUID();

  const userA: SessionUser = {
    id: userAId,
    tenantId,
    email: "model-a@test.local",
    displayName: "Model A",
    role: "member",
    groupIds: [],
  };
  const userB: SessionUser = {
    id: userBId,
    tenantId,
    email: "model-b@test.local",
    displayName: "Model B",
    role: "member",
    groupIds: [],
  };

  let db: Database;
  let service: ModelConfigsService;
  let firstId: string;
  let secondId: string;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    service = new ModelConfigsService(db, crypto);

    await db.insert(tenants).values({ id: tenantId, name: "Model Test", slug: tenantId });
    await db.insert(users).values([
      {
        id: userAId,
        tenantId,
        email: userA.email,
        passwordHash: "scrypt$00$00",
        displayName: userA.displayName,
      },
      {
        id: userBId,
        tenantId,
        email: userB.email,
        passwordHash: "scrypt$00$00",
        displayName: userB.displayName,
      },
    ]);
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.$client.end();
  });

  it("creates encrypted configs, masks keys and keeps one default per user", async () => {
    const first = await service.create(userA, {
      provider: "opencode-go",
      modelId: "deepseek-v4.1-flash",
      displayName: "Flash",
      baseUrl: "https://opencode.ai/zen/go/v1",
      apiKey: "sk-aaaa-1111",
      makeDefault: true,
    });
    firstId = first.id;

    const second = await service.create(userA, {
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
    expect(JSON.stringify(first)).not.toContain("sk-aaaa-1111");
    expect(JSON.stringify(first)).not.toContain("encryptedApiKey");

    const list = await service.list(userA);
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

  it("rejects duplicate provider/model pairs", async () => {
    await expect(
      service.create(userA, {
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

    const updated = await service.update(userA, firstId, {
      provider: "opencode-go",
      modelId: "deepseek-v4.1-flash",
      displayName: "Flash renamed",
      baseUrl: "https://opencode.ai/zen/go/v1",
    });
    expect(updated.displayName).toBe("Flash renamed");
    expect(updated.apiKeyMasked).toBe("****1111");

    const after = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, firstId))
      .then((rows) => rows[0]);
    expect(after?.encryptedApiKey).toBe(before?.encryptedApiKey);
  });

  it("isolates configs between users", async () => {
    expect(await service.list(userB)).toEqual([]);

    await expect(
      service.update(userB, firstId, {
        provider: "opencode-go",
        modelId: "deepseek-v4.1-flash",
        displayName: "Hijack",
        baseUrl: "https://opencode.ai/zen/go/v1",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(service.setDefault(userB, firstId)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.remove(userB, firstId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("sets a single default and deletes owned configs", async () => {
    const updated = await service.setDefault(userA, firstId);
    expect(updated.isDefault).toBe(true);

    const list = await service.list(userA);
    expect(list.filter((config) => config.isDefault).map((config) => config.id)).toEqual([firstId]);

    await service.remove(userA, secondId);
    expect((await service.list(userA)).map((config) => config.id)).toEqual([firstId]);
    await expect(service.remove(userA, secondId)).rejects.toMatchObject({ code: "not_found" });
  });
});
