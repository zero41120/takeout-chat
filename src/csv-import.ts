import type { RawMessagePart } from "./app-types";
import { normalizeCurrency } from "./currency";
import { isGift, type Message, type MessagePart } from "./message";

function parseCSV(source: string) {
  const rows: { cells: string[]; line: number }[] = [];
  let line = 1;
  let rowStartLine = 1;
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "\n") line++;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push({ cells: row, line: rowStartLine });
      rowStartLine = line;
      row = [];
      value = "";
    } else value += char;
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push({ cells: row, line: rowStartLine });
  }
  return rows;
}

function parseSinglePart(part: RawMessagePart): MessagePart | null {
  const emoji = part.emoji;
  if (emoji?.customEmojiUrl) {
    const shortcut = emoji.shortcuts?.[0];
    const emojiAlt = shortcut || emoji.emojiId || "custom emoji";
    return {
      type: "emoji",
      url: emoji.customEmojiUrl,
      alt: emojiAlt,
    };
  }

  const emojiShortcut = emoji?.shortcuts?.[0];
  if (emojiShortcut) return { type: "text", value: emojiShortcut };
  if (part.text) return { type: "text", value: part.text };
  return null;
}

function stringifyPart(part: MessagePart): string {
  const isText = part.type === "text";
  if (isText) return part.value;

  const isGenericCustomEmoji = part.alt === "custom emoji";
  if (isGenericCustomEmoji) return "";
  return part.alt;
}

function messageContent(raw = ""): { text: string; parts: MessagePart[] } {
  const trimmed = raw.trim();
  const isEmpty = trimmed.length === 0;
  if (isEmpty) return { text: "", parts: [] };

  try {
    const wrappedJson = `[${raw}]`;
    const rawParts = JSON.parse(wrappedJson) as RawMessagePart[];
    const parsedParts: MessagePart[] = [];

    for (const rawPart of rawParts) {
      const parsedPart = parseSinglePart(rawPart);
      if (parsedPart) {
        parsedParts.push(parsedPart);
      }
    }

    const textSegments = parsedParts.map(stringifyPart);
    const fullText = textSegments.join("");
    return { text: fullText, parts: parsedParts };
  } catch {
    const fallbackText = raw.replace(/\{"text":"([^"]*)"\}/g, "$1");
    return { text: fallbackText, parts: [{ type: "text", value: fallbackText }] };
  }
}

export function parseFile(source: string, fileName: string): Message[] {
  const rows = parseCSV(source);
  if (rows.length < 2) return [];
  const header = rows[0].cells.map((h) => h.trim().toLowerCase());
  const at = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const id = at("live chat id", "id");
  const channel = at("channel id");
  const channelName = at("channel name", "author name", "author");
  const timestamp = at("live chat create timestamp", "timestamp", "published at");
  const price = at("price", "amount");
  const currency = at("currency code", "currency");
  const token = at("token code");
  const gift = at("gift name");
  const video = at("video id");
  const text = at("live chat text", "message", "text");
  const missingCurrencies: {
    file: string;
    line: number;
    rawPrice: string;
    parsedAmount: number;
    reason: string;
  }[] = [];
  const messages = rows.slice(1).flatMap(({ cells: row, line }, index) => {
    const date = new Date(row[timestamp]);
    if (!row[channel] || Number.isNaN(date.getTime())) return [];
    const authorId = row[channel];
    const rawPrice = Math.max(0, Number(row[price]) || 0);
    const parsedAmount = rawPrice >= 10_000 ? rawPrice / 1_000_000 : rawPrice;
    const currencyCode = normalizeCurrency(row[currency] || "");
    const tokenCode = (row[token] || "").trim();
    const giftName = (row[gift] || "").trim();
    if (parsedAmount > 0 && !currencyCode && !isGift({ tokenCode, giftName })) {
      missingCurrencies.push({
        file: fileName,
        line,
        rawPrice: row[price],
        parsedAmount,
        reason: currency < 0 ? "Currency column not found" : "Currency is blank",
      });
    }
    const content = messageContent(row[text]);
    return [
      {
        id: row[id] || `${fileName}-${index}`,
        authorId,
        authorName: row[channelName] || "You",
        timestamp: date,
        price: parsedAmount,
        currency: currencyCode,
        tokenCode,
        giftName,
        videoId: (row[video] || "unknown").trim(),
        text: content.text,
        parts: content.parts,
      },
    ];
  });
  if (missingCurrencies.length) {
    console.info("[CSV import] Paid records with missing currency (1-based file lines):");
    console.table(missingCurrencies);
  }
  return messages;
}
