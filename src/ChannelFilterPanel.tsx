import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { channelKey, hashColor, refreshChannelProfiles, useChannels } from "./channel-info";
import { ChannelAvatar } from "./ChannelAvatar";
import { toggleFilter, useChatExplorer } from "./chat-explorer-store";
import type { ChannelDatum } from "./explorer-data";
import { useStreamInfo } from "./stream-info";

type ChannelFilterPanelProps = {
  channelData: ChannelDatum[];
};

export function ChannelFilterPanel({ channelData }: ChannelFilterPanelProps) {
  const { t } = useTranslation();
  const messages = useChatExplorer((state) => state.messages);
  const filters = useChatExplorer((state) => state.filters);
  const channelsBusy = useChannels((state) => state.busy);
  const connected = useStreamInfo((state) => state.connected);
  const maxChannel = Math.max(1, ...channelData.map((m) => m.count));

  return (
    <aside>
      <section className="panel channel-panel">
        <div className="section-title compact">
          <div>
            <span>{t("section.destinations.index")}</span>
            <h2>{t("section.destinations.title")}</h2>
          </div>
          {connected && (
            <button
              type="button"
              className="panel-action"
              onClick={refreshChannelProfiles}
              disabled={channelsBusy}
              title={t("channel.refresh")}
            >
              <RefreshCw size={14} className={channelsBusy ? "spin" : ""} />
            </button>
          )}
        </div>
        <div className="channel-list">
          {channelData.length ? (
            channelData.map((channel, index) => (
              <button
                key={channel.id}
                className={`channel ${filters.channel === channel.id ? "active" : ""}`}
                onClick={() => toggleFilter("channel", channel.id)}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <ChannelAvatar channel={channelKey(channel.id)} name={channel.name} size={34} />
                <span className="channel-info">
                  <b>{channel.name}</b>
                  <small>{t("channel.streams", { count: channel.streams.size })}</small>
                  <i>
                    <em
                      style={{
                        width: `${(channel.count / maxChannel) * 100}%`,
                        background: hashColor(channel.id),
                      }}
                    />
                  </i>
                </span>
                <strong>{channel.count}</strong>
              </button>
            ))
          ) : (
            <p className="empty-small">{messages.length ? t("channel.emptyFetch") : t("channel.emptyImport")}</p>
          )}
        </div>
      </section>
    </aside>
  );
}
