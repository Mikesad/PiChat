import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { type SessionResponse, sessionCookieName } from "@pichat/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { SessionGuard } from "./session.guard";
import { sessionCookieOptions } from "./session-token";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponse> {
    const input = parseBody(loginSchema, body);
    const result = await this.authService.login(input.email, input.password);
    reply.setCookie(
      sessionCookieName,
      result.token,
      sessionCookieOptions(process.env.NODE_ENV === "production"),
    );
    return { user: result.user };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionResponse["user"]): SessionResponse {
    return { user };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: FastifyRequest & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const token = request.cookies?.[sessionCookieName];
    if (token) {
      await this.authService.logout(token);
    }
    reply.clearCookie(sessionCookieName, { path: "/" });
  }
}
