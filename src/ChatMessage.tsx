import { Gift } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { channelKey, useChannelName } from "./channel-info";
import { ChannelAvatar } from "./ChannelAvatar";
import { ChatTimestamp } from "./ChatTimestamp";
import { isGift, isSuperChat, superChatTier, type Message, type MessagePart } from "./message";

type ChatMessageProps = {
  message: Message;
  locale: string;
  query: string;
  canSeek: boolean;
  amount: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const needle = query.toLocaleLowerCase();
  const parts = text.split(regex);
  return parts.map((part, index) => {
    const isMatch = part.toLocaleLowerCase() === needle;
    if (!isMatch) return part;
    return <mark key={index}>{part}</mark>;
  });
}

function renderMessagePart(part: MessagePart, index: number, query: string) {
  if (part.type === "text") {
    return <span key={index}>{highlight(part.value, query)}</span>;
  }

  return (
    <img
      key={index}
      className="chat-emoji"
      src={part.url}
      alt={part.alt}
      title={part.alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}

export function ChatMessage({ message, locale, query, canSeek, amount }: ChatMessageProps) {
  const { t } = useTranslation();
  const channel = channelKey(message.authorId);
  const author = useChannelName(channel, message.authorName);
  const gift = isGift(message);
  const giftName = message.giftName;
  const giftLabel = giftName ? t("message.namedGift", { name: giftName }) : t("message.gift");
  const giftTag = gift ? (
    <span className="gift-tag">
      <Gift size={12} />
      {giftLabel}
    </span>
  ) : null;
  const hasParts = message.parts.length > 0;
  const showEmptyMessage = !hasParts && !gift;
  const messageContent = showEmptyMessage ? (
    <span className="muted">{t("message.empty")}</span>
  ) : (
    message.parts.map((part, index) => renderMessagePart(part, index, query))
  );
  const body = (
    <>
      {giftTag}
      {messageContent}
    </>
  );

  const dateLabel = message.timestamp.toLocaleDateString(locale, {
    month: "short",
    day: "2-digit",
  });
  const timeLabel = message.timestamp.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const timestamp = (
    <ChatTimestamp videoId={message.videoId} timestamp={message.timestamp} canSeek={canSeek}>
      {dateLabel}
      <small>{timeLabel}</small>
    </ChatTimestamp>
  );

  const isSuperChatMessage = isSuperChat(message);
  if (isSuperChatMessage) {
    const tier = superChatTier(message.price);
    return (
      <article className={`super-card tier-${tier}`}>
        <div className="super-head">
          <ChannelAvatar channel={channel} name={author} size={32} />
          <div>
            <b>{author}</b>
            {timestamp}
          </div>
          <strong>{amount}</strong>
        </div>
        <p>{body}</p>
      </article>
    );
  }

  return (
    <article className="message">
      <ChannelAvatar channel={channel} name={author} size={32} />
      <div className="message-body">
        <div className="message-head">
          <b>{author}</b>
          {timestamp}
        </div>
        <p>{body}</p>
      </div>
    </article>
  );
}
