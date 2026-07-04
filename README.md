<p align="center">
  <img src="assets/opencode-logo-light.svg" alt="OpenCode" height="96" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://troco.dev/mark-coin.svg" alt="Troco" height="96" />
</p>

<h1 align="center">opencode-troco</h1>

<p align="center">
  Troco sidebar and status-line ads for OpenCode.
</p>

<p align="center">
  <a href="https://github.com/Gabrielribeiroic/opencode-troco"><img src="https://img.shields.io/badge/OpenCode-plugin-111111?style=flat-square" alt="OpenCode plugin"></a>
  <a href="https://troco.dev"><img src="https://img.shields.io/badge/Troco-unofficial-2FB266?style=flat-square" alt="Unofficial Troco integration"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" alt="GPL-3.0"></a>
  <a href="#install"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20WSL-a78bfa?style=flat-square" alt="Platform"></a>
</p>

---

`opencode-troco` brings the Troco ad surface into OpenCode without patching OpenCode itself. It registers a server plugin for diagnostics and a TUI plugin for sidebar/status-line display, then reads Troco balance data so you can see daily, monthly, and total gains inside OpenCode.

By default it is safe: it fetches public ads and never posts credit events. Real crediting is present, but must be explicitly enabled.

> [!IMPORTANT]
> This is an unofficial integration. I am not associated with OpenCode or Troco, and I am not responsible for how you use this code, what traffic you generate, or whether your usage complies with Troco's rules. Read the code before enabling real crediting.

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/Gabrielribeiroic/opencode-troco/main/install.sh | bash
```

Then restart OpenCode.

The installer is intentionally non-destructive:

- It preserves existing OpenCode plugins.
- It appends `opencode-troco` only if missing.
- It appends the TUI plugin path only if missing.
- It creates safe dry-run config only when no config exists.
- It does not read, print, change, or delete your Troco token.

## What It Shows

- A Troco ad in the OpenCode sidebar, status line, or both.
- Daily, monthly, and total gains from `GET /balance` fields `hoje`, `mes`, and `total`.
- Diagnostic status through the `troco_status` OpenCode tool.

## Install

### Automatic

```bash
curl -fsSL https://raw.githubusercontent.com/Gabrielribeiroic/opencode-troco/main/install.sh | bash
```

The script updates files under `~/.config/opencode`:

| File | Change |
|---|---|
| `package.json` | Adds `opencode-troco` as a GitHub dependency |
| `opencode.jsonc` or `opencode.json` | Adds the server plugin without removing existing plugins |
| `tui.json` | Adds the TUI plugin without removing existing plugins |
| `opencode-troco.json` | Creates safe dry-run defaults if missing |

Restart OpenCode after installation. OpenCode loads config and plugins at startup.

### Manual

Add the package dependency to `~/.config/opencode/package.json`:

```jsonc
{
  "dependencies": {
    "opencode-troco": "github:Gabrielribeiroic/opencode-troco#main"
  }
}
```

Install it:

```bash
npm install --prefix ~/.config/opencode
```

Add the server plugin to your active OpenCode config. If `~/.config/opencode/opencode.jsonc` exists, update that file; otherwise update `~/.config/opencode/opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-troco"]
}
```

Add the TUI plugin to `~/.config/opencode/tui.json`:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-troco"]
}
```

Create optional safe config at `~/.config/opencode/opencode-troco.json`:

```json
{
  "apiUrl": "https://troco.dev/api",
  "dryRun": true,
  "useServe": false,
  "realCredit": false,
  "minVisibleMs": 15000,
  "placement": "both"
}
```

## Configuration

`opencode-troco` reads `~/.config/opencode/opencode-troco.json` if present.

| Field | Default | Description |
|---|---:|---|
| `apiUrl` | `https://troco.dev/api` | Troco API base URL |
| `dryRun` | `true` | When true, never posts `/events` |
| `useServe` | `false` | Use paid `GET /serve` instead of public `GET /ads` |
| `realCredit` | `false` | Allows real credit event posting when all gates pass |
| `minVisibleMs` | `15000` | Visibility time before local dry-run or real event |
| `placement` | `both` | `sidebar`, `status`, or `both` |

The plugin reads the Troco token from `TROCO_TOKEN` first, then `~/.troco/token`.

## Real Crediting

Real crediting is triple-gated. All three settings must be explicit:

```json
{
  "dryRun": false,
  "useServe": true,
  "realCredit": true,
  "placement": "sidebar"
}
```

Only then will the plugin call `GET /serve` and, after `minVisibleMs`, post `POST /events` with `tipo: "view_threshold_met"`.

Use `placement: "sidebar"` for real crediting. Showing the same paid ad in multiple OpenCode surfaces can create confusing duplicate impressions.

## Diagnostics

Ask OpenCode to run the `troco_status` tool. It reports config, token presence, balance connectivity, and safe gain totals without printing secrets.

Example:

```text
OpenCode Troco
api: https://troco.dev/api
token: present
balance: ok
today: R$ 0,01
month: R$ 0,42
total: R$ 1,23
dryRun: true
useServe: false
realCredit: false
placement: both
```

## LLM Agent Install Guide

If you are an LLM agent installing this for a user, follow this exact path:

1. Do not overwrite existing OpenCode config.
2. Prefer the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/Gabrielribeiroic/opencode-troco/main/install.sh | bash
```

3. If installing manually, parse and merge JSON. Never replace the whole file unless it does not exist.
4. In `~/.config/opencode/package.json`, add or update only `dependencies["opencode-troco"]`.
5. If `~/.config/opencode/opencode.jsonc` exists, append only `"opencode-troco"` to that file's `plugin` array; otherwise use `~/.config/opencode/opencode.json`.
6. In `~/.config/opencode/tui.json`, append only `"opencode-troco"` if missing.
7. Create `~/.config/opencode/opencode-troco.json` only if it does not exist, and use dry-run defaults.
8. Run `npm install --prefix ~/.config/opencode`.
9. Tell the user to restart OpenCode.
10. Do not print `~/.troco/token`, call `/events`, or enable real crediting unless the user explicitly asks.

Minimal safe config for agents to write only when missing:

```json
{
  "apiUrl": "https://troco.dev/api",
  "dryRun": true,
  "useServe": false,
  "realCredit": false,
  "minVisibleMs": 15000,
  "placement": "both"
}
```

## Development

```bash
npm install
npm run check
```

Project files:

| File | Purpose |
|---|---|
| `index.js` | Server plugin and `troco_status` tool |
| `tui.tsx` | Source for the OpenCode TUI slots (sidebar/status display) |
| `tui.js` | Built TUI plugin loaded by OpenCode (`npm run build` from `tui.tsx`) |
| `build.mjs` | Compiles `tui.tsx` to `tui.js` with the Solid compiler |
| `install.sh` | Non-destructive OpenCode installer |
| `opencode-troco.example.json` | Safe config example |

## Disclaimer

This project is provided as-is, without warranty. I am not affiliated with OpenCode, Troco, or their maintainers. You are responsible for your own configuration, token handling, generated traffic, real-credit behavior, and compliance with any applicable terms or policies.

## License

GPL-3.0-only. See [`LICENSE`](LICENSE).
