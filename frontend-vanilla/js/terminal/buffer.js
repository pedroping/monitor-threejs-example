// Reading and selecting text in the xterm buffer, by on-screen cell.
// Used by interaction.js, which works out the cell under the mouse.
//
// Rows passed in are *viewport* rows (0 = top visible line). xterm's buffer
// also holds the scrollback above, so they are offset by `viewportY`.

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/** Creates the selection/link helpers for an xterm `Terminal`. */
export function createBufferHelpers(term) {
  const bufferRow = (row) => row + term.buffer.active.viewportY;
  const lineText = (row, trimRight) =>
    term.buffer.active.getLine(bufferRow(row))?.translateToString(trimRight) ?? null;

  return {
    /** Selects `length` cells starting at (col, row), wrapping across lines. */
    select: (col, row, length) => term.select(col, bufferRow(row), length),

    /** Selects the word (run of non-space characters) under (col, row). */
    selectWordAt: (col, row) => {
      const text = lineText(row, false);
      if (!text || !text[col] || text[col] === " ") return;
      let start = col;
      let end = col;
      while (start > 0 && text[start - 1] && text[start - 1] !== " ") start--;
      while (end < text.length && text[end] && text[end] !== " ") end++;
      term.select(start, bufferRow(row), end - start);
    },

    /** Selects the whole line at `row`. */
    selectLineAt: (row) => term.select(0, bufferRow(row), term.cols),

    /** Returns the http(s) URL under (col, row), or null. */
    getLinkAt: (col, row) => {
      const text = lineText(row, true);
      if (!text) return null;
      for (const match of text.matchAll(URL_REGEX)) {
        if (col >= match.index && col < match.index + match[0].length) return match[0];
      }
      return null;
    },
  };
}
