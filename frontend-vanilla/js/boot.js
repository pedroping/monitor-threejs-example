// Simulated Ubuntu "apt update && apt upgrade" boot animation.
import { playDegauss } from "./audio-fx.js";

const PROMPT = "\x1b[1;32muser@portfolio\x1b[0m:\x1b[1;34m~\x1b[0m$ ";
const PACKAGE_SOURCES = [
  "http://archive.ubuntu.com/ubuntu jammy InRelease",
  "http://security.ubuntu.com/ubuntu jammy-security InRelease",
  "http://archive.ubuntu.com/ubuntu jammy-updates InRelease",
  "https://api.github.com/users/MatthewNader2/repos",
  "https://threejs.org/examples/jsm/loaders/GLTFLoader",
  "https://wasm.modules/engine/core.wasm",
];
const PROGRESS_STEPS = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min, spread) => sleep(Math.random() * spread + min);

async function aptUpdate(write) {
  write(`${PROMPT}sudo apt update\r\n`);
  await sleep(350);

  for (const [i, source] of PACKAGE_SOURCES.entries()) {
    const size = Math.floor(Math.random() * 5000) + 1200;
    write(`Get:${i + 1} ${source} [${size} kB]\r\n`);
    await randomDelay(40, 100);
  }

  write("Fetched 24.8 MB in 1s (18.5 MB/s)\r\n");
  write("Reading package lists... Done\r\n");
  write("Building dependency tree... Done\r\n");
  write("Reading state information... Done\r\n");
  write("2 packages can be upgraded. Run 'apt list --upgradable' to see them.\r\n");
}

async function aptUpgrade(write) {
  write(`${PROMPT}sudo apt upgrade -y\r\n`);
  await sleep(400);
  write("Reading package lists... Done\r\n");
  write("Building dependency tree... Done\r\n");
  write("Calculating upgrade... Done\r\n");
  write("The following packages will be upgraded:\r\n");
  write("  portfolio-core wasm-engine\r\n");
  write("2 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\r\n");
  write("Need to get 54.2 MB of archives.\r\n");
  write("After this operation, 1024 KB of additional disk space will be used.\r\n");

  for (let i = 0; i <= PROGRESS_STEPS; i++) {
    const percent = Math.round((i / PROGRESS_STEPS) * 100);
    const bar = "#".repeat(i) + ".".repeat(PROGRESS_STEPS - i);
    write(`\rProgress: [${bar}] ${percent}%`);
    await randomDelay(20, 60);
  }
  write("\r\n");

  write("Unpacking portfolio-core (1.0.2) over (1.0.1)...\r\n");
  await sleep(150);
  write("Setting up wasm-engine (2.4.0)...\r\n");
  await sleep(150);
  write("Processing triggers for libc-bin (2.35-0ubuntu3.1)...\r\n");
  await sleep(300);
  write("System successfully initialized.\r\n");
  await sleep(500);
}

/** Plays the boot animation, then leaves the terminal at a fresh prompt. */
export async function runBootSequence(terminal) {
  playDegauss();
  const write = (text) => terminal.write(text);
  terminal.clear();

  await aptUpdate(write);
  await aptUpgrade(write);

  terminal.clear();
  write("Welcome to Matthew's Interactive Portfolio!\r\n");
  write("Type 'help' or 'ls' for a list of commands and sections.\r\n");
  terminal.prompt();
}
