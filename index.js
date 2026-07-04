import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { tool } from "@opencode-ai/plugin";

const ID = "opencode-troco";

function readJson(path) {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function loadToken() {
  if (process.env.TROCO_TOKEN) return process.env.TROCO_TOKEN.trim();
  try {
    return readFileSync(join(homedir(), ".troco", "token"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

function loadDiagnostics() {
  return readJson(join(homedir(), ".troco", "opencode-diagnostics.json"));
}

function loadConfig(options = {}) {
  const fileConfig = readJson(join(homedir(), ".config", "opencode", "opencode-troco.json"));
  return {
    apiUrl: "https://troco.dev/api",
    dryRun: true,
    useServe: false,
    realCredit: false,
    minVisibleMs: 15_000,
    placement: "both",
    ...fileConfig,
    ...options,
  };
}

async function requestJson(url, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(1500) });
  return { ok: response.ok, status: response.status, body: response.ok ? await response.json() : null };
}

function formatBRL(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

function balanceLines(body) {
  if (!body) return [];
  const lines = [`today: ${formatBRL(body.hoje)}`];
  if (typeof body.mes === "number") lines.push(`month: ${formatBRL(body.mes)}`);
  lines.push(`total: ${formatBRL(body.total)}`);
  return lines;
}

const server = async (_ctx, options = {}) => {
  const config = loadConfig(options);
  return {
    tool: {
      troco_status: tool({
        description: "Show OpenCode Troco plugin status without exposing secrets.",
        args: {},
        async execute() {
          const token = loadToken();
          let balance = "not checked";
          let gains = [];
          if (token) {
            try {
              const result = await requestJson(`${config.apiUrl}/balance`, token);
              balance = result.ok ? "ok" : `http ${result.status}`;
              gains = balanceLines(result.body);
            } catch {
              balance = "unreachable";
            }
          }
          const diagnostics = loadDiagnostics();
          return [
            "OpenCode Troco",
            `api: ${config.apiUrl}`,
            `token: ${token ? "present" : "missing"}`,
            `balance: ${balance}`,
            ...gains,
            `dryRun: ${Boolean(config.dryRun)}`,
            `useServe: ${Boolean(config.useServe)}`,
            `realCredit: ${Boolean(config.realCredit)}`,
            `placement: ${config.placement}`,
            diagnostics.serveStatus ? `serve: http ${diagnostics.serveStatus} ${diagnostics.serveAdName || "unknown"} nonce:${diagnostics.serveHasNonce ? "yes" : "no"} fm:${diagnostics.serveFm ?? "n/a"}` : null,
            diagnostics.eventStatus ? `event: http ${diagnostics.eventStatus} credited:${diagnostics.eventCredited ? "yes" : "no"} ${diagnostics.eventAdName || "unknown"}` : null,
            diagnostics.eventError ? `event error: ${diagnostics.eventError} ${diagnostics.eventAdName || "unknown"}` : null,
          ].filter(Boolean).join("\n");
        },
      }),
    },
  };
};

export default { id: ID, server };
