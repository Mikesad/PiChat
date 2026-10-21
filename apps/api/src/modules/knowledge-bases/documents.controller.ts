import { Body, Controller, Inject, Param, Put, UseGuards } from "@nestjs/common";
import type {
  AclException,
  SessionUser,
  UpdateDocumentAclRequest,
  UpdateDocumentAclResponse,
} from "@pichat/shared";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { KnowledgeBasesService } from "./knowledge-bases.service";

const aclExceptionSchema = z.object({
  type: z.enum(["user", "group"]),
  id: z.string().min(1).max(36),
  permission: z.enum(["read", "deny"]),
});

const updateDocumentAclSchema = z.object({
  exceptions: z.array(aclExceptionSchema).max(200),
});

@Controller("documents")
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(
    @Inject(KnowledgeBasesService) private readonly knowledgeBasesService: KnowledgeBasesService,
  ) {}

  @Put(":id/acl")
  async updateAcl(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<UpdateDocumentAclResponse> {
    const input = parseBody<UpdateDocumentAclRequest>(updateDocumentAclSchema, body);
    return this.knowledgeBasesService.updateDocumentAcl(
      user,
      id,
      input.exceptions as AclException[],
    );
  }
}
