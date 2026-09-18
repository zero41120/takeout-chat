import { ArrowUpRight, LoaderCircle, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  chatOffset,
  formatOffset,
  isFreshStreamInfo,
  seekChatTime,
  selectChatTime,
  useStreamInfo,
  videoUrlAt,
} from "./stream-info";

type ChatTimestampProps = {
  videoId: string;
  timestamp: Date;
  children: ReactNode;
  canSeek?: boolean;
};

type LookupError = "lookup" | "range";

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export function ChatTimestamp({ videoId, timestamp, children, canSeek = true }: ChatTimestampProps) {
  const { t } = useTranslation();
  const info = useStreamInfo((state) => state.videos[videoId]);
  const failure = useStreamInfo((state) => state.errors[videoId]);
  const selected = useStreamInfo((state) => state.selected[videoId]?.timestamp === timestamp.getTime());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LookupError | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const freshInfo = isFreshStreamInfo(info) ? info : null;
  const seconds = chatOffset(timestamp, freshInfo);
  const hasValidVideoId = VIDEO_ID.test(videoId);

  const resolveTimestamp = async () => {
    const currentInfo = useStreamInfo.getState().videos[videoId];
    const isLookingUpInfo = !isFreshStreamInfo(currentInfo);
    setBusy(isLookingUpInfo);
    setError(null);
    const result = await selectChatTime(videoId, timestamp);
    if (!mounted.current) return;
    setBusy(false);
    if (result.status !== "error") return;

    const lookupError = result.outOfRange ? "range" : "lookup";
    setError(lookupError);
  };

  let errorText = t("chatLink.failed");
  if (error === "range") {
    errorText = t("chatLink.outOfRange");
  } else if (failure === "helper-unavailable") {
    errorText = t("chatLink.helperMissing");
  } else {
    const hasNoTimingFailure = failure === "missing-start" || failure === "invalid-timing";
    if (hasNoTimingFailure) errorText = t("chatLink.noTiming");
  }

  const timestampLabel =
    seconds === null ? (
      <button
        type="button"
        className="chat-timestamp-link"
        onClick={resolveTimestamp}
        disabled={busy || !hasValidVideoId}
        title={t("chatLink.find")}
      >
        {children}
      </button>
    ) : (
      <span className="chat-timestamp-date">{children}</span>
    );

  let timestampAction: ReactNode = null;
  if (busy) {
    timestampAction = (
      <span className="chat-timestamp-loading">
        <LoaderCircle size={12} className="spin" />
      </span>
    );
  } else if (seconds !== null) {
    const offset = formatOffset(seconds);
    const seekTitle = canSeek ? t("chatLink.seek", { offset }) : t("video.unavailable");
    const selectedClass = selected ? " selected" : "";
    timestampAction = (
      <span className={`chat-offset${selectedClass}`} title={t("chatLink.cached", { offset })}>
        <button
          type="button"
          className="chat-seek"
          onClick={() => seekChatTime(videoId, timestamp, seconds)}
          disabled={!canSeek}
          title={seekTitle}
        >
          <Play size={11} />
          {offset}
        </button>
        <a
          className="chat-youtube"
          href={videoUrlAt(videoId, seconds)}
          target="_blank"
          rel="noopener noreferrer"
          title={t("video.openAt", { offset })}
        >
          <ArrowUpRight size={13} />
        </a>
      </span>
    );
  }

  const shouldShowError = error !== null && seconds === null;
  const errorStatus = shouldShowError ? <span className="chat-link-status">{errorText}</span> : null;

  return (
    <time className="chat-timestamp" dateTime={timestamp.toISOString()}>
      {timestampLabel}
      {timestampAction}
      {errorStatus}
    </time>
  );
}
