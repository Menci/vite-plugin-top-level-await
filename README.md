# vite-plugin-top-level-await

[![Test Status](https://img.shields.io/github/actions/workflow/status/Menci/vite-plugin-top-level-await/test.yaml?branch=main&style=flat-square)](https://github.com/Menci/vite-plugin-top-level-await/actions?query=workflow%3ATest)
[![npm](https://img.shields.io/npm/v/vite-plugin-top-level-await?style=flat-square)](https://www.npmjs.com/package/vite-plugin-top-level-await)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg?style=flat-square)](http://commitizen.github.io/cz-cli/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![License](https://img.shields.io/github/license/Menci/vite-plugin-top-level-await?style=flat-square)](LICENSE)

Transform code to support top-level await in normal browsers for Vite. Support all modern browsers of Vite's default target without need to set `build.target` to `esnext`.

## Installation

```bash
yarn add -D vite-plugin-top-level-await
```

## Usage

Put this plugin in your plugin list. At most case you don't need to care the order, but if there're any plugin transforming bundle before it, there's a little chance that this plugin fails to parse code since it does only parse Rollup's output `export { ... }` export statement.

```typescript
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: "__tla",
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: i => `__tla_${i}`
    })
  ]
});
```

## Workers

You can use this plugin for workers (by putting it in `config.worker.plugins`).

* If the worker format is ES, the plugin works normally.
* If the worker format is IIFE, the plugin first let Vite build your worker as an ES bundle since IIFE doesn't support top-level awaits, and then build the transformed ES bundle to IIFE. Please use IIFE when targeting Firefox.
  ```js
  const myWorker = import.meta.env.DEV
      // In development mode, `import`s in workers are not transformed, so you
      // must use `{ type: "module" }`.
    ? new Worker(new URL("./my-worker.js", import.meta.url), { type: "module" })
      // In build mode, let Vite and vite-plugin-top-level-await build a single-file
      // bundle of your worker that works on both modern browsers and Firefox.
    : new Worker(new URL("./my-worker.js", import.meta.url), { type: "classic" });
  ```

## Note

This plugin transforms code from:

```js
import { a } from "./a.js"; // This module uses top-level await
import { b } from "./b.js"; // This module uses top-level await too
import { c } from "./c.js"; // This module does NOT use top-level await

const x = 1;
await b.func();
const { y } = await somePromise;

export { x, y };
```

To:

```js
import { a, __tla as __tla_0 } from "./a.js"; // This module uses top-level await
import { b, __tla as __tla_1 } from "./b.js"; // This module uses top-level await too
import { c } from "./c.js"; // This module does NOT use top-level await

// Original exported variables
let x, y;

// Await imported TLA promises and execute original top-level statements
let __tla = Promise.all([
  (() => { try { return __tla_0; } catch {} })(),
  (() => { try { return __tla_1; } catch {} })()
]).then(async () => {
  // Transform exported variables to assignments
  x = 1;

  await b.func();

  // Destructing patterns (and function / class declarations as well) are handled correctly
  ({ y } = await somePromise);
});

// Export top-level await promise
export { x, y, __tla };
```

It could handle **correct usage** of circular dependencies with the default behavior of ES standard. But when an TLA dependency is being awaited, an accessing to one of its exports **will NOT raise an exception**. At most time you don't need to care about this. These *could* be supported by doing more transformations of the whole AST but it will make building a lot slower. Open an issue and tell me your scenario if you really need the exception.
