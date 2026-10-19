(function () {
  "use strict";

  const MIN_SIZE = 100;
  const ROOT_ID = "imagegrab-root";
  const SKIP_URL_RE =
    /(favicon|sprite|loading\.gif|placeholder|blank\.gif|spacer|captcha|qrcode|emoji|ck\.gif|search\.gif|s\.gif|1x1|pixel\.png)/i;
  const SKIP_PATH_RE = /(\/icon(?:s)?\/|\/icons\/|\/avatar\/|\/emoticon\/)/i;
  const LAZY_ATTRS = [
    "src",
    "data-src",
    "data-lazy-src",
    "data-original",
    "data-ks-lazyload",
    "data-lazy",
    "data-lazy-img",
    "data-lazyload-src",
    "data-img",
    "data-url",
    "data-image",
    "data-big",
    "data-pic"
  ];

  let toastTimer = null;

  init();

  function init() {
    syncButton();
    window.addEventListener("load", syncButton);
    window.addEventListener("popstate", syncButton);
    window.addEventListener("hashchange", syncButton);

    let lastHref = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        syncButton();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function syncButton() {
    if (!isProductPage(location.href)) {
      removeButton();
      return;
    }
    renderButton();
  }

  function isProductPage(href) {
    let url;
    try {
      url = new URL(href);
    } catch (_error) {
      return false;
    }

    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    const search = url.search;

    if (hostEndsWith(host, "taobao.com") || hostEndsWith(host, "tmall.com") || hostEndsWith(host, "tmall.hk")) {
      if (/\/item\.htm/i.test(path) || /\/item\.html/i.test(path)) {
        return true;
      }
      if (host.startsWith("detail.") && (/item/i.test(path) || /[?&]id=\d+/.test(search))) {
        return true;
      }
      return false;
    }

    if (hostEndsWith(host, "jd.com") || hostEndsWith(host, "jd.hk")) {
      if (/\/\d+\.html/i.test(path) || /\/product\/\d+/i.test(path)) {
        return host.startsWith("item.") || host.startsWith("npcitem.") || host.startsWith("product.") || /item|product/i.test(host + path);
      }
      return /[?&]sku=\d+/.test(search) && /item|product/i.test(host);
    }

    if (hostEndsWith(host, "pinduoduo.com") || hostEndsWith(host, "yangkeduo.com")) {
      if (/goods\.html/i.test(path) || /goods2\.html/i.test(path)) {
        return true;
      }
      if (/[?&]goods_id=/.test(search)) {
        return true;
      }
      if (/goods_detail|goods\/edit|product\/detail|commodity\/detail/i.test(path)) {
        return true;
      }
      return host.startsWith("mobile.") && /\/goods/i.test(path);
    }

    return false;
  }

  function hostEndsWith(host, domain) {
    return host === domain || host.endsWith("." + domain);
  }

  function renderButton() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "imagegrab-button";
      button.textContent = "获取图片";
      button.addEventListener("click", onExtractClick);
      root.appendChild(button);
      document.documentElement.appendChild(root);
    }
    root.hidden = false;
  }

  function removeButton() {
    const root = document.getElementById(ROOT_ID);
    if (root) {
      root.remove();
    }
  }

  function onExtractClick(event) {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "提取中…";

    try {
      const result = collectImages();
      if (!result.images.length) {
        const message = result.unloadedCount
          ? "暂未提取到可用商品图。页面上仍有未加载图片，请先滚动页面加载后再试。"
          : "当前页面没有提取到符合条件的商品图。";
        showToast(message);
        return;
      }

      const hint = result.unloadedCount
        ? "部分图片可能尚未加载。若结果偏少，请回到商品页继续滚动后再提取。"
        : "";

      chrome.runtime.sendMessage(
        {
          type: "OPEN_GALLERY",
          images: result.images,
          pageUrl: location.href,
          pageTitle: document.title || "",
          hint
        },
        (response) => {
          if (chrome.runtime.lastError) {
            showToast("无法打开预览页：" + chrome.runtime.lastError.message);
            return;
          }
          if (!response || !response.ok) {
            showToast("无法打开预览页：" + ((response && response.error) || "未知错误"));
          }
        }
      );
    } catch (error) {
      showToast("提取失败：" + (error && error.message ? error.message : String(error)));
    } finally {
      button.disabled = false;
      button.textContent = "获取图片";
    }
  }

  function collectImages() {
    const found = new Map();
    let unloadedCount = 0;
    const lazySelector = LAZY_ATTRS.filter((attr) => attr !== "src")
      .map((attr) => "[" + attr + "]")
      .join(",");

    document.querySelectorAll("img").forEach((img) => {
      const urls = collectFromElement(img);
      const naturalW = img.naturalWidth || 0;
      const naturalH = img.naturalHeight || 0;
      const hasSource = Boolean(
        img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-lazy-src")
      );
      const notLoaded = hasSource && naturalW === 0 && naturalH === 0;

      if (notLoaded) {
        unloadedCount += 1;
      }

      urls.forEach((url) => {
        addCandidate(found, url, {
          width: naturalW,
          height: naturalH,
          loaded: naturalW > 0 && naturalH > 0
        });
      });
    });

    document.querySelectorAll(lazySelector).forEach((el) => {
      if (el.tagName === "IMG") {
        return;
      }
      collectFromElement(el).forEach((url) => addCandidate(found, url, { width: 0, height: 0, loaded: false }));
    });

    document.querySelectorAll("source[srcset], img[srcset]").forEach((el) => {
      parseSrcset(el.getAttribute("srcset")).forEach((url) => {
        addCandidate(found, url, { width: 0, height: 0, loaded: false });
      });
    });

    document.querySelectorAll('[style*="background"], [style*="url("]').forEach((el) => {
      extractBackgroundUrls(el, false).forEach((url) => {
        addCandidate(found, url, { width: 0, height: 0, loaded: false });
      });
    });

    collectComputedBackgrounds(found);

    const images = Array.from(found.values()).filter((item) => {
      if (item.loaded && (item.width < MIN_SIZE || item.height < MIN_SIZE)) {
        return false;
      }
      return true;
    });

    return { images, unloadedCount };
  }

  function collectComputedBackgrounds(found) {
    const nodes = document.querySelectorAll("div, li, a, span, p, td, section");
    const limit = Math.min(nodes.length, 600);
    for (let i = 0; i < limit; i += 1) {
      const el = nodes[i];
      const rect = el.getBoundingClientRect();
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
        continue;
      }
      extractBackgroundUrls(el, true).forEach((url) => {
        addCandidate(found, url, { width: 0, height: 0, loaded: false });
      });
    }
  }

  function collectFromElement(el) {
    const urls = [];
    LAZY_ATTRS.forEach((attr) => {
      const value = el.getAttribute(attr);
      if (value) {
        urls.push(value);
      }
    });
    if (el.currentSrc) {
      urls.push(el.currentSrc);
    }
    const srcset = el.getAttribute("srcset");
    if (srcset) {
      parseSrcset(srcset).forEach((url) => urls.push(url));
    }
    return urls;
  }

  function extractBackgroundUrls(el, useComputed) {
    const urls = [];
    pushBackgroundUrls(el.getAttribute("style") || "", urls);
    if (useComputed) {
      try {
        pushBackgroundUrls(getComputedStyle(el).backgroundImage, urls);
      } catch (_error) {
        // ignore computed style failures
      }
    }
    return urls;
  }

  function pushBackgroundUrls(value, urls) {
    if (!value || value === "none") {
      return;
    }
    const re = /url\((['"]?)(.*?)\1\)/g;
    let match;
    while ((match = re.exec(value))) {
      urls.push(match[2]);
    }
  }

  function parseSrcset(srcset) {
    if (!srcset) {
      return [];
    }
    return srcset
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function addCandidate(found, rawUrl, meta) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized || found.has(normalized)) {
      if (normalized && found.has(normalized) && meta.loaded) {
        const existing = found.get(normalized);
        existing.width = Math.max(existing.width || 0, meta.width || 0);
        existing.height = Math.max(existing.height || 0, meta.height || 0);
        existing.loaded = true;
      }
      return;
    }
    if (shouldSkip(normalized)) {
      return;
    }
    found.set(normalized, {
      url: normalized,
      width: meta.width || 0,
      height: meta.height || 0,
      loaded: Boolean(meta.loaded)
    });
  }

  function normalizeUrl(rawUrl) {
    if (!rawUrl) {
      return "";
    }
    let value = String(rawUrl).trim().replace(/^['"]|['"]$/g, "");
    if (!value || value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("javascript:")) {
      return "";
    }
    if (value.startsWith("//")) {
      value = location.protocol + value;
    }

    let resolved;
    try {
      resolved = new URL(value, location.href);
    } catch (_error) {
      return "";
    }

    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return "";
    }

    return upgradeImageUrl(resolved.href);
  }

  function upgradeImageUrl(url) {
    let next = url;

    next = next.replace(/_\d+x\d+(q\d+)?\.(jpg|jpeg|png|gif|webp|bmp)(?=$|[?#])/gi, "");
    next = next.replace(/_\.webp(?=$|[?#])/i, "");
    next = next.replace(/\.jpg_\.webp/i, ".jpg");
    next = next.replace(/\.png_\.webp/i, ".png");
    next = next.replace(/\.(jpe?g|png|gif|webp)\.avif(?=$|[?#])/i, ".$1");
    next = next.replace(/\.(jpe?g|png|gif)\.webp(?=$|[?#])/i, ".$1");
    next = next.replace(/\.dpg(?=$|[?#])/i, ".jpg");

    next = next.replace(/\/n[1-9]\//i, "/n0/");
    next = next.replace(/\/s\d+x\d+_/i, "/");
    next = next.replace(/\/n\d+\/s\d+x\d+_/i, "/n0/");

    return next;
  }

  function shouldSkip(url) {
    if (SKIP_URL_RE.test(url) || SKIP_PATH_RE.test(url)) {
      return true;
    }
    return /\.svg(?:$|[?#])/i.test(url);
  }

  function showToast(text) {
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }
    let toast = root.querySelector(".imagegrab-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "imagegrab-toast";
      root.appendChild(toast);
    }
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 4200);
  }
})();
