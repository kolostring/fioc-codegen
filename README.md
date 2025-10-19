# @fioc/token-generator

Automatic DI token and container generator for [FIoC](https://github.com/leonardof02/fioc-core) (Functional Inversion of Control).

## Features

✅ **Automatic Token Generation** - Scans `@Service` annotations and generates type-safe DI tokens  
✅ **Factory Auto-Detection** - Finds `@Injectable` functions/classes and creates factories  
✅ **Multi-Container Support** - Use `@Module` to generate separate containers  
✅ **Interface Metadata** - Auto-detects interface implementations and generics  
✅ **Dependency Ordering** - Topological sort ensures correct declaration order  
✅ **Type-Safe** - Full TypeScript support with `.d.ts` generation  

## Installation

```bash
npm install --save-dev @fioc/token-generator ts-morph
```

## Usage

### CLI

```bash
# Run in your project root
npx fioc-generate
```

### Programmatic

```typescript
import { run } from '@fioc/token-generator';

run();
```

## Annotations

### `@Service` - Mark interfaces for single implementation

```typescript
/** @Service */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
}
```

**Generates:**
```typescript
export const IUserRepositoryToken = createDIToken<IUserRepository>().as("IUserRepository");
```

### `@MultiService` - Mark interfaces for multiple implementations

```typescript
/** @MultiService */
export interface IPlugin {
  name: string;
  execute(): void;
}

/** @Injectable */
export function AuthPlugin(): IPlugin {
  return { name: 'Auth', execute() {} };
}

/** @Injectable */
export function LoggingPlugin(): IPlugin {
  return { name: 'Logging', execute() {} };
}
```

**Generates:**
```typescript
// Base interface token
export const IPluginToken = createDIToken<IPlugin>().as("IPlugin");

// Individual implementation tokens with metadata
export const AuthPluginToken = createDIToken<IPlugin>().as("AuthPlugin", {
  implements: [IPluginToken]
});

export const LoggingPluginToken = createDIToken<IPlugin>().as("LoggingPlugin", {
  implements: [IPluginToken]
});
```

### `@Injectable` - Mark factories for auto-registration

```typescript
/**
 * @Injectable
 */
export function UserRepository(db: IDatabase): IUserRepository {
  return {
    async findById(id) {
      return db.query('SELECT * FROM users WHERE id = ?', [id]);
    }
  };
}
```

**Generates:**
```typescript
export const UserRepositoryFactory = withDependencies(Tokens.IDatabaseToken)
  .defineFactory(UserRepository);
```

### `@Singleton` / `@Scoped` - Control instance lifetime

```typescript
/**
 * @Injectable
 * @Singleton
 */
export function Config(): IConfig {
  return { apiUrl: 'http://localhost' };
}

/**
 * @Injectable
 * @Scoped
 */
export function RequestContext(): IRequestContext {
  return { requestId: generateId() };
}
```

**Lifecycles:**
- **Transient** (default) - New instance every time
- **@Singleton** - Single instance per container
- **@Scoped** - Single instance per scope (e.g., per HTTP request)

### `@Module` - Organize into separate containers

```typescript
/**
 * @Injectable
 * @Module Frontend
 */
export function FrontendService(): IFrontendService {
  // ...
}

/**
 * @Injectable
 * @Module Backend
 */
export function BackendService(): IBackendService {
  // ...
}
```

**Generates:**
- `src/ioc/containers/frontendContainer.ts`
- `src/ioc/containers/backendContainer.ts`
- `src/ioc/containers/container.ts` (default module)

## Auto-Detection

### Interface Extensions

```typescript
/** @Service */
export interface INotification<T> {
  payload: T;
}

// Auto-detected! No @Service needed
export interface UserCreatedNotification extends INotification<UserPayload> {}
```

**Generates:**
```typescript
export const UserCreatedNotificationToken = createDIToken<UserCreatedNotification>()
  .as("UserCreatedNotification", {
    implements: [INotificationToken],
    generics: [UserPayloadToken]
  });
```

### Type Aliases

```typescript
/** @Service */
export interface IHandler<T> {
  handle(data: T): void;
}

// Auto-detected!
export type UserHandler = IHandler<User>;
```

**Generates:**
```typescript
export const UserHandlerToken = createDIToken<UserHandler>()
  .as("UserHandler", {
    implements: [IHandlerToken],
    generics: [UserToken]
  });
```

## Generated Structure

```
src/ioc/
├── tokens.ts              # All DI tokens
├── factories.ts           # Factory definitions + factory tokens
└── containers/
    ├── container.ts       # Default container
    ├── frontendContainer.ts
    └── backendContainer.ts
```

## Configuration

Edit `generate-tokens/config.ts`:

```typescript
export const SRC_DIR = "src";
export const IOC_DIR = path.join(SRC_DIR, "ioc");
export const USE_JS_EXTENSIONS = true; // For ESM projects
export const DEFAULT_MODULE = "default";
```

## Example

**Input:**

```typescript
// IUserRepository.ts
/** @Service */
export interface IUserRepository {
  findAll(): Promise<User[]>;
}

// UserRepository.ts
/**
 * @Injectable
 * @Module Backend
 */
export function UserRepository(db: IDatabase): IUserRepository {
  return {
    async findAll() {
      return db.query('SELECT * FROM users');
    }
  };
}
```

**Generated:**

```typescript
// src/ioc/tokens.ts
export const IUserRepositoryToken = createDIToken<IUserRepository>()
  .as("IUserRepository");

// src/ioc/factories.ts
export const UserRepositoryFactory = withDependencies(Tokens.IDatabaseToken)
  .defineFactory(UserRepository);

// src/ioc/containers/backendContainer.ts
export const backendContainer = buildDIContainer()
  .registerFactory(Tokens.IUserRepositoryToken, Factories.UserRepositoryFactory)
  .getResult();
```

## Requirements

- TypeScript 5.0+
- `tsconfig.json` in project root
- `ts-morph` peer dependency

## License

MIT
