import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setFilters, useChatExplorer } from "./chat-explorer-store";

const DEBOUNCE_MS = 200;

export function SearchBox() {
  const { t } = useTranslation();
  const storeQuery = useChatExplorer((state) => state.filters.query);
  const [draft, setDraft] = useState(storeQuery);

  useEffect(() => setDraft(storeQuery), [storeQuery]);

  useEffect(() => {
    const trimmed = draft.trim();
    const timer = window.setTimeout(() => {
      setFilters((previousFilters) =>
        previousFilters.query === trimmed ? previousFilters : { ...previousFilters, query: trimmed },
      );
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  return (
    <label className="search">
      <span>⌕</span>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("search.placeholder")} />
    </label>
  );
}
