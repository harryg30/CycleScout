import { describe, expect, it, vi, afterEach } from "vitest";
import {
  extensionResourceUrl,
  isExtensionContextInvalidatedError,
  isExtensionContextValid,
} from "../src/extension/extension-context.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extension context helpers", () => {
  it("isExtensionContextValid is false when runtime.id is missing", () => {
    vi.stubGlobal("chrome", { runtime: {} });
    expect(isExtensionContextValid()).toBe(false);
  });

  it("extensionResourceUrl returns null when getURL throws context invalidated", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        id: "ext-id",
        getURL: () => {
          throw new Error("Extension context invalidated.");
        },
      },
    });
    expect(extensionResourceUrl("host-mre-bridge.js")).toBeNull();
  });

  it("extensionResourceUrl returns the URL when context is live", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        id: "ext-id",
        getURL: (path: string) => `chrome-extension://ext-id/${path}`,
      },
    });
    expect(extensionResourceUrl("host-mre-bridge.js")).toBe(
      "chrome-extension://ext-id/host-mre-bridge.js",
    );
  });

  it("detects invalidated error message", () => {
    expect(
      isExtensionContextInvalidatedError(
        new Error("Extension context invalidated."),
      ),
    ).toBe(true);
    expect(isExtensionContextInvalidatedError(new Error("other"))).toBe(false);
  });
});

describe("bridge inject getURL rejection handling", () => {
  it("guarded inject rejects cleanly (awaitable) when context is dead", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        id: "ext-id",
        getURL: () => {
          throw new Error("Extension context invalidated.");
        },
      },
    });

    const bridgeReady = new Promise<void>((resolve, reject) => {
      const url = extensionResourceUrl("maps-page-bridge.js");
      if (!url) {
        reject(new Error("Extension context invalidated."));
        return;
      }
      resolve();
    });

    await expect(bridgeReady).rejects.toThrow(/extension context invalidated/i);
  });
});
