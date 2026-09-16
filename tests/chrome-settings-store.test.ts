import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeSettingsStore } from "../src/adapters/settings/chrome-settings-store.js";

type AreaChange = Record<string, { newValue?: unknown }>;

function createMemoryArea(onChanged: (changes: AreaChange, area: string) => void) {
  const data = new Map<string, unknown>();
  return {
    async get(key: string) {
      return { [key]: data.get(key) };
    },
    async set(items: Record<string, unknown>) {
      const changes: AreaChange = {};
      for (const [key, value] of Object.entries(items)) {
        data.set(key, value);
        changes[key] = { newValue: value };
      }
      onChanged(changes, "local");
    },
    data,
  };
}

describe("ChromeSettingsStore Maps Key", () => {
  let local: ReturnType<typeof createMemoryArea>;
  let sync: ReturnType<typeof createMemoryArea>;

  beforeEach(() => {
    const listeners: Array<(changes: AreaChange, area: string) => void> = [];
    const fire = (changes: AreaChange, area: string) => {
      for (const listener of listeners) listener(changes, area);
    };
    local = createMemoryArea(fire);
    sync = createMemoryArea(fire);
    vi.stubGlobal("chrome", {
      runtime: { id: "ext-id" },
      storage: {
        local,
        sync,
        onChanged: {
          addListener(listener: (changes: AreaChange, area: string) => void) {
            listeners.push(listener);
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("get Maps Key is empty until set", async () => {
    const store = new ChromeSettingsStore();
    expect(await store.getMapsKey()).toBe("");
  });

  it("set Maps Key persists in this browser profile (local storage) and notifies", async () => {
    const store = new ChromeSettingsStore();
    let notified = 0;
    store.onSettingsChange(() => {
      notified += 1;
    });

    await store.setMapsKey("rider-maps-key-abc");

    expect(await store.getMapsKey()).toBe("rider-maps-key-abc");
    expect(local.data.get("ssp.mapsKey")).toBe("rider-maps-key-abc");
    expect(sync.data.has("ssp.mapsKey")).toBe(false);
    expect(notified).toBe(1);
  });
});

describe("ChromeSettingsStore Map Click Button", () => {
  let sync: ReturnType<typeof createMemoryArea>;

  beforeEach(() => {
    const listeners: Array<(changes: AreaChange, area: string) => void> = [];
    const fire = (changes: AreaChange, area: string) => {
      for (const listener of listeners) listener(changes, area);
    };
    const local = createMemoryArea(fire);
    sync = createMemoryArea(fire);
    vi.stubGlobal("chrome", {
      runtime: { id: "ext-id" },
      storage: {
        local,
        sync,
        onChanged: {
          addListener(listener: (changes: AreaChange, area: string) => void) {
            listeners.push(listener);
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to right when unset or unknown", async () => {
    const store = new ChromeSettingsStore();
    expect(await store.getMapClickButton()).toBe("right");
    await store.setMapClickButton("left");
    sync.data.set("ssp.mapClickButton", "nope");
    expect(await store.getMapClickButton()).toBe("right");
  });

  it("persists left and middle", async () => {
    const store = new ChromeSettingsStore();
    await store.setMapClickButton("left");
    expect(await store.getMapClickButton()).toBe("left");
    await store.setMapClickButton("middle");
    expect(await store.getMapClickButton()).toBe("middle");
    expect(sync.data.get("ssp.mapClickButton")).toBe("middle");
  });
});
