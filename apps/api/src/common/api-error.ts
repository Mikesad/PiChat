import { HttpException, HttpStatus } from "@nestjs/common";
import type { ApiErrorCode } from "@pichat/shared";

export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus,
    readonly details: unknown = null,
  ) {
    super(message, status);
  }
}

export function invalidRequest(message = "请求参数无效", details: unknown = null): ApiException {
  return new ApiException("invalid_request", message, HttpStatus.BAD_REQUEST, details);
}

export function unauthenticated(message = "未登录"): ApiException {
  return new ApiException("unauthenticated", message, HttpStatus.UNAUTHORIZED);
}

export function forbidden(message = "没有权限"): ApiException {
  return new ApiException("forbidden", message, HttpStatus.FORBIDDEN);
}

export function notFound(message = "资源不存在"): ApiException {
  return new ApiException("not_found", message, HttpStatus.NOT_FOUND);
}

export function conflict(message = "资源冲突"): ApiException {
  return new ApiException("conflict", message, HttpStatus.CONFLICT);
}

export function serviceUnavailable(message = "服务暂时不可用"): ApiException {
  return new ApiException("service_unavailable", message, HttpStatus.SERVICE_UNAVAILABLE);
}
