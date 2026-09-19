export const CACHE_KEYS = [
  "chat-explorer-stream-info",
  "chat-explorer-video-meta",
  "chat-explorer-channel-profiles",
] as const;

export const CACHE_UPDATED_EVENT = "takeout-chat:cache-updated";

export function getCacheSizeBytes() {
  let totalBytes = 0;
  for (const key of CACHE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value) totalBytes += new Blob([value]).size;
    } catch {}
  }
  return totalBytes;
}

export function notifyCacheUpdated() {
  window.dispatchEvent(new Event(CACHE_UPDATED_EVENT));
}
