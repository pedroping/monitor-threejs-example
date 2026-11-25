// Builds the portfolio JSON that the C engine reads on every command.
//
//   content.js (raw text) --formatters.js--> colored, wrapped sections
//                         --github.js------> + live GitHub repositories
//                         --JSON.stringify-> passed to process_command()
import { PORTFOLIO_CONTENT as CONTENT } from "./content.js";
import { formatAbout, formatSkills, formatSkillsPlain, formatProject, formatExperience } from "./formatters.js";
import { addGitHubRepos } from "./github.js";

export { expandPlaceholders } from "./ascii-art.js";

/** Full version: wrapped about text, ASCII skill icons and live GitHub projects. */
async function buildRichData() {
  const [about, skills, projects] = await Promise.all([
    formatAbout(CONTENT.about),
    formatSkills(CONTENT.skills),
    addGitHubRepos(CONTENT.projects.map(formatProject)),
  ]);
  return {
    about,
    contact: CONTENT.contact,
    education: CONTENT.education,
    skills,
    projects,
    experience: CONTENT.experience.map(formatExperience),
    awards: CONTENT.awards,
  };
}

/** Safe version used if the full one fails: same sections, no ASCII art. */
async function buildPlainData() {
  return {
    about: { content: CONTENT.about.content },
    contact: CONTENT.contact,
    education: CONTENT.education,
    skills: formatSkillsPlain(CONTENT.skills),
    projects: await addGitHubRepos(CONTENT.projects.map(formatProject)),
    experience: CONTENT.experience.map(formatExperience),
    awards: CONTENT.awards,
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
