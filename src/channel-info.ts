import { useEffect } from "react";
import { create } from "zustand";
import { notifyCacheUpdated } from "./cache-storage";
import { NAMESPACE, post, RESPONSE_EVENT, useStreamInfo } from "./stream-info";

const CACHE_KEY = "chat-explorer-channel-profiles";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 18_000;
const MAX_IN_FLIGHT = 3;
const NAME_CHARS = "[\\p{L}\\p{M}\\p{N}._-]";
const HANDLE = new RegExp(`^@${NAME_CHARS}{2,48}$`, "u");
const CHANNEL_KEY = new RegExp(`^(?:UC[A-Za-z0-9_-]{22}|@${NAME_CHARS}{2,48}|(?:user|c)/${NAME_CHARS}{1,64})$`, "u");
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const AVATAR_HOST = /(^|\.)(googleusercontent\.com|ggpht\.com)$/;

export type ChannelProfile = {
  key: string;
  name: string;
  avatar: string | null;
  channelId: string | null;
  handle: string | null;
  fetchedAt: number;
};

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function channelKey(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  if (CHANNEL_KEY.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  const [first, second] = url.pathname.replace(/^\/+/, "").split("/");
  const segment = safeDecode(first || "");
  if (segment === "channel" && CHANNEL_ID.test(second || "")) return second;
  const isLegacyPath = segment === "user" || segment === "c";
  if (isLegacyPath) {
    if (!second) return null;
    const legacyKey = `${segment}/${safeDecode(second)}`;
    return CHANNEL_KEY.test(legacyKey) ? legacyKey : null;
  }
  return CHANNEL_KEY.test(segment) ? segment : null;
}

export function avatarUrl(url: string, size: number) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !AVATAR_HOST.test(parsed.hostname)) return null;
    parsed.pathname = parsed.pathname.replace(/=s\d+(-|$)/, `=s${size}$1`);
    return parsed.href;
  } catch {
    return null;
  }
}

function parseProfile(key: string, value: unknown, fetchedAt: number): ChannelProfile | null {
  if (!isRecord(value)) return null;
  const rawName = value.name;
  if (typeof rawName !== "string") return null;
  const name = rawName.trim();
  if (!name) return null;
  if (name.length > 200) return null;

  const avatar = typeof value.avatar === "string" ? avatarUrl(value.avatar, 128) : null;
  const rawChannelId = value.channelId;
  const channelId = typeof rawChannelId === "string" && CHANNEL_ID.test(rawChannelId) ? rawChannelId : null;

  const rawHandle = value.handle;
  const handle = typeof rawHandle === "string" && HANDLE.test(rawHandle) ? rawHandle : null;
  return { key, name, avatar, channelId, handle, fetchedAt };
}

function readCache(): Record<string, ChannelProfile> {
  try {
    const serialized = localStorage.getItem(CACHE_KEY) || "null";
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) return {};
    if (parsed.version !== 1) return {};

    const cachedChannels = parsed.channels;
    if (!isRecord(cachedChannels)) return {};

    const channels: Record<string, ChannelProfile> = {};
    for (const [key, value] of Object.entries(cachedChannels)) {
      if (!CHANNEL_KEY.test(key)) continue;
      if (!isRecord(value)) continue;
      const fetchedAt = value.fetchedAt;
      if (typeof fetchedAt !== "number") continue;
      const profile = parseProfile(key, value, fetchedAt);
      if (profile && isFresh(profile)) channels[key] = profile;
    }
    return channels;
  } catch {
    return {};
  }
}

function isFresh(profile: ChannelProfile | undefined): profile is ChannelProfile {
  if (!profile) return false;
  const age = Date.now() - profile.fetchedAt;
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

export const useChannels = create<{
  profiles: Record<string, ChannelProfile>;
  failed: Record<string, true>;
  busy: boolean;
}>(() => ({ profiles: readCache(), failed: {}, busy: false }));

const wanted = new Set<string>();
const inFlight = new Map<string, { requestId: string; timeout: ReturnType<typeof setTimeout> }>();
let requestSequence = 0;

function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, channels: useChannels.getState().profiles }));
    notifyCacheUpdated();
  } catch {}
}

function syncBusy() {
  const busy = inFlight.size > 0;
  if (useChannels.getState().busy !== busy) useChannels.setState({ busy });
}

function cancelInFlight() {
  for (const request of inFlight.values()) clearTimeout(request.timeout);
  inFlight.clear();
  syncBusy();
}

function settle(key: string, profile: ChannelProfile | null) {
  const request = inFlight.get(key);
  if (request) clearTimeout(request.timeout);
  inFlight.delete(key);
  useChannels.setState((state) => {
    if (!profile) return { failed: { ...state.failed, [key]: true as const } };
    return { profiles: { ...state.profiles, [key]: profile } };
  });
  if (profile) writeCache();
  pump();
}

function pump() {
  if (useStreamInfo.getState().connected) {
    for (const key of wanted) {
      if (inFlight.size >= MAX_IN_FLIGHT) break;
      const { profiles, failed } = useChannels.getState();
      if (inFlight.has(key) || failed[key] || isFresh(profiles[key])) continue;
      requestSequence++;
      const requestId = `channel-${Date.now()}-${requestSequence}`;
      const timeout = setTimeout(() => settle(key, null), REQUEST_TIMEOUT_MS);
      inFlight.set(key, { requestId, timeout });
      try {
        post({ type: "channel", requestId, channel: key });
      } catch {
        settle(key, null);
      }
    }
  }
  syncBusy();
}

export function refreshChannelProfiles() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
  notifyCacheUpdated();
  cancelInFlight();
  useChannels.setState({ profiles: {}, failed: {} });
  pump();
}

export function clearChannelCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
  cancelInFlight();
  wanted.clear();
  useChannels.setState({ profiles: {}, failed: {} });
  notifyCacheUpdated();
}

export function requestChannelProfile(key: string | null) {
  if (!key || !CHANNEL_KEY.test(key) || wanted.has(key)) return;
  wanted.add(key);
  pump();
}

export function connectChannelHelper() {
  const receive = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail !== "string" || detail.length > 8192) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(detail);
    } catch {
      return;
    }

    if (!isRecord(parsed)) return;
    const data = parsed;
    if (data.namespace !== NAMESPACE) return;
    if (data.type !== "channel-result") return;

    const channel = data.channel;
    if (typeof channel !== "string") return;
    const pending = inFlight.get(channel);
    if (!pending) return;
    if (pending.requestId !== data.requestId) return;

    const profile = data.ok === true ? parseProfile(channel, data, Date.now()) : null;
    if (!profile) {
      console.warn("[Takeout Chat] Channel profile unavailable", {
        channel,
        error: data.error ?? "metadata-unavailable",
        status: data.status,
      });
    }
    settle(channel, profile);
  };
  document.addEventListener(RESPONSE_EVENT, receive);
  const unsubscribe = useStreamInfo.subscribe((state, previous) => {
    if (state.connected && !previous.connected) pump();
  });
  return () => {
    document.removeEventListener(RESPONSE_EVENT, receive);
    unsubscribe();
    cancelInFlight();
  };
}

export function useChannelProfile(key: string | null) {
  const profile = useChannels((state) => (key ? state.profiles[key] : undefined));
  useEffect(() => requestChannelProfile(key), [key]);
  return profile;
}

export function useChannelName(key: string | null, fallback: string) {
  return useChannelProfile(key)?.name || fallback;
}

export function hashColor(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = value.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 54% 42%)`;
}
