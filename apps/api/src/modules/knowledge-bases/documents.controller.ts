import { createReadStream } from "node:fs";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from "@nestjs/common";
import type {
  AclException,
  ReparseDocumentResponse,
  SessionUser,
  UpdateDocumentAclModeRequest,
  UpdateDocumentAclModeResponse,
  UpdateDocumentAclRequest,
  UpdateDocumentAclResponse,
} from "@pichat/shared";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { contentDisposition, parseRangeHeader } from "./document-content";
import { DocumentsService } from "./documents.service";
import { KnowledgeBasesService } from "./knowledge-bases.service";

const aclExceptionSchema = z.object({
  type: z.enum(["user", "group"]),
  id: z.string().min(1).max(36),
  permission: z.enum(["read", "deny"]),
});

const updateDocumentAclSchema = z.object({
  exceptions: z.array(aclExceptionSchema).max(200),
});

const updateDocumentAclModeSchema = z.object({
  mode: z.enum(["inherit", "restricted"]),
});

@Controller("documents")
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(
    @Inject(KnowledgeBasesService) private readonly knowledgeBasesService: KnowledgeBasesService,
    @Inject(DocumentsService) private readonly documentsService: DocumentsService,
  ) {}

  @Get(":id/content")
  async content(
    @Param("id") id: string,
    @Headers("range") range: string | undefined,
    @CurrentUser() user: SessionUser,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const content = await this.documentsService.getContent(user, id);
    const parsedRange = parseRangeHeader(range, content.sizeBytes);

    reply.header("accept-ranges", "bytes");
    reply.header("cache-control", "private, no-store");
    reply.header("content-disposition", contentDisposition(content.fileName));
    reply.header("content-type", content.mimeType);
    reply.header("x-content-type-options", "nosniff");

    if (parsedRange === "invalid") {
      reply.header("content-range", `bytes */${content.sizeBytes}`);
      reply.code(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).send();
      return;
    }

    if (parsedRange) {
      reply.header("content-length", String(parsedRange.end - parsedRange.start + 1));
      reply.header(
        "content-range",
        `bytes ${parsedRange.start}-${parsedRange.end}/${content.sizeBytes}`,
      );
      reply.code(HttpStatus.PARTIAL_CONTENT).send(
        createReadStream(content.path, {
          start: parsedRange.start,
          end: parsedRange.end,
        }),
      );
      return;
    }

    reply.header("content-length", String(content.sizeBytes));
    reply.send(createReadStream(content.path));
  }

  @Post(":id/reparse")
  @HttpCode(HttpStatus.OK)
  async reparse(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<ReparseDocumentResponse> {
    return { document: await this.documentsService.reparse(user, id) };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @CurrentUser() user: SessionUser): Promise<void> {
    await this.documentsService.remove(user, id);
  }

  @Put(":id/acl-mode")
  async updateAclMode(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<UpdateDocumentAclModeResponse> {
    const input = parseBody<UpdateDocumentAclModeRequest>(updateDocumentAclModeSchema, body);
    return this.knowledgeBasesService.updateDocumentAclMode(user, id, input.mode);
  }

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
