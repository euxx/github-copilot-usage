"use strict";

/**
 * Redirect `require('vscode')` to the test mock before any test module loads.
 * This patches Node's module resolver so that all require('vscode') calls in
 * source files and test files resolve to our local mock during testing.
 */

const Module = require("module");
const path = require("path");

const mockPath = path.resolve(__dirname, "__mocks__/vscode.js");
const originalResolveFilename = Module._resolveFilename.bind(Module);

Module._resolveFilename = function (request, ...args) {
  if (request === "vscode") {
    return mockPath;
  }
  return originalResolveFilename(request, ...args);
};
