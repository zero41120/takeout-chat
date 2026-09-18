import type { Filters, TimelineItem, VideoGroup, VideoResult } from "./app-types";
import { convertAmount, type DisplayCurrency } from "./currency";
import { isSuperChat, type Message } from "./message";

export const WEEKDAY_KEYS = [
  "weekday.sun",
  "weekday.mon",
  "weekday.tue",
  "weekday.wed",
  "weekday.thu",
  "weekday.fri",
  "weekday.sat",
];

export function streamChannelKey(message: Message, videoMeta: Record<string, VideoResult | null>): string | null {
  return videoMeta[message.videoId]?.channelUrl || null;
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function cellKey(date: Date) {
  return `${date.getDay()}-${date.getHours()}`;
}

export type FilteredMessages = {
  filtered: Message[];
  forChannelData: Message[];
  forTimelineData: Message[];
  forHeatData: Message[];
};

export function filterMessages(
  messages: Message[],
  filters: Filters,
  videoMeta: Record<string, VideoResult | null>,
): FilteredMessages {
  const normalizedQuery = filters.query.toLocaleLowerCase();
  const filtered: Message[] = [];
  const forChannelData: Message[] = [];
  const forTimelineData: Message[] = [];
  const forHeatData: Message[] = [];

  for (const message of messages) {
    const channelOk = !filters.channel || streamChannelKey(message, videoMeta) === filters.channel;
    const monthOk = !filters.month || monthKey(message.timestamp) === filters.month;
    const cellOk = !filters.cell || cellKey(message.timestamp) === filters.cell;
    const superOk = !filters.superOnly || isSuperChat(message);
    const queryOk = !normalizedQuery || message.text.toLocaleLowerCase().includes(normalizedQuery);
    const commonOk = superOk && queryOk;

    if (channelOk && monthOk && cellOk && commonOk) filtered.push(message);
    if (monthOk && cellOk && commonOk) forChannelData.push(message);
    if (channelOk && cellOk && commonOk) forTimelineData.push(message);
    if (channelOk && monthOk && commonOk) forHeatData.push(message);
  }

  return { filtered, forChannelData, forTimelineData, forHeatData };
}

export function buildVideoGroups(filtered: Message[], newest: boolean): VideoGroup[] {
  const groups = new Map<string, Message[]>();
  filtered.forEach((message) => {
    const group = groups.get(message.videoId) ?? [];
    group.push(message);
    groups.set(message.videoId, group);
  });
  const list: VideoGroup[] = [...groups].map(([videoId, items]) => {
    const sortedItems = [...items].sort((a, b) => (b.timestamp.getTime() - a.timestamp.getTime()) * (newest ? 1 : -1));
    const latest = new Date(Math.max(...items.map((m) => m.timestamp.getTime())));
    const earliest = new Date(Math.min(...items.map((m) => m.timestamp.getTime())));
    return { videoId, items: sortedItems, latest, earliest };
  });
  return list.sort((a, b) => (b.latest.getTime() - a.latest.getTime()) * (newest ? 1 : -1));
}

export type ChannelDatum = {
  id: string;
  name: string;
  count: number;
  streams: Set<string>;
};

export function buildChannelData(
  forChannelData: Message[],
  videoMeta: Record<string, VideoResult | null>,
): ChannelDatum[] {
  const counts = new Map<string, ChannelDatum>();
  forChannelData.forEach((m) => {
    const meta = videoMeta[m.videoId];
    if (!meta || "unavailable" in meta) return;
    const current = counts.get(meta.channelUrl);
    const streams = current?.streams ?? new Set<string>();
    streams.add(m.videoId);
    counts.set(meta.channelUrl, {
      id: meta.channelUrl,
      name: meta.channelName,
      count: (current?.count ?? 0) + 1,
      streams,
    });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export function buildTimelineData(messages: Message[], forTimelineData: Message[], locale: string): TimelineItem[] {
  if (!messages.length) return [];
  const first = new Date(Math.min(...messages.map((m) => m.timestamp.getTime())));
  const last = new Date(Math.max(...messages.map((m) => m.timestamp.getTime())));
  const counts = new Map<string, number>();
  forTimelineData.forEach((message) => {
    const key = monthKey(message.timestamp);
    const currentCount = counts.get(key) ?? 0;
    counts.set(key, currentCount + 1);
  });

  const allMonths: { key: string; label: string; count: number }[] = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  while (cursor <= last) {
    const key = monthKey(cursor);
    const formatted = cursor.toLocaleDateString(locale, {
      month: "short",
      year: "2-digit",
    });
    allMonths.push({
      key,
      label: locale.startsWith("en") ? formatted.replace(" ", " ’") : formatted,
      count: counts.get(key) ?? 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const merged: TimelineItem[] = [];
  let currentGap: { key: string; label: string; count: number }[] = [];
  const flushGap = () => {
    if (!currentGap.length) return;
    const start = currentGap[0];
    const end = currentGap[currentGap.length - 1];
    merged.push({
      type: "gap",
      key: `gap-${start.key}-${end.key}`,
      startLabel: start.label,
      endLabel: end.label,
      monthsCount: currentGap.length,
    });
    currentGap = [];
  };

  for (const m of allMonths) {
    if (m.count > 0) {
      flushGap();
      merged.push({
        type: "month",
        key: m.key,
        label: m.label,
        count: m.count,
      });
    } else {
      currentGap.push(m);
    }
  }
  flushGap();
  return merged;
}

export function buildHeatData(forHeatData: Message[]): number[][] {
  const values = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  forHeatData.forEach((message) => {
    const day = message.timestamp.getDay();
    const hour = message.timestamp.getHours();
    values[day][hour] += 1;
  });
  return values;
}

export type SpendingSummary = { total: number; included: number; excluded: number };

export function computeSpending(filtered: Message[], displayCurrency: DisplayCurrency): SpendingSummary {
  const superChats = filtered.filter(isSuperChat);
  const amounts = superChats.map((message) => convertAmount(message.price, message.currency, displayCurrency));
  const includedAmounts = amounts.filter((amount): amount is number => amount !== null);
  const total = includedAmounts.reduce((sum, amount) => sum + amount, 0);
  const included = includedAmounts.length;
  const excluded = amounts.length - included;
  return { total, included, excluded };
}
