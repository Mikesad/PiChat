import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  MemberListResponse,
  MemberResponse,
  ResetMemberPasswordRequest,
  SessionUser,
  UpdateMemberRequest,
} from "@pichat/shared";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { MembersService } from "./members.service";

const roleSchema = z.enum(["member", "knowledge_admin", "security_admin", "tenant_admin"]);

const updateMemberSchema = z.object({
  role: roleSchema.optional(),
  status: z.enum(["active", "disabled"]).optional(),
  groupIds: z.array(z.string().min(1).max(36)).max(200).optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6).max(200),
});

@Controller("members")
@UseGuards(SessionGuard)
export class MembersController {
  constructor(@Inject(MembersService) private readonly membersService: MembersService) {}

  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<MemberListResponse> {
    return this.membersService.list(user);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<MemberResponse> {
    const input = parseBody<UpdateMemberRequest>(updateMemberSchema, body);
    return { member: await this.membersService.update(id, user, input) };
  }

  @Post(":id/password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    const input = parseBody<ResetMemberPasswordRequest>(resetPasswordSchema, body);
    await this.membersService.resetPassword(id, user, input);
  }
}
