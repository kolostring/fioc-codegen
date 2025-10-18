import { Type } from "ts-morph";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type Lifecycle = 'transient' | 'singleton' | 'scoped';

export interface Factory {
  name: string;
  deps: string[];
  returnType: string;
  isClass: boolean;
  module: string;
  filePath: string;
  lifecycle: Lifecycle; // Default: 'transient'
  isMultiServiceImpl?: boolean; // True if this implements a @MultiService interface
  metadata?: {
    implements: string[];
    generics: string[];
  };
}

export interface TokenMetadata {
  implements: string[];
  generics: string[];
}

export interface GeneratorState {
  tokens: Map<string, string>; // TypeName → TokenName
  multiServices: Set<string>; // Interfaces marked with @MultiService
  factories: Factory[];
  tokensImports: Map<string, Set<string>>; // FilePath → Set<ImportName>
  factoriesImports: Map<string, Set<string>>; // FilePath → Set<ImportName>
}
