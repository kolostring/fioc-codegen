import { SourceFile, VariableDeclarationKind } from "ts-morph";
import { GeneratorState } from "../types.js";
import { DI_CORE, TOKENS_FILE, FACTORIES_FILE } from "../config.js";
import { getRelativePath } from "../utils.js";

// ═══════════════════════════════════════════════════════════════════
// FACTORIES GENERATOR - PASS 4
// ═══════════════════════════════════════════════════════════════════

export function generateFactories(
  state: GeneratorState,
  factoriesFile: SourceFile
): void {
  console.log("\n🏗️  PASS 4: Generating factory definitions...");

  // Add imports to factories file
  const tokensRelPath = getRelativePath(FACTORIES_FILE, TOKENS_FILE);
  factoriesFile.addImportDeclaration({
    moduleSpecifier: DI_CORE,
    namedImports: ["withDependencies", "createFactoryDIToken", "constructorToFactory"],
  });

  // Import and re-export all tokens
  factoriesFile.addImportDeclaration({
    moduleSpecifier: tokensRelPath,
    namespaceImport: "Tokens",
  });
  
  // Re-export tokens so containers can access them via Factories.Tokens
  // Note: addExportDeclaration doesn't work well for namespace re-exports, so we add it at the end

  state.factoriesImports.forEach((names, file) => {
    factoriesFile.addImportDeclaration({
      moduleSpecifier: file,
      namedImports: Array.from(names),
    });
  });

  // Generate factories
  for (const factory of state.factories) {
    const depsStr = factory.deps.map(d => `Tokens.${d}`).join(", ");
    const isClass = factory.isClass;

    const initializer = isClass
      ? `withDependencies(${depsStr}).defineFactory(constructorToFactory(${factory.name}))`
      : `withDependencies(${depsStr}).defineFactory(${factory.name})`;

    factoriesFile.addVariableStatement({
      isExported: true,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: `${factory.name}Factory`,
          initializer: initializer,
        },
      ],
    });

    // Generate factory token
    const hasMetadata = factory.metadata && (factory.metadata.implements.length > 0 || factory.metadata.generics.length > 0);
    
    if (hasMetadata) {
      const metaParts: string[] = [];
      if (factory.metadata!.implements.length > 0) {
        // Convert interface names to token names
        const implementsTokens = factory.metadata!.implements.map(interfaceName => {
          const tokenName = state.tokens.get(interfaceName);
          return tokenName ? `Tokens.${tokenName}` : `Tokens.${interfaceName}`;
        });
        metaParts.push(`implements: [${implementsTokens.join(", ")}]`);
      }
      if (factory.metadata!.generics.length > 0) {
        metaParts.push(`generics: [${factory.metadata!.generics.map(t => `Tokens.${t}`).join(", ")}]`);
      }

      factoriesFile.addVariableStatement({
        isExported: true,
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: `${factory.name}Token`,
            initializer: `createFactoryDIToken<typeof ${factory.name}Factory>().as("${factory.name}", { ${metaParts.join(", ")} })`,
          },
        ],
      });

      console.log(`  ✓ ${factory.name}Factory`);
      console.log(`    → ${factory.name}Token (with metadata)`);
    } else {
      // Check if return type has a token
      const returnToken = state.tokens.get(factory.returnType);
      if (returnToken) {
        console.log(`  ✓ ${factory.name}Factory`);
        console.log(`    → registers with Tokens.${returnToken} (direct)`);
      } else {
        factoriesFile.addVariableStatement({
          isExported: true,
          declarationKind: VariableDeclarationKind.Const,
          declarations: [
            {
              name: `${factory.name}Token`,
              initializer: `createFactoryDIToken<typeof ${factory.name}Factory>().as("${factory.name}")`,
            },
          ],
        });
        console.log(`  ✓ ${factory.name}Factory`);
        console.log(`    → ${factory.name}Token`);
      }
    }
  }

  // Re-export Tokens namespace - must be added as a statement, not export declaration
  // because we're re-exporting an already imported namespace
  const lastStatement = factoriesFile.getStatements()[factoriesFile.getStatements().length - 1];
  lastStatement.replaceWithText(lastStatement.getText() + '\n\nexport { Tokens };');
}
