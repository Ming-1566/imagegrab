/* 原生交互：移动导航、滚动高亮、入场动画和明确标注的画廊示意。 */
(() => {
  "use strict";
  document.documentElement.classList.add("js");
  const header = document.querySelector(".site-header");
  const menuButton = document.querySelector(".menu-toggle");
  const navigation = document.getElementById("primary-nav");
  const navLinks = [...navigation.querySelectorAll('a[href^="#"]')];
  const sections = navLinks.map(link => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  const mobileQuery = window.matchMedia("(max-width: 767px)");

  function setMenu(open, returnFocus = false) {
    navigation.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "关闭导航菜单" : "打开导航菜单");
    if (returnFocus) menuButton.focus();
  }
  menuButton.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
  navLinks.forEach(link => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") setMenu(false, true);
  });
  document.addEventListener("click", event => {
    if (!header.contains(event.target)) setMenu(false);
  });
  const handleBreakpoint = () => { if (!mobileQuery.matches) setMenu(false); };
  if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", handleBreakpoint);
  else mobileQuery.addListener(handleBreakpoint);

  // 只计算四个导航目标，使用 requestAnimationFrame 合并滚动事件。
  let updatePending = false;
  function updateActiveSection() {
    const threshold = header.getBoundingClientRect().height + 150;
    let currentId = sections[0].id;
    sections.forEach(section => { if (section.getBoundingClientRect().top <= threshold) currentId = section.id; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5) currentId = sections[sections.length - 1].id;
    navLinks.forEach(link => {
      if (link.getAttribute("href") === `#${currentId}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    updatePending = false;
  }
  function scheduleNavUpdate() {
    if (!updatePending) { updatePending = true; window.requestAnimationFrame(updateActiveSection); }
  }
  window.addEventListener("scroll", scheduleNavUpdate, { passive: true });
  window.addEventListener("resize", scheduleNavUpdate);
  updateActiveSection();

  // 无 JS、无 Observer 或选择减少动画时，内容始终可见。
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.remove("is-waiting"); revealObserver.unobserve(entry.target); }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll(".reveal").forEach(element => { element.classList.add("is-waiting"); revealObserver.observe(element); });
  }

  // 画廊只演示勾选，不伪装成实际提取结果，也不下载演示商品图。
  const demoCards = [...document.querySelectorAll(".demo-card")];
  const demoCount = document.getElementById("demo-count");
  const demoDownload = document.getElementById("demo-download");
  const demoMessage = document.getElementById("demo-message");
  function updateDemo() {
    const selected = demoCards.filter(card => card.getAttribute("aria-pressed") === "true").length;
    demoCount.textContent = `已选 ${selected} / ${demoCards.length} 张`;
    demoDownload.disabled = selected === 0;
  }
  function selectCard(card, selected) {
    card.setAttribute("aria-pressed", String(selected));
    card.classList.toggle("is-selected", selected);
  }
  demoCards.forEach(card => card.addEventListener("click", () => {
    selectCard(card, card.getAttribute("aria-pressed") !== "true");
    updateDemo();
  }));
  document.getElementById("demo-invert").addEventListener("click", () => {
    demoCards.forEach(card => selectCard(card, card.getAttribute("aria-pressed") !== "true"));
    updateDemo();
  });
  demoDownload.addEventListener("click", () => {
    demoMessage.textContent = "这是界面示意。请下载并安装插件后，在真实商品详情页提取和下载图片。";
  });
  updateDemo();

  // chrome:// 地址不能作为普通网页跳转，提供复制与手动复制的降级提示。
  document.getElementById("copy-address").addEventListener("click", async () => {
    const address = "chrome://extensions";
    const status = document.getElementById("copy-status");
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(address); copied = true; }
    } catch (_) { /* 权限受限时继续尝试本地文件下可用的复制方式。 */ }
    if (!copied) {
      const input = document.createElement("textarea");
      input.value = address;
      input.setAttribute("readonly", "");
      input.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(input);
      input.select();
      try { copied = document.execCommand("copy"); } catch (_) { copied = false; }
      input.remove();
      document.getElementById("copy-address").focus();
    }
    status.textContent = copied ? "已复制，请粘贴到 Chrome 地址栏" : "请手动选中并复制上方地址";
  });

  document.getElementById("copyright-year").textContent = String(new Date().getFullYear());

  // 尚未有远程仓库时不显示虚构链接；部署到项目型 GitHub Pages 后自动生成仓库入口。
  const host = window.location.hostname;
  const repo = window.location.pathname.split("/").filter(Boolean)[0];
  if (host.endsWith(".github.io") && repo && repo !== "index.html") {
    const owner = host.slice(0, -".github.io".length);
    const link = document.getElementById("github-link");
    link.href = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    link.hidden = false;
    link.rel = "noopener noreferrer";
  }
})();
