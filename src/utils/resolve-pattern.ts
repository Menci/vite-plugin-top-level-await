import * as SWC from "@swc/core";
import { raiseUnexpectedNode } from "./error";

export function resolvePattern(pattern: SWC.Pattern): string | string[] {
  switch (pattern.type) {
    case "Identifier":
      return pattern.value;
    case "ObjectPattern":
      return pattern.properties.flatMap(prop => {
        switch (prop.type) {
          case "AssignmentPatternProperty":
            return prop.key.value;
          case "RestElement":
            return resolvePattern(prop.argument);
          case "KeyValuePatternProperty":
            return resolvePattern(prop.value);
        }
      });
    case "ArrayPattern":
      return pattern.elements.flatMap(elem => {
        if (elem.type === "RestElement") {
          return resolvePattern(elem.argument);
        }

        return resolvePattern(elem);
      });
    case "AssignmentPattern":
      return resolvePattern(pattern.left);
    /* istanbul ignore next */
    default:
      raiseUnexpectedNode("pattern in variable declaration", pattern.type);
  }
}
