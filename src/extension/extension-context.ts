/**
 * Chrome tear-down after extension reload leaves orphan content scripts.
 * Accessing chrome.* then throws "Extension context invalidated."
 */

export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

/** Resource URL for injection, or null when the extension context is gone. */
export function extensionResourceUrl(path: string): string | null {
  try {
    if (!isExtensionContextValid()) return null;
    return chrome.runtime.getURL(path);
  } catch {
    return null;
  }
}

export function isExtensionContextInvalidatedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /extension context invalidated/i.test(message);
}
