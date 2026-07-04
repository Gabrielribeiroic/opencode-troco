// Builds tui.js from tui.tsx using Solid's real compiler (babel-preset-solid,
// universal renderer for @opentui/solid). OpenCode's TUI loader chokes on raw
// .tsx because @opentui/solid/jsx-runtime is types-only (no jsxDEV); a plain
// esbuild --jsx-factory=createElement transform produces React-shaped calls
// that Solid can't wire reactively. This matches @opentui/solid's own onLoad
// transform (scripts/solid-plugin.ts), so imports stay unbundled and resolve
// from node_modules at load time.
// ponytail: transform-only, no bundling — Bun resolves solid-js/@opentui at load.
import { transformAsync } from "@babel/core";
import solid from "babel-preset-solid";
import ts from "@babel/preset-typescript";
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("tui.tsx", "utf8");
const out = await transformAsync(src, {
  filename: "tui.tsx",
  configFile: false,
  babelrc: false,
  presets: [[solid, { moduleName: "@opentui/solid", generate: "universal" }], [ts]],
});

if (!out?.code) throw new Error("babel produced no output");
writeFileSync("tui.js", `// GENERATED from tui.tsx by build.mjs — do not edit. Run: npm run build\n${out.code}`);
console.log(`tui.js written (${out.code.length} bytes)`);
