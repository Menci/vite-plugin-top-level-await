import * as SWC from "@swc/core";
import { Span } from "@swc/core";

function span(): SWC.Span {
  return { start: 0, end: 0, ctxt: 0 };
}

export function makeIdentifier(name: string): SWC.Identifier {
  return {
    type: "Identifier",
    span: span(),
    // @ts-ignore SWC is missing the "ctxt" property's
    ctxt: 0,
    value: name,
    optional: false
  };
}

export function makeVariablesDeclaration(names: string[]): SWC.VariableDeclaration {
  if (names.length === 0) return null;

  return {
    type: "VariableDeclaration",
    span: span(),
    // @ts-ignore SWC is missing the "ctxt" property's
    ctxt: 0,
    kind: "let",
    declare: false,
    declarations: names.map<SWC.VariableDeclarator>(name => ({
      type: "VariableDeclarator",
      span: span(),
      id: makeIdentifier(name),
      init: null,
      definite: false
    }))
  };
}

export function makeVariableInitDeclaration(name: string, value: SWC.Expression): SWC.VariableDeclaration {
  return {
    type: "VariableDeclaration",
    span: span(),
    // @ts-ignore SWC is missing the "ctxt" property's
    ctxt: 0,
    kind: "let",
    declare: false,
    declarations: [
      {
        type: "VariableDeclarator",
        span: span(),
        id: makeIdentifier(name),
        init: value,
        definite: false
      }
    ]
  };
}

export function makeStatement(expression: SWC.Expression): SWC.ExpressionStatement {
  return {
    type: "ExpressionStatement",
    span: span(),
    expression
  };
}

export function makeAssignmentExpression(left: SWC.Pattern, right: SWC.Expression): SWC.AssignmentExpression {
  return {
    type: "AssignmentExpression",
    span: span(),
    operator: "=",
    left,
    right
  };
}

export function makeAssignmentStatement(left: SWC.Pattern, right: SWC.Expression): SWC.ExpressionStatement {
  const assignmentExpression = makeAssignmentExpression(left, right);
  return makeStatement(
    left.type === "ObjectPattern" ? makeParenthesisExpression(assignmentExpression) : assignmentExpression
  );
}

export function makeImportSpecifier(name: string, as: string): SWC.ImportSpecifier {
  return {
    type: "ImportSpecifier",
    span: span(),
    local: makeIdentifier(as),
    imported: as === name ? /* istanbul ignore next */ null : makeIdentifier(name),
    isTypeOnly: false
  };
}

export function makeArrayExpression(items: SWC.Expression[]): SWC.ArrayExpression {
  return {
    type: "ArrayExpression",
    span: span(),
    elements: items.map<SWC.ExprOrSpread>(item => ({
      spread: null,
      expression: item
    }))
  };
}

export function makeTryCatchStatement(
  tryStatements: SWC.Statement[],
  catchStatements: SWC.Statement[]
): SWC.TryStatement {
  return {
    type: "TryStatement",
    span: span(),
    block: {
      type: "BlockStatement",
      span: span(),
      // @ts-ignore SWC is missing the "ctxt" property's
      ctxt: 0,
      stmts: tryStatements
    },
    handler: {
      type: "CatchClause",
      span: span(),
      param: null,
      body: {
        type: "BlockStatement",
        span: span(),
        // @ts-ignore SWC is missing the "ctxt" property's
        ctxt: 0,
        stmts: catchStatements
      }
    },
    finalizer: null
  };
}

export function makeArrowFunction(
  args: string[],
  statements: SWC.Statement[],
  async?: boolean
): SWC.ArrowFunctionExpression {
  return {
    type: "ArrowFunctionExpression",
    span: span(),
    ctxt: 0,
    params: args.map<SWC.Identifier>(arg => ({
      type: "Identifier",
      span: span(),
      ctxt: 0,
      value: arg,
      optional: false
    })),
    body: {
      type: "BlockStatement",
      span: span(),
      // @ts-ignore SWC is missing the "ctxt" property's
      ctxt: 0,
      stmts: statements
    },
    async: !!async,
    generator: false,
    typeParameters: null,
    returnType: null
  };
}

export function makeParenthesisExpression(expression: SWC.Expression): SWC.ParenthesisExpression {
  return {
    type: "ParenthesisExpression",
    span: span(),
    expression
  };
}

export function makeCallExpression(functionExpression: SWC.Expression, args?: SWC.Expression[]): SWC.CallExpression {
  return {
    type: "CallExpression",
    span: span(),
    // @ts-ignore SWC is missing the "ctxt" property's
    ctxt: 0,
    // Put IIFE's function expression in (parenthesis)
    callee:
      functionExpression.type === "FunctionExpression" || functionExpression.type === "ArrowFunctionExpression"
        ? makeParenthesisExpression(functionExpression)
        : functionExpression,
    arguments: (args ?? []).map(arg => ({
      spread: null,
      expression: arg
    })),
    typeArguments: null
  };
}

export function makeReturnStatement(expression: SWC.Expression): SWC.ReturnStatement {
  return {
    type: "ReturnStatement",
    span: span(),
    argument: expression
  };
}

export function makeMemberExpression(object: SWC.Expression | string, member: string): SWC.MemberExpression {
  return {
    type: "MemberExpression",
    span: span(),
    object: typeof object === "string" ? makeIdentifier(object) : object,
    property: makeIdentifier(member)
  };
}

export function makeExportListDeclaration(map: [exportName: string, identifier: string][]): SWC.ExportNamedDeclaration {
  return {
    type: "ExportNamedDeclaration",
    span: span(),
    specifiers: map.map<SWC.ExportSpecifier>(([exportName, identifier]) => ({
      type: "ExportSpecifier",
      span: span(),
      orig: makeIdentifier(identifier),
      exported: identifier === exportName ? null : makeIdentifier(exportName),
      isTypeOnly: false
    })),
    source: null,
    // @ts-ignore
    typeOnly: false,
    // @ts-ignore
    assets: null
  };
}

export function makeAwaitExpression(expression: SWC.Expression): SWC.AwaitExpression {
  return {
    type: "AwaitExpression",
    span: span(),
    argument: expression
  };
}

export function transformExportNamedToImport(exportNamedDeclNode: any): SWC.ImportDeclaration {
  // Transform each ExportSpecifier into an ImportSpecifier
  const importSpecifiers: SWC.ImportSpecifier[] = exportNamedDeclNode.specifiers.map(specifier => {
    return {
      type: "ImportSpecifier",
      local: specifier.orig,
      span: span()
    };
  });

  const importDeclaration: SWC.ImportDeclaration = {
    type: "ImportDeclaration",
    specifiers: importSpecifiers,
    source: exportNamedDeclNode.source,
    span: span(),
    typeOnly: false // Set based on your requirements
  };

  return importDeclaration;
}
