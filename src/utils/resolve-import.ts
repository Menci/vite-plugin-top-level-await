import { posix as path } from "path";

export function resolveImport(base: string, imported: string) {
  // Skip external packages
  if (!imported.startsWith("./")) return null;

  return path.join(path.dirname(base), imported);
}
