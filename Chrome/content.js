// ChessEloShield — MV2/MV3 content script (Chrome+Firefox)
// Fixes: wait for <body> before observing, set timer immediately, add fallback loss detector.

const isMV3 = chrome?.runtime?.getManifest?.().manifest_version === 3;
const sget = (keys) => new Promise((res) => chrome.storage.sync.get(keys, res));
const send = (msg) =>
  isMV3
    ? chrome.runtime.sendMessage(msg).catch(() => undefined)
    : new Promise((res) =>
        chrome.runtime.sendMessage(msg, () => {
          void chrome.runtime.lastError;
          res(undefined);
        })
      );

let cooldownUntil = 0;
let settings = { durationMs: 60000, hideChat: false, hideOpp: false };

let ticking = null;
let observing = null;

// Detection control
let pausedDetection = false; // true = don't react to headers
let resumeOnNavigation = false; // after cooldown ends/reset, wait for URL change
let lastUrl = location.href;

const now = () => Date.now();
const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

function setHtmlFlag(active) {
  const html = document.documentElement;
  html.classList.toggle("tg-cooling", active);
  html.classList.toggle("tg-hide-chat", !!settings.hideChat);
  html.classList.toggle("tg-hide-opp", !!settings.hideOpp);
}
function setTimerVar(msRemaining) {
  document.documentElement.style.setProperty(
    "--tg-timer",
    `"${fmt(msRemaining)}"`
  );
}

function stopTick() {
  if (ticking) clearTimeout(ticking);
  ticking = null;
}

function startTick() {
  stopTick();
  const step = () => {
    const left = Math.max(0, cooldownUntil - now());
    setTimerVar(left);
    if (left <= 0) {
      cooldownUntil = 0;
      setHtmlFlag(false);
      stopTick();
      pausedDetection = true;
      resumeOnNavigation = true;
      return;
    }
    ticking = setTimeout(step, 250);
  };
  step();
}

async function applyState({ until, settings: s }) {
  if (s) settings = { ...settings, ...s };

  const previouslyActive = cooldownUntil > now();
  cooldownUntil = Math.max(0, Number(until || 0));
  const active = cooldownUntil > now();

  setHtmlFlag(active);

  if (active) {
    // Set initial timer immediately to avoid a blank frame, then tick.
    setTimerVar(cooldownUntil - now());
    pausedDetection = true;
    startTick();
  } else {
    stopTick();
    if (previouslyActive) {
      // Cooldown just ended (or was reset): wait for a URL change before detecting losses again.
      pausedDetection = true;
      resumeOnNavigation = true;
    } else {
      pausedDetection = false;
      resumeOnNavigation = false;
    }
  }
}

// ---- Loss detection (primary + fallback) ----
function headerText() {
  const el = document.querySelector(".header-title-component");
  return (el?.textContent || "").trim();
}
function gameOverText() {
  const el = document.querySelector(".game-over-message-component");
  return (el?.textContent || "").trim();
}
function lossDetected() {
  const ht = headerText().toLowerCase();
  if (ht.includes("black won") || ht.includes("white won")) return true;
  // Fallback path (your chat DOM sample also carries “won by …” here)
  const gt = gameOverText().toLowerCase();
  if (gt.includes(" won by ") || gt.includes("won by")) return true;
  return false;
}
function checkHeader() {
  if (pausedDetection) return;
  const ht = headerText().toLowerCase();
  if (ht.includes("you won")) return; // ignore your own wins
  if (lossDetected()) triggerCooldown();
}

function startObserverWhenBodyReady() {
  if (observing) observing.disconnect();
  if (document.body) {
    observing = new MutationObserver(checkHeader);
    observing.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    // Kick once on attach
    checkHeader();
    return;
  }
  // Body not ready yet; wait once and then attach.
  const mo = new MutationObserver(() => {
    if (document.body) {
      mo.disconnect();
      startObserverWhenBodyReady();
    }
  });
  mo.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  });
}

function triggerCooldown() {
  pausedDetection = true; // avoid double-fire
  chrome.runtime.sendMessage({ type: "tilt-guard/start" }); // fire-and-forget
}

// ---- URL change watcher (resume detection only after navigation) ----
function emitUrlChange() {
  window.dispatchEvent(new Event("ces:urlchange"));
}

(function installUrlWatch() {
  const origPush = history.pushState;
  const origRepl = history.replaceState;
  try {
    history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      emitUrlChange();
      return r;
    };
    history.replaceState = function (...args) {
      const r = origRepl.apply(this, args);
      emitUrlChange();
      return r;
    };
  } catch {}
  window.addEventListener("popstate", emitUrlChange, { passive: true });
  window.addEventListener("hashchange", emitUrlChange, { passive: true });

  // Fallback heartbeat for odd SPA flows
  setInterval(() => {
    if (location.href !== lastUrl) emitUrlChange();
  }, 500);

  window.addEventListener("ces:urlchange", () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (resumeOnNavigation) {
      resumeOnNavigation = false;
      pausedDetection = false;
      // ensure a pass on new route
      setTimeout(checkHeader, 50);
    }
  });
})();

// ---- Messaging & hydration ----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "tilt-guard/state") {
    applyState({ until: msg.until, settings: msg.settings });
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  const until = changes.cooldownUntil?.newValue;
  const set = changes.settings?.newValue;
  if (until !== undefined || set !== undefined) {
    applyState({ until: until ?? cooldownUntil, settings: set ?? settings });
  }
});

// Keep timer text fresh on visibility
document.addEventListener(
  "visibilitychange",
  () => {
    if (!document.hidden && cooldownUntil > now())
      setTimerVar(cooldownUntil - now());
  },
  { passive: true }
);
window.addEventListener(
  "pageshow",
  () => {
    if (cooldownUntil > now()) setTimerVar(cooldownUntil - now());
  },
  { passive: true }
);

// Boot
(async function init() {
  try {
    // Hydrate from storage first, then ask background (covers races).
    const obj = await sget({
      settings: { durationMs: 60000, hideChat: false, hideOpp: false },
      cooldownUntil: 0,
    });
    await applyState({
      until: obj.cooldownUntil || 0,
      settings: obj.settings || {},
    });

    const state = await send({ type: "tilt-guard/get" });
    if (state) await applyState(state);
  } catch {}
  // Wait for body before attaching MutationObserver (fixes intermittent no-timer cases)
  startObserverWhenBodyReady();
})();
