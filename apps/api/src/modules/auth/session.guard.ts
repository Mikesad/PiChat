import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { type SessionUser, sessionCookieName } from "@pichat/shared";
import type { FastifyRequest } from "fastify";
import { unauthenticated } from "../../common/api-error";
import { AuthService } from "./auth.service";

type AuthenticatedRequest = FastifyRequest & {
  cookies?: Record<string, string>;
  user?: SessionUser;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[sessionCookieName];
    if (!token) {
      throw unauthenticated();
    }

    const user = await this.authService.resolveSession(token);
    if (!user) {
      throw unauthenticated();
    }

    request.user = user;
    return true;
  }
}
