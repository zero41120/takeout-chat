export type MessagePart = { type: "text"; value: string } | { type: "emoji"; url: string; alt: string };

export type Message = {
  id: string;
  authorId: string;
  authorName: string;
  timestamp: Date;
  price: number;
  currency: string;
  tokenCode: string;
  giftName: string;
  videoId: string;
  text: string;
  parts: MessagePart[];
  file: string;
};

export function isGift(message: Pick<Message, "tokenCode" | "giftName">) {
  return Boolean(message.tokenCode || message.giftName);
}

export function isSuperChat(message: Message) {
  return message.price > 0 && !isGift(message);
}

export function superChatTier(price: number) {
  if (price < 2) return 1;
  if (price < 5) return 2;
  if (price < 10) return 3;
  if (price < 20) return 4;
  if (price < 50) return 5;
  if (price < 100) return 6;
  return 7;
}
