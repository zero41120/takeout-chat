import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TimelineItem, VideoResult } from "./app-types";
import { toggleFilter, useChatExplorer } from "./chat-explorer-store";
import { type DisplayCurrency, formatAmount } from "./currency";
import { type ChannelDatum, type SpendingSummary, streamChannelKey, WEEKDAY_KEYS } from "./explorer-data";
import { isSuperChat, type Message } from "./message";

const TIMELINE_PAGE_SIZE = 12;
const TIMELINE_SCROLL_THRESHOLD = 80;

type ActivityOverviewProps = {
  locale: string;
  filtered: Message[];
  videoMeta: Record<string, VideoResult | null>;
  channelData: ChannelDatum[];
  displayCurrency: DisplayCurrency;
  spending: SpendingSummary;
  timelineData: TimelineItem[];
  heatData: number[][];
};

export function ActivityOverview({
  locale,
  filtered,
  videoMeta,
  channelData,
  displayCurrency,
  spending,
  timelineData,
  heatData,
}: ActivityOverviewProps) {
  const { t } = useTranslation();
  const messages = useChatExplorer((state) => state.messages);
  const filters = useChatExplorer((state) => state.filters);
  const [timelineVisible, setTimelineVisible] = useState(TIMELINE_PAGE_SIZE);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineDrag = useRef<{ startX: number; scrollLeft: number; moved: boolean } | null>(null);
  const timelineJustDragged = useRef(false);

  useEffect(() => setTimelineVisible(TIMELINE_PAGE_SIZE), [messages]);

  const timelineDisplay = useMemo(() => [...timelineData].reverse(), [timelineData]);
  const visibleTimeline = useMemo(() => timelineDisplay.slice(0, timelineVisible), [timelineDisplay, timelineVisible]);

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    if (timelineVisible < timelineDisplay.length && el.scrollWidth <= el.clientWidth) {
      setTimelineVisible((v) => Math.min(timelineDisplay.length, v + TIMELINE_PAGE_SIZE));
    }
  }, [timelineVisible, timelineDisplay]);

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineVisible >= timelineDisplay.length) return;
    const el = e.currentTarget;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - TIMELINE_SCROLL_THRESHOLD) {
      setTimelineVisible((v) => Math.min(timelineDisplay.length, v + TIMELINE_PAGE_SIZE));
    }
  };

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = timelineRef.current;
    if (!el) return;
    timelineDrag.current = { startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
  };

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = timelineRef.current;
    const drag = timelineDrag.current;
    if (!el || !drag) return;
    const delta = e.clientX - drag.startX;
    if (Math.abs(delta) > 3 && !drag.moved) {
      drag.moved = true;
      el.setPointerCapture(e.pointerId);
    }
    if (drag.moved) el.scrollLeft = drag.scrollLeft - delta;
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = timelineRef.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    timelineJustDragged.current = Boolean(timelineDrag.current?.moved);
    timelineDrag.current = null;
  };

  const handleTimelineClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (timelineJustDragged.current) {
      e.preventDefault();
      e.stopPropagation();
      timelineJustDragged.current = false;
    }
  };

  const maxMonth = Math.max(1, ...timelineData.map((m) => (m.type === "month" ? m.count : 0)));
  const maxHeat = Math.max(1, ...heatData.flat());

  return (
    <>
      <section className="stats">
        {[
          [t("stats.totalMessages"), filtered.length.toLocaleString(locale)],
          [t("stats.distinctStreams"), new Set(filtered.map((m) => m.videoId)).size.toLocaleString(locale)],
          [
            t("stats.streamChannels"),
            channelData.length
              ? new Set(filtered.map((m) => streamChannelKey(m, videoMeta)).filter(Boolean)).size.toLocaleString(locale)
              : "—",
          ],
          [t("stats.superChats"), filtered.filter(isSuperChat).length.toLocaleString(locale)],
          [
            t("stats.totalSpent"),
            spending.included || !spending.excluded ? formatAmount(displayCurrency, spending.total, locale) : "—",
          ],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <p>{label}</p>
            <strong className={label === t("stats.totalSpent") ? "money" : ""}>{value}</strong>
            {label === t("stats.totalSpent") && spending.excluded > 0 && (
              <small className="spending-note">{t("currency.excluded", { count: spending.excluded })}</small>
            )}
          </div>
        ))}
      </section>

      <section className="panel timeline-panel">
        <div className="section-title">
          <div>
            <span>{t("section.time.index")}</span>
            <h2>{t("section.time.title")}</h2>
          </div>
        </div>
        <div className="activity-charts">
          <div
            className="timeline"
            ref={timelineRef}
            onScroll={handleTimelineScroll}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            onPointerUp={handleTimelinePointerUp}
            onPointerCancel={handleTimelinePointerUp}
            onClickCapture={handleTimelineClickCapture}
          >
            {visibleTimeline.length ? (
              visibleTimeline.map((item) => {
                if (item.type === "gap") {
                  const rangeLabel = item.monthsCount > 1 ? `${item.startLabel} – ${item.endLabel}` : item.startLabel;
                  return (
                    <div
                      key={item.key}
                      className="timeline-gap"
                      title={`${rangeLabel}: ${t("timeline.noChat")}${item.monthsCount > 1 ? ` (${item.monthsCount}m)` : ""}`}
                    >
                      <span className="gap-dash">—</span>
                      <i />
                      <span className="gap-text">{t("timeline.noChatLabel")}</span>
                    </div>
                  );
                }
                const [year, month] = item.key.split("-");
                return (
                  <button
                    key={item.key}
                    className={`month ${filters.month === item.key ? "active" : ""}`}
                    onClick={() => toggleFilter("month", item.key)}
                    title={`${item.label}: ${t("count.messages", { count: item.count })}`}
                  >
                    <b>{item.count}</b>
                    <i
                      style={{
                        height: `${Math.max(item.count ? 5 : 1, (item.count / maxMonth) * 100)}%`,
                      }}
                    />
                    <span>
                      {year}
                      <br />
                      {month}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="chart-placeholder">{t("chart.placeholder")}</div>
            )}
          </div>
          <section className="heat-panel">
            <div className="heat-title">
              <div>
                <h3>{t("section.rhythm.title")}</h3>
              </div>
            </div>
            <div className="heatmap-wrap">
              <div className="hour-labels">
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h}>{h % 6 === 0 ? String(h).padStart(2, "0") : ""}</span>
                ))}
              </div>
              {heatData.map((row, day) => (
                <div className="heat-row" key={day}>
                  <label>{t(WEEKDAY_KEYS[day])}</label>
                  <div>
                    {row.map((count, hour) => {
                      const key = `${day}-${hour}`;
                      return (
                        <button
                          key={key}
                          className={filters.cell === key ? "active" : ""}
                          style={
                            {
                              "--opacity": count ? Math.max(0.14, count / maxHeat) : 0.035,
                            } as React.CSSProperties
                          }
                          title={`${t(WEEKDAY_KEYS[day])} ${String(hour).padStart(2, "0")}:00 — ${t("count.messages", { count })}`}
                          onClick={() => toggleFilter("cell", key)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="heat-legend">
              <span>{t("heat.less")}</span>
              <i />
              <i />
              <i />
              <i />
              <span>{t("heat.more")}</span>
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
