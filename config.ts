import * as path from "path";

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

export const SRC_DIR = "src";
export const IOC_DIR = path.join(SRC_DIR, "ioc");
export const TOKENS_FILE = path.join(IOC_DIR, "tokens.ts");
export const FACTORIES_FILE = path.join(IOC_DIR, "factories.ts");
export const CONTAINERS_DIR = path.join(IOC_DIR, "containers");
export const DI_CORE = "@fioc/core";

// Set to true for ESM projects with "module": "nodenext" in tsconfig.json
// Set to false for CommonJS or projects that don't require explicit .js extensions
export const USE_JS_EXTENSIONS = true;

// Default module name for factories without @Module annotation
export const DEFAULT_MODULE = "default";
