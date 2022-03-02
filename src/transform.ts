import * as SWC from "@swc/core";

import { BundleInfo } from "./bundle-info";
import { Options } from "./options";
import { raiseUnexpectedNode } from "./utils/error";
import {
  makeIdentifier,
  makeAssignmentStatement,
  makeVariablesDeclaration,
  makeImportSpecifier,
  makeArrayExpression,
  makeCallExpression,
  makeArrowFunction,
  makeTryCatchStatement,
  makeReturnStatement,
  makeMemberExpression,
  makeVariableInitDeclaration,
  makeExportListDeclaration,
  makeStatement
} from "./utils/make-node";
import { resolveImport } from "./utils/resolve-import";
import { resolvePattern } from "./utils/resolve-pattern";

export function transformModule(ast: SWC.Module, moduleName: string, bundleInfo: BundleInfo, options: Options) {
  // Extract import declarations
  const imports = ast.body.filter((item): item is SWC.ImportDeclaration => item.type === "ImportDeclaration");

  // Extract export declarations
  // In Rollup's output, there should be only one, and as the last top-level statement
  const exports = ast.body.filter((item): item is SWC.ExportNamedDeclaration => {
    switch (item.type) {
      /* istanbul ignore next */
      case "ExportAllDeclaration":
      /* istanbul ignore next */
      case "ExportDefaultDeclaration":
      /* istanbul ignore next */
      case "ExportDefaultExpression":
      /* istanbul ignore next */
      case "ExportDeclaration":
        raiseUnexpectedNode("top-level statement", item.type);
      case "ExportNamedDeclaration":
        item.specifiers.forEach(specifier => {
          /* istanbul ignore if */
          if (specifier.type !== "ExportSpecifier") {
            raiseUnexpectedNode("export specifier", specifier.type);
          }
        });
        return true;
    }

    return false;
  });

  const exportMap = Object.fromEntries(
    exports.flatMap(item =>
      item.specifiers.map(({ orig, exported }: SWC.NamedExportSpecifier) => [(exported || orig).value, orig.value])
    )
  );
  const exportedNames = Object.values(exportMap);
  const exportedNameSet = new Set(exportedNames);

  /*
   * Move ALL top-level statements to an async IIFE:
   *
   * ```js
   * export let __tla = Promise.all([
   *   // imported TLA promises
   * ]).then(async () => {
   *   // original top-level statements here
   * });
   * ```
   *
   * And add variable declarations for exported names to new top-level, before the IIFE.
   *
   * ```js
   * let x;
   * export let __tla = Promise.all([
   *   // imported TLA promises
   * ]).then(async () => {
   *   // const x = 1;
   *   x = 1;
   * });
   * export { x as someExport };
   * ```
   */

  const topLevelStatements = ast.body.filter(
    (item): item is SWC.Statement =>
      !(imports as SWC.ModuleItem[]).includes(item) && !(exports as SWC.ModuleItem[]).includes(item)
  );
  const exportedNamesDeclaration = makeVariablesDeclaration(exportedNames);
  const warppedStatements = topLevelStatements.flatMap<SWC.Statement>(stmt => {
    if (stmt.type === "VariableDeclaration") {
      const declaredNames = stmt.declarations.flatMap(decl => resolvePattern(decl.id));
      const exportedDeclaredNames = declaredNames.filter(name => exportedNameSet.has(name));
      const unexportedDeclaredNames = declaredNames.filter(name => !exportedNameSet.has(name));

      // None is exported in the declared names, no need to transform
      if (exportedDeclaredNames.length === 0) return stmt;

      // Generate assignment statements for init-ed declarators
      const assignmentStatements = stmt.declarations
        .filter(decl => decl.init)
        .map(decl => makeAssignmentStatement(decl.id, decl.init));

      // Generate variable declarations for unexported variables
      const unexportedDeclarations = makeVariablesDeclaration(unexportedDeclaredNames);

      return unexportedDeclarations ? [unexportedDeclarations, ...assignmentStatements] : assignmentStatements;
    } else if (stmt.type === "FunctionDeclaration") {
      const name = stmt.identifier.value;
      if (!exportedNameSet.has(name)) return stmt;

      return makeAssignmentStatement(makeIdentifier(name), <SWC.FunctionExpression>{
        ...stmt,
        type: "FunctionExpression"
      });
    } else if (stmt.type === "ClassDeclaration") {
      const name = stmt.identifier.value;
      if (!exportedNameSet.has(name)) return stmt;

      return makeAssignmentStatement(makeIdentifier(name), <SWC.ClassExpression>{
        ...stmt,
        type: "ClassExpression"
      });
    } else {
      return stmt;
    }
  });

  /*
   * Import and await the promise "__tla" from each imported module with TLA transform enabled.
   *
   * ```js
   * import { ..., __tla as __tla_0 } from "...";
   * import { ..., __tla as __tla_1 } from "...";
   * ```
   *
   * To work with circular dependency, wrap each imported promise with try-catch.
   * Promises from circular dependencies will not be imported and awaited.
   *
   * export let __tla = Promise.all([
   *   (() => { try { return __tla_0; } catch {} })(),
   *   (() => { try { return __tla_1; } catch {} })()
   * ]).then(async () => {
   *   // original top-level statements here
   * });
   */

  // Add import of TLA promises from imported modules
  let importedPromiseCount = 0;
  for (const importDeclaration of imports) {
    const importedModuleName = resolveImport(moduleName, importDeclaration.source.value);
    if (!importedModuleName) continue;

    if (bundleInfo[importedModuleName].transformNeeded) {
      importDeclaration.specifiers.push(
        makeImportSpecifier(options.promiseExportName, options.promiseImportName(importedPromiseCount))
      );
      importedPromiseCount++;
    }
  }

  const importedPromiseArray =
    importedPromiseCount === 0
      ? null
      : makeArrayExpression(
          [...Array(importedPromiseCount).keys()].map(i =>
            makeCallExpression(
              makeArrowFunction([
                makeTryCatchStatement([makeReturnStatement(makeIdentifier(options.promiseImportName(i)))], [])
              ])
            )
          )
        );

  // The `async () => { /* original top-level statements */ }` function
  const wrappedTopLevelFunction = makeArrowFunction(warppedStatements, true);

  // `Promise.all([ /* ... */]).then(async () => { /* ... */ })` or `(async () => {})()`
  const promiseExpression = importedPromiseArray
    ? makeCallExpression(
        makeMemberExpression(
          makeCallExpression(makeMemberExpression("Promise", "all"), [importedPromiseArray]),
          "then"
        ),
        [wrappedTopLevelFunction]
      )
    : makeCallExpression(wrappedTopLevelFunction);

  /*
   * New top-level after transformation:
   *
   * import { ..., __tla as __tla_0 } from "some-module-with-TLA";
   * import { ... } from "some-module-without-TLA";
   *
   * let some, variables, exported, from, original, top, level;
   *
   * let __tla = Promise.all([ ... ]).then(async () => {
   *   ...
   * });
   *
   * export { ..., __tla };
   */

  const newTopLevel: SWC.ModuleItem[] = [...imports, exportedNamesDeclaration];

  if (exportedNames.length > 0 || bundleInfo[moduleName].importedBy.length > 0) {
    // If the chunk is being imported, append export of the TLA promise to export list
    const promiseDeclaration = makeVariableInitDeclaration(options.promiseExportName, promiseExpression);
    exportMap[options.promiseExportName] = options.promiseExportName;

    newTopLevel.push(promiseDeclaration, makeExportListDeclaration(Object.entries(exportMap)));
  } else {
    // If the chunk is an entry, just execute the promise expression
    newTopLevel.push(makeStatement(promiseExpression));
  }

  ast.body = newTopLevel.filter(x => x);

  return ast;
}
