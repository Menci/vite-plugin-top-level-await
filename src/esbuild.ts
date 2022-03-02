// Import the `esbuild` package installed by `vite`

import path from "path";
const Module = require("module");

function requireFrom(self: any, contextModuleName: string, wantedModuleName: string) {
  const contextModulePath = Module._resolveFilename(contextModuleName, self);
  const virtualModule = new Module(contextModulePath, module);
  virtualModule.filename = contextModulePath;
  virtualModule.paths = Module._nodeModulePaths(path.dirname(contextModulePath));
  return virtualModule.require(wantedModuleName);
}

export default requireFrom(module, "vite", "esbuild") as typeof import("esbuild");
