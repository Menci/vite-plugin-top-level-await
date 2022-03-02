export function raiseUnexpectedNode(nodeType: string, type: string): never {
  /* istanbul ignore next */
  throw new Error(
    `Unexpected ${nodeType} "${type}" in Rollup's output chunk. Please open an issue at https://github.com/Menci/vite-plugin-top-level-await/issues.`
  );
}
