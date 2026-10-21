import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import type { AccessCheckRequest, AccessCheckResponse, SessionUser } from "@pichat/shared";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { KnowledgeBasesService } from "./knowledge-bases.service";

const accessCheckSchema = z.object({
  documentId: z.string().min(1).max(36),
});

@Controller("access-check")
@UseGuards(SessionGuard)
export class AccessCheckController {
  constructor(
    @Inject(KnowledgeBasesService) private readonly knowledgeBasesService: KnowledgeBasesService,
  ) {}

  @Post()
  @HttpCode(200)
  async check(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<AccessCheckResponse> {
    const input = parseBody<AccessCheckRequest>(accessCheckSchema, body);
    return this.knowledgeBasesService.accessCheck(input.documentId, user);
  }
}
