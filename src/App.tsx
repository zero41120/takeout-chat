import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityOverview } from "./ActivityOverview";
import "./App.css";
import { connectChannelHelper } from "./channel-info";
import { ChannelFilterPanel } from "./ChannelFilterPanel";
import { useChatExplorer } from "./chat-explorer-store";
import { ChatFeed } from "./ChatFeed";
import { buildChannelData, buildHeatData, buildTimelineData, computeSpending, filterMessages } from "./explorer-data";
import type { SupportedLanguage } from "./i18n";
import { connectStreamHelper } from "./stream-info";
import { TakeoutHeader } from "./TakeoutHeader";

const LOCALE_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  en_US: "en-US",
  zh_TW: "zh-TW",
};

function App() {
  const { i18n } = useTranslation();
  const locale = LOCALE_BY_LANGUAGE[i18n.language as SupportedLanguage] ?? LOCALE_BY_LANGUAGE.en_US;
  const messages = useChatExplorer((state) => state.messages);
  const displayCurrency = useChatExplorer((state) => state.displayCurrency);
  const filters = useChatExplorer((state) => state.filters);
  const videoMeta = useChatExplorer((state) => state.videoMeta);

  useEffect(() => connectStreamHelper(), []);
  useEffect(() => connectChannelHelper(), []);

  useEffect(() => {
    const lang = i18n.language === "zh_TW" ? "zh-TW" : "en";
    document.documentElement.lang = lang;
    document.documentElement.setAttribute("data-lang", i18n.language);
  }, [i18n.language]);

  const { filtered, forChannelData, forTimelineData, forHeatData } = useMemo(
    () => filterMessages(messages, filters, videoMeta),
    [messages, filters, videoMeta],
  );
  const channelData = useMemo(() => buildChannelData(forChannelData, videoMeta), [forChannelData, videoMeta]);
  const timelineData = useMemo(
    () => buildTimelineData(messages, forTimelineData, locale),
    [messages, forTimelineData, locale],
  );
  const heatData = useMemo(() => buildHeatData(forHeatData), [forHeatData]);
  const spending = useMemo(() => computeSpending(filtered, displayCurrency), [filtered, displayCurrency]);

  return (
    <main>
      <TakeoutHeader />
      <ActivityOverview
        locale={locale}
        filtered={filtered}
        videoMeta={videoMeta}
        channelData={channelData}
        displayCurrency={displayCurrency}
        spending={spending}
        timelineData={timelineData}
        heatData={heatData}
      />
      <div className="explorer-grid">
        <ChannelFilterPanel channelData={channelData} />
        <ChatFeed
          filtered={filtered}
          channelData={channelData}
          videoMeta={videoMeta}
          locale={locale}
          displayCurrency={displayCurrency}
        />
      </div>
    </main>
  );
}

export default App;
