// ==UserScript==
// @name         Takeout Chat Stream Helper
// @namespace    takeout-chat
// @version      0.4.2
// @description  Returns YouTube stream timing and channel profile metadata requested by Chat History Explorer.
// @match        https://zero41120.github.io/*
// @match        http://localhost/*
// @match        http://127.0.0.1/*
// @grant        GM_xmlhttpRequest
// @connect      youtube.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const NAMESPACE = "takeout-chat:stream-info:v1";
  const VERSION = "0.4.2";
  const REQUEST_EVENT = `${NAMESPACE}:request`;
  const RESPONSE_EVENT = `${NAMESPACE}:response`;
  const REQUEST_TIMEOUT_MS = 15000;
  const MAX_DETAIL_LENGTH = 4096;
  const MAX_REQUEST_ID_LENGTH = 100;

  const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
  const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
  const NAME_CHARS = "[\\p{L}\\p{M}\\p{N}._-]";
  const HANDLE = new RegExp(`^@${NAME_CHARS}{2,48}$`, "u");
  const CHANNEL_KEY = new RegExp(`^(?:UC[A-Za-z0-9_-]{22}|@${NAME_CHARS}{2,48}|(?:user|c)/${NAME_CHARS}{1,64})$`, "u");
  const PLAYER_RESPONSE_ASSIGNMENT = /\bytInitialPlayerResponse(?:["']\])?\s*=\s*/g;
  const HELPER_MARKER = 'meta[name="takeout-chat-helper"][content="stream-info-v1"]';

  // Main entry reads as a sequence of intentional steps
  function start() {
    const isHelperPage = Boolean(document.querySelector(HELPER_MARKER));
    if (!isHelperPage) return; // Guard clause keeps the rest of the script unindented
    document.addEventListener(REQUEST_EVENT, handleRequest);
    console.info(`[Takeout Chat helper] v${VERSION} started`);
    sendReady();
  }

  // --- messaging ---

  function send(data) {
    const payload = JSON.stringify({ namespace: NAMESPACE, ...data }); // Build the new state before the side effect
    const response = new CustomEvent(RESPONSE_EVENT, { detail: payload });
    document.dispatchEvent(response);
  }

  function sendReady() {
    send({ type: "ready", version: VERSION });
  }

  function failureResult(error, status) {
    if (!status) return { ok: false, error };
    return { ok: false, error, status };
  }

  // --- request routing ---

  function handleRequest(event) {
    const detail = event.detail;
    const isString = typeof detail === "string";
    const isWithinLimit = isString && detail.length <= MAX_DETAIL_LENGTH; // Named boolean instead of a compound condition in the branch
    if (!isWithinLimit) return;
    const request = safely(() => JSON.parse(detail));
    if (request?.namespace !== NAMESPACE) return;
    if (request.type === "probe") return sendReady();
    if (request.type === "channel") return handleChannelRequest(request);
    if (request.type === "request") return handleVideoRequest(request);
  }

  function isValidRequestId(value) {
    const isString = typeof value === "string";
    if (!isString) return false;
    const isWithinLimit = value.length > 0 && value.length <= MAX_REQUEST_ID_LENGTH;
    return isWithinLimit;
  }

  function handleChannelRequest(request) {
    const hasRequestId = isValidRequestId(request.requestId);
    const isChannelKey = typeof request.channel === "string";
    const isKnownChannel = isChannelKey && CHANNEL_KEY.test(request.channel);
    if (!hasRequestId || !isKnownChannel) return;

    const { channel, requestId } = request;
    const answer = (result) => send({ type: "channel-result", requestId, channel, ...result });
    const failed = (error, status) => answer(failureResult(error, status));

    fetchHtml(channelUrl(channel), {
      onError: failed,
      onHtml(html) {
        const profile = safely(() => readChannelProfile(html));
        if (!profile) return failed("metadata-unavailable");
        answer({ ok: true, ...profile });
      },
    });
  }

  function handleVideoRequest(request) {
    const hasRequestId = isValidRequestId(request.requestId);
    const isVideoId = typeof request.videoId === "string";
    const isKnownVideo = isVideoId && VIDEO_ID.test(request.videoId);
    if (!hasRequestId || !isKnownVideo) return;

    const { videoId, requestId } = request;
    const reply = (result) => send({ type: "result", requestId, videoId, ...result });
    const fail = (error, status) => reply(failureResult(error, status));
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    fetchHtml(watchUrl, {
      onError: fail,
      onHtml(html) {
        const timing = safely(() => readStreamTiming(html, videoId));
        if (!timing) return fail("metadata-unavailable");
        reply({ ok: true, ...timing });
      },
    });
  }

  // --- fetching ---

  // Both request types share one transport: fetch HTML, or report why not
  function fetchHtml(url, { onHtml, onError }) {
    const settings = {
      method: "GET",
      url,
      timeout: REQUEST_TIMEOUT_MS,
      onload(response) {
        const isOk = response.status === 200;
        if (!isOk) return onError("http-error", response.status);
        onHtml(response.responseText);
      },
      ontimeout: () => onError("timeout"),
      onerror: () => onError("network-error"),
      onabort: () => onError("network-error"),
    };
    try {
      GM_xmlhttpRequest(settings);
    } catch {
      onError("network-error");
    }
  }

  function channelUrl(key) {
    if (CHANNEL_ID.test(key)) return `https://www.youtube.com/channel/${key}`;
    const isHandle = key.startsWith("@");
    if (isHandle) {
      const name = encodeURIComponent(key.slice(1));
      return `https://www.youtube.com/@${name}`;
    }
    const slash = key.indexOf("/"); // Legacy `user/name` and `c/name` keys
    const prefix = key.slice(0, slash);
    const name = encodeURIComponent(key.slice(slash + 1));
    return `https://www.youtube.com/${prefix}/${name}`;
  }

  // --- stream timing ---

  function readStreamTiming(html, videoId) {
    const player = findPlayerResponse(html);
    const isSameVideo = player?.videoDetails?.videoId === videoId;
    if (!isSameVideo) return null;
    const microformat = player.microformat?.playerMicroformatRenderer;
    if (!microformat) return null;
    const live = microformat.liveBroadcastDetails;
    return {
      startTimestamp: textOrNull(live?.startTimestamp),
      endTimestamp: textOrNull(live?.endTimestamp),
      uploadDate: textOrNull(microformat.uploadDate),
    };
  }

  function findPlayerResponse(html) {
    const assignments = [...html.matchAll(PLAYER_RESPONSE_ASSIGNMENT)];
    for (const assignment of assignments) {
      const objectStart = assignment.index + assignment[0].length;
      if (html[objectStart] !== "{") continue;
      const objectEnd = findObjectEnd(html, objectStart);
      if (objectEnd === -1) continue;
      const source = html.slice(objectStart, objectEnd + 1);
      const parsed = safely(() => JSON.parse(source));
      if (parsed) return parsed;
    }
    return null;
  }

  // Character scan: the closing brace of the object starting at `start`
  function findObjectEnd(html, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < html.length; index++) {
      const char = html[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") {
        depth++;
        continue;
      }
      if (char !== "}") continue;
      depth--;
      if (depth === 0) return index;
    }
    return -1;
  }

  // --- channel profile ---

  function readChannelProfile(html) {
    const name = metaContent(html, "property", "og:title");
    if (!name) return null;
    const image = metaContent(html, "property", "og:image");
    const channelId = readChannelId(html);
    const handle = readChannelHandle(html);
    return { name, avatar: image || null, channelId, handle };
  }

  function readChannelId(html) {
    const identifier = metaContent(html, "itemprop", "identifier");
    const channelIdMeta = metaContent(html, "itemprop", "channelId");
    const declared = identifier || channelIdMeta;
    if (CHANNEL_ID.test(declared || "")) return declared;
    const embedded = html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/); // Fall back to the id embedded in the page data
    if (!embedded) return null;
    return embedded[1];
  }

  function readChannelHandle(html) {
    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i);
    if (!canonical) return null;
    const handleMatch = canonical[1].match(/youtube\.com\/(@[^"/?#]+)/);
    if (!handleMatch) return null;
    const handle = safeDecode(handleMatch[1]);
    if (!HANDLE.test(handle)) return null;
    return handle;
  }

  function metaContent(html, attribute, name) {
    const attributeFirst = new RegExp(`<meta[^>]+${attribute}="${name}"[^>]+content="([^"]*)"[^>]*>`, "i");
    const attributeFirstTag = html.match(attributeFirst);
    if (attributeFirstTag) return decodeEntities(attributeFirstTag[1]);
    const contentFirst = new RegExp(`<meta[^>]+content="([^"]*)"[^>]+${attribute}="${name}"[^>]*>`, "i");
    const contentFirstTag = html.match(contentFirst);
    if (contentFirstTag) return decodeEntities(contentFirstTag[1]);
    return null;
  }

  // --- small helpers ---

  function safely(read) {
    try {
      return read();
    } catch {
      return null;
    }
  }

  function textOrNull(value) {
    if (typeof value !== "string") return null;
    return value;
  }

  function safeDecode(value) {
    const decoded = safely(() => decodeURIComponent(value));
    if (decoded === null) return value;
    return decoded;
  }

  function decodeEntities(value) {
    const area = document.createElement("textarea");
    area.innerHTML = value;
    return area.value;
  }

  start();
})();
