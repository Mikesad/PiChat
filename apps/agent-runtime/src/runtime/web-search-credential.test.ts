import { describe, expect, it } from "vitest";
import {
  BOCHA_API_KEY_ENV,
  createWebSearchCredentialGate,
  TAVILY_API_KEY_ENV,
} from "./web-search-credential.js";

describe("web search credential gate", () => {
  it("sets the provider key while held and clears it on release", async () => {
    const gate = createWebSearchCredentialGate({
      provider: "tavily",
      apiKey: "tvly-test",
      proxy: " http://127.0.0.1:7890 ",
    });

    await gate.acquire();
    expect(process.env[TAVILY_API_KEY_ENV]).toBe("tvly-test");
    expect(gate.proxy).toBe("http://127.0.0.1:7890");

    gate.release();
    expect(process.env[TAVILY_API_KEY_ENV]).toBeUndefined();
  });

  it("serializes concurrent acquisitions", async () => {
    const first = createWebSearchCredentialGate({
      provider: "tavily",
      apiKey: "first",
    });
    const second = createWebSearchCredentialGate({
      provider: "bocha",
      apiKey: "second",
    });

    const order: string[] = [];
    await first.acquire();
    const waiting = second.acquire().then(() => order.push("second"));
    expect(process.env[TAVILY_API_KEY_ENV]).toBe("first");
    expect(process.env[BOCHA_API_KEY_ENV]).toBeUndefined();

    first.release();
    await waiting;
    expect(order).toEqual(["second"]);
    expect(process.env[BOCHA_API_KEY_ENV]).toBe("second");
    second.release();
    expect(process.env[BOCHA_API_KEY_ENV]).toBeUndefined();
  });
});
