/// <reference types="jest-extended" />

import * as SWC from "@swc/core";

import { findTopLevelAwait } from "./find";

function test(hasTopLevelAwait: boolean, code: string) {
  expect(findTopLevelAwait(SWC.parseSync(code, { target: "es2022", syntax: "ecmascript" }))).toBe(hasTopLevelAwait);
}

describe("Find top-level await usage in module", () => {
  it("should return true with top-level await", () => {
    test(
      true,
      `
      await Promise.resolve(0);
    `
    );
  });

  it("should return true with top-level await in a complex expression", () => {
    test(
      true,
      `
      const x = x?.y[fun([await z])];
    `
    );
  });

  it("should return false without top-level await", () => {
    test(
      false,
      `
      console.log("qwq");
    `
    );
  });

  it("should return true with top-level for-await statements", () => {
    test(
      true,
      `
      for await (const x of y) {
        console.log(x);
      }
    `
    );
  });

  it("should return false with top-level for (non-await) statements", () => {
    test(
      false,
      `
      for (const x of y) {
        console.log(x);
      }
    `
    );
  });

  it("should return true with top-level await in block statements", () => {
    test(
      true,
      `
      for (const x of y) {
        if (x === 1) {
          console.log(await x.func());
        }
      }
    `
    );
  });

  it("should return false with await in functions", () => {
    test(
      false,
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

  it("should return false with await in class methods", () => {
    test(
      false,
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
});
