import { create } from "zustand";
import type { Filters, VideoResult } from "./app-types";
import type { DisplayCurrency } from "./currency";
import type { Message } from "./message";

export const EMPTY_FILTERS: Filters = {
  channel: null,
  month: null,
  cell: null,
  superOnly: false,
  query: "",
};

const CURRENCY_STORAGE_KEY = "chat-explorer-currency";

function storedCurrency(): DisplayCurrency {
  try {
    return localStorage.getItem(CURRENCY_STORAGE_KEY) === "TWD" ? "TWD" : "USD";
  } catch {
    return "USD";
  }
}

type ChatExplorerState = {
  messages: Message[];
  filters: Filters;
  displayCurrency: DisplayCurrency;
  videoMeta: Record<string, VideoResult | null>;
};

export const useChatExplorer = create<ChatExplorerState>(() => ({
  messages: [],
  filters: EMPTY_FILTERS,
  displayCurrency: storedCurrency(),
  videoMeta: {},
}));

export function setMessages(messages: Message[]) {
  useChatExplorer.setState({ messages });
}

export function setFilters(update: Filters | ((filters: Filters) => Filters)) {
  useChatExplorer.setState((state) => ({
    filters: typeof update === "function" ? (update as (filters: Filters) => Filters)(state.filters) : update,
  }));
}

export function setDisplayCurrency(displayCurrency: DisplayCurrency) {
  useChatExplorer.setState({ displayCurrency });
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, displayCurrency);
  } catch {}
}

export function setVideoMeta(videoMeta: Record<string, VideoResult | null>) {
  useChatExplorer.setState({ videoMeta });
}

export function toggleFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
  useChatExplorer.setState((state) => {
    const previousFilters = state.filters;
    const isAlreadyActive = previousFilters[key] === value;
    if (isAlreadyActive) {
      const isBooleanField = typeof value === "boolean";
      const fallbackValue = isBooleanField ? false : null;
      return { filters: { ...previousFilters, [key]: fallbackValue } };
    }
    return { filters: { ...previousFilters, [key]: value } };
  });
}

export function clearFilter(key: keyof Filters) {
  useChatExplorer.setState((state) => ({ filters: { ...state.filters, [key]: EMPTY_FILTERS[key] } }));
}
