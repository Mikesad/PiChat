import { randomUUID } from "node:crypto";
import type { Database } from "@pichat/db";
import {
  authSessions,
  createDatabase,
  departments,
  hashPassword,
  tenants,
  users,
  verifyPassword,
} from "@pichat/db";
import type { SessionUser } from "@pichat/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MembersService } from "./members.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("MembersService", () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const adminId = randomUUID();
  const secondAdminId = randomUUID();
  const memberId = randomUUID();
  const outsiderId = randomUUID();
  const groupId = randomUUID();
  const secondGroupId = randomUUID();
  const foreignGroupId = randomUUID();

  let db: Database;
  let service: MembersService;

  const admin: SessionUser = {
    id: adminId,
    tenantId,
    email: "admin@test.local",
    displayName: "Admin",
    role: "tenant_admin",
    departmentId: null,
  };
  const member: SessionUser = {
    id: memberId,
    tenantId,
    email: "member@test.local",
    displayName: "Member",
    role: "member",
    departmentId: groupId,
  };
  const knowledgeAdmin: SessionUser = {
    id: outsiderId,
    tenantId,
    email: "knowledge-admin@test.local",
    displayName: "Knowledge Admin",
    role: "knowledge_admin",
    departmentId: groupId,
  };

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    service = new MembersService(db);

    await db.insert(tenants).values([
      { id: tenantId, name: "Members", slug: tenantId },
      { id: otherTenantId, name: "Members Other", slug: otherTenantId },
    ]);
    await db.insert(departments).values([
      { id: groupId, tenantId, name: "Support", externalId: "idp-support" },
      { id: secondGroupId, tenantId, name: "Finance", externalId: "idp-finance" },
      { id: foreignGroupId, tenantId: otherTenantId, name: "Foreign" },
    ]);
    await db.insert(users).values([
      {
        id: adminId,
        tenantId,
        email: `admin-${tenantId}@test.local`,
        passwordHash: await hashPassword("123456"),
        displayName: "Admin",
        role: "tenant_admin",
      },
      {
        id: secondAdminId,
        tenantId,
        email: `admin2-${tenantId}@test.local`,
        passwordHash: await hashPassword("123456"),
        displayName: "Second Admin",
        role: "tenant_admin",
      },
      {
        id: memberId,
        tenantId,
        email: `member-${tenantId}@test.local`,
        passwordHash: await hashPassword("123456"),
        displayName: "Member",
        role: "member",
        departmentId: groupId,
      },
      {
        id: outsiderId,
        tenantId,
        email: `outsider-${tenantId}@test.local`,
        passwordHash: await hashPassword("123456"),
        displayName: "Outsider",
        role: "member",
        departmentId: groupId,
      },
    ]);
    await db.insert(authSessions).values([
      {
        id: randomUUID(),
        tenantId,
        userId: memberId,
        tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(tenants).where(eq(tenants.id, otherTenantId));
  });

  it("lists members with departments and last active time", async () => {
    const result = await service.list(admin);

    expect(result.members).toHaveLength(4);
    expect(result.groups).toHaveLength(2);
    expect(result.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 4,
      totalPages: 1,
    });
    const listed = result.members.find((item) => item.id === memberId);
    expect(listed).toMatchObject({ role: "member", status: "active", departmentId: groupId });
    expect(listed?.lastActiveAt).not.toBeNull();
    const support = result.groups.find((item) => item.id === groupId);
    expect(support).toMatchObject({ memberCount: 2, externalId: "idp-support" });
  });

  it("paginates the member list", async () => {
    const first = await service.list(admin, { page: 1, pageSize: 10 });
    expect(first.members).toHaveLength(4);
    expect(first.pagination).toMatchObject({ page: 1, pageSize: 10, total: 4 });

    const second = await service.list(admin, { page: 2, pageSize: 10 });
    expect(second.members).toHaveLength(0);
    expect(second.pagination).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 4,
      totalPages: 1,
      hasPrevious: true,
    });
  });

  it("lists a lean directory for any authenticated member", async () => {
    const directory = await service.directory(knowledgeAdmin);

    expect(directory.members).toHaveLength(4);
    expect(directory.members[0]).not.toHaveProperty("email");
    expect(directory.members.find((item) => item.id === memberId)).toMatchObject({
      displayName: "Member",
      role: "member",
      status: "active",
      departmentId: groupId,
    });
    expect(directory.groups.find((item) => item.id === groupId)).toMatchObject({
      name: "Support",
      memberCount: 2,
    });
    expect(directory.groups.some((item) => item.id === foreignGroupId)).toBe(false);
    await expect(service.directory(member)).resolves.toMatchObject({ groups: expect.any(Array) });
    await expect(service.list(knowledgeAdmin)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("forbids members from viewing or editing the member list", async () => {
    await expect(service.list(member)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.update(memberId, member, { role: "knowledge_admin" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("updates role, status and department", async () => {
    const updated = await service.update(outsiderId, admin, {
      role: "knowledge_admin",
      status: "disabled",
      departmentId: secondGroupId,
    });

    expect(updated).toMatchObject({
      role: "knowledge_admin",
      status: "disabled",
      departmentId: secondGroupId,
    });
  });

  it("updates the department without touching role or status", async () => {
    const updated = await service.update(memberId, admin, { departmentId: secondGroupId });

    expect(updated).toMatchObject({
      role: "member",
      status: "active",
      departmentId: secondGroupId,
    });
  });

  it("clears the department", async () => {
    const updated = await service.update(memberId, admin, { departmentId: null });

    expect(updated).toMatchObject({ departmentId: null });
  });

  it("rejects department ids outside the tenant", async () => {
    await expect(
      service.update(outsiderId, admin, { departmentId: foreignGroupId }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects changing own role or status", async () => {
    await expect(service.update(adminId, admin, { role: "member" })).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("keeps at least one active tenant admin", async () => {
    const secondAdmin: SessionUser = { ...admin, id: secondAdminId, displayName: "Second Admin" };

    await expect(
      service.update(secondAdminId, admin, { status: "disabled" }),
    ).resolves.toMatchObject({ status: "disabled" });
    await expect(service.update(adminId, secondAdmin, { role: "member" })).rejects.toMatchObject({
      code: "invalid_request",
    });
    await service.update(secondAdminId, admin, { status: "active" });
  });

  it("resets passwords and invalidates sessions", async () => {
    await service.resetPassword(memberId, admin, { password: "new-pass-123" });

    const rows = await db.select().from(users).where(eq(users.id, memberId)).limit(1);
    expect(await verifyPassword("new-pass-123", rows[0]?.passwordHash ?? "")).toBe(true);
    const sessions = await db.select().from(authSessions).where(eq(authSessions.userId, memberId));
    expect(sessions).toHaveLength(0);
  });
});
