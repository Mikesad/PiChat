import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { SessionUser } from "@pichat/shared";
import type { FastifyRequest } from "fastify";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user: SessionUser }>();
    return request.user;
  },
);
