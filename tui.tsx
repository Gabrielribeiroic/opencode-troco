/** @jsxImportSource @opentui/solid */
import type { JSX } from "@opentui/solid";
import type { TuiPlugin, TuiPluginApi, TuiPluginModule, TuiPromptRef } from "@opencode-ai/plugin/tui";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createSignal, onCleanup, Show } from "solid-js";

const ID = "opencode-troco";
const SIDEBAR_ORDER = 140;
const STATUS_ORDER = 80;
const REFRESH_MS = 60_000;
const REQUEST_TIMEOUT_MS = 1500;
const EVENT_TIMEOUT_MS = 5000;

type Balance = {
  hoje?: number;
  mes?: number;
  total?: number;
};

type Ad = {
  id?: string;
  nome?: string;
  texto: string;
  url?: string;
  iconUrl?: string;
};

type ServedAd = {
  ad: Ad;
  nonce?: string;
  source: "serve" | "ads";
};

type Config = {
  apiUrl: string;
  dryRun: boolean;
  useServe: boolean;
  realCredit: boolean;
  minVisibleMs: number;
  placement: "sidebar" | "status" | "both";
};

type State = {
  status: "loading" | "ready" | "error";
  ad?: Ad;
  nonce?: string;
  balance?: Balance;
  credited?: "dry-run" | "sent" | "skipped";
  message?: string;
};

type CreditEntry = {
  key: string;
  mode: string;
  ts: number;
};

function trocoDir() {
  return join(homedir(), ".troco");
}

function writeDiagnostics(data: Record<string, unknown>) {
  try {
    mkdirSync(trocoDir(), { recursive: true });
    const path = join(trocoDir(), "opencode-diagnostics.json");
    let current = {};
    try {
      current = JSON.parse(readFileSync(path, "utf8"));
    } catch {
    }
    writeFileSync(path, JSON.stringify({ ...current, ...data, ts: Date.now() }), "utf8");
  } catch {
  }
}

function readJson(path: string): Record<string, unknown> {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function loadConfig(): Config {
  const config = readJson(join(homedir(), ".config", "opencode", "opencode-troco.json"));
  const realCredit = config.realCredit === true;
  const placement = String(config.placement || "");
  return {
    apiUrl: String(config.apiUrl || "https://troco.dev/api").replace(/\/$/, ""),
    dryRun: config.dryRun !== false,
    useServe: config.useServe === true,
    realCredit,
    minVisibleMs: Number(config.minVisibleMs || 15_000),
    placement: placement === "sidebar" || placement === "status" || placement === "both" ? placement : realCredit ? "sidebar" : "both",
  };
}

function loadToken(): string | null {
  if (process.env.TROCO_TOKEN?.trim()) return process.env.TROCO_TOKEN.trim();
  try {
    return readFileSync(join(trocoDir(), "token"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

function label(ad?: Ad): string {
  if (!ad) return "troco: no ad loaded";
  const text = ad.texto.replace(/\s+/g, " ").trim();
  const name = ad.nome?.replace(/\s+/g, " ").trim();
  return name ? `${name} · ${text}` : text;
}

function formatBRL(value?: number): string {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

function balanceLabel(balance?: Balance): string {
  if (!balance) return "";
  const month = typeof balance.mes === "number" ? ` · ${formatBRL(balance.mes)} mês` : "";
  return `${formatBRL(balance.hoje)} hoje${month} · ${formatBRL(balance.total)} total`;
}

async function getAd(config: Config, token: string | null): Promise<ServedAd | null> {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  if (config.useServe && token) {
    const response = await fetch(`${config.apiUrl}/serve`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
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
      eventError: null,
    });
    if (body?.ad) return { ...body, source: "serve" };
  }

  const response = await fetch(`${config.apiUrl}/ads`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) return null;
  const ads = ((await response.json()).ads || []) as Ad[];
  if (!ads.length) return null;
  return { ad: ads[Math.floor(Date.now() / REFRESH_MS) % ads.length], source: "ads" };
}

async function getBalance(config: Config, token: string | null): Promise<Balance | null> {
  if (!token) return null;
  const response = await fetch(`${config.apiUrl}/balance`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) return null;
  return await response.json();
}

function creditKey(ad?: Ad) {
  return ad?.id || "no-id";
}

function alreadyCredited(key: string) {
  try {
    const entries = JSON.parse(readFileSync(join(trocoDir(), "opencode-credit.json"), "utf8"));
    return (Array.isArray(entries) ? entries : [entries]).some((entry: CreditEntry) => entry.key === key);
  } catch {
    return false;
  }
}

function markCredited(key: string, mode: string) {
  try {
    mkdirSync(trocoDir(), { recursive: true });
    let entries: CreditEntry[] = [];
    try {
      const current = JSON.parse(readFileSync(join(trocoDir(), "opencode-credit.json"), "utf8"));
      entries = Array.isArray(current) ? current : [current];
    } catch {
    }
    entries = [{ key, mode, ts: Date.now() }, ...entries.filter((entry) => entry.key !== key)].slice(0, 50);
    writeFileSync(join(trocoDir(), "opencode-credit.json"), JSON.stringify(entries), "utf8");
  } catch {
  }
}

async function maybeCredit(config: Config, token: string | null, served: ServedAd, balance: Balance | undefined, setState: (state: State) => void) {
  const key = creditKey(served.ad);
  const realEvent = Boolean(!config.dryRun && config.realCredit && config.useServe && token && served.nonce && served.source === "serve");
  if (!served.ad.id || (!realEvent && alreadyCredited(key))) return;

  if (!realEvent && !config.dryRun) {
    setState({ status: "ready", ad: served.ad, nonce: served.nonce, balance, credited: "skipped" });
    return;
  }

  if (config.dryRun || !realEvent) {
    markCredited(key, "dry-run");
    setState({ status: "ready", ad: served.ad, nonce: served.nonce, balance, credited: "dry-run" });
    return;
  }

  try {
    const response = await fetch(`${config.apiUrl}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ adId: served.ad.id, tipo: "view_threshold_met", nonce: served.nonce }),
      signal: AbortSignal.timeout(EVENT_TIMEOUT_MS),
    });
    const body = response.ok ? await response.json().catch(() => null) : null;
    writeDiagnostics({
      eventStatus: response.status,
      eventOk: response.ok,
      eventCredited: Boolean(body?.credited),
      eventAdId: served.ad.id,
      eventAdName: served.ad.nome,
    });
    if (body?.credited) {
      markCredited(key, "sent");
      setState({ status: "ready", ad: served.ad, nonce: served.nonce, balance, credited: "sent" });
    } else {
      setState({ status: "ready", ad: served.ad, nonce: served.nonce, balance, credited: "skipped" });
    }
  } catch (error) {
    writeDiagnostics({
      eventError: error instanceof Error ? error.name : "unknown",
      eventAdId: served.ad.id,
      eventAdName: served.ad.nome,
    });
    setState({ status: "ready", ad: served.ad, nonce: served.nonce, balance, credited: "skipped" });
  }
}

function showSidebar(config: Config) {
  return config.placement === "sidebar" || config.placement === "both";
}

function showStatus(config: Config) {
  return config.placement === "status" || config.placement === "both";
}

function createTrocoResource() {
  const [state, setState] = createSignal<State>({ status: "loading" });
  const config = loadConfig();
  const token = loadToken();
  const timers = new Set<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>();
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
        void maybeCredit(config, token, served, state().balance, setState).catch(() => {});
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
      for (const timer of timers) clearTimeout(timer as ReturnType<typeof setTimeout>);
      timers.clear();
    },
  };
}

const resources = new WeakMap<TuiPluginApi, ReturnType<typeof createTrocoResource>>();

function resourceFor(api: TuiPluginApi) {
  const existing = resources.get(api);
  if (existing) return existing;
  const next = createTrocoResource();
  resources.set(api, next);
  api.lifecycle.onDispose(() => next.dispose());
  return next;
}

function SidebarView(props: { api: TuiPluginApi }) {
  const resource = resourceFor(props.api);
  const state = resource.state;
  return (
    <Show when={showSidebar(resource.config)}>
      <box gap={0}>
        <text fg={props.api.theme.current.text}><b>Troco</b></text>
        <Show when={state().status === "ready"} fallback={<text fg={props.api.theme.current.textMuted}>{state().message || "loading ad..."}</text>}>
          <text fg={props.api.theme.current.text} wrapMode="word">{label(state().ad)}</text>
          <Show when={balanceLabel(state().balance)}>
            <text fg={props.api.theme.current.textMuted} wrapMode="none">{balanceLabel(state().balance)}</text>
          </Show>
          <text fg={props.api.theme.current.textMuted} wrapMode="none">
            {resource.config.dryRun ? "dry-run" : state().credited === "sent" ? "credited" : state().credited === "skipped" ? "not credited" : "visible"}
          </text>
        </Show>
      </box>
    </Show>
  );
}

function StatusLine(props: { api: TuiPluginApi }) {
  const resource = resourceFor(props.api);
  const state = resource.state;
  const text = () => showStatus(resource.config) && state().status === "ready" ? `* troco · ${balanceLabel(state().balance) || label(state().ad)}` : "";
  return (
    <Show when={text()}>
      <box flexDirection="row" justifyContent="flex-end">
        <text fg={props.api.theme.current.textMuted} wrapMode="none">{text()}</text>
      </box>
    </Show>
  );
}

function PromptWithStatus(props: {
  api: TuiPluginApi;
  sessionID: string;
  visible?: boolean;
  disabled?: boolean;
  onSubmit?: () => void;
  promptRef?: (ref: TuiPromptRef | undefined) => void;
}) {
  return (
    <box gap={0}>
      <props.api.ui.Prompt
        sessionID={props.sessionID}
        visible={props.visible}
        disabled={props.disabled}
        onSubmit={props.onSubmit}
        ref={props.promptRef}
      />
      <StatusLine api={props.api} />
    </box>
  );
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content(_ctx: unknown, _props: { session_id: string }) {
        return <SidebarView api={api} />;
      },
    },
  });

  api.slots.register({
    order: STATUS_ORDER,
    slots: {
      home_bottom() {
        return <StatusLine api={api} />;
      },
      session_prompt(_ctx: unknown, props: { session_id: string; visible?: boolean; disabled?: boolean; on_submit?: () => void; ref?: (ref: TuiPromptRef | undefined) => void }): JSX.Element {
        return (
          <PromptWithStatus
            api={api}
            sessionID={props.session_id}
            visible={props.visible}
            disabled={props.disabled}
            onSubmit={props.on_submit}
            promptRef={props.ref}
          />
        );
      },
    },
  });
};

const pluginModule: TuiPluginModule & { id: string } = { id: ID, tui };
export default pluginModule;
