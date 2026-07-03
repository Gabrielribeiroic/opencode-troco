#!/usr/bin/env bash
set -euo pipefail

repo="Gabrielribeiroic/opencode-troco"
branch="main"
package="opencode-troco"
config_dir="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
package_spec="github:${repo}#${branch}"

need() {
  command -v "$1" >/dev/null 2>&1 || { printf 'missing required command: %s\n' "$1" >&2; exit 1; }
}

need node
need npm

mkdir -p "$config_dir"

node --input-type=module - "$config_dir" "$package" "$package_spec" <<'NODE'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [configDir, packageName, packageSpec] = process.argv.slice(2)

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.error(`${path} is not valid JSON: ${error.message}`)
    process.exit(1)
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function samePlugin(item, value) {
  return item === value || (Array.isArray(item) && item[0] === value)
}

function addUniquePlugin(list, value) {
  if (!Array.isArray(list)) return [value]
  return list.some((item) => samePlugin(item, value)) ? list : [...list, value]
}

const packageJsonPath = join(configDir, 'package.json')
const packageJson = readJson(packageJsonPath, {})
packageJson.dependencies = { ...(packageJson.dependencies || {}), [packageName]: packageSpec }
writeJson(packageJsonPath, packageJson)

const serverConfigPath = join(configDir, 'opencode.json')
const serverConfig = readJson(serverConfigPath, { $schema: 'https://opencode.ai/config.json' })
serverConfig.$schema ||= 'https://opencode.ai/config.json'
serverConfig.plugin = addUniquePlugin(serverConfig.plugin, packageName)
writeJson(serverConfigPath, serverConfig)

const tuiConfigPath = join(configDir, 'tui.json')
const tuiConfig = readJson(tuiConfigPath, { $schema: 'https://opencode.ai/tui.json' })
tuiConfig.$schema ||= 'https://opencode.ai/tui.json'
tuiConfig.plugin = addUniquePlugin(tuiConfig.plugin, join(configDir, 'node_modules', packageName, 'tui.tsx'))
writeJson(tuiConfigPath, tuiConfig)

const trocoConfigPath = join(configDir, 'opencode-troco.json')
if (!existsSync(trocoConfigPath)) {
  writeJson(trocoConfigPath, {
    apiUrl: 'https://troco.dev/api',
    dryRun: true,
    useServe: false,
    realCredit: false,
    minVisibleMs: 15000,
    placement: 'both',
  })
}
NODE

npm install --prefix "$config_dir"

printf '\nopencode-troco installed. Restart OpenCode to load the plugin.\n'
printf 'Config: %s\n' "$config_dir/opencode-troco.json"
printf 'Default mode is dry-run; no /events calls are made unless you opt in.\n'
