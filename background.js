const SESSION_KEY = "imagegrabSession";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
    });
  return true;
});

async function handleMessage(message) {
  switch (message && message.type) {
    case "OPEN_GALLERY":
      return openGallery(message);
    case "GET_SESSION":
      return getSession();
    case "FETCH_IMAGE":
      return fetchImage(message.url);
    case "DOWNLOAD_PNG":
      return downloadPng(message.filename, message.buffer, message.base64);
    default:
      throw new Error("未知消息类型");
  }
}

async function openGallery(payload) {
  const session = {
    images: Array.isArray(payload.images) ? payload.images : [],
    pageUrl: payload.pageUrl || "",
    pageTitle: payload.pageTitle || "",
    hint: payload.hint || "",
    createdAt: Date.now()
  };
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  await chrome.tabs.create({ url: chrome.runtime.getURL("gallery.html") });
  return { ok: true };
}

async function getSession() {
  const data = await chrome.storage.session.get(SESSION_KEY);
  return { ok: true, session: data[SESSION_KEY] || null };
}

async function fetchImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("无效的图片地址");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-cache",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("空响应");
    }

    const contentType = response.headers.get("content-type") || "";
    const bytes = new Uint8Array(buffer);
    if (looksLikeHtml(bytes, contentType)) {
      throw new Error("服务器返回了网页而不是图片（可能被防盗链拦截）");
    }

    return {
      ok: true,
      base64: uint8ToBase64(bytes),
      contentType
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadPng(filename, buffer, base64) {
  if (!filename) {
    throw new Error("缺少文件名");
  }

  const bytes = base64 ? base64ToUint8(base64) : toUint8Array(buffer);
  if (!bytes || !bytes.length) {
    throw new Error("缺少图片数据");
  }
  const blob = new Blob([bytes], { type: "image/png" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const downloadId = await chrome.downloads.download({
      url: objectUrl,
      filename,
      saveAs: false,
      conflictAction: "uniquify"
    });
    waitAndRevoke(objectUrl, downloadId);
    return { ok: true, downloadId };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function looksLikeHtml(bytes, contentType) {
  if (/text\/html/i.test(contentType || "")) {
    return true;
  }
  const head = Array.from(bytes.slice(0, 16));
  const text = String.fromCharCode.apply(null, head).replace(/^\uFEFF/, "").trim().toLowerCase();
  return text.startsWith("<!doctype") || text.startsWith("<html") || text.startsWith("<head");
}

function uint8ToBase64(bytes) {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toUint8Array(buffer) {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer);
  }
  if (Array.isArray(buffer)) {
    return Uint8Array.from(buffer);
  }
  if (buffer && buffer.data) {
    return toUint8Array(buffer.data);
  }
  return new Uint8Array(buffer);
}

function waitAndRevoke(objectUrl, downloadId) {
  const timeoutId = setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    chrome.downloads.onChanged.removeListener(onChanged);
  }, 120000);

  function onChanged(delta) {
    if (delta.id !== downloadId) {
      return;
    }
    if (delta.state && (delta.state.current === "complete" || delta.state.current === "interrupted")) {
      URL.revokeObjectURL(objectUrl);
      chrome.downloads.onChanged.removeListener(onChanged);
      clearTimeout(timeoutId);
    }
  }

  chrome.downloads.onChanged.addListener(onChanged);
}
