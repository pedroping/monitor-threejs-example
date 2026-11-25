// Autocomplete rules for the terminal prompt. Pure functions: they take the
// current line and return what it should become; the terminal does the drawing.
//
// The first word completes to a command, later words complete to a section
// name (e.g. "cat pro" -> "cat projects").

const COMMANDS = [
  "cat",
  "echo",
  "help",
  "clear",
  "cls",
  "ls",
  "dir",
  "whoami",
  "id",
  "date",
  "pwd",
  "about",
  "projects",
  "skills",
  "experience",
  "education",
  "awards",
  "contact",
];

const SECTIONS = ["about", "projects", "skills", "experience", "education", "contact", "awards"];

// Commands that take an argument get a trailing space after completion.
const COMMANDS_WITH_ARGUMENT = new Set(["cat", "echo"]);

/** Splits a line into everything before the last word, and the last word. */
function splitLastWord(text) {
  const lastSpace = text.lastIndexOf(" ");
  return {
    prefix: lastSpace >= 0 ? text.slice(0, lastSpace + 1) : "",
    word: (lastSpace >= 0 ? text.slice(lastSpace + 1) : text).toLowerCase(),
    candidates: text.includes(" ") ? SECTIONS : COMMANDS,
  };
}

/** The longest start shared by every word, e.g. ["cat", "cls"] -> "c". */
function longestCommonPrefix(words) {
  return words.reduce((common, word) => {
    while (!word.startsWith(common)) common = common.slice(0, -1);
    return common;
  });
}

/** Adds the trailing space after a fully typed "cat"/"echo". */
export function withArgumentSpace(text) {
  return COMMANDS_WITH_ARGUMENT.has(text) ? `${text} ` : text;
}

/**
 * The grey "ghost text" shown after the cursor: the rest of the first
 * matching word, or "" when there is nothing to suggest.
 */
export function getSuggestion(text) {
  if (!text || text.endsWith(" ")) return "";
  const { word, candidates } = splitLastWord(text);
  if (!word) return "";
  const match = candidates.find((item) => item.startsWith(word) && item !== word);
  return match ? match.slice(word.length) : "";
}

/**
 * What pressing Tab does to `text`:
 *   { kind: "none" }                  nothing matches
 *   { kind: "complete", text }        exactly one match: the completed line
 *   { kind: "extend", text }          several matches sharing a longer start
 *   { kind: "list", matches }         several matches, nothing more to fill in
 */
export function completeOnTab(text) {
  const { prefix, word, candidates } = splitLastWord(text);
  const matches = candidates.filter((item) => item.startsWith(word));

  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "complete", text: withArgumentSpace(prefix + matches[0]) };

  const common = longestCommonPrefix(matches);
  if (common.length > word.length) return { kind: "extend", text: prefix + common };
  return { kind: "list", matches };
}
