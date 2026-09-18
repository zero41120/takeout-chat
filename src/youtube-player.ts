export type YouTubePlayer = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  destroy: () => void;
};

type PlayerOptions = {
  videoId: string;
  host: string;
  width: string;
  height: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: (event: { target: YouTubePlayer }) => void;
    onError: (event: { data: number }) => void;
  };
};

type YouTubeApi = {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer;
};
type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

let apiPromise: Promise<YouTubeApi> | null = null;

export function loadYouTubeApi(): Promise<YouTubeApi> {
  const target = window as YouTubeWindow;
  if (target.YT?.Player) return Promise.resolve(target.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    const previous = target.onYouTubeIframeAPIReady;
    const cleanup = () => {
      clearTimeout(timeout);
      script.onerror = null;
      if (target.onYouTubeIframeAPIReady === ready) target.onYouTubeIframeAPIReady = previous;
    };
    const fail = () => {
      cleanup();
      script.remove();
      reject(new Error("YouTube player API unavailable"));
    };
    const ready = () => {
      cleanup();
      if (target.YT?.Player) resolve(target.YT);
      else reject(new Error("YouTube player API unavailable"));
      previous?.();
    };
    const timeout = setTimeout(fail, 20_000);
    target.onYouTubeIframeAPIReady = ready;
    script.onerror = fail;
    document.head.append(script);
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}
