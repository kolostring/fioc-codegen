import { SourceFile, Node } from "ts-morph";
import { GeneratorState } from "../types.js";
import { 
  hasTag, 
  hasTagOnVar,
  getModuleName,
  getModuleNameOnVar,
  getLifecycle,
  getLifecycleOnVar,
  getRelativePathFromFactories, 
  addFactoryImport,
  ensureToken,
  extractMetadata,
  getTypeName
} from "../utils.js";

// ═══════════════════════════════════════════════════════════════════
// FACTORY COLLECTOR - PASS 2
// ═══════════════════════════════════════════════════════════════════

export function collectFactories(state: GeneratorState, files: SourceFile[]): void {
  console.log("\n🏭 PASS 2: Collecting @Injectable factories...");

  for (const file of files) {
    const rel = getRelativePathFromFactories(file.getFilePath());

    const processFactory = (
      node: Node,
      name: string,
      isClass: boolean,
      params: any[],
      moduleName: string,
      lifecycle: 'transient' | 'singleton' | 'scoped'
    ) => {
      const paramDeps = params
        .map((p) => ensureToken(state, p.getType(), `${name} parameter`))
        .filter(Boolean);

      let returnType;
      if (isClass) {
        returnType = node.getType();
      } else {
        const funcType = node.getType();
        const sig = funcType.getCallSignatures()[0];
        if (!sig) {
          console.warn(`  ⚠️ No call signature for ${name}, skipping`);
          return;
        }
        returnType = sig.getReturnType();
      }

      const returnTypeName = getTypeName(returnType);
      const metadata = extractMetadata(state, returnType);

      // Check if this implements a @MultiService interface
      const isMultiServiceImpl = state.multiServices?.has(returnTypeName) || false;
      
      // If it's a multi-service implementation, create a unique token for this factory
      const actualReturnType = isMultiServiceImpl ? name : returnTypeName;

      state.factories.push({
        name,
        isClass,
        deps: paramDeps,
        returnType: actualReturnType,
        filePath: rel,
        module: moduleName,
        lifecycle,
        isMultiServiceImpl,
        metadata: isMultiServiceImpl ? {
          implements: [returnTypeName],
          generics: metadata?.generics || []
        } : metadata,
      });

      addFactoryImport(state, rel, name);

      const depsStr = paramDeps.length > 0 ? `(${paramDeps.join(", ")})` : "()";
      const moduleStr = moduleName !== "default" ? ` [@Module ${moduleName}]` : "";
      const multiStr = isMultiServiceImpl ? " [multi-impl]" : "";
      const lifecycleStr = lifecycle !== "transient" ? ` [@${lifecycle.charAt(0).toUpperCase() + lifecycle.slice(1)}]` : "";
      console.log(`  ✓ ${name}${depsStr} → ${returnTypeName}${moduleStr}${multiStr}${lifecycleStr}`);
    };

    file.getFunctions().forEach((fn) => {
      if (!hasTag(fn, "Injectable")) return;
      const name = fn.getName();
      if (!name) return;
      const moduleName = getModuleName(fn);
      const lifecycle = getLifecycle(fn);
      processFactory(fn, name, false, fn.getParameters(), moduleName, lifecycle);
    });

    file.getClasses().forEach((cls) => {
      if (!hasTag(cls, "Injectable")) return;
      const name = cls.getName();
      if (!name) return;
      const ctor = cls.getConstructors()[0];
      const moduleName = getModuleName(cls);
      const lifecycle = getLifecycle(cls);
      processFactory(cls, name, true, ctor?.getParameters() ?? [], moduleName, lifecycle);
    });

    file.getVariableDeclarations().forEach((v) => {
      if (!hasTagOnVar(v, "Injectable")) return;
      const name = v.getName();
      const init = v.getInitializer();
      if (init && (Node.isFunctionExpression(init) || Node.isArrowFunction(init))) {
        const moduleName = getModuleNameOnVar(v);
        const lifecycle = getLifecycleOnVar(v);
        processFactory(v, name, false, init.getParameters(), moduleName, lifecycle);
      }
    });

    // Also collect from namespaces
    file.getModules().forEach((ns) => {
      ns.getFunctions().forEach((fn) => {
        if (!hasTag(fn, "Injectable")) return;
        const name = fn.getName();
        if (!name) return;
        const moduleName = getModuleName(fn);
        const lifecycle = getLifecycle(fn);
        processFactory(fn, name, false, fn.getParameters(), moduleName, lifecycle);
      });

      ns.getClasses().forEach((cls) => {
        if (!hasTag(cls, "Injectable")) return;
        const name = cls.getName();
        if (!name) return;
        const ctor = cls.getConstructors()[0];
        const moduleName = getModuleName(cls);
        const lifecycle = getLifecycle(cls);
        processFactory(cls, name, true, ctor?.getParameters() ?? [], moduleName, lifecycle);
      });

      ns.getVariableDeclarations().forEach((v) => {
        if (!hasTagOnVar(v, "Injectable")) return;
        const name = v.getName();
        const init = v.getInitializer();
        if (init && (Node.isFunctionExpression(init) || Node.isArrowFunction(init))) {
          const moduleName = getModuleNameOnVar(v);
          const lifecycle = getLifecycleOnVar(v);
          processFactory(v, name, false, init.getParameters(), moduleName, lifecycle);
        }
      });
    });
  }
}
