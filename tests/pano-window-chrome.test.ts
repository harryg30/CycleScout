import { describe, expect, it } from "vitest";
import {
  applyPanoWindowLayout,
  nextPanoLayoutFromDrag,
} from "../src/adapters/street-view/maps-street-view-surface.js";
import { DEFAULT_PANO_LAYOUT } from "../src/domain/types.js";

describe("Pano Window chrome without content.css", () => {
  it("floats as a fixed overlay so the window is visible when the peg is", () => {
    const el = { style: {} as CSSStyleDeclaration };
    applyPanoWindowLayout(el as HTMLElement, DEFAULT_PANO_LAYOUT);

    expect(el.style.position).toBe("fixed");
    expect(el.style.zIndex).toBe("2147483646");
    expect(el.style.left).toBe("24px");
    expect(el.style.top).toBe("24px");
    expect(el.style.width).toBe("420px");
    expect(el.style.height).toBe("320px");
  });

  it("moves the Pano Window from pointer delta so the title bar can drag it", () => {
    const next = nextPanoLayoutFromDrag(
      { x: 24, y: 80, width: 420, height: 320 },
      { x: 100, y: 100 },
      { x: 140, y: 70 },
    );
    expect(next).toEqual({ x: 64, y: 50, width: 420, height: 320 });
  });
});
