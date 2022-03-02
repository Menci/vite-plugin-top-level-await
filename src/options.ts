export interface Options {
  /**
   * @default "__tla"
   */
  promiseExportName?: string;

  /**
   * @default i => `__tla_${i}`
   */
  promiseImportName?: (i: number) => string;
}

export const DEFAULT_OPTIONS: Options = {
  promiseExportName: "__tla",
  promiseImportName: i => `__tla_${i}`
};
