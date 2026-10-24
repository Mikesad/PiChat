import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Database, User } from "@pichat/db";
import { auditLogs, authSessions, departments, hashPassword, users } from "@pichat/db";
import type {
  DirectoryResponse,
  GroupSummary,
  MemberListResponse,
  MemberSummary,
  ResetMemberPasswordRequest,
  SessionUser,
  UpdateMemberRequest,
} from "@pichat/shared";
import { defaultPageSize } from "@pichat/shared";
import { and, count, eq, inArray, max, ne } from "drizzle-orm";
import { forbidden, invalidRequest, notFound } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import { buildPaginationMeta, type PaginationInput, pageOffset } from "../../common/pagination";

export function canViewMembers(role: string): boolean {
  return role === "tenant_admin" || role === "security_admin";
}

export function canEditMembers(role: string): boolean {
  return role === "tenant_admin";
}

function toIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

@Injectable()
export class MembersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(
    principal: SessionUser,
    pagination: PaginationInput = { page: 1, pageSize: defaultPageSize },
  ): Promise<MemberListResponse> {
    if (!canViewMembers(principal.role)) {
      throw forbidden();
    }

    const [totalRows, userRows, departmentRows, departmentCounts] = await Promise.all([
      this.db.select({ total: count() }).from(users).where(eq(users.tenantId, principal.tenantId)),
      this.db
        .select()
        .from(users)
        .where(eq(users.tenantId, principal.tenantId))
        .orderBy(users.displayName, users.id)
        .limit(pagination.pageSize)
        .offset(pageOffset(pagination)),
      this.db
        .select()
        .from(departments)
        .where(eq(departments.tenantId, principal.tenantId))
        .orderBy(departments.name),
      this.loadDepartmentCounts(principal.tenantId),
    ]);
    const total = totalRows[0]?.total ?? 0;

    const userIds = userRows.map((row) => row.id);
    const activityRows =
      userIds.length > 0
        ? await this.db
            .select({ userId: authSessions.userId, lastActiveAt: max(authSessions.lastUsedAt) })
            .from(authSessions)
            .where(
              and(
                eq(authSessions.tenantId, principal.tenantId),
                inArray(authSessions.userId, userIds),
              ),
            )
            .groupBy(authSessions.userId)
        : [];

    const lastActiveByUser = new Map(
      activityRows.map((row) => [row.userId, toIso(row.lastActiveAt)] as const),
    );

    const members = userRows.map((row) =>
      this.toSummary(row, lastActiveByUser.get(row.id) ?? null),
    );
    const groupSummaries: GroupSummary[] = departmentRows.map((group) => ({
      id: group.id,
      name: group.name,
      externalId: group.externalId,
      memberCount: departmentCounts.get(group.id) ?? 0,
    }));

    return {
      members,
      groups: groupSummaries,
      pagination: buildPaginationMeta(pagination, total),
    };
  }

  async directory(principal: SessionUser): Promise<DirectoryResponse> {
    const [userRows, departmentRows, activeDepartmentCounts] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(eq(users.tenantId, principal.tenantId))
        .orderBy(users.displayName),
      this.db
        .select()
        .from(departments)
        .where(eq(departments.tenantId, principal.tenantId))
        .orderBy(departments.name),
      this.loadDepartmentCounts(principal.tenantId, true),
    ]);

    return {
      members: userRows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        role: row.role,
        status: row.status,
        departmentId: row.departmentId,
      })),
      groups: departmentRows.map((group) => ({
        id: group.id,
        name: group.name,
        memberCount: activeDepartmentCounts.get(group.id) ?? 0,
      })),
    };
  }

  private async loadDepartmentCounts(
    tenantId: string,
    activeOnly = false,
  ): Promise<Map<string, number>> {
    const conditions = [eq(users.tenantId, tenantId)];
    if (activeOnly) {
      conditions.push(eq(users.status, "active"));
    }
    const rows = await this.db
      .select({ departmentId: users.departmentId, total: count() })
      .from(users)
      .where(and(...conditions))
      .groupBy(users.departmentId);
    return new Map(
      rows.flatMap((row) => (row.departmentId ? [[row.departmentId, row.total] as const] : [])),
    );
  }

  async update(
    id: string,
    principal: SessionUser,
    input: UpdateMemberRequest,
  ): Promise<MemberSummary> {
    if (!canEditMembers(principal.role)) {
      throw forbidden();
    }

    const target = await this.findUser(id, principal.tenantId);
    if (!target) {
      throw notFound();
    }

    const changingRole = input.role !== undefined && input.role !== target.role;
    const changingStatus = input.status !== undefined && input.status !== target.status;
    if (target.id === principal.id && (changingRole || changingStatus)) {
      throw invalidRequest("不能修改自己的角色或状态");
    }

    if (input.role !== undefined && changingRole && target.role === "tenant_admin") {
      await this.ensureAnotherTenantAdmin(target.id, principal.tenantId);
    }
    if (input.status === "disabled" && changingStatus && target.role === "tenant_admin") {
      await this.ensureAnotherTenantAdmin(target.id, principal.tenantId);
    }

    let nextDepartmentId: string | null | undefined;
    if (input.departmentId !== undefined) {
      nextDepartmentId = input.departmentId?.trim() || null;
      if (nextDepartmentId) {
        const departmentRows = await this.db
          .select({ id: departments.id })
          .from(departments)
          .where(
            and(eq(departments.tenantId, principal.tenantId), eq(departments.id, nextDepartmentId)),
          )
          .limit(1);
        if (!departmentRows[0]) {
          throw invalidRequest("部门不属于当前租户");
        }
      }
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(nextDepartmentId !== undefined ? { departmentId: nextDepartmentId } : {}),
        })
        .where(and(eq(users.id, target.id), eq(users.tenantId, principal.tenantId)));

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        tenantId: principal.tenantId,
        actorId: principal.id,
        action: "member.update",
        resourceType: "member",
        resourceId: target.id,
        metadata: {
          actorId: principal.id,
          result: "success",
          name: target.displayName,
          before: {
            role: target.role,
            status: target.status,
            departmentId: target.departmentId,
          },
          after: {
            role: input.role ?? target.role,
            status: input.status ?? target.status,
            departmentId: nextDepartmentId !== undefined ? nextDepartmentId : target.departmentId,
          },
        },
      });
    });

    const updated = await this.findUser(target.id, principal.tenantId);
    if (!updated) {
      throw notFound();
    }
    return this.toSummary(updated, await this.lastActiveAt(updated.id, principal.tenantId));
  }

  async resetPassword(
    id: string,
    principal: SessionUser,
    input: ResetMemberPasswordRequest,
  ): Promise<void> {
    if (!canEditMembers(principal.role)) {
      throw forbidden();
    }

    const target = await this.findUser(id, principal.tenantId);
    if (!target) {
      throw notFound();
    }

    const passwordHash = await hashPassword(input.password);
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash })
        .where(and(eq(users.id, target.id), eq(users.tenantId, principal.tenantId)));
      await tx.delete(authSessions).where(eq(authSessions.userId, target.id));
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        tenantId: principal.tenantId,
        actorId: principal.id,
        action: "member.password_reset",
        resourceType: "member",
        resourceId: target.id,
        metadata: {
          actorId: principal.id,
          result: "success",
          name: target.displayName,
        },
      });
    });
  }

  private async findUser(id: string, tenantId: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
      .limit(1);
    return rows[0] ?? null;
  }

  private async lastActiveAt(userId: string, tenantId: string): Promise<string | null> {
    const rows = await this.db
      .select({ lastActiveAt: max(authSessions.lastUsedAt) })
      .from(authSessions)
      .where(and(eq(authSessions.userId, userId), eq(authSessions.tenantId, tenantId)));
    return toIso(rows[0]?.lastActiveAt);
  }

  private async ensureAnotherTenantAdmin(userId: string, tenantId: string): Promise<void> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.role, "tenant_admin"),
          eq(users.status, "active"),
          ne(users.id, userId),
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      throw invalidRequest("至少保留一个启用的租户管理员");
    }
  }

  private toSummary(user: User, lastActiveAt: string | null): MemberSummary {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      departmentId: user.departmentId,
      lastActiveAt,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
