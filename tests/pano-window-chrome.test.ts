import { describe, expect, it } from "vitest";
import {
  applyPanoWindowLayout,
  nextPanoLayoutFromDrag,
  nextPanoLayoutFromResize,
} from "../src/adapters/street-view/maps-street-view-surface.js";
import { DEFAULT_PANO_LAYOUT, clampPanoLayoutToViewport } from "../src/domain/types.js";

/** Author-style declaration that expands `inset` the way CSS does (wipes left/top). */
function createStyleDeclaration(): CSSStyleDeclaration {
  const values: Record<string, string> = {};
  return new Proxy(values, {
    get(target, prop) {
      if (prop === "setProperty") {
        return (name: string, value: string) => {
          if (name === "inset") {
            target.top = value;
            target.right = value;
            target.bottom = value;
            target.left = value;
            return;
          }
          const camel = name.replace(/-([a-z])/g, (_, c: string) =>
            c.toUpperCase(),
          );
          target[camel] = value;
        };
      }
      return target[prop as string] ?? "";
    },
    set(target, prop, value) {
      if (typeof prop === "string") target[prop] = String(value);
      return true;
    },
  }) as unknown as CSSStyleDeclaration;
}

describe("Pano Window chrome without content.css", () => {
  it("floats as a fixed overlay so the window is visible when the peg is", () => {
    const el = { style: createStyleDeclaration() };
    applyPanoWindowLayout(el as HTMLElement, DEFAULT_PANO_LAYOUT);

    expect(el.style.position).toBe("fixed");
    expect(el.style.zIndex).toBe("2147483647");
    expect(el.style.left).toBe("24px");
    expect(el.style.top).toBe("24px");
    expect(el.style.right).toBe("auto");
    expect(el.style.bottom).toBe("auto");
    expect(el.style.width).toBe("420px");
    expect(el.style.height).toBe("320px");
  });

  it("keeps left/top after a drag apply so popover inset cannot pin the window", () => {
    const el = { style: createStyleDeclaration() };
    applyPanoWindowLayout(el as HTMLElement, DEFAULT_PANO_LAYOUT);
    applyPanoWindowLayout(el as HTMLElement, {
      x: 64,
      y: 50,
      width: 420,
      height: 320,
    });

    expect(el.style.left).toBe("64px");
    expect(el.style.top).toBe("50px");
    expect(el.style.right).toBe("auto");
    expect(el.style.bottom).toBe("auto");
  });

  it("moves the Pano Window from pointer delta so the title bar can drag it", () => {
    const next = nextPanoLayoutFromDrag(
      { x: 24, y: 80, width: 420, height: 320 },
      { x: 100, y: 100 },
      { x: 140, y: 70 },
    );
    expect(next).toEqual({ x: 64, y: 50, width: 420, height: 320 });
  });

  it("grows the Pano Window from the resize-handle pointer delta", () => {
    const next = nextPanoLayoutFromResize(
      { x: 24, y: 80, width: 420, height: 320 },
      { x: 444, y: 400 },
      { x: 504, y: 460 },
    );
    expect(next).toEqual({ x: 24, y: 80, width: 480, height: 380 });
  });

  it("pulls an off-screen remembered layout back onto the viewport", () => {
    expect(
      clampPanoLayoutToViewport(
        { x: 4000, y: 3000, width: 420, height: 320 },
        { width: 1280, height: 800 },
      ),
    ).toEqual({ x: 860, y: 480, width: 420, height: 320 });
  });
});
