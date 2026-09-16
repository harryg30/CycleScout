import type { MapClickButton } from "../../domain/types.js";
import { ChromeSettingsStore } from "../../adapters/settings/chrome-settings-store.js";

const settings = new ChromeSettingsStore();

const leftEl = document.getElementById(
  "map-click-left",
) as HTMLInputElement | null;
const rightEl = document.getElementById(
  "map-click-right",
) as HTMLInputElement | null;
const middleEl = document.getElementById(
  "map-click-middle",
) as HTMLInputElement | null;
const mapsKeyEl = document.getElementById(
  "maps-key",
) as HTMLInputElement | null;

function applyMapClickButton(button: MapClickButton): void {
  if (!leftEl || !rightEl || !middleEl) return;
  leftEl.checked = button === "left";
  rightEl.checked = button === "right";
  middleEl.checked = button === "middle";
}

function selectedMapClickButton(): MapClickButton {
  if (middleEl?.checked) return "middle";
  if (leftEl?.checked) return "left";
  return "right";
}

async function hydrate(): Promise<void> {
  if (!leftEl || !rightEl || !middleEl || !mapsKeyEl) return;

  applyMapClickButton(await settings.getMapClickButton());
  mapsKeyEl.value = await settings.getMapsKey();

  const onButtonChange = () => {
    void settings.setMapClickButton(selectedMapClickButton());
  };
  leftEl.addEventListener("change", onButtonChange);
  rightEl.addEventListener("change", onButtonChange);
  middleEl.addEventListener("change", onButtonChange);

  mapsKeyEl.addEventListener("input", () => {
    void settings.setMapsKey(mapsKeyEl.value.trim());
  });
}

void hydrate();
