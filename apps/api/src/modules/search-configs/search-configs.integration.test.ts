import { randomUUID } from "node:crypto";
import { createDatabase, type Database, searchConfigs, tenants, users } from "@pichat/db";
import type { SessionUser } from "@pichat/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModelConfigCrypto } from "../../common/model-config-crypto";
import { SearchConfigsService } from "./search-configs.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("search configs service", () => {
  const crypto = new ModelConfigCrypto(Buffer.alloc(32, 7));
  const tenantId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();

  const user: SessionUser = {
    id: userId,
    tenantId,
    email: "search@test.local",
    displayName: "Search User",
    role: "tenant_admin",
    departmentId: null,
  };
  const otherUser: SessionUser = {
    ...user,
    id: otherUserId,
    email: "search-other@test.local",
  };

  let db: Database;
  let service: SearchConfigsService;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    service = new SearchConfigsService(db, crypto);

    await db.insert(tenants).values({ id: tenantId, name: "Search Test", slug: tenantId });
    await db.insert(users).values([
      {
        id: userId,
        tenantId,
        email: user.email,
        passwordHash: "scrypt$00$00",
        displayName: user.displayName,
        role: "tenant_admin",
      },
      {
        id: otherUserId,
        tenantId,
        email: otherUser.email,
        passwordHash: "scrypt$00$00",
        displayName: otherUser.displayName,
        role: "tenant_admin",
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

  it("creates encrypted configs, masks keys and makes the first config default", async () => {
    const first = await service.create(user, {
      provider: "tavily",
      name: "Tavily",
      remark: "默认",
      apiKey: "tvly-secret-1111",
      proxy: "http://127.0.0.1:7890",
    });

    expect(first.isDefault).toBe(true);
    expect(first.hasApiKey).toBe(true);
    expect(first.apiKeyMasked).toBe("****1111");
    expect(JSON.stringify(first)).not.toContain("tvly-secret-1111");

    const rows = await db.select().from(searchConfigs).where(eq(searchConfigs.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    expect(crypto.decrypt(rows[0]?.encryptedApiKey ?? "")).toBe("tvly-secret-1111");

    const resolved = await service.resolveForRun(user);
    expect(resolved).toMatchObject({
      provider: "tavily",
      apiKey: "tvly-secret-1111",
      proxy: "http://127.0.0.1:7890",
    });
  });

  it("keeps the stored key when an update omits apiKey and isolates users", async () => {
    const list = await service.list(user);
    const id = list[0]?.id;
    expect(id).toBeTruthy();

    const updated = await service.update(user, id as string, {
      provider: "tavily",
      name: "Tavily 生产",
      remark: "",
      proxy: "",
    });
    expect(updated.name).toBe("Tavily 生产");
    expect(updated.apiKeyMasked).toBe("****1111");

    await expect(service.list(otherUser)).resolves.toEqual([]);
    await expect(service.setDefault(otherUser, id as string)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("promotes another config when the default is removed", async () => {
    const second = await service.create(user, {
      provider: "tavily",
      name: "Tavily 备用",
      apiKey: "tvly-secret-2222",
    });
    expect(second.isDefault).toBe(false);

    const first = (await service.list(user)).find((config) => config.id !== second.id);
    expect(first).toBeTruthy();
    await service.remove(user, first?.id as string);

    const remaining = await service.list(user);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(second.id);
    expect(remaining[0]?.isDefault).toBe(true);
  });
});
