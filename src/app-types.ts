import type { Message } from "./message";

export type VideoMeta = {
  title: string;
  channelName: string;
  channelUrl: string;
  thumbnailUrl: string;
};

export type UnavailableVideo = {
  unavailable: true;
  status: 403 | 404;
  checkedAt: number;
  title?: never;
  channelName?: never;
  channelUrl?: never;
  thumbnailUrl?: never;
};

export type VideoResult = VideoMeta | UnavailableVideo;

export type VideoGroup = {
  videoId: string;
  items: Message[];
  latest: Date;
  earliest: Date;
};

export type TimelineMonthItem = {
  type: "month";
  key: string;
  label: string;
  count: number;
};

export type TimelineGapItem = {
  type: "gap";
  key: string;
  startLabel: string;
  endLabel: string;
  monthsCount: number;
};

export type TimelineItem = TimelineMonthItem | TimelineGapItem;

export type Filters = {
  channel: string | null;
  month: string | null;
  cell: string | null;
  superOnly: boolean;
  query: string;
};

export type RawMessagePart = {
  text?: string;
  emoji?: {
    customEmojiUrl?: string;
    shortcuts?: string[];
    emojiId?: string;
  };
};
