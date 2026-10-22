import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Database, User } from "@pichat/db";
import { auditLogs, authSessions, groupMembers, groups, hashPassword, users } from "@pichat/db";
import type {
  GroupSummary,
  MemberListResponse,
  MemberSummary,
  ResetMemberPasswordRequest,
  SessionUser,
  UpdateMemberRequest,
} from "@pichat/shared";
import { and, eq, inArray, max, ne } from "drizzle-orm";
import { forbidden, invalidRequest, notFound } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";

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

  async list(principal: SessionUser): Promise<MemberListResponse> {
    if (!canViewMembers(principal.role)) {
      throw forbidden();
    }

    const [userRows, groupRows, membershipRows, activityRows] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(eq(users.tenantId, principal.tenantId))
        .orderBy(users.displayName),
      this.db
        .select()
        .from(groups)
        .where(eq(groups.tenantId, principal.tenantId))
        .orderBy(groups.name),
      this.db
        .select({ userId: groupMembers.userId, groupId: groupMembers.groupId })
        .from(groupMembers)
        .innerJoin(groups, eq(groupMembers.groupId, groups.id))
        .where(eq(groups.tenantId, principal.tenantId)),
      this.db
        .select({ userId: authSessions.userId, lastActiveAt: max(authSessions.lastUsedAt) })
        .from(authSessions)
        .where(eq(authSessions.tenantId, principal.tenantId))
        .groupBy(authSessions.userId),
    ]);

    const groupIdsByUser = new Map<string, string[]>();
    for (const membership of membershipRows) {
      const current = groupIdsByUser.get(membership.userId) ?? [];
      current.push(membership.groupId);
      groupIdsByUser.set(membership.userId, current);
    }
    const lastActiveByUser = new Map(
      activityRows.map((row) => [row.userId, toIso(row.lastActiveAt)] as const),
    );
    const memberCountByGroup = new Map<string, number>();
    for (const membership of membershipRows) {
      memberCountByGroup.set(
        membership.groupId,
        (memberCountByGroup.get(membership.groupId) ?? 0) + 1,
      );
    }

    const members = userRows.map((row) =>
      this.toSummary(
        row,
        (groupIdsByUser.get(row.id) ?? []).sort(),
        lastActiveByUser.get(row.id) ?? null,
      ),
    );
    const groupSummaries: GroupSummary[] = groupRows.map((group) => ({
      id: group.id,
      name: group.name,
      externalId: group.externalId,
      memberCount: memberCountByGroup.get(group.id) ?? 0,
    }));

    return { members, groups: groupSummaries };
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

    let nextGroupIds: string[] | undefined;
    if (input.groupIds !== undefined) {
      nextGroupIds = [...new Set(input.groupIds)];
      if (nextGroupIds.length > 0) {
        const groupRows = await this.db
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.tenantId, principal.tenantId), inArray(groups.id, nextGroupIds)));
        if (groupRows.length !== nextGroupIds.length) {
          throw invalidRequest("包含不属于当前租户的用户组");
        }
      }
    }

    const beforeGroupIds = await this.groupIdsForUser(target.id, principal.tenantId);

    await this.db.transaction(async (tx) => {
      if (input.role !== undefined || input.status !== undefined) {
        await tx
          .update(users)
          .set({
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          })
          .where(and(eq(users.id, target.id), eq(users.tenantId, principal.tenantId)));
      }

      if (nextGroupIds !== undefined) {
        await tx.delete(groupMembers).where(eq(groupMembers.userId, target.id));
        if (nextGroupIds.length > 0) {
          await tx.insert(groupMembers).values(
            nextGroupIds.map((groupId) => ({
              id: randomUUID(),
              groupId,
              userId: target.id,
            })),
          );
        }
      }

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
            groupIds: beforeGroupIds,
          },
          after: {
            role: input.role ?? target.role,
            status: input.status ?? target.status,
            groupIds: nextGroupIds ?? beforeGroupIds,
          },
        },
      });
    });

    const updated = await this.findUser(target.id, principal.tenantId);
    if (!updated) {
      throw notFound();
    }
    return this.toSummary(
      updated,
      await this.groupIdsForUser(updated.id, principal.tenantId),
      await this.lastActiveAt(updated.id, principal.tenantId),
    );
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

  private async groupIdsForUser(userId: string, tenantId: string): Promise<string[]> {
    const rows = await this.db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(and(eq(groupMembers.userId, userId), eq(groups.tenantId, tenantId)));
    return rows.map((row) => row.groupId).sort();
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

  private toSummary(user: User, groupIds: string[], lastActiveAt: string | null): MemberSummary {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      groupIds,
      lastActiveAt,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
