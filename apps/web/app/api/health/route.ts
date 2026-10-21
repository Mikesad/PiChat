export function GET() {
  return Response.json({
    status: "ok",
    service: "pichat-web",
    timestamp: new Date().toISOString(),
  });
}
