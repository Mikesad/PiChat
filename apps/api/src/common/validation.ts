import type { ZodType } from "zod";
import { invalidRequest } from "./api-error";

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) {
    return result.data;
  }

  const fields = [
    ...new Set(
      result.error.issues.map((issue) => issue.path.join(".")).filter((path) => path.length > 0),
    ),
  ];
  throw invalidRequest("请求参数无效", { fields });
}
