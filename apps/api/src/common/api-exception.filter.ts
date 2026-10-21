import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { ApiErrorBody, ApiErrorCode } from "@pichat/shared";
import type { FastifyReply } from "fastify";
import { ApiException } from "./api-error";

const statusCodes: Record<number, ApiErrorCode> = {
  [HttpStatus.BAD_REQUEST]: "invalid_request",
  [HttpStatus.UNAUTHORIZED]: "unauthenticated",
  [HttpStatus.FORBIDDEN]: "forbidden",
  [HttpStatus.NOT_FOUND]: "not_found",
  [HttpStatus.CONFLICT]: "conflict",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof ApiException) {
      const body: ApiErrorBody = {
        code: exception.code,
        message: exception.message,
        details: exception.details ?? null,
      };
      void reply.status(exception.getStatus()).send(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = statusCodes[status] ?? (status >= 500 ? "internal_error" : "invalid_request");
      const body: ApiErrorBody = {
        code,
        message: exception.message || "请求失败",
        details: null,
      };
      void reply.status(status).send(body);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.message : "Unhandled error");
    const body: ApiErrorBody = {
      code: "internal_error",
      message: "服务器内部错误",
      details: null,
    };
    void reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send(body);
  }
}
