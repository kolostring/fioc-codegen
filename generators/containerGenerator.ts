import { Project, SourceFile } from "ts-morph";
import { GeneratorState } from "../types.js";
import { DI_CORE, CONTAINERS_DIR, FACTORIES_FILE, DEFAULT_MODULE } from "../config.js";
import { getRelativePath, toPascalCase, toCamelCase } from "../utils.js";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════
// CONTAINER GENERATOR - PASS 5
// ═══════════════════════════════════════════════════════════════════

export function generateContainers(
  state: GeneratorState,
  project: Project
): void {
  console.log("\n📦 PASS 5: Generating container registrations...");

  // Group factories by module
  const factoriesByModule = new Map<string, typeof state.factories>();
  
  for (const factory of state.factories) {
    const module = factory.module;
    if (!factoriesByModule.has(module)) {
      factoriesByModule.set(module, []);
    }
    factoriesByModule.get(module)!.push(factory);
  }

  // Generate a container file for each module
  for (const [moduleName, factories] of factoriesByModule.entries()) {
    const containerFileName = moduleName === DEFAULT_MODULE 
      ? "container.ts" 
      : `${toCamelCase(moduleName)}Container.ts`;
    
    const containerFile = project.createSourceFile(
      path.join(CONTAINERS_DIR, containerFileName),
      `// Auto-generated - DI Container for module: ${moduleName}\n// Do not edit manually\n\n`,
      { overwrite: true }
    );

    const factoriesRelPath = getRelativePath(
      path.join(CONTAINERS_DIR, containerFileName),
      FACTORIES_FILE
    );
    
    containerFile.addImportDeclaration({
      moduleSpecifier: DI_CORE,
      namedImports: ["buildDIContainer"],
    });

    containerFile.addImportDeclaration({
      moduleSpecifier: factoriesRelPath,
      namespaceImport: "Factories",
    });

    const registrations: string[] = [];

    console.log(`\n  Module: ${moduleName}`);
    
    for (const factory of factories) {
      const hasMetadata = factory.metadata.implements.length > 0 || factory.metadata.generics.length > 0;
      const returnToken = state.tokens.get(factory.returnTypeName);

      if (hasMetadata || !returnToken) {
        // Register with factory token
        registrations.push(
          `.registerFactory(Factories.${factory.name}Token, Factories.${factory.name}Factory)`
        );
        console.log(`    ✓ ${factory.name}Token ← ${factory.name}Factory`);
      } else {
        // Register with return type token
        registrations.push(
          `.registerFactory(Factories.Tokens.${returnToken}, Factories.${factory.name}Factory)`
        );
        console.log(`    ✓ Tokens.${returnToken} ← ${factory.name}Factory`);
      }
    }

    if (registrations.length > 0) {
      const containerVarName = moduleName === DEFAULT_MODULE 
        ? "container" 
        : `${toCamelCase(moduleName)}Container`;
      
      containerFile.addStatements([
        `\n// Pre-configured container with all dependencies registered`,
        `export const ${containerVarName} = buildDIContainer()${registrations.join("\n  ")}\n  .getResult();`,
      ]);
    } else {
      console.warn(`    ⚠️  No factories to register in ${moduleName} module`);
    }

    containerFile.formatText();
    containerFile.saveSync();

    console.log(`    📄 Generated: ${containerFileName}`);
  }
}
