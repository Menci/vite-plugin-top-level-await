import * as SWC from "@swc/core";
import { findTopLevelAwait } from "./find";

import { resolveImport } from "./utils/resolve-import";

export interface ModuleInfo {
  imported: string[];
  importedBy: string[];
  transformNeeded: boolean;
}

export type BundleInfo = Record<string, ModuleInfo>;

export async function parseBundleAsts(bundleChunks: Record<string, string>): Promise<Record<string, SWC.Module>> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(bundleChunks).map(
        async ([filename, code]) =>
          [
            filename,
            await SWC.parse(code, {
              syntax: "ecmascript",
              target: "es2022"
            })
          ] as const
      )
    )
  );
}

export async function parseBundleInfo(bundleAsts: Record<string, SWC.Module>): Promise<BundleInfo> {
  const bundleInfo = Object.fromEntries(
    Object.keys(bundleAsts).map(moduleName => [
      moduleName,
      <ModuleInfo>{
        imported: null,
        importedBy: [],
        transformNeeded: null
      }
    ])
  );

  // Pass 1: build dependency graph and its reverse graph
  //         determine top-level await usage in each module
  for (const moduleName in bundleAsts) {
    const ast = bundleAsts[moduleName];
    const moduleInfo = bundleInfo[moduleName];

    // Parse imports
    moduleInfo.imported = ast.body
      .map(item => {
        if (item.type === "ImportDeclaration") {
          return resolveImport(moduleName, item.source.value);
        }
      })
      .filter(x => x);

    // Add reverse edges for dependency graph traversal
    moduleInfo.imported.forEach(importedModuleName => {
      bundleInfo[importedModuleName].importedBy.push(moduleName);
    });

    moduleInfo.transformNeeded = findTopLevelAwait(ast);
  }

  // Pass 2: transfer each modules's "top-level await usage" property to all successors in reverse graph
  const q: string[] = Object.entries(bundleInfo)
    .filter(([, module]) => module.transformNeeded)
    .map(([moduleName]) => moduleName);
  while (q.length > 0) {
    const moduleName = q.shift();

    for (const nextModuleName of bundleInfo[moduleName].importedBy) {
      // Skip modules which are already enqueued once
      if (bundleInfo[nextModuleName].transformNeeded) continue;

      // Enqueue next module
      bundleInfo[nextModuleName].transformNeeded = true;
      q.push(nextModuleName);
    }
  }

  return bundleInfo;
}
