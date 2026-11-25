// Live GitHub sync: adds public repositories that are not in content.js yet,
// so new projects show up in `cat projects` without editing the site.
import { formatProject } from "./formatters.js";

const GITHUB_REPOS_URL = "https://api.github.com/users/MatthewNader2/repos?per_page=100&sort=updated";

// "My-Repo_v2" and "myrepov2" count as the same repository.
const normalizeRepoName = (name) => name.toLowerCase().replace(/[-_.]/g, "");

// "my-cool_repo" -> "My Cool Repo"
const toTitle = (repoName) => repoName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** The repository name inside a github.com link, if there is one. */
const repoNameFromLink = (link) => (link || "").match(/github\.com\/[^/]+\/([^/.]+)/i)?.[1];

/**
 * Returns `projects` (already formatted) plus every public repository not
 * already linked from one of them. Unstarred forks are skipped. On any
 * failure (offline, rate limit) the input is returned unchanged.
 */
export async function addGitHubRepos(projects) {
  try {
    const response = await fetch(GITHUB_REPOS_URL, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!response.ok) return projects;
    const repos = await response.json();
    if (!Array.isArray(repos)) return projects;

    const knownNames = new Set(projects.map((p) => repoNameFromLink(p.github)).filter(Boolean).map(normalizeRepoName));

    const merged = [...projects];
    for (const repo of repos) {
      if (repo.fork && repo.stargazers_count === 0) continue;
      const name = normalizeRepoName(repo.name);
      if (knownNames.has(name)) continue;
      knownNames.add(name);

      const language = repo.language || "Software";
      const stars = repo.stargazers_count > 0 ? ` | ${repo.stargazers_count} ★` : "";
      merged.push(
        formatProject({
          title: toTitle(repo.name),
          subtitle: `${language}${stars}`,
          description: repo.description || `Open-source ${language} project by Matthew Nader.`,
          github: repo.html_url,
        }),
      );
    }
    return merged;
  } catch (err) {
    console.warn("GitHub live sync skipped:", err);
    return projects;
  }
}
