import { useState, type CSSProperties } from "react";
import { avatarUrl, hashColor, useChannelProfile } from "./channel-info";

type ChannelAvatarProps = {
  channel: string | null;
  name: string;
  size?: number;
  className?: string;
};

type AvatarStyle = CSSProperties & { "--avatar-size": string };

export function ChannelAvatar({ channel, name, size = 32, className = "" }: ChannelAvatarProps) {
  const profile = useChannelProfile(channel);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const profileName = profile?.name;
  const fallbackName = name || "?";
  const displayName = profileName || fallbackName;
  const label = displayName.slice(0, 1).toUpperCase();
  const box: AvatarStyle = { "--avatar-size": `${size}px` };
  const colorKey = channel || name;
  const fallback = (
    <span className={`avatar ${className}`.trim()} style={{ ...box, color: hashColor(colorKey) }}>
      {label}
    </span>
  );

  const avatar = profile?.avatar;
  let source: string | null = null;
  if (avatar) source = avatarUrl(avatar, size * 2);
  if (!source) return fallback;

  const isFailedSource = failedAvatarUrl === source;
  if (isFailedSource) return fallback;

  return (
    <img
      className={`avatar avatar-photo ${className}`.trim()}
      style={box}
      src={source}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedAvatarUrl(source)}
    />
  );
}
