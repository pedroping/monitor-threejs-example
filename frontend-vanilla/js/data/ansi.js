// Text helpers for terminal output: ANSI colors and word wrapping.
//
// ANSI escape codes ("\x1b[...m") change the color of the text that follows.
// They take no space on screen, so they must be ignored when measuring lines.

/** Width of the terminal text, in characters, used for word wrapping. */
export const TERMINAL_COLS = 44;

const RESET = "\x1b[0m";
export const green = (text) => `\x1b[1;32m${text}${RESET}`; // bold green
export const white = (text) => `\x1b[1;37m${text}${RESET}`; // bold white
export const cyan = (text) => `\x1b[36m${text}${RESET}`;

/** "   >> Python" with the name in green: one line of the skills list. */
export const skillBullet = (item) => `   >> ${green(item)}`;

const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");

/**
 * Word-wraps `text` to `maxWidth` visible columns, keeping existing line
 * breaks. Wrapped lines start with `indent`.
 */
export function wrapText(text, maxWidth, indent = "") {
  if (!text) return "";
  const available = maxWidth - indent.length;
  return text
    .trim()
    .split(/\r?\n/)
    .map((paragraph) => {
      if (!paragraph.trim()) return "";
      const [first, ...rest] = paragraph.trim().split(/\s+/);
      const lines = [];
      let current = first;
      for (const word of rest) {
        if (stripAnsi(current).length + 1 + stripAnsi(word).length <= available) {
          current += ` ${word}`;
        } else {
          lines.push(current);
          current = word;
        }
      }
      lines.push(current);
      return lines.join(`\n${indent}`);
    })
    .join(`\n${indent}`);
}
