import { timingSafeEqual } from "node:crypto";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { ApiException } from "../../common/api-error";

@Injectable()
export class InternalGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>("INTERNAL_SHARED_SECRET")?.trim();
    if (!secret) {
      throw new ApiException("service_unavailable", "内部服务未配置", 503);
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers.authorization;
    const prefix = "Bearer ";
    if (!header?.startsWith(prefix)) {
      throw new ApiException("unauthenticated", "内部服务认证失败", 401);
    }

    const token = header.slice(prefix.length);
    const expected = Buffer.from(secret);
    const actual = Buffer.from(token);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new ApiException("unauthenticated", "内部服务认证失败", 401);
    }

    return true;
  }
}
