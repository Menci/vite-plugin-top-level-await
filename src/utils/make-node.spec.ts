/// <reference types="jest-extended" />

import * as SWC from "../swc";

import { makeArrowFunction, makeStatement, makeIdentifier, makeTryCatchStatement } from "./make-node";

const parse = (code: string) => SWC.parseSync(code, { target: "es2022", syntax: "ecmascript" });

/** The body node SWC's own parser produces for an arrow function. */
function parsedArrowBodyType(): string {
  const declaration = parse("const f = () => {};").body[0] as any;
  return declaration.declarations[0].init.body.type;
}

describe("make-node against the installed SWC", () => {
  // SWC 1.16 renamed a function/arrow body from `BlockStatement` to `FunctionBody`.
  // Hard-coding either name breaks `printSync` on the versions that use the other one,
  // with "unknown variant `BlockStatement`" — the body is deserialised as an expression.
  it("builds an arrow body with the node type this SWC uses", () => {
    const arrow = makeArrowFunction([], [makeStatement(makeIdentifier("a"))]);

    expect((arrow.body as any).type).toBe(parsedArrowBodyType());
  });

  it("keeps standalone blocks as BlockStatement, which was not renamed", () => {
    const tryStatement = makeTryCatchStatement([], []);

    expect((tryStatement.block as any).type).toBe("BlockStatement");
    expect((tryStatement.handler.body as any).type).toBe("BlockStatement");
  });

  it("prints an arrow function without SWC rejecting the module", () => {
    // The end-to-end symptom: a module containing a constructed arrow used to fail the
    // whole `printSync` call rather than anything more localised.
    const module_ = {
      type: "Module",
      span: { start: 0, end: 0, ctxt: 0 },
      body: [makeStatement(makeArrowFunction(["x"], [makeStatement(makeIdentifier("x"))], true))],
      interpreter: null
    } as any;

    expect(() => SWC.printSync(module_)).not.toThrow();
    expect(SWC.printSync(module_).code).toInclude("async");
  });
});
