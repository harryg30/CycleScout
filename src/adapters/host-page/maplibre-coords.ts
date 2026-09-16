/**
 * MapLibre unproject uses CSS pixels relative to the map container,
 * not viewport clientX/clientY.
 */
export function clientPointToMapPixel(
  clientX: number,
  clientY: number,
  mapRect: { left: number; top: number },
): { x: number; y: number } {
  return { x: clientX - mapRect.left, y: clientY - mapRect.top };
}

export function latLngFromUnknown(
  value: unknown,
): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as { lat?: unknown; lng?: unknown };
  const lat = typeof rec.lat === "number" ? rec.lat : Number(rec.lat);
  const lng = typeof rec.lng === "number" ? rec.lng : Number(rec.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
