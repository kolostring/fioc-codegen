import { SourceFile } from "ts-morph";
import { GeneratorState } from "../types.js";
import { 
  hasTag, 
  getRelativePathFromTokens, 
  addTokenImport,
  ensureToken 
} from "../utils.js";

// ═══════════════════════════════════════════════════════════════════
// TOKEN COLLECTOR - PASS 1 & 1.5
// ═══════════════════════════════════════════════════════════════════

export function collectTokens(state: GeneratorState, files: SourceFile[]): void {
  console.log("📋 PASS 1: Collecting @Service and @MultiService types...");

  for (const f of files) {
    const rel = getRelativePathFromTokens(f.getFilePath());

    // Collect from top-level
    const collectFromNodes = (nodes: any[]) => {
      for (const node of nodes) {
        if (!node.isExported()) continue;
        
        const hasService = hasTag(node, "Service");
        const hasMultiService = hasTag(node, "MultiService");
        
        if (!hasService && !hasMultiService) continue;

        const name = node.getName();
        if (!name) continue;

        const tokenName = `${name}Token`;
        state.tokens.set(name, tokenName);
        addTokenImport(state, rel, name);

        // Track multi-service interfaces
        if (hasMultiService) {
          state.multiServices.add(name);
          console.log(`  ✓ ${name} → ${tokenName} (multi)`);
        } else {
          console.log(`  ✓ ${name} → ${tokenName}`);
        }
      }
    };

    collectFromNodes([
      ...f.getTypeAliases(),
      ...f.getInterfaces(),
      ...f.getClasses(),
    ]);

    // Also collect from namespaces
    for (const ns of f.getModules()) {
      collectFromNodes([
        ...ns.getTypeAliases(),
        ...ns.getInterfaces(),
        ...ns.getClasses(),
      ]);
    }
  }
}

export function autoDetectTokens(state: GeneratorState, files: SourceFile[]): void {
  console.log("\n🔎 PASS 1.5: Auto-detecting type aliases and interface extensions with @Token generics...");

  for (const f of files) {
    const rel = getRelativePathFromTokens(f.getFilePath());

    // Check type aliases
    for (const typeAlias of f.getTypeAliases()) {
      if (!typeAlias.isExported()) continue;

      const aliasName = typeAlias.getName();
      if (!aliasName) continue;

      if (hasTag(typeAlias, "Token")) continue;

      const aliasType = typeAlias.getType();
      const symbol = aliasType.getSymbol();
      const baseTypeName = symbol?.getName() || "";
      const baseToken = state.tokens.get(baseTypeName);

      if (baseToken && !state.tokens.has(aliasName) && baseTypeName) {
        const tokenName = `${aliasName}Token`;
        state.tokens.set(aliasName, tokenName);
        addTokenImport(state, rel, aliasName);

        console.log(`  ✓ ${aliasName} → ${tokenName} (auto-detected from ${baseTypeName})`);
      }
    }

    // Check interface extensions
    for (const iface of f.getInterfaces()) {
      if (!iface.isExported()) continue;

      const ifaceName = iface.getName();
      if (!ifaceName) continue;

      if (hasTag(iface, "Token")) continue;

      const extendedTypes = iface.getExtends();
      for (const extendedType of extendedTypes) {
        const extendedTypeObj = extendedType.getType();
        const symbol = extendedTypeObj.getSymbol();
        const baseTypeName = symbol?.getName() || "";
        const baseToken = state.tokens.get(baseTypeName);

        if (baseToken && !state.tokens.has(ifaceName) && baseTypeName) {
          const tokenName = `${ifaceName}Token`;
          state.tokens.set(ifaceName, tokenName);
          addTokenImport(state, rel, ifaceName);

          console.log(`  ✓ ${ifaceName} → ${tokenName} (auto-detected from ${baseTypeName})`);
          break;
        }
      }
    }
  }
}
