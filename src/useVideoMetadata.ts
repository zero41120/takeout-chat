import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VideoResult } from "./app-types";
import { setVideoMeta, useChatExplorer } from "./chat-explorer-store";
import { readVideoCache, writeVideoCache } from "./video-cache";

const BATCH_SIZE = 8;

async function fetchVideoResult(videoId: string): Promise<[string, VideoResult | null]> {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const response = await fetch(url);
    if (response.status === 403 || response.status === 404) {
      return [videoId, { unavailable: true, status: response.status, checkedAt: Date.now() }];
    }
    if (!response.ok) return [videoId, null];
    const data = await response.json();
    return [
      videoId,
      {
        title: data.title || videoId,
        channelName: data.author_name || "Unknown channel",
        channelUrl: data.author_url || `video:${videoId}`,
        thumbnailUrl: data.thumbnail_url || "",
      },
    ];
  } catch {
    return [videoId, null];
  }
}

export function useVideoMetadata() {
  const { t } = useTranslation();
  const messages = useChatExplorer((state) => state.messages);
  const videoMeta = useChatExplorer((state) => state.videoMeta);
  const [enriching, setEnriching] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState("");

  const pendingVideoIds = useMemo(
    () => [...new Set(messages.map((m) => m.videoId))].filter((id) => id !== "unknown" && !videoMeta[id]),
    [messages, videoMeta],
  );

  const hydrateFromCache = useCallback((videoIds: string[]) => {
    const cached = readVideoCache();
    const usedCache = Object.fromEntries(
      [...new Set(videoIds)].filter((id) => id in cached).map((id) => [id, cached[id]]),
    );
    setVideoMeta(usedCache);
    return Object.keys(usedCache).length;
  }, []);

  const enrichVideos = useCallback(async () => {
    const ids = pendingVideoIds;
    if (!ids.length) {
      setEnrichStatus(t("enrich.allCached"));
      return;
    }
    setEnriching(true);
    let latest: Record<string, VideoResult | null> = { ...useChatExplorer.getState().videoMeta };
    let persistent = readVideoCache();
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      const batch = ids.slice(start, start + BATCH_SIZE);
      const results = await Promise.all(batch.map(fetchVideoResult));
      latest = { ...latest, ...Object.fromEntries(results) };
      persistent = {
        ...persistent,
        ...Object.fromEntries(results.filter((result): result is [string, VideoResult] => result[1] !== null)),
      };
      setVideoMeta(latest);
      writeVideoCache(persistent);
      setEnrichStatus(
        t("enrich.progress", {
          done: Math.min(start + batch.length, ids.length),
          total: ids.length,
        }),
      );
    }
    setEnriching(false);
    setEnrichStatus(t("enrich.ready"));
  }, [pendingVideoIds, t]);

  return { videoMeta, enriching, enrichStatus, pendingVideoIds, hydrateFromCache, enrichVideos };
}
