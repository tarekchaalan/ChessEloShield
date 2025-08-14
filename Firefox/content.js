const sget = (keys) => new Promise((res) => chrome.storage.sync.get(keys, res));
const send = (msg) =>
  new Promise((res) => chrome.runtime.sendMessage(msg, res));

let cooldownUntil = 0;
let settings = { durationMs: 60000, hideChat: false, hideOpp: false };

let ticking = null;
let observing = null;

// Detection control
let pausedDetection = false; // true = don't react to headers
let resumeOnNavigation = false; // after cooldown ends, wait for URL change before checking for win/loss
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

  const wasActive = cooldownUntil > now();
  cooldownUntil = Math.max(0, Number(until || 0));
  const isActive = cooldownUntil > now();

  setHtmlFlag(isActive);

  if (isActive) {
    // Entering/remaining in cooldown: pause detection and tick.
    pausedDetection = true;
    startTick();
  } else {
    // Not active now
    stopTick();
    if (wasActive) {
      // Cooldown just ended
      // keep detection paused until a URL change occurs.
      pausedDetection = true;
      resumeOnNavigation = true;
    } else {
      // Normal idle state
      pausedDetection = false;
      resumeOnNavigation = false;
    }
  }
}

// ---- Loss detection via header text ----
function headerText() {
  const el = document.querySelector(".header-title-component");
  return (el?.textContent || "").trim();
}
function checkHeader() {
  if (pausedDetection) return;
  const t = headerText().toLowerCase();
  if (!t) return;
  // Spec: “You Won!” => ignore. “White Won”/“Black Won” => start cooldown.
  const lost = t.includes("black won") || t.includes("white won");
  const won = t.includes("you won");
  if (lost && !won) triggerCooldown();
}
function startObserver() {
  stopObserver();
  const root = document.body;
  if (!root) return;
  observing = new MutationObserver(checkHeader);
  observing.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  checkHeader();
}
function stopObserver() {
  if (observing) observing.disconnect();
  observing = null;
}
function triggerCooldown() {
  pausedDetection = true;
  chrome.runtime.sendMessage({ type: "tilt-guard/start" });
}

// URL change watcher (resume detection only after navigation)
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

  setInterval(() => {
    if (location.href !== lastUrl) emitUrlChange();
  }, 500);

  window.addEventListener("ces:urlchange", () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (resumeOnNavigation) {
      // Navigation occurred after cooldown end/remove — resume detection now.
      resumeOnNavigation = false;
      pausedDetection = false;
      // Ensure header check runs at least once on the new route.
      setTimeout(checkHeader, 50);
    }
  });
})();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "tilt-guard/state") {
    applyState({ until: msg.until, settings: msg.settings });
  }
});

// React to storage changes (belt-and-suspenders)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  const until = changes.cooldownUntil?.newValue;
  const set = changes.settings?.newValue;
  if (until !== undefined || set !== undefined) {
    applyState({ until: until ?? cooldownUntil, settings: set ?? settings });
  }
});

// Keep timer text fresh on visibility changes
document.addEventListener(
  "visibilitychange",
  () => {
    if (!document.hidden && cooldownUntil > now()) {
      setTimerVar(cooldownUntil - now());
    }
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
    // Get from storage (MV2-safe), then ask background for current state.
    const obj = await sget({
      settings: { durationMs: 60000, hideChat: false, hideOpp: false },
      cooldownUntil: 0,
    });
    await applyState({
      until: obj.cooldownUntil || 0,
      settings: obj.settings || {},
    });

    const state = await send({ type: "tilt-guard/get" }).catch(() => null);
    if (state) await applyState(state);
  } catch {}
  startObserver();
})();
