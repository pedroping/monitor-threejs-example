// The interactive terminal: an xterm.js screen plus our own line editor.
//
// xterm only draws characters; it has no idea what a "command line" is. So we
// keep the line being typed ourselves (`line` below), redraw it on every key,
// and call `onCommand` on Enter. On top of that: history (Up/Down), Tab
// completion with grey suggestions, Ctrl shortcuts, clipboard, and a hidden
// textarea that brings up the keyboard on phones.
//
// `Terminal` and `FitAddon` come from the UMD bundles loaded in index.html.
import { playKeyClick, playEnterKey, playTabComplete } from "../audio-fx.js";
import { getSuggestion, completeOnTab, withArgumentSpace } from "./autocomplete.js";
import { createBufferHelpers } from "./buffer.js";

const { Terminal } = window;
const { FitAddon } = window.FitAddon;

const PROMPT = "> ";
const XTERM_OPTIONS = {
  fontFamily: '"Pixelmix", monospace',
  fontSize: 16,
  lineHeight: 1.5,
  cursorBlink: true,
  theme: {
    background: "rgba(0, 0, 0, 0)", // transparent: the CRT element behind shows through
    foreground: "#00ff00",
    cursor: "#00ff00",
    selectionBackground: "#00ff00",
    selectionForeground: "#000000",
  },
  allowTransparency: true,
  rightPadding: 20,
};

// ANSI escape codes used to redraw the line.
const ANSI = {
  clearLine: "\x1b[2K\r",
  clearScreen: "\x1b[H\x1b[2J",
  clearScreenAndScrollback: "\x1b[2J\x1b[3J\x1b[H",
  suggestionColor: "\x1b[38;5;28m", // dark green
  reset: "\x1b[0m",
  moveToColumn: (col) => `\x1b[${col}G`, // 1-based
};

/**
 * Mounts an interactive terminal inside `container`, which must contain a
 * `.terminal-mobile-input` textarea and a `.terminal-xterm` element.
 * `onCommand(line)` is called with the trimmed line on Enter ("" for an empty line).
 */
export function createTerminal(container, { onCommand }) {
  const mobileInput = container.querySelector(".terminal-mobile-input");
  const xtermHost = container.querySelector(".terminal-xterm");

  const term = new Terminal(XTERM_OPTIONS);
  const fitAddon = new FitAddon();

  // --- The line being typed ---

  const line = {
    text: "",
    cursor: 0, // index in `text`
    suggestion: "", // grey completion shown after the text
    history: [], // newest first
    historyIndex: -1, // -1 = not browsing history
  };

  const resetLine = () => {
    line.text = "";
    line.cursor = 0;
    line.suggestion = "";
    line.historyIndex = -1;
  };

  const isCursorAtEnd = () => line.cursor === line.text.length;

  /** Redraws the prompt line (and its suggestion) and places the cursor. */
  const redrawLine = () => {
    line.suggestion = getSuggestion(line.text);
    let output = `${ANSI.clearLine}${PROMPT}${line.text}`;
    if (line.suggestion && isCursorAtEnd()) {
      output += `${ANSI.suggestionColor}${line.suggestion}${ANSI.reset}`;
    }
    term.write(output);
    term.write(ANSI.moveToColumn(PROMPT.length + line.cursor + 1));
  };

  /** Replaces the whole line and puts the cursor at its end. */
  const setLine = (text) => {
    line.text = text;
    line.cursor = text.length;
    line.suggestion = "";
    redrawLine();
  };

  // --- Editing actions ---

  const insertText = (text) => {
    playKeyClick();
    line.text = line.text.slice(0, line.cursor) + text + line.text.slice(line.cursor);
    line.cursor += text.length;
    redrawLine();
  };

  const backspace = () => {
    playKeyClick();
    if (line.cursor > 0) {
      line.text = line.text.slice(0, line.cursor - 1) + line.text.slice(line.cursor);
      line.cursor--;
      redrawLine();
    }
  };

  const deleteForward = () => {
    playKeyClick();
    if (line.cursor < line.text.length) {
      line.text = line.text.slice(0, line.cursor) + line.text.slice(line.cursor + 1);
      redrawLine();
    }
  };

  /** Accepts the grey suggestion. Returns false if there was none to accept. */
  const acceptSuggestion = () => {
    if (!line.suggestion || !isCursorAtEnd()) return false;
    playTabComplete();
    setLine(withArgumentSpace(line.text + line.suggestion));
    return true;
  };

  const handleTab = () => {
    if (acceptSuggestion()) return;

    const result = completeOnTab(line.text);
    if (result.kind === "none") return;

    playTabComplete();
    if (result.kind === "list") {
      term.write(`\r\n${result.matches.join("   ")}\r\n`);
      redrawLine();
    } else {
      setLine(result.text); // "complete" or "extend"
    }
  };

  const submitLine = () => {
    playEnterKey();
    const command = line.text.trim();
    if (command) {
      term.write("\r\n");
      onCommand(command);
      if (line.history[0] !== command) line.history.unshift(command);
    } else {
      onCommand("");
    }
    resetLine();
  };

  /** Shows history entry `index` (-1 = back to an empty line). */
  const showHistoryEntry = (index) => {
    line.historyIndex = index;
    line.text = index >= 0 ? line.history[index] : "";
    line.cursor = line.text.length;
  };

  const moveCursorTo = (position) => {
    line.cursor = position;
    redrawLine();
  };

  // --- Keyboard ---

  const handleCtrlKey = (key) => {
    switch (key) {
      case "l": // clear screen, keep the line
        term.reset();
        term.write(ANSI.clearScreenAndScrollback);
        redrawLine();
        break;
      case "c": // cancel the line
        term.write(`^C\r\n${PROMPT}`);
        line.text = "";
        line.cursor = 0;
        line.suggestion = "";
        break;
      case "u": // delete everything before the cursor
        line.text = line.text.slice(line.cursor);
        moveCursorTo(0);
        break;
      case "a": // start of line
        moveCursorTo(0);
        break;
      case "e": // end of line (or accept the suggestion)
        if (!acceptSuggestion()) moveCursorTo(line.text.length);
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
      case "Tab": // handled earlier, in interceptKey
        break;
      case "Enter":
        submitLine();
        break;
      case "Backspace":
        backspace();
        break;
      case "Delete":
        deleteForward();
        break;
      case "ArrowLeft":
        playKeyClick();
        if (line.cursor > 0) moveCursorTo(line.cursor - 1);
        break;
      case "ArrowRight":
        if (!acceptSuggestion() && line.cursor < line.text.length) {
          playKeyClick();
          moveCursorTo(line.cursor + 1);
        }
        break;
      case "Home":
        playKeyClick();
        moveCursorTo(0);
        break;
      case "End":
        if (!acceptSuggestion()) {
          playKeyClick();
          moveCursorTo(line.text.length);
        }
        break;
      case "ArrowUp": // older entry
        playKeyClick();
        if (line.historyIndex < line.history.length - 1) {
          showHistoryEntry(line.historyIndex + 1);
          redrawLine();
        }
        break;
      case "ArrowDown": // newer entry, then back to an empty line
        playKeyClick();
        if (line.historyIndex >= 0) showHistoryEntry(line.historyIndex - 1);
        redrawLine();
        break;
      default:
        if (key.length === 1) insertText(key); // printable character
    }
  };

  const pasteFromClipboard = () => {
    navigator.clipboard
      .readText()
      .then(insertText)
      .catch(() => {}); // permission denied
  };

  // Runs before xterm handles a key; returning false stops xterm handling it.
  // Used for keys whose browser default (focus change, copy) we must block.
  const interceptKey = (event) => {
    if (event.type !== "keydown") return true;

    if (event.key === "Tab") {
      event.preventDefault(); // don't move focus out of the terminal
      handleTab();
      return false;
    }
    if (event.key === "ArrowRight" && line.suggestion && isCursorAtEnd()) {
      event.preventDefault();
      acceptSuggestion();
      return false;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      // With a selection, Ctrl+C copies; without one it cancels the line.
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

  // --- Phone keyboard: typing goes into a transparent textarea ---

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
  // Columns/rows depend on the font, so fit once it has loaded.
  document.fonts.ready.then(() => fitAddon.fit());

  // --- Public API ---

  return {
    /** Prints text; plain "\n" newlines are converted for the terminal. */
    write: (text) => term.write(text.replace(/\r?\n/g, "\r\n")),

    /** Clears the screen and shows a fresh prompt. */
    clear: () => {
      resetLine();
      term.clear();
      term.write(`${ANSI.clearScreen}${PROMPT}`);
    },

    /** Starts a new prompt line. */
    prompt: () => {
      resetLine();
      term.write(`\r\n${PROMPT}`);
    },

    /** Recomputes columns/rows after the element changed size. */
    fit: () => fitAddon.fit(),

    getDimensions: () => ({ cols: term.cols, rows: term.rows }),

    paste: insertText,

    getSelection: () => term.getSelection(),

    clearSelection: () => term.clearSelection(),

    ...createBufferHelpers(term), // select, selectWordAt, selectLineAt, getLinkAt
  };
}
