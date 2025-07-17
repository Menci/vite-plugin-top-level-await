/* istanbul ignore file */
let SWC;
try {
  if (process.env.VITE_TLA_FORCE_WASM === "true") {
    throw new Error("Force using @swc/wasm");
  }
  SWC = require("@swc/core");
} catch (e) {
  if (process.env.VITE_TLA_FORCE_NATIVE === "true") {
    throw e;
  }
  SWC = require("@swc/wasm");
}

module.exports = SWC;
