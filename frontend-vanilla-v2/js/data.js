// Builds the portfolio JSON handed to the WASM engine, plus the ASCII-art
// cache used to expand the placeholders the engine echoes back.
import { FALLBACK_PORTFOLIO_DATA as FALLBACK } from "./fallback-data.js";

const TERMINAL_COLS = 44;
const GITHUB_REPOS_URL = "https://api.github.com/users/MatthewNader2/repos?per_page=100&sort=updated";
const SKILL_KEYS = ["languages", "frameworks_libraries", "tools_platforms", "concepts"];

const DEVICON = "https://cdn.jsdelivr.net/gh/devicons/devicon/icons";
const SKILL_ICONS = {
  "c": `${DEVICON}/c/c-original.svg`,
  "c++": `${DEVICON}/cplusplus/cplusplus-original.svg`,
  "c/c++": `${DEVICON}/cplusplus/cplusplus-original.svg`,
  matlab: `${DEVICON}/matlab/matlab-original.svg`,
  "c#": `${DEVICON}/csharp/csharp-original.svg`,
  "three.js": `${DEVICON}/threejs/threejs-original.svg`,
  react: `${DEVICON}/react/react-original.svg`,
  python: `${DEVICON}/python/python-original.svg`,
  javascript: `${DEVICON}/javascript/javascript-original.svg`,
  typescript: `${DEVICON}/typescript/typescript-original.svg`,
  linux: `${DEVICON}/linux/linux-original.svg`,
  git: `${DEVICON}/git/git-original.svg`,
  docker: `${DEVICON}/docker/docker-original.svg`,
  arduino: `${DEVICON}/arduino/arduino-original.svg`,
  unity: `${DEVICON}/unity/unity-original.svg`,
  opencv: `${DEVICON}/opencv/opencv-original.svg`,
  pytorch: `${DEVICON}/pytorch/pytorch-original.svg`,
  flask: `${DEVICON}/flask/flask-original.svg`,
  bash: `${DEVICON}/bash/bash-original.svg`,
  rust: `${DEVICON}/rust/rust-original.svg`,
  ros: `${DEVICON}/ros/ros-original.svg`,
  cmake: `${DEVICON}/cmake/cmake-original.svg`,
};

// ASCII art rendered during boot, substituted into engine output on demand.
const asciiCache = {
  profile: "",
  icons: {},
};

// --- Text helpers ---

const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, "");

/** Word-wraps `text` to `maxWidth` visible columns, ignoring ANSI codes. */
function wrapText(text, maxWidth, indent = "") {
  if (!text) return "";
  const available = maxWidth - indent.length;
  return text
    .trim()
    .split(/\r?\n/)
    .map((para) => {
      if (!para.trim()) return "";
      const [first, ...rest] = para.trim().split(/\s+/);
      const lines = [];
      let currentLine = first;
      for (const word of rest) {
        if (stripAnsi(currentLine).length + 1 + stripAnsi(word).length <= available) {
          currentLine += ` ${word}`;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
      lines.push(currentLine);
      return lines.join(`\n${indent}`);
    })
    .join(`\n${indent}`);
}

const green = (text) => `\x1b[1;32m${text}\x1b[0m`;
const skillBullet = (item) => `   >> ${green(item)}`;

// --- ASCII art ---

const ASCII_RAMP = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Renders an image as true-color ANSI ASCII art; resolves "" on any failure. */
async function generateAsciiArt(imageUrl, width = 60) {
  if (!imageUrl) return "";
  try {
    const img = await loadImage(imageUrl);
    const height = Math.max(1, Math.floor((img.height / img.width) * width * 0.5));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;

    let ascii = "";
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const [r, g, b, alpha] = data.subarray(offset, offset + 4);
        if (alpha < 20) {
          ascii += " ";
          continue;
        }
        const charIndex = Math.floor(((r + g + b) / 3 / 255) * (ASCII_RAMP.length - 1));
        const char = ASCII_RAMP[ASCII_RAMP.length - 1 - charIndex] || ".";
        ascii += `\x1b[38;2;${r};${g};${b}m${char}`;
      }
      ascii += "\x1b[0m\n";
    }
    return ascii;
  } catch {
    return "";
  }
}

/** Replaces the [[PROFILE_ART]] / [[ICON:key]] placeholders in engine output. */
export function expandPlaceholders(output) {
  return output
    .replace("[[PROFILE_ART]]", () => asciiCache.profile)
    .replace(/\[\[ICON:(.*?)\]\]/g, (_, skillKey) => asciiCache.icons[skillKey] || "");
}

// --- Section formatters ---

function findSkillIcon(name) {
  const isCombinedC = name === "c/c++" || name === "c / c++";
  const key = Object.keys(SKILL_ICONS).find(
    (k) => name === k || (isCombinedC && (k === "c" || k === "c++" || k === "c/c++")),
  );
  return key ? SKILL_ICONS[key] : null;
}

/** Skill line, preceded by an icon placeholder when its ASCII icon renders. */
async function formatSkill(item) {
  const name = String(item).toLowerCase().trim();
  const iconUrl = findSkillIcon(name);
  if (iconUrl) {
    const ascii = await generateAsciiArt(iconUrl, 24);
    if (ascii) {
      asciiCache.icons[name] = `\n${ascii}\n`;
      return `[[ICON:${name}]]\n${skillBullet(item)}`;
    }
  }
  return skillBullet(item);
}

async function formatSkills() {
  const entries = await Promise.all(
    SKILL_KEYS.map(async (key) => {
      const items = await Promise.all((FALLBACK.skills[key] || []).map(formatSkill));
      return [key, items.length > 0 ? items : ["  N/A"]];
    }),
  );
  return Object.fromEntries(entries);
}

/** About text, preceded by a profile-art placeholder when a picture is configured. */
async function formatAbout() {
  const content = wrapText(FALLBACK.about.content, TERMINAL_COLS);
  asciiCache.profile = await generateAsciiArt(FALLBACK.about.profile_picture_url, 70);
  return { content: asciiCache.profile ? `[[PROFILE_ART]]\n${content}` : content };
}

const formatProject = (p) => ({
  title: green(p.title),
  subtitle: p.subtitle,
  description: wrapText(p.description, TERMINAL_COLS - 6, "      "),
  github: p.github,
});

const formatExperience = (e) => ({
  title: green(e.title),
  company: `\x1b[1;37m${e.company}\x1b[0m`,
  duration: `\x1b[36m${e.duration}\x1b[0m`,
  description: e.description.map((l) => wrapText(l, TERMINAL_COLS - 6, "    ")),
});

// --- GitHub live sync ---

const normalizeRepoName = (name) => name.toLowerCase().replace(/[-_.]/g, "");

/** Appends public GitHub repos not already listed; returns the input on any failure. */
async function fetchAndMergeGitHubRepos(existingProjects) {
  try {
    const res = await fetch(GITHUB_REPOS_URL, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) return existingProjects;
    const repos = await res.json();
    if (!Array.isArray(repos)) return existingProjects;

    const knownNames = new Set(
      existingProjects
        .map((p) => (p.github || "").match(/github\.com\/[^/]+\/([^/.]+)/i)?.[1])
        .filter(Boolean)
        .map(normalizeRepoName),
    );

    const merged = [...existingProjects];
    for (const repo of repos) {
      if (repo.fork && repo.stargazers_count === 0) continue;
      const normName = normalizeRepoName(repo.name);
      if (knownNames.has(normName)) continue;
      knownNames.add(normName);

      const lang = repo.language || "Software";
      const stars = repo.stargazers_count > 0 ? ` | ${repo.stargazers_count} ★` : "";
      merged.push(
        formatProject({
          title: repo.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          subtitle: `${lang}${stars}`,
          description: repo.description || `Open-source ${lang} project by Matthew Nader.`,
          github: repo.html_url,
        }),
      );
    }
    return merged;
  } catch (err) {
    console.warn("GitHub live sync skipped:", err);
    return existingProjects;
  }
}

// --- Public builders ---

/** Rich data: wrapped about text, ASCII skill icons and live GitHub projects. */
async function buildRichData() {
  const [about, skills, projects] = await Promise.all([
    formatAbout(),
    formatSkills(),
    fetchAndMergeGitHubRepos(FALLBACK.projects.map(formatProject)),
  ]);
  return {
    about,
    contact: FALLBACK.contact,
    education: FALLBACK.education,
    skills,
    projects,
    experience: FALLBACK.experience.map(formatExperience),
    awards: FALLBACK.awards,
  };
}

/** Plain data: same sections without any ASCII art. */
async function buildPlainData() {
  return {
    about: { content: FALLBACK.about.content },
    contact: FALLBACK.contact,
    education: FALLBACK.education,
    skills: Object.fromEntries(SKILL_KEYS.map((key) => [key, FALLBACK.skills[key].map(skillBullet)])),
    projects: await fetchAndMergeGitHubRepos(FALLBACK.projects.map(formatProject)),
    experience: FALLBACK.experience.map(formatExperience),
    awards: FALLBACK.awards,
  };
}

/** Returns the portfolio as the JSON string expected by the WASM engine. */
export async function buildPortfolioData() {
  try {
    return JSON.stringify(await buildRichData());
  } catch (err) {
    console.warn("Rich portfolio formatting failed, using plain data:", err);
    return JSON.stringify(await buildPlainData());
  }
}
