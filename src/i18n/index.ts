import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en_US from "./locales/en_US";
import zh_TW from "./locales/zh_TW";

export const LANGUAGE_STORAGE_KEY = "chat-explorer-language";
export const SUPPORTED_LANGUAGES = ["en_US", "zh_TW"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function isSupportedLanguage(lang: string | null): lang is SupportedLanguage {
  if (!lang) return false;
  const isSupported = (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
  return isSupported;
}

function storedLanguage(): SupportedLanguage {
  const rawValue = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  const isValidLanguage = isSupportedLanguage(rawValue);
  if (isValidLanguage) return rawValue;
  return "en_US";
}

function applyDocumentLanguage(lang: string): void {
  const isBrowser = typeof document !== "undefined";
  if (!isBrowser) return;
  const langCode = lang === "zh_TW" ? "zh-TW" : "en";
  document.documentElement.lang = langCode;
  document.documentElement.setAttribute("data-lang", lang);
}

const initialLanguage = storedLanguage();
applyDocumentLanguage(initialLanguage);

const resources = {
  en_US: { translation: en_US },
  zh_TW: { translation: zh_TW },
};

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "en_US",
  keySeparator: false,
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  applyDocumentLanguage(lng);
});

export default i18n;
