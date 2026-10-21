import { proxyToApi } from "@/lib/bff";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyToApi(request, path.join("/"));
}

export function GET(request: Request, context: RouteContext) {
  return forward(request, context);
}

export function POST(request: Request, context: RouteContext) {
  return forward(request, context);
}

export function PUT(request: Request, context: RouteContext) {
  return forward(request, context);
}

export function PATCH(request: Request, context: RouteContext) {
  return forward(request, context);
}

export function DELETE(request: Request, context: RouteContext) {
  return forward(request, context);
}
