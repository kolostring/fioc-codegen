import { Node, Type, VariableDeclaration } from "ts-morph";
import * as path from "path";
import { USE_JS_EXTENSIONS, TOKENS_FILE, FACTORIES_FILE, DEFAULT_MODULE } from "./config.js";
import { GeneratorState } from "./types.js";

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

export function addTokenImport(state: GeneratorState, file: string, name: string): void {
  if (!state.tokensImports.has(file)) state.tokensImports.set(file, new Set());
  state.tokensImports.get(file)!.add(name);
}

export function addFactoryImport(state: GeneratorState, file: string, name: string): void {
  if (!state.factoriesImports.has(file)) state.factoriesImports.set(file, new Set());
  state.factoriesImports.get(file)!.add(name);
}

export function hasTag(node: Node, tag: string): boolean {
  const jsDocs = (node as any).getJsDocs?.();
  if (!jsDocs) return false;
  
  return jsDocs.some((doc: any) =>
    doc.getTags().some((t: any) => t.getTagName().toLowerCase() === tag.toLowerCase())
  );
}

export function getTagValue(node: Node, tag: string): string | null {
  const jsDocs = (node as any).getJsDocs?.();
  if (!jsDocs) return null;
  
  for (const doc of jsDocs) {
    const tags = doc.getTags();
    for (const t of tags) {
      if (t.getTagName().toLowerCase() === tag.toLowerCase()) {
        // Get the comment text after the tag
        const comment = t.getCommentText();
        return comment?.trim() || null;
      }
    }
  }
  
  return null;
}

export function getModuleName(node: Node): string {
  const moduleValue = getTagValue(node, "Module");
  return moduleValue || DEFAULT_MODULE;
}

export function hasTagOnVar(node: Node, tag: string): boolean {
  const parent = node.getParent();
  return parent ? hasTag(parent, tag) : false;
}

export function getModuleNameOnVar(v: VariableDeclaration): string {
  const stmt = v.getVariableStatement();
  if (!stmt) return "default";
  return getTagValue(stmt, "Module") || "default";
}

export function getLifecycle(node: Node): 'transient' | 'singleton' | 'scoped' {
  if (hasTag(node, "Singleton")) return "singleton";
  if (hasTag(node, "Scoped")) return "scoped";
  return "transient"; // Default
}

export function getLifecycleOnVar(v: VariableDeclaration): 'transient' | 'singleton' | 'scoped' {
  const stmt = v.getVariableStatement();
  if (!stmt) return "transient";
  if (hasTag(stmt, "Singleton")) return "singleton";
  if (hasTag(stmt, "Scoped")) return "scoped";
  return "transient";
}

export function getTypeName(type: Type): string {
  const symbol = type.getSymbol();
  if (symbol) {
    const name = symbol.getName();
    if (name && name !== "__type") return name;
  }
  
  // Fallback to text representation (strip generics)
  return type.getText().replace(/<.*>/, "");
}

export function isPrimitive(name: string): boolean {
  return ["string", "number", "boolean", "any", "void", "unknown"].includes(name);
}

export function getRelativePath(fromFile: string, toFile: string): string {
  const relativePath = path
    .relative(path.dirname(fromFile), toFile)
    .replace(/\\/g, "/");
  
  // Replace .ts extension based on configuration
  const pathWithoutTs = relativePath.replace(/\.ts$/, "");
  const finalPath = USE_JS_EXTENSIONS ? `${pathWithoutTs}.js` : pathWithoutTs;
  
  return `./${finalPath}`;
}

export function getRelativePathFromTokens(filePath: string): string {
  return getRelativePath(TOKENS_FILE, filePath);
}

export function getRelativePathFromFactories(filePath: string): string {
  return getRelativePath(FACTORIES_FILE, filePath);
}

export function ensureToken(state: GeneratorState, type: Type, context: string = "unknown"): string {
  // Check if this is an anonymous object type (inline object literal)
  if (type.isObject() && !type.getSymbol()) {
    const typeText = type.getText();
    if (typeText.includes('{') && typeText.includes('}')) {
      throw new Error(
        `\n\n❌ ERROR: Inline object type detected in ${context}!\n` +
        `   Type: ${typeText}\n\n` +
        `   Inline object types cannot be used as DI tokens.\n` +
        `   Please create a named type or interface instead.\n\n` +
        `   Example:\n` +
        `   ❌ Bad:  INotification<{ id: string }>\n` +
        `   ✅ Good: INotification<MyPayload>\n\n`
      );
    }
  }

  const name = getTypeName(type);
  if (!name || isPrimitive(name)) return "";

  // Additional check for inline objects in type name
  if (name.includes("{") || name.includes("}")) {
    throw new Error(
      `\n\n❌ ERROR: Inline object type detected in ${context}!\n` +
      `   Type: ${name}\n\n` +
      `   Inline object types cannot be used as DI tokens.\n` +
      `   Please create a named type or interface instead.\n\n` +
      `   Example:\n` +
      `   ❌ Bad:  { id: string; name: string }\n` +
      `   ✅ Good: UserPayload\n\n`
    );
  }

  let tokenName = state.tokens.get(name);
  if (!tokenName) {
    tokenName = `${name}Token`;
    state.tokens.set(name, tokenName);
  }

  // Always ensure import is added (even if token already exists)
  const symbol = type.getSymbol() || type.getAliasSymbol();
  const decl = symbol?.getDeclarations()?.[0];
  
  if (decl) {
    const file = decl.getSourceFile().getFilePath();
    const relativePath = getRelativePathFromTokens(file);
    // Only add import if it's not from node_modules
    if (!file.includes('node_modules')) {
      addTokenImport(state, relativePath, name);
    }
  }

  return tokenName;
}

export function extractMetadata(state: GeneratorState, type: Type): { implements: string[]; generics: string[] } {
  const implementsTokens: string[] = [];
  const genericsTokens: string[] = [];

  // First, check if this type itself has generics (e.g., INotificationHandler<T, R>)
  const typeName = getTypeName(type);
  const typeToken = state.tokens.get(typeName);
  
  if (typeToken) {
    implementsTokens.push(typeToken);
    
    // Extract generic arguments from the type
    const typeArgs = type.getTypeArguments();
    typeArgs.forEach((arg) => {
      const genericToken = ensureToken(state, arg, `${typeName} generic`);
      if (genericToken) genericsTokens.push(genericToken);
    });
  }

  // Get all base types (interfaces/classes this type extends/implements)
  const baseTypes = type.getBaseTypes();
  
  for (const baseType of baseTypes) {
    const baseTypeName = getTypeName(baseType);
    const baseToken = state.tokens.get(baseTypeName);
    
    if (baseToken) {
      // This type implements/extends a @Token interface
      implementsTokens.push(baseToken);
      
      // Extract generic arguments
      const args = baseType.getTypeArguments();
      args.forEach((arg) => {
        const genericToken = ensureToken(state, arg, `${baseTypeName} generic`);
        if (genericToken) genericsTokens.push(genericToken);
      });
    }
  }

  // Also check properties for interface implementations (for return types)
  const symbol = type.getSymbol();
  if (symbol) {
    const decls = symbol.getDeclarations();
    for (const decl of decls) {
      if (Node.isClassDeclaration(decl) || Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl)) {
        const declType = decl.getType();
        const callSigs = declType.getCallSignatures();


        
        if (callSigs.length > 0) {
          const retType = callSigs[0].getReturnType();
          
          // First check if the return type itself has a token (e.g., INotificationHandler<T, R>)
          const retTypeName = getTypeName(retType);
          const retTypeToken = state.tokens.get(retTypeName);
          
          if (retTypeToken && !implementsTokens.includes(retTypeToken)) {
            implementsTokens.push(retTypeToken);
            
            // Extract generics from the return type itself
            const retTypeArgs = retType.getTypeArguments();
            retTypeArgs.forEach((arg) => {
              const genericToken = ensureToken(state, arg, `${retTypeName} generic`);
              if (genericToken) genericsTokens.push(genericToken);
            });
          }
          
          // Also check return type's base types
          const retBaseTypes = retType.getBaseTypes();
          for (const retBaseType of retBaseTypes) {
            const retBaseTypeName = getTypeName(retBaseType);
            const retBaseToken = state.tokens.get(retBaseTypeName);
            
            if (retBaseToken && !implementsTokens.includes(retBaseToken)) {
              implementsTokens.push(retBaseToken);
              
              // Extract generics
              const args = retBaseType.getTypeArguments();
              args.forEach((arg) => {
                const genericToken = ensureToken(state, arg, `${retBaseTypeName} generic`);
                if (genericToken) genericsTokens.push(genericToken);
              });
            }
          }
        }
      }
    }
  }

  return {
    implements: [...new Set(implementsTokens)],
    generics: [...new Set(genericsTokens)],
  };
}

export function toPascalCase(str: string): string {
  return str
    .split(/[\s-_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
