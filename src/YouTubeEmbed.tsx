import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { videoUrlAt } from "./stream-info";
import { loadYouTubeApi, type YouTubePlayer } from "./youtube-player";

type SeekRequest = { id: number; seconds: number };

type YouTubeEmbedProps = {
  videoId: string;
  title: string;
  seek?: SeekRequest;
};

type PlayerStatus = "loading" | "ready" | "error";

export function YouTubeEmbed({ videoId, title, seek }: YouTubeEmbedProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const ready = useRef(false);
  const latestSeek = useRef(seek);
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    latestSeek.current = seek;
    if (!seek) return;
    if (!ready.current) return;

    const currentPlayer = player.current;
    if (!currentPlayer) return;
    currentPlayer.seekTo(seek.seconds, true);
    currentPlayer.playVideo();
  }, [seek]);

  useEffect(() => {
    let active = true;
    let instance: YouTubePlayer | null = null;
    const host = container.current;
    if (!host) return;

    ready.current = false;
    setStatus("loading");
    const timeout = setTimeout(() => {
      const shouldShowTimeout = active && !ready.current;
      if (shouldShowTimeout) setStatus("error");
    }, 25_000);

    const handlePlayerReady = (event: { target: YouTubePlayer }) => {
      if (!active) return;
      clearTimeout(timeout);
      ready.current = true;
      player.current = event.target;
      setStatus("ready");

      const pendingSeek = latestSeek.current;
      if (!pendingSeek) return;
      event.target.seekTo(pendingSeek.seconds, true);
      event.target.playVideo();
    };

    const handlePlayerError = (event: { data: number }) => {
      if (!active) return;
      clearTimeout(timeout);
      ready.current = false;
      setStatus("error");
      console.info("[Takeout Chat] Embedded playback unavailable", {
        videoId,
        code: event.data,
      });
    };

    loadYouTubeApi()
      .then((api) => {
        if (!active) return;

        const mount = document.createElement("div");
        host.append(mount);

        const origin = window.location.origin;
        const playerVars: Record<string, string | number> = {
          playsinline: 1,
        };
        if (origin !== "null") playerVars.origin = origin;

        const initialSeek = latestSeek.current;
        if (initialSeek) {
          playerVars.start = initialSeek.seconds;
          playerVars.autoplay = 1;
        }

        const options = {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars,
          events: {
            onReady: handlePlayerReady,
            onError: handlePlayerError,
          },
        };

        instance = new api.Player(mount, options);
        player.current = instance;
      })
      .catch(() => {
        if (!active) return;
        clearTimeout(timeout);
        setStatus("error");
      });

    return () => {
      active = false;
      clearTimeout(timeout);
      ready.current = false;
      player.current = null;
      instance?.destroy();
      host.replaceChildren();
    };
  }, [videoId, attempt]);

  useEffect(() => {
    const iframe = container.current?.querySelector("iframe");
    if (!iframe) return;
    iframe.title = title;
  }, [title, status]);

  const showStatus = status !== "ready";
  const retry = () => setAttempt((currentAttempt) => currentAttempt + 1);
  let statusContent: ReactNode = null;
  if (status === "loading") {
    statusContent = (
      <>
        <LoaderCircle size={24} className="spin" />
        <span>{t("video.playerLoading")}</span>
      </>
    );
  }
  if (status === "error") {
    statusContent = (
      <>
        <span>{t("video.playerFailed")}</span>
        <button type="button" onClick={retry}>
          {t("video.playerRetry")}
        </button>
        <a href={videoUrlAt(videoId, seek?.seconds)} target="_blank" rel="noopener noreferrer">
          {t("video.openOnYoutube")}
        </a>
      </>
    );
  }

  return (
    <div className="youtube-embed">
      <div ref={container} className="youtube-player" />
      {showStatus && <div className="youtube-player-status">{statusContent}</div>}
    </div>
  );
}
