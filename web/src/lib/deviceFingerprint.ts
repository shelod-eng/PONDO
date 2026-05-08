export async function createDeviceFingerprint() {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !window.crypto?.subtle) {
    return "";
  }

  const payload = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    String(navigator.hardwareConcurrency || 0),
    String(navigator.maxTouchPoints || 0),
    window.screen?.width || 0,
    window.screen?.height || 0,
    window.screen?.colorDepth || 0,
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  ].join("|");

  const encoded = new TextEncoder().encode(payload);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  return `fp_${hex.slice(0, 32)}`;
}
