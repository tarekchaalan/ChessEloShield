const DEFAULTS = { durationMs: 60_000, hideChat: false, hideOpp: false };
const EXP_ALARM_PREFIX = "ces-expire-";

const sget = (k) => new Promise((res) => chrome.storage.sync.get(k, res));
const sset = (o) => new Promise((res) => chrome.storage.sync.set(o, res));
const tabsQuery = (q) => new Promise((res) => chrome.tabs.query(q, res));
const sendTabMsg = (id, msg) =>
  new Promise((res) => chrome.tabs.sendMessage(id, msg, res));
const alarmsClearAll = () => new Promise((res) => chrome.alarms.clearAll(res));

async function getState() {
  const obj = await sget({ settings: DEFAULTS, cooldownUntil: 0 });
  const settings = { ...DEFAULTS, ...(obj.settings || {}) };
  const cooldownUntil = Number(obj.cooldownUntil || 0);
  return { settings, cooldownUntil };
}

async function broadcast() {
  const { settings, cooldownUntil } = await getState();
  const payload = { type: "tilt-guard/state", until: cooldownUntil, settings };
  const tabs = await tabsQuery({ url: ["https://www.chess.com/*"] });
  await Promise.all(tabs.map((t) => sendTabMsg(t.id, payload).catch(() => {})));
}

async function setSettings(partial) {
  const { settings } = await getState();
  await sset({ settings: { ...settings, ...partial } });
  await broadcast();
}

async function setCooldown(untilMs) {
  await sset({ cooldownUntil: untilMs });
  await alarmsClearAll();
  if (untilMs > Date.now())
    chrome.alarms.create(EXP_ALARM_PREFIX + untilMs, { when: untilMs });
  await broadcast();
}

// Lifecycle
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await sget(null);
  if (!cur.settings) await sset({ settings: DEFAULTS });
  if (typeof cur.cooldownUntil !== "number") await sset({ cooldownUntil: 0 });
});

// Messages
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "tilt-guard/get") {
      sendResponse(await getState());
      return;
    }
    if (msg?.type === "tilt-guard/start") {
      const { settings } = await getState();
      const dur = Math.max(0, Number(msg.durationMs ?? settings.durationMs));
      const until = Date.now() + dur;
      await setCooldown(until);
      sendResponse({ ok: true, until });
      return;
    }
    if (msg?.type === "tilt-guard/set-settings") {
      await setSettings(msg.settings || {});
      sendResponse({ ok: true });
      return;
    }
    // NEW: hard reset from popup link
    if (msg?.type === "tilt-guard/reset") {
      await setCooldown(0);
      sendResponse({ ok: true });
      return;
    }
  })();
  return true;
});

// Sync + expiry
chrome.storage.onChanged.addListener((_c, area) => {
  if (area === "sync") broadcast().catch(() => {});
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(EXP_ALARM_PREFIX)) return;
  const stamp = Number(alarm.name.slice(EXP_ALARM_PREFIX.length));
  const { cooldownUntil } = await getState();
  if (cooldownUntil === stamp) await setCooldown(0);
});

// Nav hooks (debounced + slight delay to avoid race with content script load)
const perTab = new Map();
function isChess(url) {
  return typeof url === "string" && url.startsWith("https://www.chess.com/");
}
async function sendStateToTab(tabId, delayMs = 120) {
  const { settings, cooldownUntil } = await getState();
  const payload = { type: "tilt-guard/state", until: cooldownUntil, settings };
  const meta = perTab.get(tabId) || { lastSent: 0, lastUntil: NaN };
  const nowTs = Date.now();
  if (meta.lastUntil === cooldownUntil && nowTs - meta.lastSent < 300) return;
  perTab.set(tabId, { lastSent: nowTs, lastUntil: cooldownUntil });
  setTimeout(() => sendTabMsg(tabId, payload).catch(() => {}), delayMs);
}

chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (d.frameId === 0 && isChess(d.url)) sendStateToTab(d.tabId, 60);
});
chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId === 0 && isChess(d.url)) sendStateToTab(d.tabId, 150);
});
chrome.webNavigation.onCompleted.addListener((d) => {
  if (d.frameId === 0 && isChess(d.url)) sendStateToTab(d.tabId, 250);
});
