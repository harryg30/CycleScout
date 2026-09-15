import type { MapClickButton } from "../../domain/types.js";
import { ChromeSettingsStore } from "../../adapters/settings/chrome-settings-store.js";

const settings = new ChromeSettingsStore();

const leftEl = document.getElementById(
  "map-click-left",
) as HTMLInputElement | null;
const rightEl = document.getElementById(
  "map-click-right",
) as HTMLInputElement | null;
const mapsKeyEl = document.getElementById(
  "maps-key",
) as HTMLInputElement | null;

function applyMapClickButton(button: MapClickButton): void {
  if (!leftEl || !rightEl) return;
  leftEl.checked = button === "left";
  rightEl.checked = button === "right";
}

async function hydrate(): Promise<void> {
  if (!leftEl || !rightEl || !mapsKeyEl) return;

  applyMapClickButton(await settings.getMapClickButton());
  mapsKeyEl.value = await settings.getMapsKey();

  const onButtonChange = () => {
    const button: MapClickButton = rightEl.checked ? "right" : "left";
    void settings.setMapClickButton(button);
  };
  leftEl.addEventListener("change", onButtonChange);
  rightEl.addEventListener("change", onButtonChange);

  mapsKeyEl.addEventListener("input", () => {
    void settings.setMapsKey(mapsKeyEl.value.trim());
  });
}

void hydrate();
