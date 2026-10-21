import { afterEach, describe, expect, it, vi } from "vitest";
import { RAGFlowClient, toParseState } from "./client.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ code: 0, data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("RAGFlow client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads multipart form data without forcing a JSON content type", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse([{ id: "rf-doc-1", name: "policy.pdf" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    const document = await client.uploadDocument("ds-1", {
      fileName: "policy.pdf",
      mimeType: "application/pdf",
      data: new TextEncoder().encode("%PDF-1.4"),
    });

    expect(document.id).toBe("rf-doc-1");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer secret");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("maps RAGFlow run/status values to parse states", () => {
    expect(toParseState({ run: "DONE" })).toBe("ready");
    expect(toParseState({ run: "RUNNING" })).toBe("parsing");
    expect(toParseState({ run: "FAIL" })).toBe("failed");
    expect(toParseState({ status: 0 })).toBe("pending");
    expect(toParseState({ status: 1 })).toBe("parsing");
    expect(toParseState({ status: 3 })).toBe("ready");
    expect(toParseState({ status: 4 })).toBe("failed");
  });

  it("finds datasets and documents from list responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ datasets: [{ id: "ds-1", name: "Policy" }] }))
      .mockResolvedValueOnce(jsonResponse({ docs: [{ id: "rf-doc-1", run: "DONE" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    expect(await client.getDataset("ds-1")).toMatchObject({ id: "ds-1" });
    expect(await client.getDocument("ds-1", "rf-doc-1")).toMatchObject({
      id: "rf-doc-1",
      state: "ready",
    });
  });
});
