import { Plugin, ResolvedConfig } from "vite";
import type { OutputChunk } from "rollup";
import * as SWC from "@swc/core";
import esbuild from "./esbuild";

import { DEFAULT_OPTIONS, Options } from "./options";
import { parseBundleAsts, parseBundleInfo } from "./bundle-info";
import { transformModule } from "./transform";

export type { Options } from "./options";

type ViteTarget = ResolvedConfig["build"]["target"];

export default function topLevelAwait(options?: Options): Plugin {
  const resolvedOptions: Options = {
    ...DEFAULT_OPTIONS,
    ...(options || {})
  };

  let buildTarget: ViteTarget;
  let minify: boolean;

  return {
    name: "vite-plugin-top-level-await",
    configResolved(config) {
      if (config.command === "build") {
        // By default Vite transforms code with esbuild with target for a browser list with ES modules support
        // This cause esbuild to throw an exception when there're top-level awaits in code
        // Let's backup the original target and override the esbuild target with "esnext", which allows TLAs
        buildTarget = config.build.target;
        config.build.target = "esnext";

        minify = !!config.build.minify;
      }

      if (config.command === "serve") {
        // Fix errors in NPM packages which are getting pre-processed in development build
        if (config.optimizeDeps?.esbuildOptions) {
          config.optimizeDeps.esbuildOptions.target = "esnext";
        }
      }
    },
    async generateBundle(bundleOptions, bundle) {
      // Process ES modules (modern) target only since TLAs in legacy builds are handled by SystemJS
      if (bundleOptions.format !== "es") return;

      const bundleChunks = Object.fromEntries(
        Object.entries(bundle)
          .filter(([, item]) => item.type === "chunk")
          .map(([key, item]) => [key, (item as OutputChunk).code])
      );
      const bundleAsts = await parseBundleAsts(bundleChunks);
      const bundleInfo = await parseBundleInfo(bundleAsts);

      await Promise.all(
        Object.keys(bundleChunks).map(async moduleName => {
          if (!bundleInfo[moduleName].transformNeeded) return;

          const newAst = transformModule(bundleAsts[moduleName], moduleName, bundleInfo, resolvedOptions);
          let code = SWC.printSync(newAst, { minify }).code;
          if (buildTarget !== "esnext") {
            code = (
              await esbuild.transform(code, {
                minify,
                target: buildTarget as string | string[],
                format: "esm"
              })
            ).code;
          }
          (bundle[moduleName] as OutputChunk).code = code;
        })
      );
    }
  };
}
