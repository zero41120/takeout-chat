import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VideoResult } from "./app-types";
import { clearFilter, EMPTY_FILTERS, setFilters, toggleFilter, useChatExplorer } from "./chat-explorer-store";
import { convertAmount, type DisplayCurrency, formatAmount } from "./currency";
import { buildVideoGroups, type ChannelDatum, WEEKDAY_KEYS } from "./explorer-data";
import { type Message } from "./message";
import { SearchBox } from "./SearchBox";
import { useStreamInfo } from "./stream-info";
import { VideoGroupCard } from "./VideoGroupCard";

const PAGE_SIZE = 20;

type ChatFeedProps = {
  filtered: Message[];
  channelData: ChannelDatum[];
  videoMeta: Record<string, VideoResult | null>;
  locale: string;
  displayCurrency: DisplayCurrency;
};

export function ChatFeed({ filtered, channelData, videoMeta, locale, displayCurrency }: ChatFeedProps) {
  const { t } = useTranslation();
  const messages = useChatExplorer((state) => state.messages);
  const filters = useChatExplorer((state) => state.filters);
  const seeks = useStreamInfo((state) => state.seeks);
  const [newest, setNewest] = useState(true);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());

  useEffect(() => setVisible(PAGE_SIZE), [filters, newest]);
  useEffect(() => setPlayingVideos(new Set()), [messages]);

  const videoGroups = useMemo(() => buildVideoGroups(filtered, newest), [filtered, newest]);
  const visibleGroups = useMemo(() => videoGroups.slice(0, visible), [videoGroups, visible]);
  const activeCount = Object.values(filters).filter(Boolean).length;

  const displayAmount = (currency: string, amount: number) => {
    const converted = convertAmount(amount, currency, displayCurrency);
    return converted === null
      ? formatAmount(currency || t("currency.unknown"), amount, locale)
      : formatAmount(displayCurrency, converted, locale);
  };

  return (
    <section className="panel feed-panel">
      <div className="section-title">
        <div>
          <span>{t("section.records.index")}</span>
          <h2>{t("section.records.title")}</h2>
        </div>
        <p>
          {t("count.messages", { count: filtered.length })} · {t("count.videos", { count: videoGroups.length })}
        </p>
      </div>
      <div className="toolbar">
        <SearchBox />
        <button className={filters.superOnly ? "active" : ""} onClick={() => toggleFilter("superOnly", true)}>
          {t("toolbar.superChats")}
        </button>
        <button onClick={() => setNewest((v) => !v)}>
          {newest ? t("toolbar.newestFirst") : t("toolbar.oldestFirst")}
        </button>
      </div>
      <div className="chips">
        <span className="filter-label">{t("filters.label", { count: activeCount })}</span>
        {filters.channel && (
          <button onClick={() => clearFilter("channel")}>
            {t("filters.channel", {
              name: channelData.find((c) => c.id === filters.channel)?.name ?? t("filters.channelUnknown"),
            })}{" "}
            ×
          </button>
        )}
        {filters.month && (
          <button onClick={() => clearFilter("month")}>{t("filters.month", { month: filters.month })} ×</button>
        )}
        {filters.cell && (
          <button onClick={() => clearFilter("cell")}>
            {t(WEEKDAY_KEYS[Number(filters.cell.split("-")[0])])} {filters.cell.split("-")[1]}:00 ×
          </button>
        )}
        {filters.superOnly && <button onClick={() => clearFilter("superOnly")}>{t("stats.superChats")} ×</button>}
        {filters.query && (
          <button onClick={() => clearFilter("query")}>{t("filters.search", { query: filters.query })} ×</button>
        )}
        {activeCount > 1 && (
          <button className="clear" onClick={() => setFilters(EMPTY_FILTERS)}>
            {t("filters.clearAll")}
          </button>
        )}
      </div>
      <div className="feed">
        {!messages.length ? (
          <div className="feed-empty">
            <strong>{t("feedEmpty.noArchive.title")}</strong>
            <p>{t("feedEmpty.noArchive.desc")}</p>
          </div>
        ) : !videoGroups.length ? (
          <div className="feed-empty">
            <strong>{t("feedEmpty.noMatch.title")}</strong>
            <p>{t("feedEmpty.noMatch.desc")}</p>
          </div>
        ) : (
          visibleGroups.map((group, groupIndex) => {
            const meta = videoMeta[group.videoId];
            const seek = seeks[group.videoId];
            const isPlaying = playingVideos.has(group.videoId) || Boolean(seek);
            return (
              <VideoGroupCard
                key={group.videoId}
                group={group}
                index={groupIndex}
                meta={meta}
                locale={locale}
                query={filters.query}
                seek={seek}
                isPlaying={isPlaying}
                onPlay={() => setPlayingVideos((current) => new Set(current).add(group.videoId))}
                displayAmount={displayAmount}
              />
            );
          })
        )}
      </div>
      {visible < videoGroups.length && (
        <button className="show-more" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
          {t("showMore.label")}{" "}
          <span>
            {t("showMore.remaining", {
              count: videoGroups.length - visible,
            })}
          </span>
        </button>
      )}
    </section>
  );
}
