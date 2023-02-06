/// <reference types="jest-extended" />

import * as SWC from "@swc/core";

import { BundleInfo } from "./bundle-info";
import { DEFAULT_OPTIONS } from "./options";
import { transformModule } from "./transform";

function test(moduleName: string, bundleInfo: BundleInfo, code: string, expectedResult: string) {
  const parse = (code: string) => SWC.parseSync(code, { target: "es2022", syntax: "ecmascript" });
  const print = (ast: SWC.Module) => SWC.printSync(ast).code;

  const originalAst = parse(code);
  const transformedAst = transformModule(code, originalAst, moduleName, bundleInfo, DEFAULT_OPTIONS);

  expect(print(transformedAst)).toBe(print(parse(expectedResult)));
}

describe("Transform top-level await", () => {
  it("should work for a module without imports/exports", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      await globalThis.somePromise;
    `,
      `
      (async () => {
        await globalThis.somePromise;
      })();
    `
    );
  });

  it("should work for a module with imports", () => {
    test(
      "a",
      {
        a: { imported: ["./b"], importedBy: [], transformNeeded: true, withTopLevelAwait: true },
        b: { imported: [], importedBy: ["./a"], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      import { qwq } from "./b";
      await globalThis.somePromise;
    `,
      `
      import { qwq, __tla as __tla_0 } from "./b";
      Promise.all(
        [(() => { try { return __tla_0; } catch {} })()]
      ).then(async () => {
        await globalThis.somePromise;
      });
    `
    );
  });

  it("should work for a module with exports", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const w = 0;
      const x = await globalThis.somePromise;
      const y = w + 1;
      export { x, y as z };
    `,
      `
      let x, y;
      let __tla = (async () => {
        const w = 0;
        x = await globalThis.somePromise;
        y = w + 1;
      })();
      export { x, y as z, __tla };
    `
    );
  });

  it("should work for a module with imports/exports", () => {
    test(
      "a",
      {
        a: { imported: ["./b"], importedBy: [], transformNeeded: true, withTopLevelAwait: true },
        b: { imported: [], importedBy: ["./a"], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      import { qwq } from "./b";
      const x = await globalThis.somePromise;
      const y = 1;
      export { x, y as z };
    `,
      `
      import { qwq, __tla as __tla_0 } from "./b";
      let x, y;
      let __tla = Promise.all(
        [(() => { try { return __tla_0; } catch {} })()]
      ).then(async () => {
        x = await globalThis.somePromise;
        y = 1;
      });
      export { x, y as z, __tla };
    `
    );
  });

  it("should work for a module with multiple imports (some with TLA)", () => {
    test(
      "a",
      {
        a: { imported: ["./b", "./c", "./d"], importedBy: [], transformNeeded: true, withTopLevelAwait: true },
        b: { imported: [], importedBy: ["./a"], transformNeeded: true, withTopLevelAwait: true },
        c: { imported: [], importedBy: ["./a"], transformNeeded: false, withTopLevelAwait: false },
        d: { imported: [], importedBy: ["./a"], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      import { qwq } from "./b";
      import { quq as qvq } from "./c";
      import { default as qaq } from "./d";
      const x = await qvq[qaq].someFunc(globalThis.somePromise);
      const y = 1;
      export { x, y as default };
    `,
      `
      import { qwq, __tla as __tla_0 } from "./b";
      import { quq as qvq } from "./c";
      import { default as qaq, __tla as __tla_1 } from "./d";
      let x, y;
      let __tla = Promise.all([
        (() => { try { return __tla_0; } catch {} })(),
        (() => { try { return __tla_1; } catch {} })()
      ]).then(async () => {
        x = await qvq[qaq].someFunc(globalThis.somePromise);
        y = 1;
      });
      export { x, y as default, __tla };
    `
    );
  });

  it("should work for a module with export functions", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const x = await globalThis.somePromise;
      function f0(args) { return Math.max(...args); }
      function f1(args) { return f1(...args, 0); }
      function* f2(args) { yield globalThis.qwq; }
      async function f3(args) { await Promise.all(globalThis.promises); }
      export { x, f1 as func1, f2 as func2, f3 as func3 };
    `,
      `
      let x, f1, f2, f3;
      let __tla = (async () => {
        x = await globalThis.somePromise;
        function f0(args) { return Math.max(...args); }
        f1 = function f1(args) { return f1(...args, 0); };
        f2 = function* f2(args) { yield globalThis.qwq; };
        f3 = async function f3(args) { await Promise.all(globalThis.promises); };
      })();
      export { x, f1 as func1, f2 as func2, f3 as func3, __tla };
    `
    );
  });

  it("should work for a module with export classes", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const x = await globalThis.somePromise;
      class C0 { method0() { return 0; } }
      class C1 extends C0 { method1() { return 1; } }
      class C2 extends C1 { method2() { return 2; } }
      export { x, C0 as Class0, C2 as Class2 };
    `,
      `
      let x, C0, C2;
      let __tla = (async () => {
        x = await globalThis.somePromise;
        C0 = class C0 { method0() { return 0; } };
        class C1 extends C0 { method1() { return 1; } }
        C2 = class C2 extends C1 { method2() { return 2; } };
      })();
      export { x, C0 as Class0, C2 as Class2, __tla };
    `
    );
  });

  it("should work for a module with exports of complex object destructuring", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const { x, _0: { _1: { y, z } } = { _0: { _1: { y: 1, z: "" } } }, ...w } = await globalThis.somePromise;
      export { x, z as zzz, w };
    `,
      `
      let x, z, w;
      let __tla = (async () => {
        let y;
        ({ x, _0: { _1: { y, z } } = { _0: { _1: { y: 1, z: "" } } }, ...w } = await globalThis.somePromise);
      })();
      export { x, z as zzz, w, __tla };
    `
    );
  });

  it("should work for a module with exports of complex array destructuring", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const [x, [[[y, z] = [0, 1], w], ...u] = globalThis.someArray, ...v] = await globalThis.somePromise;
      export { x, y as yyy, w as www, u as uuu };
    `,
      `
      let x, y, w, u
      let __tla = (async () => {
        let z, v;
        [x, [[[y, z] = [0, 1], w], ...u] = globalThis.someArray, ...v] = await globalThis.somePromise;
      })();
      export { x, y as yyy, w as www, u as uuu, __tla };
    `
    );
  });

  it("should work for a module with plugin-injected function/class exports", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const x = await globalThis.somePromise;
      function f0(args) { return Math.max(...args); }
      export function f1(args) { return f1(...args, 0); }
      export function* f2(args) { yield globalThis.qwq; }
      export async function f3(args) { await Promise.all(globalThis.promises); }
      export class c1 { qwq = 1 }
      export { x };
    `,
      `
      let f1, f2, f3, c1, x;
      let __tla = (async () => {
        x = await globalThis.somePromise;
        function f0(args) { return Math.max(...args); }
        f1 = function f1(args) { return f1(...args, 0); };
        f2 = function* f2(args) { yield globalThis.qwq; };
        f3 = async function f3(args) { await Promise.all(globalThis.promises); };
        c1 = class c1 { qwq = 1 };
      })();
      export { f1, f2, f3, c1, x, __tla };
    `
    );
  });

  it("should work for a module with default export declaration (with function name)", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const a = await globalThis.somePromise;
      export default function A(b, c, d) { return a; }
    `,
      `
      let A;
      let __tla = (async () => {
        const a = await globalThis.somePromise;
        A = function A(b, c, d) { return a; };
      })();
      export { A as default, __tla };
    `
    );
  });

  it("should work for a module with default export declaration (with class name)", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const a = await globalThis.somePromise;
      export default class A { prop = "qwq"; }
    `,
      `
      let A;
      let __tla = (async () => {
        const a = await globalThis.somePromise;
        A = class A { prop = "qwq"; };
      })();
      export { A as default, __tla };
    `
    );
  });

  it("should work for a module with default export declaration (without name)", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const a = await globalThis.somePromise;
      export default function (b, c, d) { return a; }
    `,
      `
      let var_69d2a4fc_d77c_5996_9dda_fc4d543f0a82;
      let __tla = (async () => {
        const a = await globalThis.somePromise;
        var_69d2a4fc_d77c_5996_9dda_fc4d543f0a82 = function (b, c, d) { return a; };
      })();
      export { var_69d2a4fc_d77c_5996_9dda_fc4d543f0a82 as default, __tla };
    `
    );
  });

  it("should work for a module with default export expression", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const a = await globalThis.somePromise;
      export default globalThis.someFunc().someProp + "qwq";
    `,
      `
      let var_b51c2b27_5763_5458_95c3_0273366c9dee;
      let __tla = (async () => {
        const a = await globalThis.somePromise;
        var_b51c2b27_5763_5458_95c3_0273366c9dee = globalThis.someFunc().someProp + "qwq";
      })();
      export { var_b51c2b27_5763_5458_95c3_0273366c9dee as default, __tla };
    `
    );
  });

  it("should work for a module with manual re-exports", () => {
    test(
      "a",
      {
        a: { imported: ["./b"], importedBy: [], transformNeeded: true, withTopLevelAwait: true },
        b: { imported: [], importedBy: ["./a"], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      import { default as qwq } from "./b";
      export { qwq };
    `,
      `
      import { default as qwq, __tla as __tla_0 } from "./b";
      let __tla = Promise.all([
        (() => { try { return __tla_0; } catch {} })(),
      ]).then(async () => {});
      export { qwq, __tla };
    `
    );
  });

  it("should skip processing imports of external modules", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      import React from "https://esm.run/react";
      import path from "path";
      import MuiMaterial from "@mui/material";
      const x = await globalThis.someFunc(React, path);
      export { x as y };
    `,
      `
      import React from "https://esm.run/react";
      import path from "path";
      import MuiMaterial from "@mui/material";
      let x;
      let __tla = (async () => {
        x = await globalThis.someFunc(React, path);
      })();
      export { x as y, __tla };
    `
    );
  });

  it("should transform dynamic imports correctly", () => {
    test(
      "a",
      {
        a: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true },
        b: { imported: [], importedBy: [], transformNeeded: false, withTopLevelAwait: false },
        c: { imported: [], importedBy: [], transformNeeded: true, withTopLevelAwait: true }
      },
      `
      const x = await Promise.all([
        import("./b"),
        import("./c"),
        import(globalThis.dynamicModuleName)
      ]);
      export { x as y };
    `,
      `
      let x;
      let __tla = (async () => {
        x = await Promise.all([
          import("./b"),
          import("./c").then(async m => { await m.__tla; return m; }),
          import(globalThis.dynamicModuleName).then(async m => { await m.__tla; return m; })
        ]);
      })();
      export { x as y, __tla };
    `
    );
  });
  it("should fail gracefully if bundleInfo is undefined", () => {
    test(
      "css-module.js",
      {},
      `
    await globalThis.someFunc(import("./css-module.js"));
  `,
      `
    (async () => {
      await globalThis.someFunc(import("./css-module.js"));
    })();
  `
    );
  });
});
