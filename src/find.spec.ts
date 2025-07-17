/// <reference types="jest-extended" />

import * as SWC from "./swc";

import { CodePattern, findHighestPattern } from "./find";

function test(highestPattern: CodePattern, code: string) {
  expect(findHighestPattern(SWC.parseSync(code, { target: "es2022", syntax: "ecmascript" }))).toBe(highestPattern);
}

describe("Find top-level await usage in module", () => {
  it("should work with top-level await", () => {
    test(
      CodePattern.TopLevelAwait,
      `
      await Promise.resolve(0);
    `
    );
  });

  it("should work with top-level await in a complex expression", () => {
    test(
      CodePattern.TopLevelAwait,
      `
      const x = x?.y[fun([await z])];
    `
    );
  });

  it("should work without top-level await", () => {
    test(
      null,
      `
      console.log("qwq");
    `
    );
  });

  it("should work with top-level for-await statements", () => {
    test(
      CodePattern.TopLevelAwait,
      `
      for await (const x of y) {
        console.log(x);
      }
    `
    );
  });

  it("should work with top-level for (non-await) statements", () => {
    test(
      null,
      `
      for (const x of y) {
        console.log(x);
      }
    `
    );
  });

  it("should work with top-level await in block statements", () => {
    test(
      CodePattern.TopLevelAwait,
      `
      for (const x of y) {
        if (x === 1) {
          console.log(await x.func());
        }
      }
    `
    );
  });

  it("should work with await in functions", () => {
    test(
      null,
      `
      console.log(async () => await x.func());
      async function test() {
        for await (const y of x) {
          console.log(y);
        }
      }
    `
    );
  });

  it("should work with await in class methods", () => {
    test(
      null,
      `
      const Class = class Class {
        async method() {
          await x.func();
        }
      }

      class Class2 {
        async method2() {
          for await (const y of x) {
            console.log(y);
          }
        }
      }
    `
    );
  });

  it("should work with dynamic import but without top-level await", () => {
    test(
      CodePattern.DynamicImport,
      `
      function qwqwq() {
        return import("qwq");
      }
    `
    );
  });

  it("should work with await in object method property", () => {
    test(
      null,
      `
      const obj = {
        async method() {
          await x.func();
        }
      }
    `
    );
  });
});
