const DEFAULTS = { durationMs: 60000, hideChat: false, hideOpp: false };
const sget = (keys) => new Promise((res) => chrome.storage.sync.get(keys, res));
const sset = (obj) => new Promise((res) => chrome.storage.sync.set(obj, res));
const isMV3 = chrome?.runtime?.getManifest?.().manifest_version === 3;
const send = (msg) => {
  if (isMV3) return chrome.runtime.sendMessage(msg).catch(() => undefined);
  return new Promise((res) =>
    chrome.runtime.sendMessage(msg, () => {
      void chrome.runtime.lastError;
      res(undefined);
    })
  );
};
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function setChipActive(ms) {
  $$("#presets .chip").forEach(
    (c) => (c.dataset.active = Number(c.dataset.val) === ms ? "true" : "false")
  );
}
function activeDurationMs() {
  const chip = $$("#presets .chip").find((x) => x.dataset.active === "true");
  if (chip) return Number(chip.dataset.val);
  const mm = Math.max(0, Number($("#mm").value) || 0);
  const ss = Math.max(0, Math.min(59, Number($("#ss").value) || 0));
  return (mm * 60 + ss) * 1000;
}
function setSwitch(el, on) {
  el.dataset.on = on ? "true" : "false";
  el.setAttribute("aria-checked", on ? "true" : "false");
}
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

async function hydrate() {
  const { settings } = await sget({ settings: DEFAULTS });

  const duration = Number(settings.durationMs ?? DEFAULTS.durationMs);
  setChipActive(duration);
  $("#mm").value = Math.floor(duration / 60000);
  $("#ss").value = Math.floor((duration % 60000) / 1000);

  setSwitch($("#hideChat"), !!settings.hideChat);
  setSwitch($("#hideOpp"), !!settings.hideOpp);

  try {
    const state = await send({ type: "tilt-guard/get" });
    if (state?.until > Date.now()) {
      const st = $("#state");
      const tick = () => {
        const left = Math.max(0, state.until - Date.now());
        st.textContent = left
          ? `Cooling down: ${fmt(left)} remaining`
          : "Ready";
        if (left) setTimeout(tick, 1000);
      };
      tick();
    } else {
      $("#state").textContent = "Ready";
      setTimeout(() => ($("#state").textContent = ""), 1200);
    }
  } catch {}
}

document.addEventListener("DOMContentLoaded", hydrate);

$("#presets").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  setChipActive(Number(chip.dataset.val));
});
$("#mm").addEventListener("input", () => setChipActive(NaN));
$("#ss").addEventListener("input", () => setChipActive(NaN));

["hideChat", "hideOpp"].forEach((id) => {
  const el = $("#" + id);
  el.addEventListener("click", () =>
    setSwitch(el, !(el.dataset.on === "true"))
  );
  el.addEventListener("keydown", (ev) => {
    if (ev.key === " " || ev.key === "Enter") {
      ev.preventDefault();
      setSwitch(el, !(el.dataset.on === "true"));
    }
  });
});

$("#save").addEventListener("click", async () => {
  const durationMs = activeDurationMs();
  const hideChat = $("#hideChat").dataset.on === "true";
  const hideOpp = $("#hideOpp").dataset.on === "true";

  await sset({ settings: { durationMs, hideChat, hideOpp } });
  await send({
    type: "tilt-guard/set-settings",
    settings: { durationMs, hideChat, hideOpp },
  });

  const st = $("#state");
  st.textContent = "Saved";
  setTimeout(() => (st.textContent = ""), 1400);
});

// NEW: subtle bottom-right escape hatch
document.getElementById("resetLink")?.addEventListener("click", async () => {
  await send({ type: "tilt-guard/reset" });
  const st = document.getElementById("state");
  if (st) {
    st.textContent = "Cooldown removed";
    setTimeout(() => (st.textContent = ""), 1400);
  }
});
