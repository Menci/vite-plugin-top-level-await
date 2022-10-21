import * as SWC from "@swc/core";
import { Visitor } from "@swc/core/Visitor";

// Throw an exception when found top-level await to exit earlier from AST traversal
class FoundTopLevelAwaitError extends Error {}

class FindTopLevelAwaitVisitor extends Visitor {
  // Hook class/function visiting functions so we won't enter them while the traversal
  constructor() {
    super();

    const visitor: Visitor = this;
    function hook(methodName: keyof Visitor) {
      (visitor[methodName] as Function) = (node: unknown) => node;
    }

    hook("visitClass");
    hook("visitArrowFunctionExpression");
    hook("visitFunction");
  }

  visitAwaitExpression(_expr: SWC.AwaitExpression): never {
    throw new FoundTopLevelAwaitError();
  }

  visitForOfStatement(stmt: SWC.ForOfStatement) {
    if (stmt.await) {
      throw new FoundTopLevelAwaitError();
    }
    return super.visitForOfStatement(stmt);
  }
}

export function findTopLevelAwait(ast: SWC.Module) {
  try {
    new FindTopLevelAwaitVisitor().visitModule(ast);
  } catch (e) {
    if (e instanceof FoundTopLevelAwaitError) return true;

    /* istanbul ignore next */
    throw e;
  }

  return false;
}
