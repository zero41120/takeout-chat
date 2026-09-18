import { VideoOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VideoGroup, VideoResult } from "./app-types";
import { channelKey } from "./channel-info";
import { ChannelAvatar } from "./ChannelAvatar";
import { ChatMessage } from "./ChatMessage";
import { VideoOpenLink } from "./VideoOpenLink";
import { YouTubeEmbed } from "./YouTubeEmbed";

type SeekRequest = { id: number; seconds: number };

type VideoGroupCardProps = {
  group: VideoGroup;
  index: number;
  meta: VideoResult | null | undefined;
  locale: string;
  query: string;
  seek: SeekRequest | undefined;
  isPlaying: boolean;
  onPlay: () => void;
  displayAmount: (currency: string, amount: number) => string;
};

export function VideoGroupCard({
  group,
  index,
  meta,
  locale,
  query,
  seek,
  isPlaying,
  onPlay,
  displayAmount,
}: VideoGroupCardProps) {
  const { t } = useTranslation();
  const isUnavailable = meta !== null && meta !== undefined && "unavailable" in meta;
  const canSeek = !isUnavailable;
  const title = meta?.title ?? t("video.unknownTitle", { id: group.videoId });
  const messageCount = group.items.length;
  const latestDateLabel = group.latest.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  const getChannelLabel = () => {
    if (isUnavailable) return t("video.unavailable");
    if (meta?.channelName) return meta.channelName;
    if (meta === null) return t("video.fetchFailed");
    return t("video.unknownChannel");
  };

  const renderVideoStage = () => {
    if (isUnavailable) {
      return (
        <div className="video-unavailable">
          <VideoOff size={28} />
          <strong>{t("video.unavailable")}</strong>
          <p>{t("video.unavailableHint")}</p>
        </div>
      );
    }

    if (isPlaying) {
      return <YouTubeEmbed videoId={group.videoId} title={title} seek={seek} />;
    }

    const thumbnailUrl = meta?.thumbnailUrl;
    const thumbnailStyle = thumbnailUrl
      ? {
          backgroundImage: `linear-gradient(rgba(31,34,40,.28),rgba(31,34,40,.76)), url("${thumbnailUrl}")`,
        }
      : undefined;

    return (
      <button style={thumbnailStyle} onClick={onPlay}>
        <span>▶</span>
        <strong>{t("video.loadVideo")}</strong>
      </button>
    );
  };

  const channelLabel = getChannelLabel();

  return (
    <article className="video-group">
      <div className="video-summary">
        <span className="video-index">
          {t("video.index", {
            index: String(index + 1).padStart(2, "0"),
          })}
        </span>
        {meta?.channelName && <ChannelAvatar channel={channelKey(meta.channelUrl)} name={meta.channelName} size={30} />}
        <div>
          <h3>{title}</h3>
          <p>
            {channelLabel} · {latestDateLabel} · {t("count.matchingMessages", { count: messageCount })}
          </p>
        </div>
        <VideoOpenLink videoId={group.videoId} />
      </div>
      <div className="video-content">
        <div className="video-stage">{renderVideoStage()}</div>
        <div className="group-messages">
          <div className="chat-pane-label">
            <span>{t("chat.paneLabel")}</span>
            <span>{t("count.messages", { count: messageCount })}</span>
          </div>
          {group.items.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              locale={locale}
              query={query}
              canSeek={canSeek}
              amount={displayAmount(message.currency, message.price)}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
