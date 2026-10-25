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
  const otherTenantId = randomUUID();
  const adminId = randomUUID();
  const memberId = randomUUID();
  const otherAdminId = randomUUID();

  const admin: SessionUser = {
    id: adminId,
    tenantId,
    email: "search-admin@test.local",
    displayName: "Search Admin",
    role: "tenant_admin",
    departmentId: null,
  };
  const member: SessionUser = {
    id: memberId,
    tenantId,
    email: "search-member@test.local",
    displayName: "Search Member",
    role: "member",
    departmentId: null,
  };
  const otherAdmin: SessionUser = {
    id: otherAdminId,
    tenantId: otherTenantId,
    email: "search-other@test.local",
    displayName: "Search Other",
    role: "tenant_admin",
    departmentId: null,
  };

  let db: Database;
  let service: SearchConfigsService;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    service = new SearchConfigsService(db, crypto);

    await db.insert(tenants).values([
      { id: tenantId, name: "Search Test", slug: tenantId },
      { id: otherTenantId, name: "Search Other", slug: otherTenantId },
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

  it("creates encrypted configs, masks keys and makes the first config default", async () => {
    const first = await service.create(admin, {
      provider: "tavily",
      name: "Tavily",
      remark: "默认",
      apiKey: "tvly-secret-1111",
      proxy: "http://127.0.0.1:7890",
    });

    expect(first.isDefault).toBe(true);
    expect(first.hasApiKey).toBe(true);
    expect(first.apiKeyMasked).toBe("****1111");
    expect(first.createdByUserId).toBe(adminId);
    expect(first.createdByName).toBe(admin.displayName);
    expect(JSON.stringify(first)).not.toContain("tvly-secret-1111");

    const rows = await db.select().from(searchConfigs).where(eq(searchConfigs.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    expect(crypto.decrypt(rows[0]?.encryptedApiKey ?? "")).toBe("tvly-secret-1111");

    const resolved = await service.resolveForRun(admin);
    expect(resolved).toMatchObject({
      provider: "tavily",
      apiKey: "tvly-secret-1111",
      proxy: "http://127.0.0.1:7890",
    });
  });

  it("shares configs with members while keeping writes admin-only", async () => {
    const list = await service.list(admin);
    const id = list[0]?.id;
    expect(id).toBeTruthy();

    const updated = await service.update(admin, id as string, {
      provider: "tavily",
      name: "Tavily 生产",
      remark: "",
      proxy: "",
    });
    expect(updated.name).toBe("Tavily 生产");
    expect(updated.apiKeyMasked).toBe("****1111");

    const memberList = await service.list(member);
    expect(memberList.map((config) => config.id)).toEqual([id]);
    await expect(service.resolveForRun(member)).resolves.toMatchObject({
      apiKey: "tvly-secret-1111",
    });
    await expect(service.setDefault(member, id as string)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(service.remove(member, id as string)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.create(member, {
        provider: "tavily",
        name: "Member Search",
        apiKey: "tvly-member",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("isolates search configs between tenants", async () => {
    await expect(service.list(otherAdmin)).resolves.toEqual([]);
    const id = (await service.list(admin))[0]?.id as string;
    await expect(service.setDefault(otherAdmin, id)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.remove(otherAdmin, id)).rejects.toMatchObject({ code: "not_found" });
    await expect(
      service.update(otherAdmin, id, {
        provider: "tavily",
        name: "Hijack",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("promotes another config when the default is removed", async () => {
    const second = await service.create(admin, {
      provider: "tavily",
      name: "Tavily 备用",
      apiKey: "tvly-secret-2222",
    });
    expect(second.isDefault).toBe(false);

    const first = (await service.list(admin)).find((config) => config.id !== second.id);
    expect(first).toBeTruthy();
    await service.remove(admin, first?.id as string);

    const remaining = await service.list(member);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(second.id);
    expect(remaining[0]?.isDefault).toBe(true);
  });
});
