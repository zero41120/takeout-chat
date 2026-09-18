import { ArrowUpRight, Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { checkStreamHelper, useStreamInfo } from "./stream-info";

const CHROME_STORE =
  "https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en&pli=1";
const FIREFOX_STORE = "https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/";

function getBrowserStores() {
  const userAgent = navigator.userAgent;
  const isFirefox = /Firefox\//.test(userAgent);
  if (isFirefox) {
    return [{ name: "Firefox", url: FIREFOX_STORE }];
  }

  const isChrome = /Chrome\//.test(userAgent);
  const isMobile = /Mobile|Android/.test(userAgent);
  const canUseChromiumStore = isChrome && !isMobile;
  if (canUseChromiumStore) {
    const isEdge = /Edg\//.test(userAgent);
    const browserName = isEdge ? "Edge" : "Chrome";
    return [{ name: browserName, url: CHROME_STORE }];
  }

  return [
    { name: "Chrome", url: CHROME_STORE },
    { name: "Firefox", url: FIREFOX_STORE },
  ];
}

export function HelperSetup() {
  const { t } = useTranslation();
  const connected = useStreamInfo((state) => state.connected);
  const checking = useStreamInfo((state) => state.checking);
  const browserLinks = getBrowserStores();
  const installScriptUrl = `${import.meta.env.BASE_URL}takeout-chat-stream-info.user.js`;
  const dotClassName = connected ? "step-dot on" : "step-dot";
  const showRecheck = !connected;

  let connectionStatus = t("helper.notConnected");
  if (connected) {
    connectionStatus = t("helper.connected");
  } else if (checking) {
    connectionStatus = t("helper.checking");
  }

  return (
    <section className="takeout-step">
      <span className="takeout-step-head">
        <Puzzle size={14} />
        <b>02</b>
        <i>{t("takeout.step2.label")}</i>
        <span className="takeout-optional">{t("helper.optional")}</span>
      </span>
      <span className="takeout-step-body">
        <span className="takeout-step-text">{t("helper.hint")}</span>
        <span className="helper-links">
          {browserLinks.map((browser) => (
            <a key={browser.name} className="takeout-inline-link" href={browser.url} target="_blank" rel="noreferrer">
              {t("helper.extension", { browser: browser.name })}
              <ArrowUpRight size={11} />
            </a>
          ))}
        </span>
      </span>
      <a className="takeout-step-action" href={installScriptUrl} target="_blank" rel="noreferrer">
        <span className="action-label">{t("helper.install")}</span>
        <ArrowUpRight size={13} className="action-arrow" />
      </a>
      <span className="takeout-step-foot">
        <span className={dotClassName} />
        <span className="step-status">{connectionStatus}</span>
        {showRecheck && (
          <button
            type="button"
            className="helper-recheck"
            onClick={checkStreamHelper}
            disabled={checking}
            title={t("helper.connectionHint")}
          >
            {t("helper.recheck")}
          </button>
        )}
      </span>
    </section>
  );
}
