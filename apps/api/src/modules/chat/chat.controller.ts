import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type {
  ChatMessagesResponse,
  ChatSessionListResponse,
  ChatSessionResponse,
  CreateChatSessionRequest,
  SendChatMessageRequest,
  SessionUser,
} from "@pichat/shared";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { notFound } from "../../common/api-error";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ChatService } from "./chat.service";

const createSessionSchema = z.object({
  title: z.string().trim().max(200).optional(),
  modelConfigId: z.string().min(1).max(64).optional(),
});

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  modelConfigId: z.string().min(1).max(64).optional(),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  retry: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  knowledgeBaseIds: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
});

@Controller("chat")
@UseGuards(SessionGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatService) {}

  @Get("sessions")
  async listSessions(@CurrentUser() user: SessionUser): Promise<ChatSessionListResponse> {
    return { sessions: await this.chatService.listSessions(user) };
  }

  @Post("sessions")
  async createSession(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<ChatSessionResponse> {
    const input = parseBody<CreateChatSessionRequest>(createSessionSchema, body);
    return { session: await this.chatService.createSession(user, input) };
  }

  @Get("sessions/:id/messages")
  async getMessages(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<ChatMessagesResponse> {
    const result = await this.chatService.getMessages(user, id);
    return { session: result.session, messages: result.messages };
  }

  @Post("sessions/:id/messages")
  async sendMessage(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const input = parseBody<SendChatMessageRequest>(sendMessageSchema, body);
    await this.chatService.stream(user, id, input, reply);
  }

  @Post("runs/:runId/abort")
  @HttpCode(HttpStatus.NO_CONTENT)
  async abort(@Param("runId") runId: string, @CurrentUser() user: SessionUser): Promise<void> {
    const aborted = await this.chatService.abort(user, runId);
    if (!aborted) {
      throw notFound("运行不存在");
    }
  }
}
