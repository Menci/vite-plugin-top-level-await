import * as SWC from "@swc/core";
import { Visitor } from "@swc/core/Visitor";

// Throw an exception when found top-level await to exit earlier from AST traversal
class FoundTopLevelAwaitError extends Error {}

class FindPatternsVisitor extends Visitor {
  // Set the flag when a dynamic import is found
  public foundDynamicImport = false;

  // Tell if one await is in top-level or not
  private currentLevel = 0;

  // Hook class/function visiting functions so we can know the current level
  constructor() {
    super();

    const visitor = this;
    function hook(methodName: keyof Visitor) {
      const originalFunction = visitor[methodName] as Function;
      (visitor[methodName] as Function) = function () {
        /* istanbul ignore next */
        // A optimize: if we have already found dynamic imports, don't go deeper
        if (visitor.foundDynamicImport) return arguments[0];

        visitor.currentLevel++;
        const result = originalFunction.apply(this, arguments);
        visitor.currentLevel--;
        return result;
      };
    }

    hook("visitClass");
    hook("visitArrowFunctionExpression");
    hook("visitFunction");
    hook("visitMethodProperty");
  }

  visitAwaitExpression(expr: SWC.AwaitExpression): SWC.Expression {
    if (this.currentLevel === 0) throw new FoundTopLevelAwaitError();
    return super.visitAwaitExpression(expr);
  }

  visitForOfStatement(stmt: SWC.ForOfStatement): SWC.Statement {
    if (stmt.await && this.currentLevel === 0) {
      throw new FoundTopLevelAwaitError();
    }
    return super.visitForOfStatement(stmt);
  }

  visitCallExpression(expr: SWC.CallExpression): SWC.Expression {
    if (expr.callee.type === "Import") this.foundDynamicImport = true;
    return super.visitCallExpression(expr);
  }
}

export enum CodePattern {
  TopLevelAwait = "TopLevelAwait",
  DynamicImport = "DynamicImport"
}

// Return the "highest" pattern found in the code
// i.e. if we found top-level await, we don't care if there're any dynamic imports then
export function findHighestPattern(ast: SWC.Module): CodePattern {
  try {
    const visitor = new FindPatternsVisitor();
    visitor.visitModule(ast);

    if (visitor.foundDynamicImport) return CodePattern.DynamicImport;
  } catch (e) {
    if (e instanceof FoundTopLevelAwaitError) return CodePattern.TopLevelAwait;

    /* istanbul ignore next */
    throw e;
  }

  return null;
}
