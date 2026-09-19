import { create } from "zustand";
import { notifyCacheUpdated } from "./cache-storage";

export const NAMESPACE = "takeout-chat:stream-info:v1";
export const RESPONSE_EVENT = `${NAMESPACE}:response`;
const REQUEST_EVENT = `${NAMESPACE}:request`;
const CACHE_KEY = "chat-explorer-stream-info";
const REQUEST_TIMEOUT_MS = 18_000;
const LIVE_INFO_TTL_MS = 5 * 60 * 1000;
const ARCHIVE_INFO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const EXACT_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type StreamInfo = {
  startTimestamp: string;
  endTimestamp: string | null;
  uploadDate: string | null;
  fetchedAt: number;
};

export type StreamInfoError =
  | "helper-unavailable"
  | "metadata-unavailable"
  | "missing-start"
  | "invalid-timing"
  | "http-error"
  | "timeout"
  | "network-error";

type StreamInfoState = {
  connected: boolean;
  checking: boolean;
  videos: Record<string, StreamInfo>;
  pending: Record<string, boolean>;
  errors: Record<string, StreamInfoError>;
  selected: Record<string, { timestamp: number; seconds: number }>;
  seeks: Record<string, { id: number; seconds: number }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const hasExactFormat = EXACT_TIME.test(value);
  if (!hasExactFormat) return false;
  return Number.isFinite(Date.parse(value));
}

function parseInfo(value: unknown, fetchedAt: number): StreamInfo | null {
  if (!isRecord(value)) return null;

  const startTimestamp = value.startTimestamp;
  if (!exactTime(startTimestamp)) return null;
  const startTime = Date.parse(startTimestamp);
  if (startTime > Date.now()) return null;

  const rawEndTimestamp = value.endTimestamp;
  let endTimestamp: string | null = null;
  if (rawEndTimestamp !== undefined && rawEndTimestamp !== null) {
    if (!exactTime(rawEndTimestamp)) return null;
    const endTime = Date.parse(rawEndTimestamp);
    if (endTime < startTime) return null;
    endTimestamp = rawEndTimestamp;
  }

  const rawUploadDate = value.uploadDate;
  const hasDatePrefix = typeof rawUploadDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(rawUploadDate);
  const uploadDate = hasDatePrefix ? rawUploadDate.slice(0, 10) : null;
  return {
    startTimestamp,
    endTimestamp,
    uploadDate,
    fetchedAt,
  };
}

export function isFreshStreamInfo(info: StreamInfo | undefined): info is StreamInfo {
  if (!info) return false;
  const hasEndTimestamp = Boolean(info.endTimestamp);
  const ttl = hasEndTimestamp ? ARCHIVE_INFO_TTL_MS : LIVE_INFO_TTL_MS;
  const age = Date.now() - info.fetchedAt;
  return Number.isFinite(age) && age >= 0 && age < ttl;
}

function readCache(): Record<string, StreamInfo> {
  try {
    const serialized = localStorage.getItem(CACHE_KEY) || "null";
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) return {};
    if (parsed.version !== 1) return {};

    const cachedVideos = parsed.videos;
    if (!isRecord(cachedVideos)) return {};

    const videos: Record<string, StreamInfo> = {};
    for (const [id, value] of Object.entries(cachedVideos)) {
      if (!VIDEO_ID.test(id)) continue;
      if (!isRecord(value)) continue;
      const fetchedAt = value.fetchedAt;
      if (typeof fetchedAt !== "number") continue;
      const info = parseInfo(value, fetchedAt);
      if (info && isFreshStreamInfo(info)) videos[id] = info;
    }
    return videos;
  } catch {
    return {};
  }
}

export const useStreamInfo = create<StreamInfoState>(() => ({
  connected: false,
  checking: false,
  videos: readCache(),
  pending: {},
  errors: {},
  selected: {},
  seeks: {},
}));

type PendingRequest = {
  requestId: string;
  promise: Promise<StreamInfo | null>;
  resolve: (info: StreamInfo | null) => void;
  timeout: ReturnType<typeof setTimeout>;
};
const requests = new Map<string, PendingRequest>();
let requestSequence = 0;
let handshakeTimeout: ReturnType<typeof setTimeout> | undefined;
const selections = new Map<string, number>();
let selectionSequence = 0;

export function post(data: Record<string, unknown>) {
  document.dispatchEvent(
    new CustomEvent(REQUEST_EVENT, {
      detail: JSON.stringify({ namespace: NAMESPACE, ...data }),
    }),
  );
}

export function checkStreamHelper() {
  clearTimeout(handshakeTimeout);
  useStreamInfo.setState({ checking: true });
  handshakeTimeout = setTimeout(() => {
    handshakeTimeout = undefined;
    useStreamInfo.setState({ connected: false, checking: false });
  }, 2000);
  post({ type: "probe" });
}

function finish(videoId: string, info: StreamInfo | null, error?: StreamInfoError) {
  const request = requests.get(videoId);
  if (!request) return;
  clearTimeout(request.timeout);
  requests.delete(videoId);
  useStreamInfo.setState((state) => {
    const pending = { ...state.pending };
    delete pending[videoId];
    const errors = { ...state.errors };
    if (error) errors[videoId] = error;
    else delete errors[videoId];
    const videos = info ? { ...state.videos, [videoId]: info } : state.videos;
    return { pending, errors, videos };
  });
  if (info) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, videos: useStreamInfo.getState().videos }));
      notifyCacheUpdated();
    } catch {}
  }
  request.resolve(info);
}

function getResponseError(data: Record<string, unknown>, info: StreamInfo | null): StreamInfoError | undefined {
  if (info) return undefined;

  if (data.ok === true) {
    const hasStartTimestamp = Boolean(data.startTimestamp);
    return hasStartTimestamp ? "invalid-timing" : "missing-start";
  }

  if (data.error === "http-error") return "http-error";
  if (data.error === "timeout") return "timeout";
  if (data.error === "network-error") return "network-error";
  return "metadata-unavailable";
}

export function connectStreamHelper() {
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

    if (data.type === "ready") {
      clearTimeout(handshakeTimeout);
      handshakeTimeout = undefined;
      const wasDisconnected = !useStreamInfo.getState().connected;
      if (wasDisconnected) console.info("[Takeout Chat] Helper connected", data.version ?? "");
      useStreamInfo.setState({ connected: true, checking: false });
      return;
    }

    if (data.type !== "result") return;
    const videoId = data.videoId;
    if (typeof videoId !== "string") return;
    const pending = requests.get(videoId);
    if (!pending) return;
    if (data.requestId !== pending.requestId) return;

    const info = data.ok === true ? parseInfo(data, Date.now()) : null;
    const error = getResponseError(data, info);
    if (error) {
      console.warn("[Takeout Chat] Stream timing unavailable", {
        videoId,
        error,
        status: data.status,
        startTimestamp: data.startTimestamp,
        endTimestamp: data.endTimestamp,
        uploadDate: data.uploadDate,
      });
    }
    finish(videoId, info, error);
  };
  document.addEventListener(RESPONSE_EVENT, receive);
  window.addEventListener("focus", checkStreamHelper);
  window.addEventListener("pageshow", checkStreamHelper);
  checkStreamHelper();
  return () => {
    clearTimeout(handshakeTimeout);
    handshakeTimeout = undefined;
    document.removeEventListener(RESPONSE_EVENT, receive);
    window.removeEventListener("focus", checkStreamHelper);
    window.removeEventListener("pageshow", checkStreamHelper);
    const pendingVideoIds = [...requests.keys()];
    pendingVideoIds.forEach((videoId) => finish(videoId, null));
    useStreamInfo.setState({ connected: false, checking: false });
  };
}

export function requestStreamInfo(videoId: string): Promise<StreamInfo | null> {
  const state = useStreamInfo.getState();
  if (!VIDEO_ID.test(videoId)) return Promise.resolve(null);
  const cached = state.videos[videoId];
  if (isFreshStreamInfo(cached)) return Promise.resolve(cached);
  const pending = requests.get(videoId);
  if (pending) return pending.promise;
  if (!state.connected) {
    useStreamInfo.setState({
      errors: { ...state.errors, [videoId]: "helper-unavailable" },
    });
    return Promise.resolve(null);
  }

  requestSequence++;
  const requestId = `${Date.now()}-${requestSequence}`;
  let resolve!: PendingRequest["resolve"];
  const promise = new Promise<StreamInfo | null>((done) => {
    resolve = done;
  });
  const timeout = setTimeout(() => finish(videoId, null, "timeout"), REQUEST_TIMEOUT_MS);
  requests.set(videoId, { requestId, promise, resolve, timeout });
  useStreamInfo.setState((current) => {
    const errors = { ...current.errors };
    delete errors[videoId];
    return { pending: { ...current.pending, [videoId]: true }, errors };
  });
  try {
    post({ type: "request", requestId, videoId });
  } catch {
    finish(videoId, null, "network-error");
  }
  return promise;
}

export function chatOffset(chatTime: Date, info?: StreamInfo | null) {
  if (!info) return null;
  const timestamp = chatTime.getTime();
  const start = Date.parse(info.startTimestamp);
  const end = info.endTimestamp ? Date.parse(info.endTimestamp) : Infinity;
  const seconds = Math.floor((timestamp - start) / 1000);
  const isValidOffset = Number.isFinite(seconds) && seconds >= 0;
  if (!isValidOffset) return null;
  const isWithinStream = timestamp <= end;
  if (!isWithinStream) return null;
  return seconds;
}

export function formatOffset(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

export function clearChatSelection() {
  selections.clear();
  useStreamInfo.setState({ selected: {}, seeks: {} });
}

export function clearStreamInfoCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
  for (const request of requests.values()) {
    clearTimeout(request.timeout);
    request.resolve(null);
  }
  requests.clear();
  selections.clear();
  useStreamInfo.setState({ videos: {}, pending: {}, errors: {}, selected: {}, seeks: {} });
  notifyCacheUpdated();
}

export function seekChatTime(videoId: string, timestamp: Date, seconds: number) {
  const hasValidVideoId = VIDEO_ID.test(videoId);
  const hasWholeSecondOffset = Number.isInteger(seconds);
  const hasNonnegativeOffset = seconds >= 0;
  const canSeek = hasValidVideoId && hasWholeSecondOffset && hasNonnegativeOffset;
  if (!canSeek) return;

  selections.delete(videoId);
  selectionSequence++;
  const seekId = selectionSequence;
  useStreamInfo.setState((state) => ({
    selected: {
      ...state.selected,
      [videoId]: { timestamp: timestamp.getTime(), seconds },
    },
    seeks: { ...state.seeks, [videoId]: { id: seekId, seconds } },
  }));
}

export function videoUrlAt(videoId: string, seconds?: number) {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  if (seconds !== undefined && Number.isInteger(seconds) && seconds >= 0) {
    url.searchParams.set("t", `${seconds}s`);
  }
  return url.href;
}

export async function selectChatTime(videoId: string, timestamp: Date) {
  selectionSequence++;
  const selectionId = selectionSequence;
  selections.set(videoId, selectionId);
  useStreamInfo.setState((state) => {
    const selected = { ...state.selected };
    delete selected[videoId];
    return { selected };
  });
  const info = await requestStreamInfo(videoId);
  if (selections.get(videoId) !== selectionId) return { status: "superseded" as const };
  const seconds = chatOffset(timestamp, info);
  if (seconds === null) return { status: "error" as const, outOfRange: Boolean(info) };
  useStreamInfo.setState((state) => ({
    selected: {
      ...state.selected,
      [videoId]: { timestamp: timestamp.getTime(), seconds },
    },
  }));
  return { status: "ready" as const, seconds };
}
