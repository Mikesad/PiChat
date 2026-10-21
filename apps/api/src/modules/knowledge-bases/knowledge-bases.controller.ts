import { Body, Controller, Get, Inject, Param, Put, UseGuards } from "@nestjs/common";
import type {
  KnowledgeBaseListResponse,
  KnowledgeBaseResponse,
  SessionUser,
  UpdateKnowledgeBaseAclRequest,
  UpdateKnowledgeBaseAclResponse,
} from "@pichat/shared";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { KnowledgeBasesService } from "./knowledge-bases.service";

const aclSubjectSchema = z.object({
  type: z.enum(["user", "group"]),
  id: z.string().min(1).max(36),
});

const updateKnowledgeBaseAclSchema = z.object({
  defaultSubjects: z.array(aclSubjectSchema).max(200),
});

@Controller("knowledge-bases")
@UseGuards(SessionGuard)
export class KnowledgeBasesController {
  constructor(
    @Inject(KnowledgeBasesService) private readonly knowledgeBasesService: KnowledgeBasesService,
  ) {}

  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<KnowledgeBaseListResponse> {
    return { knowledgeBases: await this.knowledgeBasesService.list(user) };
  }

  @Get(":id/documents")
  async documents(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return { documents: await this.knowledgeBasesService.listDocuments(id, user) };
  }

  @Get(":id")
  async get(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<KnowledgeBaseResponse> {
    return { knowledgeBase: await this.knowledgeBasesService.get(id, user) };
  }

  @Put(":id/acl")
  async updateAcl(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<UpdateKnowledgeBaseAclResponse> {
    const input = parseBody<UpdateKnowledgeBaseAclRequest>(updateKnowledgeBaseAclSchema, body);
    return this.knowledgeBasesService.updateKnowledgeBaseAcl(user, id, input.defaultSubjects);
  }
}
