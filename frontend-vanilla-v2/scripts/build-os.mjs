// Builds the Angular "Windows XP" portfolio and copies it into ./os, where the
// TV screen loads it in an iframe (see js/scene.js).
//
//   node scripts/build-os.mjs
//
// PORTFOLIO_DIR overrides the Angular workspace location (default ../../portfolio).
// SERVICE_KEY, TEMPLATE_KEY and PUBLIC_KEY (EmailJS) are passed through if set.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, "..");
const portfolioDir = path.resolve(process.env.PORTFOLIO_DIR || path.join(siteDir, "../../portfolio"));
const outDir = path.join(siteDir, "os");
const buildDir = path.join(portfolioDir, "dist-embed");
const BASE = "/os/";

if (!existsSync(path.join(portfolioDir, "nx.json"))) {
  console.error(`Angular workspace not found at ${portfolioDir} (set PORTFOLIO_DIR).`);
  process.exit(1);
}

// Minimal environment: keeps Nx non-interactive and nothing private reaches the bundle.
const env = { PATH: process.env.PATH, CI: "true", NX_NO_CLOUD: "true", NX_DAEMON: "false" };
for (const key of ["SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "SERVICE_KEY", "TEMPLATE_KEY", "PUBLIC_KEY"]) {
  if (process.env[key]) env[key] = process.env[key];
}

const webpackConfig = path.relative(portfolioDir, path.join(here, "webpack.os.cjs")).split(path.sep).join("/");
const args = [
  "nx", "build", "portifolio",
  "--outputPath=dist-embed",
  `--base-href=${BASE}`,
  "--service-worker=false",
  "--skip-nx-cache",
  `--customWebpackConfig.path=${webpackConfig}`,
];
const command = `npx ${args.map((arg) => `"${arg}"`).join(" ")}`;
console.log(`> ${command}`);
const result = spawnSync(command, { cwd: portfolioDir, env, stdio: "inherit", shell: true });
if (result.status !== 0) process.exit(result.status ?? 1);

rmSync(outDir, { recursive: true, force: true });
cpSync(buildDir, outDir, { recursive: true });
rmSync(buildDir, { recursive: true, force: true });

// The app references assets as "/assets/..." (root-absolute), which would hit
// this site's own assets folder. Point them at the app's copy instead.
let rewritten = 0;
for (const file of readdirSync(outDir)) {
  if (!/\.(js|css|html)$/.test(file)) continue;
  const full = path.join(outDir, file);
  const source = readFileSync(full, "utf8");
  const updated = source.replace(/(["'`(])\/assets\//g, (_, quote) => {
    rewritten++;
    return `${quote}${BASE}assets/`;
  });
  if (updated !== source) writeFileSync(full, updated);
}
console.log(`Copied build to ${path.relative(siteDir, outDir)}/ and rewrote ${rewritten} asset paths.`);
