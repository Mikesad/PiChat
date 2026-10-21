import { proxyToApi } from "@/lib/bff";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return proxyToApi(request, "auth/me");
}
