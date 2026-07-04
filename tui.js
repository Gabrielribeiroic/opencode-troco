// tui.tsx
import { createElement } from "@opentui/solid";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createSignal, Show } from "solid-js";
var ID = "opencode-troco";
var SIDEBAR_ORDER = 140;
var STATUS_ORDER = 80;
var REFRESH_MS = 6e4;
function trocoDir() {
  return join(homedir(), ".troco");
}
function readJson(path) {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}
function loadConfig() {
  const config = readJson(join(homedir(), ".config", "opencode", "opencode-troco.json"));
  const realCredit = config.realCredit === true;
  const placement = String(config.placement || "");
  return {
    apiUrl: String(config.apiUrl || "https://troco.dev/api").replace(/\/$/, ""),
    dryRun: config.dryRun !== false,
    useServe: config.useServe === true,
    realCredit,
    minVisibleMs: Number(config.minVisibleMs || 15e3),
    placement: placement === "sidebar" || placement === "status" || placement === "both" ? placement : realCredit ? "sidebar" : "both"
  };
}
function loadToken() {
  if (process.env.TROCO_TOKEN?.trim()) return process.env.TROCO_TOKEN.trim();
  try {
    return readFileSync(join(trocoDir(), "token"), "utf8").trim() || null;
  } catch {
    return null;
  }
}
function label(ad) {
  if (!ad) return "troco: no ad loaded";
  const text = ad.texto.replace(/\s+/g, " ").trim();
  const name = ad.nome?.replace(/\s+/g, " ").trim();
  return name ? `${name} \xB7 ${text}` : text;
}
function formatBRL(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}
function balanceLabel(balance) {
  if (!balance) return "";
  const month = typeof balance.mes === "number" ? ` \xB7 ${formatBRL(balance.mes)} m\xEAs` : "";
  return `${formatBRL(balance.hoje)} hoje${month} \xB7 ${formatBRL(balance.total)} total`;
}
async function getAd(config, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  if (config.useServe && token) {
    const response2 = await fetch(`${config.apiUrl}/serve`, { headers, signal: AbortSignal.timeout(1500) });
    if (response2.ok) return await response2.json();
  }
  const response = await fetch(`${config.apiUrl}/ads`, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) return null;
  const ads = (await response.json()).ads || [];
  if (!ads.length) return null;
  return { ad: ads[Math.floor(Date.now() / REFRESH_MS) % ads.length] };
}
async function getBalance(config, token) {
  if (!token) return null;
  const response = await fetch(`${config.apiUrl}/balance`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1500) });
  if (!response.ok) return null;
  return await response.json();
}
function creditKey(ad) {
  return ad?.id || "no-id";
}
function alreadyCredited(key) {
  try {
    return readFileSync(join(trocoDir(), "opencode-credit.json"), "utf8").includes(JSON.stringify(key));
  } catch {
    return false;
  }
}
function markCredited(key, mode) {
  try {
    mkdirSync(trocoDir(), { recursive: true });
    writeFileSync(join(trocoDir(), "opencode-credit.json"), JSON.stringify({ key, mode, ts: Date.now() }), "utf8");
  } catch {
  }
}
async function maybeCredit(config, token, served, balance, setState) {
  const key = creditKey(served.ad);
  if (!served.ad.id || alreadyCredited(key)) return;
  if (config.dryRun || !config.realCredit || !config.useServe || !token || !served.nonce) {
    markCredited(key, "dry-run");
    setState({ status: "ready", ad: served.ad, nonce: served.nonce, balance, credited: "dry-run" });
    return;
  }
  const response = await fetch(`${config.apiUrl}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ adId: served.ad.id, tipo: "view_threshold_met", nonce: served.nonce }),
    signal: AbortSignal.timeout(1500)
  });
  const body = response.ok ? await response.json().catch(() => null) : null;
  if (body?.credited) {
    markCredited(key, "sent");
    setState({ status: "ready", ad: served.ad, nonce: served.nonce, balance, credited: "sent" });
  }
}
function showSidebar(config) {
  return config.placement === "sidebar" || config.placement === "both";
}
function showStatus(config) {
  return config.placement === "status" || config.placement === "both";
}
function createTrocoResource() {
  const [state, setState] = createSignal({ status: "loading" });
  const config = loadConfig();
  const token = loadToken();
  const timers = /* @__PURE__ */ new Set();
  let disposed = false;
  const load = async () => {
    const previous = state();
    try {
      const [served, balance] = await Promise.all([getAd(config, token), getBalance(config, token).catch(() => null)]);
      if (disposed) return;
      if (!served) {
        setState({ ...previous, status: "error", message: "no Troco ad available", balance: balance || previous.balance });
        return;
      }
      setState({ status: "ready", ad: served.ad, nonce: served.nonce, balance: balance || previous.balance });
      const timer = setTimeout(() => {
        timers.delete(timer);
        void maybeCredit(config, token, served, state().balance, setState).catch(() => {
        });
      }, config.minVisibleMs);
      timers.add(timer);
    } catch {
      if (!disposed) setState({ ...previous, status: "error", message: "Troco API unreachable" });
    }
  };
  void load();
  const interval = setInterval(load, REFRESH_MS);
  timers.add(interval);
  return {
    config,
    state,
    dispose() {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    }
  };
}
var resources = /* @__PURE__ */ new WeakMap();
function resourceFor(api) {
  const existing = resources.get(api);
  if (existing) return existing;
  const next = createTrocoResource();
  resources.set(api, next);
  api.lifecycle.onDispose(() => next.dispose());
  return next;
}
function SidebarView(props) {
  const resource = resourceFor(props.api);
  const state = resource.state;
  return /* @__PURE__ */ createElement(Show, { when: showSidebar(resource.config) }, /* @__PURE__ */ createElement("box", { gap: 0 }, /* @__PURE__ */ createElement("text", { fg: props.api.theme.current.text }, /* @__PURE__ */ createElement("b", null, "Troco")), /* @__PURE__ */ createElement(Show, { when: state().status === "ready", fallback: /* @__PURE__ */ createElement("text", { fg: props.api.theme.current.textMuted }, state().message || "loading ad...") }, /* @__PURE__ */ createElement("text", { fg: props.api.theme.current.text, wrapMode: "word" }, label(state().ad)), /* @__PURE__ */ createElement(Show, { when: balanceLabel(state().balance) }, /* @__PURE__ */ createElement("text", { fg: props.api.theme.current.textMuted, wrapMode: "none" }, balanceLabel(state().balance))), /* @__PURE__ */ createElement("text", { fg: props.api.theme.current.textMuted, wrapMode: "none" }, resource.config.dryRun ? "dry-run" : state().credited === "sent" ? "credited" : "visible"))));
}
function StatusLine(props) {
  const resource = resourceFor(props.api);
  const state = resource.state;
  const text = () => showStatus(resource.config) && state().status === "ready" ? `* troco \xB7 ${balanceLabel(state().balance) || label(state().ad)}` : "";
  return /* @__PURE__ */ createElement(Show, { when: text() }, /* @__PURE__ */ createElement("box", { flexDirection: "row", justifyContent: "flex-end" }, /* @__PURE__ */ createElement("text", { fg: props.api.theme.current.textMuted, wrapMode: "none" }, text())));
}
function PromptWithStatus(props) {
  return /* @__PURE__ */ createElement("box", { gap: 0 }, /* @__PURE__ */ createElement(
    props.api.ui.Prompt,
    {
      sessionID: props.sessionID,
      visible: props.visible,
      disabled: props.disabled,
      onSubmit: props.onSubmit,
      ref: props.promptRef
    }
  ), /* @__PURE__ */ createElement(StatusLine, { api: props.api }));
}
var tui = async (api) => {
  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content(_ctx, _props) {
        return /* @__PURE__ */ createElement(SidebarView, { api });
      }
    }
  });
  api.slots.register({
    order: STATUS_ORDER,
    slots: {
      home_bottom() {
        return /* @__PURE__ */ createElement(StatusLine, { api });
      },
      session_prompt(_ctx, props) {
        return /* @__PURE__ */ createElement(
          PromptWithStatus,
          {
            api,
            sessionID: props.session_id,
            visible: props.visible,
            disabled: props.disabled,
            onSubmit: props.on_submit,
            promptRef: props.ref
          }
        );
      }
    }
  });
};
var pluginModule = { id: ID, tui };
var tui_default = pluginModule;
export {
  tui_default as default
};
