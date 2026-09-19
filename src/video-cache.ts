import type { UnavailableVideo, VideoMeta, VideoResult } from "./app-types";
import { notifyCacheUpdated } from "./cache-storage";

const VIDEO_CACHE_KEY = "chat-explorer-video-meta";
const UNAVAILABLE_CACHE_MS = 24 * 60 * 60 * 1000;

function isValidCachedVideo(entryValue: unknown): entryValue is VideoResult {
  if (!entryValue || typeof entryValue !== "object") return false;

  const unavailable = entryValue as Partial<UnavailableVideo>;
  if (unavailable.unavailable === true) {
    const isExpectedStatus = unavailable.status === 403 || unavailable.status === 404;
    if (!isExpectedStatus) return false;

    const checkedAt = unavailable.checkedAt ?? NaN;
    const age = Date.now() - checkedAt;
    const isFresh = age >= 0 && age < UNAVAILABLE_CACHE_MS;
    return isFresh;
  }

  const meta = entryValue as Partial<VideoMeta>;
  const hasValidTitle = typeof meta.title === "string";
  const hasValidChannel = typeof meta.channelName === "string";
  const hasValidUrl = typeof meta.channelUrl === "string";
  const isValidMeta = hasValidTitle && hasValidChannel && hasValidUrl;
  return isValidMeta;
}

export function readVideoCache(): Record<string, VideoResult> {
  try {
    const rawValue = localStorage.getItem(VIDEO_CACHE_KEY);
    const serialized = rawValue || "{}";
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return {};

    const rawEntries = Object.entries(parsed);
    const validEntries = rawEntries.filter((entry): entry is [string, VideoResult] => isValidCachedVideo(entry[1]));
    return Object.fromEntries(validEntries);
  } catch {
    return {};
  }
}

export function writeVideoCache(value: Record<string, VideoResult>) {
  try {
    localStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify(value));
    notifyCacheUpdated();
  } catch {}
}

export function clearVideoCache() {
  try {
    localStorage.removeItem(VIDEO_CACHE_KEY);
  } catch {}
  notifyCacheUpdated();
}
