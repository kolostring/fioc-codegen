import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";
import { SRC_DIR, IOC_DIR, TOKENS_FILE, FACTORIES_FILE, CONTAINERS_DIR, DI_CORE } from "./config.js";
import { GeneratorState } from "./types.js";
import { collectTokens, autoDetectTokens } from "./collectors/tokenCollector.js";
import { collectFactories } from "./collectors/factoryCollector.js";
import { generateTokens } from "./generators/tokensGenerator.js";
import { generateFactories } from "./generators/factoriesGenerator.js";
import { generateContainers } from "./generators/containerGenerator.js";

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

export function run() {
  console.log("\n🚀 Running LOCAL @fioc/codegen v0.1.0-local-dev");
  console.log("🔍 Scanning codebase for @Service, @MultiService, and @Injectable...\n");

  // Initialize state
  const state: GeneratorState = {
    tokens: new Map(),
    multiServices: new Set(),
    factories: [],
    tokensImports: new Map(),
    factoriesImports: new Map(),
  };

  const project = new Project({ tsConfigFilePath: "tsconfig.json" });

  // Ensure directories exist
  if (!fs.existsSync(IOC_DIR)) {
    fs.mkdirSync(IOC_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONTAINERS_DIR)) {
    fs.mkdirSync(CONTAINERS_DIR, { recursive: true });
  }

  // Load source files (exclude generated files)
  project.addSourceFilesAtPaths(`${SRC_DIR}/**/*.ts`);
  const files = project
    .getSourceFiles()
    .filter((f) => {
      const filePath = f.getFilePath().replace(/\\/g, "/");
      return !filePath.includes("/ioc/") && 
             !filePath.endsWith("/ioc") &&
             !filePath.endsWith("tokens.generated.ts");
    });

  // Create output files
  const tokensFile = project.createSourceFile(
    TOKENS_FILE,
    "// Auto-generated - Interface tokens\n// Do not edit manually\n\n",
    { overwrite: true }
  );

  const factoriesFile = project.createSourceFile(
    FACTORIES_FILE,
    "// Auto-generated - Factory definitions and tokens\n// Do not edit manually\n\n",
    { overwrite: true }
  );

  // Run collection passes
  collectTokens(state, files);
  autoDetectTokens(state, files);
  collectFactories(state, files);

  // Run generation passes
  generateTokens(state, tokensFile, files);
  generateFactories(state, factoriesFile);
  generateContainers(state, project);

  // Save tokens and factories files
  tokensFile.formatText();
  tokensFile.saveSync();

  factoriesFile.formatText();
  factoriesFile.saveSync();

  // Summary
  const moduleCount = new Set(state.factories.map(f => f.module)).size;
  
  console.log(`\n✅ Files generated successfully:`);
  console.log(`   • ${TOKENS_FILE}`);
  console.log(`   • ${FACTORIES_FILE}`);
  console.log(`   • ${CONTAINERS_DIR}/ (${moduleCount} container(s))`);
  console.log(`\n📊 Summary:`);
  console.log(`   • ${state.tokens.size} tokens`);
  console.log(`   • ${state.factories.length} factories`);
  console.log(`   • ${moduleCount} module(s)\n`);
}

// Export for library usage
export type { GeneratorState } from "./types.js";
export * from "./config.js";

// Run if executed directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;
if (isMainModule) {
  run();
}
