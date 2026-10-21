import { proxyToApi } from "@/lib/bff";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return proxyToApi(request, "auth/logout");
}
