// Turns the raw portfolio content into terminal-ready text: colors, wrapping
// and ASCII-art placeholders. Each function handles one section.
import { TERMINAL_COLS, green, white, cyan, skillBullet, wrapText } from "./ansi.js";
import { asciiCache, generateAsciiArt } from "./ascii-art.js";

// Indentation of wrapped description lines, so they line up under the title.
const PROJECT_INDENT = "      ";
const EXPERIENCE_INDENT = "    ";
// Both descriptions wrap at the same width.
const DESCRIPTION_WIDTH = TERMINAL_COLS - 6;

const DEVICON = "https://cdn.jsdelivr.net/gh/devicons/devicon/icons";
/** Skill name (lowercase) -> icon image, rendered as ASCII art next to it. */
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

/** The skill categories, in the order the engine prints them. */
export const SKILL_KEYS = ["languages", "frameworks_libraries", "tools_platforms", "concepts"];

// --- About ---

/** About text, preceded by a profile-art placeholder when a picture is set. */
export async function formatAbout(about) {
  const content = wrapText(about.content, TERMINAL_COLS);
  asciiCache.profile = await generateAsciiArt(about.profile_picture_url, 70);
  return { content: asciiCache.profile ? `[[PROFILE_ART]]\n${content}` : content };
}

// --- Skills ---

function findSkillIcon(name) {
  // "C/C++" can use the icon of C, C++ or C/C++, whichever is listed first.
  const isCombinedC = name === "c/c++" || name === "c / c++";
  const key = Object.keys(SKILL_ICONS).find(
    (k) => name === k || (isCombinedC && (k === "c" || k === "c++" || k === "c/c++")),
  );
  return key ? SKILL_ICONS[key] : null;
}

/** One skill line, preceded by an icon placeholder when its icon renders. */
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

/** All skill categories with icons: { languages: [...lines], ... }. */
export async function formatSkills(skills) {
  const entries = await Promise.all(
    SKILL_KEYS.map(async (key) => {
      const lines = await Promise.all((skills[key] || []).map(formatSkill));
      return [key, lines.length > 0 ? lines : ["  N/A"]];
    }),
  );
  return Object.fromEntries(entries);
}

/** All skill categories as plain lines, without icons. */
export function formatSkillsPlain(skills) {
  return Object.fromEntries(SKILL_KEYS.map((key) => [key, skills[key].map(skillBullet)]));
}

// --- Projects and experience ---

export const formatProject = (project) => ({
  title: green(project.title),
  subtitle: project.subtitle,
  description: wrapText(project.description, DESCRIPTION_WIDTH, PROJECT_INDENT),
  github: project.github,
});

export const formatExperience = (job) => ({
  title: green(job.title),
  company: white(job.company),
  duration: cyan(job.duration),
  description: job.description.map((line) => wrapText(line, DESCRIPTION_WIDTH, EXPERIENCE_INDENT)),
});
