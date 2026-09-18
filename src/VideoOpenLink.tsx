import { useTranslation } from "react-i18next";
import { formatOffset, useStreamInfo, videoUrlAt } from "./stream-info";

export function VideoOpenLink({ videoId }: { videoId: string }) {
  const { t } = useTranslation();
  const selected = useStreamInfo((state) => state.selected[videoId]);
  const label = selected ? t("video.openAt", { offset: formatOffset(selected.seconds) }) : t("video.openOnYoutube");
  return (
    <a href={videoUrlAt(videoId, selected?.seconds)} target="_blank" rel="noopener noreferrer" title={label}>
      ↗
    </a>
  );
}
