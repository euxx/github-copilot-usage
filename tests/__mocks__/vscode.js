"use strict";

/**
 * Minimal vscode mock for Vitest.
 * No vi.fn() usage — this file loads in a plain Node context before test globals.
 */

class MarkdownString {
  constructor(value = "") {
    this.value = value;
    this.isTrusted = false;
  }
  appendText(text) {
    this.value += text;
    return this;
  }
  appendMarkdown(md) {
    this.value += md;
    return this;
  }
}

class ThemeColor {
  constructor(id) {
    this.id = id;
  }
}

const StatusBarAlignment = { Left: 1, Right: 2 };

const workspace = {
  getConfiguration: () => ({ get: (_key, defaultValue) => defaultValue }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
};

const window = {
  createStatusBarItem: () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {},
    text: "",
    tooltip: undefined,
    color: undefined,
    command: undefined,
  }),
};

const authentication = {
  getSession: () => Promise.resolve(null),
};

const commands = {
  registerCommand: () => ({ dispose: () => {} }),
};

const extensions = {
  getExtension: () => null,
};

module.exports = {
  MarkdownString,
  ThemeColor,
  StatusBarAlignment,
  workspace,
  window,
  authentication,
  commands,
  extensions,
};
