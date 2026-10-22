import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { AuditLogListResponse, SessionUser } from "@pichat/shared";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { type AuditLogQuery, AuditService } from "./audit.service";

const listAuditLogsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  resourceType: z.string().trim().min(1).max(60).optional(),
  result: z.enum(["success", "denied", "failed"]).optional(),
  actorId: z.string().trim().min(1).max(36).optional(),
});

@Controller("audit-logs")
@UseGuards(SessionGuard)
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  @Get()
  async list(
    @Query() query: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<AuditLogListResponse> {
    const input = parseBody<AuditLogQuery>(listAuditLogsSchema, query);
    return this.auditService.list(user, input);
  }
}
