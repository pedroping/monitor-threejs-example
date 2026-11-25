// xterm.js wrapper: line editing, autocomplete, history, mobile input and the
// selection/link helpers the 3D raycaster needs.
// `Terminal` and `FitAddon` come from the UMD bundles loaded in index.html.
import { playKeyClick, playEnterKey, playTabComplete } from "./audio-fx.js";

const { Terminal } = window;
const { FitAddon } = window.FitAddon;

const AVAILABLE_COMMANDS = [
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
const AVAILABLE_SECTIONS = [
  "about",
  "projects",
  "skills",
  "experience",
  "education",
  "contact",
  "awards",
];

// Commands that take an argument get a trailing space after completion.
const COMMANDS_WITH_ARGUMENT = new Set(["cat", "echo"]);

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Mounts an interactive terminal inside `container`.
 * `onCommand(line)` is called with the trimmed line on Enter ("" for an empty line).
 */
export function createTerminal(container, { onCommand }) {
  const mobileInput = container.querySelector(".terminal-mobile-input");
  const xtermHost = container.querySelector(".terminal-xterm");

  const term = new Terminal({
    fontFamily: '"Pixelmix", monospace',
    fontSize: 16,
    lineHeight: 1.5,
    cursorBlink: true,
    theme: {
      background: "rgba(0, 0, 0, 0)",
      foreground: "#00ff00",
      cursor: "#00ff00",
      selectionBackground: "#00ff00",
      selectionForeground: "#000000",
    },
    allowTransparency: true,
    rightPadding: 20,
  });
  const fitAddon = new FitAddon();

  const line = {
    text: "",
    cursor: 0,
    history: [],
    historyIndex: -1,
    suggestion: "",
  };

  const resetLine = () => {
    line.text = "";
    line.cursor = 0;
    line.suggestion = "";
    line.historyIndex = -1;
  };

  // --- Line editing ---

  const lastWordInfo = (text) => {
    const lastSpace = text.lastIndexOf(" ");
    return {
      prefix: lastSpace >= 0 ? text.slice(0, lastSpace + 1) : "",
      word: (lastSpace >= 0 ? text.slice(lastSpace + 1) : text).toLowerCase(),
      // First word completes commands; later words complete section names.
      source: text.includes(" ") ? AVAILABLE_SECTIONS : AVAILABLE_COMMANDS,
    };
  };

  const getSuggestion = (text) => {
    if (!text || text.endsWith(" ")) return "";
    const { word, source } = lastWordInfo(text);
    if (!word) return "";
    const match = source.find((item) => item.startsWith(word) && item.toLowerCase() !== word);
    return match ? match.slice(word.length) : "";
  };

  const isCursorAtEnd = () => line.cursor === line.text.length;

  const redrawLine = () => {
    line.suggestion = getSuggestion(line.text);
    let output = `\x1b[2K\r> ${line.text}`;
    if (line.suggestion && isCursorAtEnd()) {
      output += `\x1b[38;5;28m${line.suggestion}\x1b[0m`;
    }
    term.write(output);
    term.write(`\x1b[${line.cursor + 3}G`);
  };

  const setCompletedLine = (text) => {
    line.text = COMMANDS_WITH_ARGUMENT.has(text) ? `${text} ` : text;
    line.cursor = line.text.length;
    line.suggestion = "";
    redrawLine();
  };

  const insertText = (text) => {
    playKeyClick();
    line.text = line.text.slice(0, line.cursor) + text + line.text.slice(line.cursor);
    line.cursor += text.length;
    redrawLine();
  };

  const acceptSuggestion = () => {
    if (!line.suggestion || !isCursorAtEnd()) return false;
    playTabComplete();
    setCompletedLine(line.text + line.suggestion);
    return true;
  };

  const longestCommonPrefix = (words) =>
    words.reduce((lcp, word) => {
      while (!word.startsWith(lcp)) lcp = lcp.slice(0, -1);
      return lcp;
    });

  const handleTab = () => {
    if (acceptSuggestion()) return;

    const { prefix, word, source } = lastWordInfo(line.text);
    const matches = source.filter((item) => item.startsWith(word));
    if (matches.length === 0) return;

    playTabComplete();
    if (matches.length === 1) {
      setCompletedLine(prefix + matches[0]);
      return;
    }

    const lcp = longestCommonPrefix(matches);
    if (lcp.length > word.length) {
      line.text = prefix + lcp;
      line.cursor = line.text.length;
      line.suggestion = "";
    } else {
      term.write(`\r\n${matches.join("   ")}\r\n`);
    }
    redrawLine();
  };

  const submitLine = () => {
    playEnterKey();
    const trimmed = line.text.trim();
    if (trimmed) {
      term.write("\r\n");
      onCommand(trimmed);
      if (line.history[0] !== trimmed) {
        line.history.unshift(trimmed);
      }
    } else {
      onCommand("");
    }
    resetLine();
  };

  const backspace = () => {
    playKeyClick();
    if (line.cursor > 0) {
      line.text = line.text.slice(0, line.cursor - 1) + line.text.slice(line.cursor);
      line.cursor--;
      redrawLine();
    }
  };

  const showHistoryEntry = (index) => {
    line.historyIndex = index;
    line.text = index >= 0 ? line.history[index] : "";
    line.cursor = line.text.length;
  };

  // --- Keyboard ---

  const handleCtrlKey = (key) => {
    switch (key) {
      case "l": // Clear screen
        term.reset();
        term.write("\x1b[2J\x1b[3J\x1b[H");
        redrawLine();
        break;
      case "c": // Cancel line
        term.write("^C\r\n> ");
        line.text = "";
        line.cursor = 0;
        line.suggestion = "";
        break;
      case "u": // Clear line before cursor
        line.text = line.text.slice(line.cursor);
        line.cursor = 0;
        redrawLine();
        break;
      case "a": // Start of line
        line.cursor = 0;
        redrawLine();
        break;
      case "e": // End of line / accept suggestion
        if (!acceptSuggestion()) {
          line.cursor = line.text.length;
          redrawLine();
        }
        break;
    }
  };

  const handleKey = ({ key, domEvent }) => {
    if (domEvent.ctrlKey) {
      handleCtrlKey(domEvent.key.toLowerCase());
      return;
    }
    if (domEvent.altKey || domEvent.metaKey) return;

    switch (domEvent.key) {
      case "Tab": // Handled by the custom key event handler
        break;
      case "Enter":
        submitLine();
        break;
      case "Backspace":
        backspace();
        break;
      case "Delete":
        playKeyClick();
        if (line.cursor < line.text.length) {
          line.text = line.text.slice(0, line.cursor) + line.text.slice(line.cursor + 1);
          redrawLine();
        }
        break;
      case "ArrowLeft":
        playKeyClick();
        if (line.cursor > 0) {
          line.cursor--;
          redrawLine();
        }
        break;
      case "ArrowRight":
        if (!acceptSuggestion() && line.cursor < line.text.length) {
          playKeyClick();
          line.cursor++;
          redrawLine();
        }
        break;
      case "Home":
        playKeyClick();
        line.cursor = 0;
        redrawLine();
        break;
      case "End":
        if (!acceptSuggestion()) {
          playKeyClick();
          line.cursor = line.text.length;
          redrawLine();
        }
        break;
      case "ArrowUp":
        playKeyClick();
        if (line.historyIndex < line.history.length - 1) {
          showHistoryEntry(line.historyIndex + 1);
          redrawLine();
        }
        break;
      case "ArrowDown":
        playKeyClick();
        if (line.historyIndex >= 0) {
          showHistoryEntry(line.historyIndex - 1);
        }
        redrawLine();
        break;
      default:
        if (key.length === 1) insertText(key);
    }
  };

  const pasteFromClipboard = () => {
    navigator.clipboard
      .readText()
      .then(insertText)
      .catch(() => {});
  };

  // Runs before xterm's own handling; returning false swallows the event.
  const interceptKey = (event) => {
    if (event.type !== "keydown") return true;

    if (event.key === "Tab") {
      event.preventDefault();
      handleTab();
      return false;
    }

    if (event.key === "ArrowRight" && line.suggestion && isCursorAtEnd()) {
      event.preventDefault();
      acceptSuggestion();
      return false;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      const selection = term.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
        return false;
      }
    }

    if ((event.ctrlKey && event.key.toLowerCase() === "v") || (event.shiftKey && event.key === "Insert")) {
      pasteFromClipboard();
      return false;
    }
    return true;
  };

  // --- Mobile keyboard (hidden textarea) ---

  mobileInput.addEventListener("input", () => {
    if (mobileInput.value) insertText(mobileInput.value);
    mobileInput.value = "";
  });

  mobileInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitLine();
    else if (event.key === "Backspace") backspace();
    else return;
    event.preventDefault();
  });

  container.addEventListener("click", () => {
    term.focus();
    mobileInput.focus();
  });

  // --- Mount ---

  term.loadAddon(fitAddon);
  term.open(xtermHost);
  term.focus();
  term.attachCustomKeyEventHandler(interceptKey);
  term.onKey(handleKey);
  document.fonts.ready.then(() => fitAddon.fit());

  // --- Buffer helpers (rows are viewport-relative) ---

  const bufferRow = (row) => row + term.buffer.active.viewportY;
  const getLineString = (row, trimRight) =>
    term.buffer.active.getLine(bufferRow(row))?.translateToString(trimRight) ?? null;

  return {
    write: (text) => term.write(text.replace(/\r?\n/g, "\r\n")),

    clear: () => {
      resetLine();
      term.clear();
      term.write("\x1b[H\x1b[2J> ");
    },

    prompt: () => {
      resetLine();
      term.write("\r\n> ");
    },

    fit: () => fitAddon.fit(),

    getDimensions: () => ({ cols: term.cols, rows: term.rows }),

    paste: insertText,

    getSelection: () => term.getSelection(),

    clearSelection: () => term.clearSelection(),

    select: (col, row, length) => term.select(col, bufferRow(row), length),

    selectWordAt: (col, row) => {
      const str = getLineString(row, false);
      if (!str || !str[col] || str[col] === " ") return;
      let start = col;
      let end = col;
      while (start > 0 && str[start - 1] && str[start - 1] !== " ") start--;
      while (end < str.length && str[end] && str[end] !== " ") end++;
      term.select(start, bufferRow(row), end - start);
    },

    selectLineAt: (row) => term.select(0, bufferRow(row), term.cols),

    getLinkAt: (col, row) => {
      const str = getLineString(row, true);
      if (!str) return null;
      for (const match of str.matchAll(URL_REGEX)) {
        if (col >= match.index && col < match.index + match[0].length) {
          return match[0];
        }
      }
      return null;
    },
  };
}
