import "@fastify/multipart";
import { Body, Controller, Get, Inject, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import type {
  KnowledgeBaseListResponse,
  KnowledgeBaseResponse,
  SessionUser,
  UpdateKnowledgeBaseAclRequest,
  UpdateKnowledgeBaseAclResponse,
  UploadDocumentResponse,
} from "@pichat/shared";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { invalidRequest } from "../../common/api-error";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { DocumentsService } from "./documents.service";
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
    @Inject(DocumentsService) private readonly documentsService: DocumentsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<KnowledgeBaseListResponse> {
    return { knowledgeBases: await this.knowledgeBasesService.list(user) };
  }

  @Get(":id/documents")
  async documents(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return { documents: await this.knowledgeBasesService.listDocuments(id, user) };
  }

  @Post(":id/documents")
  async upload(
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @CurrentUser() user: SessionUser,
  ): Promise<UploadDocumentResponse> {
    if (!request.isMultipart()) {
      throw invalidRequest("请使用 multipart/form-data 上传文件");
    }

    const maxBytes = this.documentsService.maxUploadBytes();
    let part: Awaited<ReturnType<FastifyRequest["file"]>>;
    try {
      part = await request.file({
        limits: { fileSize: maxBytes, files: 1, fields: 2 },
      });
    } catch (cause) {
      throw mapMultipartError(cause, maxBytes) ?? cause;
    }
    if (!part) {
      throw invalidRequest("缺少文件字段 file");
    }
    if (part.fieldname !== "file") {
      throw invalidRequest("文件字段名必须为 file");
    }

    try {
      const document = await this.documentsService.upload(user, id, {
        fileName: part.filename,
        mimeType: part.mimetype,
        stream: part.file,
      });
      return { document };
    } catch (cause) {
      throw mapMultipartError(cause, maxBytes) ?? cause;
    }
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

function mapMultipartError(cause: unknown, maxBytes: number) {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? (cause as { code?: unknown }).code
      : undefined;

  switch (code) {
    case "FST_REQ_FILE_TOO_LARGE":
      return invalidRequest(`文件不能超过 ${Math.floor(maxBytes / (1024 * 1024))}MB`);
    case "FST_INVALID_MULTIPART_CONTENT_TYPE":
      return invalidRequest("请使用 multipart/form-data 上传文件");
    case "FST_FILES_LIMIT":
      return invalidRequest("一次只能上传一个文件");
    case "FST_FIELDS_LIMIT":
    case "FST_PARTS_LIMIT":
      return invalidRequest("上传表单字段过多");
    default:
      return null;
  }
}
