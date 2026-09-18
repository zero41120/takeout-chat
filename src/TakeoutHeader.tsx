import { ArrowUpRight, ChevronRight, Download, FolderOpen, RefreshCw, Upload, Video } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EMPTY_FILTERS, setDisplayCurrency, setFilters, setMessages, useChatExplorer } from "./chat-explorer-store";
import { DISPLAY_CURRENCIES, TWD_PER_USD } from "./currency";
import { parseFile } from "./csv-import";
import { HelperSetup } from "./HelperSetup";
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES, type SupportedLanguage } from "./i18n";
import { clearChatSelection } from "./stream-info";
import { useVideoMetadata } from "./useVideoMetadata";

const LANGUAGE_LABEL: Record<SupportedLanguage, string> = {
  en_US: "EN",
  zh_TW: "繁",
};

export function TakeoutHeader() {
  const { t, i18n } = useTranslation();
  const messages = useChatExplorer((state) => state.messages);
  const displayCurrency = useChatExplorer((state) => state.displayCurrency);
  const { videoMeta, enriching, enrichStatus, pendingVideoIds, hydrateFromCache, enrichVideos } = useVideoMetadata();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasMessages = messages.length > 0;
  const hasNoMessages = !hasMessages;
  const hasPendingVideoIds = pendingVideoIds.length > 0;
  const hasNoPendingVideoIds = !hasPendingVideoIds;
  const videoMetadataCount = Object.keys(videoMeta).length;
  const hasCachedVideoMetadata = videoMetadataCount > 0;
  const isFetchDisabled = hasNoMessages || enriching || hasNoPendingVideoIds;
  const isEnrichmentReady = hasMessages && hasNoPendingVideoIds;

  const getEnrichActionLabel = () => {
    if (hasNoMessages) return t("enrich.needsData");
    if (enriching) return t("enrich.fetchingLabel");
    if (hasNoPendingVideoIds) return t("enrich.allCached");
    if (hasCachedVideoMetadata) return t("enrich.fetchRemaining");
    return t("enrich.fetchAll");
  };

  const getEnrichStatus = () => {
    if (enriching) return enrichStatus;
    if (hasNoMessages) return t("enrich.waiting");
    if (hasPendingVideoIds) return t("enrich.pending", { count: pendingVideoIds.length });
    return t("enrich.ready");
  };

  const openFilePicker = () => {
    const fileInput = inputRef.current;
    if (!fileInput) return;
    fileInput.click();
  };

  const setLanguage = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  };

  const loadFiles = async (list: FileList | File[]) => {
    const selectedFiles = Array.from(list);
    const csvFiles = selectedFiles.filter((file) => file.name.toLowerCase().endsWith(".csv"));
    if (!csvFiles.length) {
      setSourceLabel(t("status.noCsv"));
      return;
    }

    setLoading(true);
    try {
      const fileContentPromises = csvFiles.map(async (file) => ({
        name: file.name,
        content: await file.text(),
      }));
      const fileContents = await Promise.all(fileContentPromises);
      const parsedFiles = fileContents.map(({ content, name }) => parseFile(content, name));
      const parsedMessages = parsedFiles.flat();
      const messageEntries = parsedMessages.map((message) => [message.id, message] as const);
      const messagesById = new Map(messageEntries);
      const uniqueMessages = Array.from(messagesById.values());

      setMessages(uniqueMessages);
      clearChatSelection();
      const videoIds = uniqueMessages.map((message) => message.videoId);
      const cacheCount = hydrateFromCache(videoIds);
      setFilters(EMPTY_FILTERS);

      const statusParts = [
        t("status.files", { count: csvFiles.length }),
        t("status.rows", { count: uniqueMessages.length }),
      ];
      if (cacheCount) statusParts.push(t("status.cached", { count: cacheCount }));
      setSourceLabel(statusParts.join(" · "));
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="hero-header">
      <div className="header-top">
        <div className="lang-switch" title={t("currency.rate", { rate: TWD_PER_USD })}>
          {DISPLAY_CURRENCIES.map((currency) => (
            <button
              key={currency}
              type="button"
              className={displayCurrency === currency ? "active" : ""}
              onClick={() => setDisplayCurrency(currency)}
            >
              {currency}
            </button>
          ))}
        </div>
        <div className="lang-switch">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              className={i18n.language === lang ? "active" : ""}
              onClick={() => setLanguage(lang)}
            >
              {LANGUAGE_LABEL[lang]}
            </button>
          ))}
        </div>
      </div>
      <div className="hero-copy">
        <h1>
          {t("hero.title1")}
          <br />
          <span>{t("hero.title2")}</span>
        </h1>
      </div>
      <div className="takeout-flow">
        <p className="takeout-flow-title">{t("takeout.title")}</p>
        <div className="takeout-steps">
          <a
            className="takeout-step"
            href="https://takeout.google.com/?pli=1#:~:text=YouTube%20and%20YouTube%20Music,-Watch"
            target="_blank"
            rel="noreferrer"
          >
            <span className="takeout-step-head">
              <Download size={14} />
              <b>01</b>
              <i>{t("takeout.step1.label")}</i>
            </span>
            <span className="takeout-step-body">
              <span className="takeout-step-text">{t("takeout.step1.text")}</span>
            </span>
            <span className="takeout-step-action">
              <span className="action-label">{t("takeout.linkLabel")}</span>
              <ArrowUpRight size={13} className="action-arrow" />
            </span>
            <span className="takeout-step-foot">
              <span className="step-dot" />
              <span className="step-status">{t("takeout.step1.foot")}</span>
            </span>
          </a>
          <ChevronRight className="takeout-arrow" size={16} />
          <HelperSetup />
          <ChevronRight className="takeout-arrow" size={16} />
          <div
            className={`takeout-step takeout-step-primary takeout-step-drop ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              loadFiles(e.dataTransfer.files);
            }}
            onClick={openFilePicker}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              openFilePicker();
            }}
          >
            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={(e) => {
                const files = e.target.files;
                if (!files) return;
                loadFiles(files);
              }}
            />
            <span className="takeout-step-head">
              <FolderOpen size={14} />
              <b>03</b>
              <i>{t("takeout.step3.label")}</i>
            </span>
            <span className="takeout-step-body">
              <span className="takeout-step-text">{t("drop.hint")}</span>
            </span>
            <span className="takeout-step-action primary">
              <Upload size={14} />
              <span className="action-label">{loading ? t("drop.processing") : t("drop.cta")}</span>
            </span>
            <span className="takeout-step-foot">
              <span className={`step-dot${hasMessages ? " on" : ""}`} />
              <span className="step-status" title={sourceLabel ?? undefined}>
                {sourceLabel ?? t("status.noData")}
              </span>
            </span>
          </div>
          <ChevronRight className="takeout-arrow" size={16} />
          <button
            type="button"
            className="takeout-step takeout-step-primary takeout-step-fetch"
            onClick={enrichVideos}
            disabled={isFetchDisabled}
            title={t("enrich.hint")}
          >
            <span className="takeout-step-head">
              <Video size={14} />
              <b>04</b>
              <i>{t("takeout.step4.label")}</i>
            </span>
            <span className="takeout-step-body">
              <span className="takeout-step-text">{t("takeout.step4.text")}</span>
            </span>
            <span className="takeout-step-action primary">
              {enriching ? <RefreshCw size={14} className="spin" /> : <Video size={14} />}
              <span className="action-label">{getEnrichActionLabel()}</span>
            </span>
            <span className="takeout-step-foot">
              <span className={`step-dot${isEnrichmentReady ? " on" : ""}`} />
              <span className="step-status">{getEnrichStatus()}</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
