import { SourceFile, VariableDeclarationKind } from "ts-morph";
import { GeneratorState } from "../types.js";
import { DI_CORE } from "../config.js";
import { ensureToken } from "../utils.js";

// ═══════════════════════════════════════════════════════════════════
// TOKENS GENERATOR - PASS 3
// ═══════════════════════════════════════════════════════════════════

export function generateTokens(
  state: GeneratorState, 
  tokensFile: SourceFile,
  files: SourceFile[]
): void {
  console.log("\n🎫 PASS 3: Generating token declarations...");

  // Build dependency graph for tokens FIRST (this will call ensureToken for generics)
  const tokenDeps = new Map<string, Set<string>>();
  const tokenMetadata = new Map<string, { implements: string[]; generics: string[] }>();

  for (const [typeName, tokenName] of state.tokens.entries()) {
    tokenDeps.set(tokenName, new Set());

    for (const file of files) {
      // Check type aliases
      const typeAliases = file.getTypeAliases();
      const foundAlias = typeAliases.find(
        (ta) => ta.getName() === typeName && ta.isExported()
      );

      if (foundAlias) {
        const aliasType = foundAlias.getType();
        const symbol = aliasType.getSymbol();
        const baseTypeName = symbol?.getName() || "";
        const baseToken = state.tokens.get(baseTypeName);

        if (baseToken) {
          const args = aliasType.getTypeArguments();
          const genericsTokens: string[] = [];

          args.forEach((arg) => {
            const genericToken = ensureToken(state, arg, `${typeName} generic argument`);
            if (genericToken) {
              genericsTokens.push(genericToken);
              tokenDeps.get(tokenName)!.add(genericToken);
            }
          });

          if (genericsTokens.length > 0) {
            tokenMetadata.set(tokenName, {
              implements: [baseToken],
              generics: genericsTokens,
            });
          }
        }
        break;
      }

      // Check interface extensions
      const interfaces = file.getInterfaces();
      const foundInterface = interfaces.find(
        (iface) => iface.getName() === typeName && iface.isExported()
      );

      if (foundInterface) {
        const extendedTypes = foundInterface.getExtends();
        for (const extendedType of extendedTypes) {
          const extendedTypeObj = extendedType.getType();
          const symbol = extendedTypeObj.getSymbol();
          const baseTypeName = symbol?.getName() || "";
          const baseToken = state.tokens.get(baseTypeName);

          if (baseToken) {
            const args = extendedTypeObj.getTypeArguments();
            const genericsTokens: string[] = [];

            args.forEach((arg) => {
              const genericToken = ensureToken(state, arg, `${typeName} generic argument`);
              if (genericToken) {
                genericsTokens.push(genericToken);
                tokenDeps.get(tokenName)!.add(genericToken);
              }
            });

            if (genericsTokens.length > 0) {
              tokenMetadata.set(tokenName, {
                implements: [baseToken],
                generics: genericsTokens,
              });
            }
            break;
          }
        }
        break;
      }
    }
  }

  // Now add imports AFTER all ensureToken calls have been made
  const coreImports = new Set(["createDIToken"]);
  
  // Check if DIContainer token exists - it needs to be imported from @fioc/core
  // even though it's defined as a type alias in user code
  if (state.tokens.has("DIContainer")) {
    coreImports.add("DIContainer");
    // Remove DIContainer from tokensImports if it was added there
    state.tokensImports.forEach((names, file) => {
      names.delete("DIContainer");
    });
  }
  
  tokensFile.addImportDeclaration({
    moduleSpecifier: DI_CORE,
    namedImports: Array.from(coreImports).sort(),
  });

  // Group and merge imports from the same file
  const importsByFile = new Map<string, Set<string>>();
  state.tokensImports.forEach((names, file) => {
    if (!importsByFile.has(file)) {
      importsByFile.set(file, new Set());
    }
    names.forEach(name => importsByFile.get(file)!.add(name));
  });

  importsByFile.forEach((names, file) => {
    tokensFile.addImportDeclaration({
      moduleSpecifier: file,
      namedImports: Array.from(names).sort(),
    });
  });

  // Topological sort
  const sortedTokens: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(tokenName: string) {
    if (visited.has(tokenName)) return;
    if (visiting.has(tokenName)) {
      throw new Error(`Circular dependency detected in token: ${tokenName}`);
    }

    visiting.add(tokenName);
    const deps = tokenDeps.get(tokenName) || new Set();
    for (const dep of deps) {
      visit(dep);
    }
    visiting.delete(tokenName);
    visited.add(tokenName);
    sortedTokens.push(tokenName);
  }

  for (const tokenName of state.tokens.values()) {
    visit(tokenName);
  }

  // Generate tokens in dependency order
  for (const tokenName of sortedTokens) {
    const typeName = Array.from(state.tokens.entries()).find(([_, t]) => t === tokenName)?.[0];
    if (!typeName) continue;

    const metadata = tokenMetadata.get(tokenName);
    if (metadata) {
      const metaParts: string[] = [];
      metaParts.push(`implements: [${metadata.implements.join(", ")}]`);
      metaParts.push(`generics: [${metadata.generics.join(", ")}]`);

      tokensFile.addVariableStatement({
        isExported: true,
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: tokenName,
            initializer: `createDIToken<${typeName}>().as("${typeName}", { ${metaParts.join(", ")} })`,
          },
        ],
      });
      console.log(`  ✓ ${tokenName} (with metadata)`);
    } else {
      tokensFile.addVariableStatement({
        isExported: true,
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: tokenName,
            initializer: `createDIToken<${typeName}>().as("${typeName}")`,
          },
        ],
      });
      console.log(`  ✓ ${tokenName}`);
    }
  }

  // Generate tokens for multi-service implementations
  for (const factory of state.factories) {
    if (factory.isMultiServiceImpl && factory.metadata) {
      const implTokenName = `${factory.name}Token`;
      
      // Skip if already generated
      if (Array.from(state.tokens.values()).includes(implTokenName)) {
        continue;
      }

      const metaParts: string[] = [];
      if (factory.metadata.implements.length > 0) {
        const implementsTokens = factory.metadata.implements.map(i => `${i}Token`);
        metaParts.push(`implements: [${implementsTokens.join(", ")}]`);
      }
      if (factory.metadata.generics.length > 0) {
        metaParts.push(`generics: [${factory.metadata.generics.join(", ")}]`);
      }

      const interfaceName = factory.metadata.implements[0];
      
      tokensFile.addVariableStatement({
        isExported: true,
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: implTokenName,
            initializer: metaParts.length > 0
              ? `createDIToken<${interfaceName}>().as("${factory.name}", { ${metaParts.join(", ")} })`
              : `createDIToken<${interfaceName}>().as("${factory.name}")`,
          },
        ],
      });
      console.log(`  ✓ ${implTokenName} (multi-service impl)`);
    }
  }
}
