import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import type {
  AccessCheckResult,
  AccessScopeResponse,
  InternalAccessCheckRequest,
  InternalPrincipal,
} from "@pichat/shared";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { InternalGuard } from "./internal.guard";
import { InternalAccessService } from "./internal-access.service";

const principalSchema = z.object({
  tenantId: z.string().min(1).max(64),
  userId: z.string().min(1).max(64),
});

const scopeSchema = z.object({
  principal: principalSchema,
  knowledgeBaseIds: z.array(z.string().min(1).max(64)).max(50).optional(),
});

const checkSchema = z.object({
  principal: principalSchema,
  documentId: z.string().min(1).max(64),
});

@Controller("internal/access")
@UseGuards(InternalGuard)
export class InternalAccessController {
  constructor(
    @Inject(InternalAccessService) private readonly internalAccessService: InternalAccessService,
  ) {}

  @Post("scope")
  @HttpCode(HttpStatus.OK)
  async scope(@Body() body: unknown): Promise<AccessScopeResponse> {
    const input = parseBody<{ principal: InternalPrincipal; knowledgeBaseIds?: string[] }>(
      scopeSchema,
      body,
    );
    return this.internalAccessService.scope(input.principal, input.knowledgeBaseIds);
  }

  @Post("check")
  @HttpCode(HttpStatus.OK)
  async check(@Body() body: unknown): Promise<AccessCheckResult> {
    const input = parseBody<InternalAccessCheckRequest>(checkSchema, body);
    return this.internalAccessService.check(input.principal, input.documentId);
  }
}
