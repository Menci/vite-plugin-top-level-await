import path from "path";
import { Plugin, ResolvedConfig } from "vite";
import { rollup, OutputChunk } from "rollup";
import virtual from "@rollup/plugin-virtual";
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

  let isWorker = false;
  let isWorkerIifeRequested = false;

  let assetsDir = "";
  let buildTarget: ViteTarget;
  let minify: boolean;

  const buildRawTarget = async (code: string) => {
    return (
      await esbuild.transform(code, {
        minify,
        target: buildTarget as string | string[],
        format: "esm"
      })
    ).code as string;
  };

  return {
    name: "vite-plugin-top-level-await",
    enforce: "post",
    outputOptions(options) {
      if (isWorker && options.format === "iife") {
        // The the worker bundle's output format to ES to allow top-level awaits
        // We'll use another rollup build to convert it back to IIFE
        options.format = "es";
        isWorkerIifeRequested = true;
      }
    },
    config(config, env) {
      if (env.command === "build") {
        if (config.worker) {
          isWorker = true;
        }

        // By default Vite transforms code with esbuild with target for a browser list with ES modules support
        // This cause esbuild to throw an exception when there're top-level awaits in code
        // Let's backup the original target and override the esbuild target with "esnext", which allows TLAs
        buildTarget = config.build.target;
        config.build.target = "esnext";

        minify = !!config.build.minify;

        assetsDir = config.build.assetsDir;
      }

      if (env.command === "serve") {
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
          if (!bundleInfo[moduleName].transformNeeded) {
            if (buildTarget !== "esnext") {
              (bundle[moduleName] as OutputChunk).code = await buildRawTarget(bundleChunks[moduleName]);
            }
            return;
          }

          const newAst = transformModule(
            bundleChunks[moduleName],
            bundleAsts[moduleName],
            moduleName,
            bundleInfo,
            resolvedOptions
          );
          let code = SWC.printSync(newAst, { minify }).code;
          if (buildTarget !== "esnext") {
            code = await buildRawTarget(code);
          }
          (bundle[moduleName] as OutputChunk).code = code;
        })
      );

      if (isWorker && isWorkerIifeRequested) {
        // Get the entry chunk
        const chunkNames = Object.keys(bundle).filter(key => bundle[key].type === "chunk");
        const entry = chunkNames.find(key => (bundle[key] as OutputChunk).isEntry);
        if (!entry) {
          throw new Error(`Entry not found in worker bundle! Please submit an issue with a reproducible project.`);
        }

        // Build a new bundle to convert ESM to IIFE
        // Assets are not touched
        const newBuild = await rollup({
          input: entry,
          plugins: [virtual(Object.fromEntries(chunkNames.map(key => [key, (bundle[key] as OutputChunk).code])))]
        });

        // IIFE bundle is always a single file
        const {
          output: [newEntry]
        } = await newBuild.generate({
          format: "iife",
          entryFileNames: path.posix.join(assetsDir, "[name].js")
        });

        // Postprocess and minify (if requested) with ESBuild
        newEntry.code = (
          await esbuild.transform(
            // Polyfill `document.currentScript.src` since it's used for `import.meta.url`.
            `self.document = { currentScript: { src: self.location.href } };\n${newEntry.code}`,
            {
              minify,
              target: buildTarget as string | string[]
            }
          )
        ).code;

        // Remove extra chunks and replace ESM entry with IIFE entry
        for (const chunkName of chunkNames) {
          if (chunkName !== entry) delete bundle[chunkName];
        }
        bundle[entry] = newEntry;
      }
    }
  };
}
