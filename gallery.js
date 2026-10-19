(function () {
  "use strict";

  const MIN_SIZE = 100;

  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const hint = document.getElementById("hint");
  const filterNote = document.getElementById("filterNote");
  const source = document.getElementById("source");
  const selectAll = document.getElementById("selectAll");
  const invertBtn = document.getElementById("invertBtn");
  const selectedCount = document.getElementById("selectedCount");
  const downloadBtn = document.getElementById("downloadBtn");
  const progress = document.getElementById("progress");

  const items = [];
  let downloading = false;

  init();

  async function init() {
    const response = await sendMessage({ type: "GET_SESSION" });
    if (!response || !response.ok || !response.session || !response.session.images || !response.session.images.length) {
      empty.hidden = false;
      empty.textContent = "没有可显示的商品图。请从商品详情页点击“获取图片”。";
      downloadBtn.disabled = true;
      return;
    }

    const session = response.session;
    source.textContent = session.pageTitle ? session.pageTitle + " · " + session.pageUrl : session.pageUrl;
    if (session.hint) {
      hint.hidden = false;
      hint.textContent = session.hint;
    }

    session.images.forEach((image, index) => {
      items.push(createCard(image, index));
    });

    selectAll.addEventListener("change", () => {
      visibleItems().forEach((item) => {
        item.checkbox.checked = selectAll.checked;
      });
      refreshCount();
    });

    invertBtn.addEventListener("click", () => {
      visibleItems().forEach((item) => {
        item.checkbox.checked = !item.checkbox.checked;
      });
      refreshCount();
    });

    downloadBtn.addEventListener("click", () => {
      downloadSelected().catch((error) => {
        showProgress("下载失败：" + (error && error.message ? error.message : String(error)));
      });
    });

    refreshCount();
  }

  function createCard(image, index) {
    const card = document.createElement("label");
    card.className = "card";

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const img = document.createElement("img");
    img.alt = "商品图 " + String(index + 1);
    img.referrerPolicy = "no-referrer";
    img.src = image.url;
    thumb.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const size = document.createElement("span");
    size.className = "size";
    size.textContent = image.width && image.height ? image.width + " × " + image.height : "读取尺寸中…";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", refreshCount);
    meta.appendChild(size);
    meta.appendChild(checkbox);

    card.appendChild(thumb);
    card.appendChild(meta);
    grid.appendChild(card);

    const item = {
      url: image.url,
      width: image.width || 0,
      height: image.height || 0,
      qualified: true,
      card,
      checkbox,
      size,
      img
    };

    img.addEventListener("load", () => {
      item.width = img.naturalWidth || item.width;
      item.height = img.naturalHeight || item.height;
      applySizeFilter(item);
    });
    img.addEventListener("error", () => {
      item.size.textContent = "预览失败";
      item.qualified = true;
      refreshVisibility();
    });

    return item;
  }

  function applySizeFilter(item) {
    item.size.textContent = item.width + " × " + item.height;
    item.qualified = item.width >= MIN_SIZE && item.height >= MIN_SIZE;
    if (!item.qualified) {
      item.checkbox.checked = false;
    }
    refreshVisibility();
  }

  function refreshVisibility() {
    let hiddenCount = 0;
    items.forEach((item) => {
      if (item.qualified) {
        item.card.classList.remove("unqualified");
      } else {
        item.card.classList.add("unqualified");
        hiddenCount += 1;
      }
    });

    const visible = visibleItems();
    empty.hidden = visible.length > 0;
    empty.textContent = hiddenCount
      ? "未找到不小于 " + MIN_SIZE + "×" + MIN_SIZE + " 的商品图。请先滚动商品页加载大图后再提取。"
      : "没有可显示的商品图。";

    if (hiddenCount) {
      filterNote.hidden = false;
      filterNote.textContent = "已过滤 " + hiddenCount + " 张小于 " + MIN_SIZE + "×" + MIN_SIZE + " 的图标或占位图。";
    } else {
      filterNote.hidden = true;
    }

    refreshCount();
  }

  function visibleItems() {
    return items.filter((item) => item.qualified);
  }

  function selectedItems() {
    return visibleItems().filter((item) => item.checkbox.checked);
  }

  function refreshCount() {
    const selected = selectedItems().length;
    const visible = visibleItems().length;
    selectedCount.textContent = "已选 " + selected + " 张";
    selectAll.checked = visible > 0 && selected === visible;
    selectAll.indeterminate = selected > 0 && selected < visible;
    downloadBtn.disabled = downloading || selected === 0;
  }

  async function downloadSelected() {
    const targets = selectedItems();
    if (!targets.length || downloading) {
      return;
    }

    downloading = true;
    downloadBtn.disabled = true;
    const failures = [];
    let success = 0;

    for (let i = 0; i < targets.length; i += 1) {
      const filename = "商品图_" + String(i + 1).padStart(3, "0") + ".png";
      showProgress(
        "正在下载 " + (i + 1) + " / " + targets.length + "\n已成功 " + success + " 张，失败 " + failures.length + " 张"
      );

      try {
        const pngBlob = await urlToPngBlob(targets[i]);
        await savePngBlob(filename, pngBlob);
        success += 1;
      } catch (error) {
        failures.push(filename + "：" + (error && error.message ? error.message : String(error)));
      }
    }

    downloading = false;
    refreshCount();

    let text = "下载完成。成功 " + success + " 张，失败 " + failures.length + " 张。";
    if (failures.length) {
      text += "\n失败原因：\n" + failures.join("\n");
    }
    showProgress(text);
  }

  async function urlToPngBlob(item) {
    const blob = await loadImageBlob(item.url);
    const drawable = await decodeBlob(blob);
    const pngBlob = await drawableToPng(drawable);
    if (typeof drawable.close === "function") {
      drawable.close();
    }
    return pngBlob;
  }

  async function loadImageBlob(url) {
    const candidates = candidateUrls(url);
    const errors = [];

    for (let i = 0; i < candidates.length; i += 1) {
      try {
        return await fetchBlobDirect(candidates[i]);
      } catch (error) {
        errors.push(error && error.message ? error.message : String(error));
      }
    }

    for (let i = 0; i < candidates.length; i += 1) {
      try {
        return await fetchBlobViaWorker(candidates[i]);
      } catch (error) {
        errors.push(error && error.message ? error.message : String(error));
      }
    }

    throw new Error(errors[errors.length - 1] || "无法获取图片");
  }

  async function fetchBlobDirect(url) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-cache",
      referrerPolicy: "no-referrer"
    });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const blob = await response.blob();
    await assertImageBlob(blob, response.headers.get("content-type") || blob.type || "");
    return blob;
  }

  async function fetchBlobViaWorker(url) {
    const fetched = await sendMessage({ type: "FETCH_IMAGE", url });
    if (!fetched || !fetched.ok || !fetched.base64) {
      throw new Error((fetched && fetched.error) || "无法获取图片");
    }
    const blob = base64ToBlob(fetched.base64, fetched.contentType || "image/jpeg");
    await assertImageBlob(blob, fetched.contentType || "");
    return blob;
  }

  function candidateUrls(url) {
    const list = [];
    function add(value) {
      if (value && list.indexOf(value) === -1) {
        list.push(value);
      }
    }

    add(url);
    add(url.replace(/\.dpg(?=$|[?#])/i, ".jpg"));
    add(url.replace(/\.dpg(?=$|[?#])/i, ".webp"));
    add(url.replace(/\.(jpe?g|png|gif|webp)\.avif(?=$|[?#])/i, ".$1"));
    add(url.replace(/\.(jpe?g|png|gif)\.webp(?=$|[?#])/i, ".$1"));
    add(url.replace(/![\w.,-]+$/i, ""));
    return list;
  }

  async function assertImageBlob(blob, contentType) {
    if (!blob || !blob.size) {
      throw new Error("空响应");
    }
    const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (isHtmlBytes(header) || /text\/html/i.test(contentType)) {
      throw new Error("服务器返回了网页而不是图片（可能被防盗链拦截）");
    }
    if (!looksLikeImage(header, contentType)) {
      throw new Error("响应不是可识别的图片数据");
    }
  }

  function isHtmlBytes(bytes) {
    const text = String.fromCharCode.apply(null, Array.from(bytes)).replace(/^\uFEFF/, "").trim().toLowerCase();
    return text.startsWith("<!doctype") || text.startsWith("<html") || text.startsWith("<head");
  }

  function looksLikeImage(bytes, contentType) {
    if (/^image\//i.test(contentType) && !/text\/html/i.test(contentType)) {
      return true;
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return true;
    }
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return true;
    }
    if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return true;
    }
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return true;
    }
    if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
      return true;
    }
    const ascii = String.fromCharCode.apply(null, Array.from(bytes));
    return ascii.indexOf("ftyp") !== -1;
  }

  async function decodeBlob(blob) {
    try {
      return await createImageBitmap(blob);
    } catch (_error) {
      return decodeWithImage(blob);
    }
  }

  function decodeWithImage(blob) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("无法解码为位图，未转换成 PNG"));
      };
      image.src = objectUrl;
    });
  }

  async function drawableToPng(drawable) {
    const canvas = document.createElement("canvas");
    canvas.width = drawable.width || drawable.naturalWidth;
    canvas.height = drawable.height || drawable.naturalHeight;
    if (!canvas.width || !canvas.height) {
      throw new Error("图片尺寸无效");
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("无法创建画布");
    }
    ctx.drawImage(drawable, 0, 0);
    const pngBlob = await canvasToPng(canvas);
    const header = new Uint8Array(await pngBlob.slice(0, 8).arrayBuffer());
    if (!(header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47)) {
      throw new Error("PNG 编码失败");
    }
    return pngBlob;
  }

  async function savePngBlob(filename, pngBlob) {
    const objectUrl = URL.createObjectURL(pngBlob);
    try {
      const downloadId = await chrome.downloads.download({
        url: objectUrl,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      });
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      return downloadId;
    } catch (_error) {
      URL.revokeObjectURL(objectUrl);
      const base64 = await blobToBase64(pngBlob);
      const result = await sendMessage({
        type: "DOWNLOAD_PNG",
        filename,
        base64
      });
      if (!result || !result.ok) {
        throw new Error((result && result.error) || "写入下载失败");
      }
      return result.downloadId;
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        const comma = text.indexOf(",");
        resolve(comma >= 0 ? text.slice(comma + 1) : "");
      };
      reader.onerror = () => reject(new Error("读取失败"));
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64, contentType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType || "application/octet-stream" });
  }

  function canvasToPng(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("PNG 编码失败"));
            return;
          }
          resolve(blob);
        },
        "image/png"
      );
    });
  }

  function showProgress(text) {
    progress.hidden = false;
    progress.textContent = text;
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }
})();
