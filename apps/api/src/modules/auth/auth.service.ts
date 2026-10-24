import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Database, User } from "@pichat/db";
import { authSessions, users, verifyPassword } from "@pichat/db";
import type { SessionUser } from "@pichat/shared";
import { and, eq, gt } from "drizzle-orm";
import { ApiException } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import { createSessionExpiry, createSessionToken, hashSessionToken } from "./session-token";

export interface LoginResult {
  user: SessionUser;
  token: string;
}

@Injectable()
export class AuthService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);
    const user = rows[0];

    if (!user) {
      throw new ApiException("user_not_found", "邮箱不存在", 401);
    }
    if (user.status !== "active") {
      throw new ApiException("account_disabled", "账号已停用", 401);
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new ApiException("invalid_password", "密码错误", 401);
    }

    const token = createSessionToken();
    await this.db.insert(authSessions).values({
      id: randomUUID(),
      tenantId: user.tenantId,
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiry(),
      lastUsedAt: new Date(),
    });

    return { user: await this.toSessionUser(user), token };
  }

  async resolveSession(token: string): Promise<SessionUser | null> {
    const now = new Date();
    const rows = await this.db
      .select({ sessionId: authSessions.id, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(
        and(
          eq(authSessions.tokenHash, hashSessionToken(token)),
          gt(authSessions.expiresAt, now),
          eq(users.status, "active"),
        ),
      )
      .limit(1);
    const row = rows[0];

    if (!row) {
      return null;
    }

    await this.db
      .update(authSessions)
      .set({ lastUsedAt: now })
      .where(eq(authSessions.id, row.sessionId));

    return this.toSessionUser(row.user);
  }

  async logout(token: string): Promise<void> {
    await this.db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
  }

  private async toSessionUser(user: User): Promise<SessionUser> {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      departmentId: user.departmentId,
    };
  }
}
