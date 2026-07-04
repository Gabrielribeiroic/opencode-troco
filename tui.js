// GENERATED from tui.tsx by build.mjs — do not edit. Run: npm run build
import { memo as _$memo } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createSignal, Show } from "solid-js";
const ID = "opencode-troco";
const SIDEBAR_ORDER = 140;
const STATUS_ORDER = 80;
const REFRESH_MS = 60_000;
const REQUEST_TIMEOUT_MS = 1500;
const EVENT_TIMEOUT_MS = 5000;
function trocoDir() {
  return join(homedir(), ".troco");
}
function writeDiagnostics(data) {
  try {
    mkdirSync(trocoDir(), {
      recursive: true
    });
    const path = join(trocoDir(), "opencode-diagnostics.json");
    let current = {};
    try {
      current = JSON.parse(readFileSync(path, "utf8"));
    } catch {}
    writeFileSync(path, JSON.stringify({
      ...current,
      ...data,
      ts: Date.now()
    }), "utf8");
  } catch {}
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
    minVisibleMs: Number(config.minVisibleMs || 15_000),
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
  return name ? `${name} · ${text}` : text;
}
function formatBRL(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}
function balanceLabel(balance) {
  if (!balance) return "";
  const month = typeof balance.mes === "number" ? ` · ${formatBRL(balance.mes)} mês` : "";
  return `${formatBRL(balance.hoje)} hoje${month} · ${formatBRL(balance.total)} total`;
}
async function getAd(config, token) {
  const headers = token ? {
    authorization: `Bearer ${token}`
  } : {};
  if (config.useServe && token) {
    const response = await fetch(`${config.apiUrl}/serve`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const body = response.ok ? await response.json().catch(() => null) : null;
    writeDiagnostics({
      serveStatus: response.status,
      serveOk: response.ok,
      serveAdId: body?.ad?.id,
      serveAdName: body?.ad?.nome,
      serveHasNonce: Boolean(body?.nonce),
      serveFm: body?.fm ?? null,
      eventStatus: null,
      eventOk: null,
      eventCredited: null,
      eventAdId: null,
      eventAdName: null,
      eventError: null
    });
    if (body?.ad) return {
      ...body,
      source: "serve"
    };
  }
  const response = await fetch(`${config.apiUrl}/ads`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) return null;
  const ads = (await response.json()).ads || [];
  if (!ads.length) return null;
  return {
    ad: ads[Math.floor(Date.now() / REFRESH_MS) % ads.length],
    source: "ads"
  };
}
async function getBalance(config, token) {
  if (!token) return null;
  const response = await fetch(`${config.apiUrl}/balance`, {
    headers: {
      authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) return null;
  return await response.json();
}
function creditKey(ad) {
  return ad?.id || "no-id";
}
function alreadyCredited(key) {
  try {
    const entries = JSON.parse(readFileSync(join(trocoDir(), "opencode-credit.json"), "utf8"));
    return (Array.isArray(entries) ? entries : [entries]).some(entry => entry.key === key);
  } catch {
    return false;
  }
}
function markCredited(key, mode) {
  try {
    mkdirSync(trocoDir(), {
      recursive: true
    });
    let entries = [];
    try {
      const current = JSON.parse(readFileSync(join(trocoDir(), "opencode-credit.json"), "utf8"));
      entries = Array.isArray(current) ? current : [current];
    } catch {}
    entries = [{
      key,
      mode,
      ts: Date.now()
    }, ...entries.filter(entry => entry.key !== key)].slice(0, 50);
    writeFileSync(join(trocoDir(), "opencode-credit.json"), JSON.stringify(entries), "utf8");
  } catch {}
}
async function maybeCredit(config, token, served, balance, setState) {
  const key = creditKey(served.ad);
  const realEvent = Boolean(!config.dryRun && config.realCredit && config.useServe && token && served.nonce && served.source === "serve");
  if (!served.ad.id || !realEvent && alreadyCredited(key)) return;
  if (!realEvent && !config.dryRun) {
    setState({
      status: "ready",
      ad: served.ad,
      nonce: served.nonce,
      balance,
      credited: "skipped"
    });
    return;
  }
  if (config.dryRun || !realEvent) {
    markCredited(key, "dry-run");
    setState({
      status: "ready",
      ad: served.ad,
      nonce: served.nonce,
      balance,
      credited: "dry-run"
    });
    return;
  }
  try {
    const response = await fetch(`${config.apiUrl}/events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        adId: served.ad.id,
        tipo: "view_threshold_met",
        nonce: served.nonce
      }),
      signal: AbortSignal.timeout(EVENT_TIMEOUT_MS)
    });
    const body = response.ok ? await response.json().catch(() => null) : null;
    writeDiagnostics({
      eventStatus: response.status,
      eventOk: response.ok,
      eventCredited: Boolean(body?.credited),
      eventAdId: served.ad.id,
      eventAdName: served.ad.nome
    });
    if (body?.credited) {
      markCredited(key, "sent");
      setState({
        status: "ready",
        ad: served.ad,
        nonce: served.nonce,
        balance,
        credited: "sent"
      });
    } else {
      setState({
        status: "ready",
        ad: served.ad,
        nonce: served.nonce,
        balance,
        credited: "skipped"
      });
    }
  } catch (error) {
    writeDiagnostics({
      eventError: error instanceof Error ? error.name : "unknown",
      eventAdId: served.ad.id,
      eventAdName: served.ad.nome
    });
    setState({
      status: "ready",
      ad: served.ad,
      nonce: served.nonce,
      balance,
      credited: "skipped"
    });
  }
}
function showSidebar(config) {
  return config.placement === "sidebar" || config.placement === "both";
}
function showStatus(config) {
  return config.placement === "status" || config.placement === "both";
}
function createTrocoResource() {
  const [state, setState] = createSignal({
    status: "loading"
  });
  const config = loadConfig();
  const token = loadToken();
  const timers = new Set();
  let disposed = false;
  const load = async () => {
    const previous = state();
    try {
      const [served, balance] = await Promise.all([getAd(config, token), getBalance(config, token).catch(() => null)]);
      if (disposed) return;
      if (!served) {
        setState({
          ...previous,
          status: "error",
          message: "no Troco ad available",
          balance: balance || previous.balance
        });
        return;
      }
      setState({
        status: "ready",
        ad: served.ad,
        nonce: served.nonce,
        balance: balance || previous.balance
      });
      const timer = setTimeout(() => {
        timers.delete(timer);
        void maybeCredit(config, token, served, state().balance, setState).catch(() => {});
      }, config.minVisibleMs);
      timers.add(timer);
    } catch {
      if (!disposed) setState({
        ...previous,
        status: "error",
        message: "Troco API unreachable"
      });
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
const resources = new WeakMap();
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
  return _$createComponent(Show, {
    get when() {
      return showSidebar(resource.config);
    },
    get children() {
      var _el$ = _$createElement("box"),
        _el$2 = _$createElement("text"),
        _el$3 = _$createElement("b");
      _$insertNode(_el$, _el$2);
      _$setProp(_el$, "gap", 0);
      _$insertNode(_el$2, _el$3);
      _$insertNode(_el$3, _$createTextNode(`Troco`));
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return state().status === "ready";
        },
        get fallback() {
          return (() => {
            var _el$8 = _$createElement("text");
            _$insert(_el$8, () => state().message || "loading ad...");
            _$effect(_$p => _$setProp(_el$8, "fg", props.api.theme.current.textMuted, _$p));
            return _el$8;
          })();
        },
        get children() {
          return [(() => {
            var _el$5 = _$createElement("text");
            _$setProp(_el$5, "wrapMode", "word");
            _$insert(_el$5, () => label(state().ad));
            _$effect(_$p => _$setProp(_el$5, "fg", props.api.theme.current.text, _$p));
            return _el$5;
          })(), _$createComponent(Show, {
            get when() {
              return balanceLabel(state().balance);
            },
            get children() {
              var _el$6 = _$createElement("text");
              _$setProp(_el$6, "wrapMode", "none");
              _$insert(_el$6, () => balanceLabel(state().balance));
              _$effect(_$p => _$setProp(_el$6, "fg", props.api.theme.current.textMuted, _$p));
              return _el$6;
            }
          }), (() => {
            var _el$7 = _$createElement("text");
            _$setProp(_el$7, "wrapMode", "none");
            _$insert(_el$7, (() => {
              var _c$ = _$memo(() => !!resource.config.dryRun);
              return () => _c$() ? "dry-run" : _$memo(() => state().credited === "sent")() ? "credited" : state().credited === "skipped" ? "not credited" : "visible";
            })());
            _$effect(_$p => _$setProp(_el$7, "fg", props.api.theme.current.textMuted, _$p));
            return _el$7;
          })()];
        }
      }), null);
      _$effect(_$p => _$setProp(_el$2, "fg", props.api.theme.current.text, _$p));
      return _el$;
    }
  });
}
function StatusLine(props) {
  const resource = resourceFor(props.api);
  const state = resource.state;
  const text = () => showStatus(resource.config) && state().status === "ready" ? `* troco · ${balanceLabel(state().balance) || label(state().ad)}` : "";
  return _$createComponent(Show, {
    get when() {
      return text();
    },
    get children() {
      var _el$9 = _$createElement("box"),
        _el$0 = _$createElement("text");
      _$insertNode(_el$9, _el$0);
      _$setProp(_el$9, "flexDirection", "row");
      _$setProp(_el$9, "justifyContent", "flex-end");
      _$setProp(_el$0, "wrapMode", "none");
      _$insert(_el$0, text);
      _$effect(_$p => _$setProp(_el$0, "fg", props.api.theme.current.textMuted, _$p));
      return _el$9;
    }
  });
}
function PromptWithStatus(props) {
  return (() => {
    var _el$1 = _$createElement("box");
    _$setProp(_el$1, "gap", 0);
    _$insert(_el$1, _$createComponent(props.api.ui.Prompt, {
      get sessionID() {
        return props.sessionID;
      },
      get visible() {
        return props.visible;
      },
      get disabled() {
        return props.disabled;
      },
      get onSubmit() {
        return props.onSubmit;
      },
      ref(r$) {
        var _ref$ = props.promptRef;
        typeof _ref$ === "function" ? _ref$(r$) : props.promptRef = r$;
      }
    }), null);
    _$insert(_el$1, _$createComponent(StatusLine, {
      get api() {
        return props.api;
      }
    }), null);
    return _el$1;
  })();
}
const tui = async api => {
  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content(_ctx, _props) {
        return _$createComponent(SidebarView, {
          api: api
        });
      }
    }
  });
  api.slots.register({
    order: STATUS_ORDER,
    slots: {
      home_bottom() {
        return _$createComponent(StatusLine, {
          api: api
        });
      },
      session_prompt(_ctx, props) {
        return _$createComponent(PromptWithStatus, {
          api: api,
          get sessionID() {
            return props.session_id;
          },
          get visible() {
            return props.visible;
          },
          get disabled() {
            return props.disabled;
          },
          get onSubmit() {
            return props.on_submit;
          },
          get promptRef() {
            return props.ref;
          }
        });
      }
    }
  });
};
const pluginModule = {
  id: ID,
  tui
};
export default pluginModule;