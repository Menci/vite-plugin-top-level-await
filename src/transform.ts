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
  makeStatement,
  makeAwaitExpression
} from "./utils/make-node";
import { RandomIdentifierGenerator } from "./utils/random-identifier";
import { resolveImport } from "./utils/resolve-import";
import { resolvePattern } from "./utils/resolve-pattern";

function transformByType(node: object, type: string, filter: (node: SWC.Node) => SWC.Node) {
  for (const key of Array.isArray(node) ? node.keys() : Object.keys(node)) {
    if (["span", "type"].includes(key as string)) continue;
    if (!node[key]) continue;
    if (typeof node[key] === "object") node[key] = transformByType(node[key], type, filter);
  }

  if (node["type"] === type) return filter(node as SWC.Node);
  return node;
}

function declarationToExpression(
  decl: SWC.FunctionDeclaration | SWC.ClassDeclaration
): SWC.FunctionExpression | SWC.ClassExpression {
  if (decl.type === "FunctionDeclaration") {
    return <SWC.FunctionExpression>{
      ...decl,
      identifier: null,
      type: "FunctionExpression"
    };
  } else if (decl.type === "ClassDeclaration") {
    return <SWC.ClassExpression>{
      ...decl,
      identifier: null,
      type: "ClassExpression"
    };
  } else {
    /* istanbul ignore next */
    raiseUnexpectedNode("declaration", (decl as SWC.Node).type);
  }
}

function expressionToDeclaration(
  expr: SWC.FunctionExpression | SWC.ClassExpression
): SWC.FunctionDeclaration | SWC.ClassDeclaration {
  if (expr.type === "FunctionExpression") {
    return <SWC.FunctionDeclaration>{
      ...expr,
      type: "FunctionDeclaration"
    };
  } else if (expr.type === "ClassExpression") {
    return <SWC.ClassDeclaration>{
      ...expr,
      type: "ClassDeclaration"
    };
  } else {
    /* istanbul ignore next */
    raiseUnexpectedNode("expression", (expr as SWC.Node).type);
  }
}

export function transformModule(
  code: string,
  ast: SWC.Module,
  moduleName: string,
  bundleInfo: BundleInfo,
  options: Options
) {
  const randomIdentifier = new RandomIdentifierGenerator(code);

  // Extract import declarations
  const imports = ast.body.filter((item): item is SWC.ImportDeclaration => item.type === "ImportDeclaration");

  const exportMap: Record<string, string> = {};

  // Extract export declarations
  // In Rollup's output, there should be only one, and as the last top-level statement
  // But some plugins (e.g. @vitejs/plugin-legacy) may inject others like "export function"
  const namedExports = ast.body.filter((item, i): item is SWC.ExportNamedDeclaration => {
    switch (item.type) {
      /* istanbul ignore next */
      case "ExportAllDeclaration":
        raiseUnexpectedNode("top-level statement", item.type);
      case "ExportDefaultExpression":
        // Convert to a variable
        const identifier = randomIdentifier.generate();
        ast.body[i] = makeVariableInitDeclaration(identifier, item.expression);
        exportMap["default"] = identifier;
        return false;
      case "ExportDefaultDeclaration":
        if (item.decl.type === "FunctionExpression" || item.decl.type === "ClassExpression") {
          // Convert to a declaration or variable
          if (item.decl.identifier) {
            ast.body[i] = expressionToDeclaration(item.decl);
            exportMap["default"] = item.decl.identifier.value;
          } else {
            const identifier = randomIdentifier.generate();
            ast.body[i] = makeVariableInitDeclaration(identifier, item.decl);
            exportMap["default"] = identifier;
          }
        } else {
          /* istanbul ignore next */
          raiseUnexpectedNode("top-level export declaration", item.decl.type);
        }

        return false;
      case "ExportDeclaration":
        if (item.declaration.type === "FunctionDeclaration" || item.declaration.type === "ClassDeclaration") {
          // Remove the "export" keyword from this statement
          ast.body[i] = item.declaration;
          exportMap[item.declaration.identifier.value] = item.declaration.identifier.value;
        } else {
          /* istanbul ignore next */
          raiseUnexpectedNode("top-level export declaration", item.declaration.type);
        }

        return false;
      case "ExportNamedDeclaration":
        item.specifiers.forEach(specifier => {
          /* istanbul ignore if */
          if (specifier.type !== "ExportSpecifier") {
            raiseUnexpectedNode("export specifier", specifier.type);
          }

          exportMap[(specifier.exported || specifier.orig).value] = specifier.orig.value;
        });

        return true;
    }

    return false;
  });

  const exportedNameSet = new Set(Object.values(exportMap));
  const exportedNames = Array.from(exportedNameSet);

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
      !(imports as SWC.ModuleItem[]).includes(item) && !(namedExports as SWC.ModuleItem[]).includes(item)
  );
  const importedNames = new Set(
    imports.flatMap(importStmt => importStmt.specifiers.map(specifier => specifier.local.value))
  );
  const exportedNamesDeclaration = makeVariablesDeclaration(exportedNames.filter(name => !importedNames.has(name)));
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
    } else if (stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") {
      const name = stmt.identifier.value;
      if (!exportedNameSet.has(name)) return stmt;
      return makeAssignmentStatement(makeIdentifier(name), declarationToExpression(stmt));
    } else {
      return stmt;
    }
  });

  /*
   * Process dynamic imports.
   *
   * ```js
   * [
   *   import("some-module-with-tla"),
   *   import("some-module-without-tla"),
   *   import(dynamicModuleName)
   * ]
   * ```
   *
   * The expression evaluates to a promise, which will resolve after module loaded, but not after
   * out `__tla` promise resolved.
   *
   * We can check the target module. If the argument is string literial and the target module has NO
   * top-level await, we won't need to transform it.
   *
   * ```js
   * [
   *   import("some-module-with-tla").then(async m => { await m.__tla; return m; }),
   *   import("some-module-without-tla"),
   *   import(dynamicModuleName).then(async m => { await m.__tla; return m; })
   * ]
   * ```
   */

  transformByType(warppedStatements, "CallExpression", (call: SWC.CallExpression) => {
    if (call.callee.type === "Import") {
      const argument = call.arguments[0].expression;
      if (argument.type === "StringLiteral") {
        const importedModuleName = resolveImport(moduleName, argument.value);

        // Skip transform
        if (importedModuleName && !bundleInfo[importedModuleName]?.transformNeeded) return call;
      }

      return makeCallExpression(makeMemberExpression(call, "then"), [
        makeArrowFunction(
          ["m"],
          [
            makeStatement(makeAwaitExpression(makeMemberExpression("m", "__tla"))),
            makeReturnStatement(makeIdentifier("m"))
          ],
          true
        )
      ]);
    }

    return call;
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
   * ```js
   * export let __tla = Promise.all([
   *   (() => { try { return __tla_0; } catch {} })(),
   *   (() => { try { return __tla_1; } catch {} })()
   * ]).then(async () => {
   *   // original top-level statements here
   * });
   * ```
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
              makeArrowFunction(
                [],
                [makeTryCatchStatement([makeReturnStatement(makeIdentifier(options.promiseImportName(i)))], [])]
              )
            )
          )
        );

  // The `async () => { /* original top-level statements */ }` function
  const wrappedTopLevelFunction = makeArrowFunction([], warppedStatements, true);

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

  if (exportedNames.length > 0 || bundleInfo[moduleName]?.importedBy?.length > 0) {
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
