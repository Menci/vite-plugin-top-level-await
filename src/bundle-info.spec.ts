/// <reference types="jest-extended" />

import { parseBundleAsts, parseBundleInfo } from "./bundle-info";

function makeTestcase(
  dependencyGraph: Record<string, string[]>,
  moduleWithTopLevelAwait: string[]
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dependencyGraph).map(([moduleName, importedModules]) => [
      moduleName,
      importedModules.map(name => `import ${name} from "${name}";\n`).join("") +
        (moduleWithTopLevelAwait.includes(moduleName) ? "await Promise.resolve(0);\n" : "") +
        "export default null;\n"
    ])
  );
}

describe("Bundle info parser", () => {
  it("should parse AST of esnext code with SWC correctly", async () => {
    const chunks = {
      a: `
        import { x } from "b";
        const w = await x?.y?.z;
        export { w };
      `,
      b: `
        import { w } from "a";
        const x = await w?.x?.y;
        export { x };
      `
    };

    const bundleAsts = await parseBundleAsts(chunks);

    for (const moduleName in chunks) {
      expect(bundleAsts[moduleName]).toBeObject();
      expect(bundleAsts[moduleName].type).toBe("Module");
    }
  });

  it("should parse dependency graph correctly", async () => {
    const dependencyGraph = {
      a: ["b", "c", "d"],
      b: ["c", "d"],
      c: [],
      d: ["b", "f"],
      e: ["a", "c"],
      f: ["g"],
      g: ["h"],
      h: ["i"],
      i: []
    };
    const bundleInfo = await parseBundleInfo(await parseBundleAsts(makeTestcase(dependencyGraph, [])));

    for (const moduleName in bundleInfo) {
      expect(bundleInfo[moduleName].imported).toIncludeSameMembers(dependencyGraph[moduleName]);
      expect(bundleInfo[moduleName].importedBy).toIncludeSameMembers(
        Object.entries(dependencyGraph)
          .filter(([, imports]) => imports.includes(moduleName))
          .map(([name]) => name)
      );
    }
  });

  it("should determine which modules need transform correctly", async () => {
    const dependencyGraph = {
      a: ["b", "c", "d"],
      b: ["c", "d"],
      c: [],
      d: ["b", "f"],
      e: ["a", "c"],
      f: ["g"],
      g: ["h"],
      h: ["i"],
      i: []
    };
    const moduleWithTopLevelAwait = ["f", "h"];
    const bundleInfo = await parseBundleInfo(
      await parseBundleAsts(makeTestcase(dependencyGraph, moduleWithTopLevelAwait))
    );

    const expectedModulesNeedTransform = ["a", "b", "d", "e", "f", "g", "h"];
    expect(
      Object.entries(bundleInfo)
        .filter(([, info]) => info.transformNeeded)
        .map(([name]) => name)
    ).toIncludeSameMembers(expectedModulesNeedTransform);
  });
});
