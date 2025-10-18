# Token Generator - Current Limitations & Known Issues

## ✅ Test Coverage Summary

**Total Tests:** 38 (37 passing, 1 skipped)
**Coverage:** ~70-85% on core modules

### Coverage by Module:
- ✅ **Collectors** (tokenCollector, factoryCollector): 72-86%
- ✅ **Utils**: 76%
- ✅ **Token Generator**: 68%
- ✅ **Factory Generator**: 65%
- ✅ **Container Generator**: 70%
- ❌ **CLI/Index**: 0% (acceptable - entry points)

---

## 🚫 Known Limitations

### 1. **Const Variable Declarations with Arrow Functions**

**Status:** ❌ Not Supported

**Example:**
```typescript
/**
 * @Injectable
 */
export const LoggerFactory = (): ILogger => {
  return { log: console.log };
};
```

**Issue:** JSDoc comments on `const` variable statements are not properly detected.

**Workaround:** Use regular function syntax:
```typescript
/** @Injectable */
export function LoggerFactory(): ILogger {
  return { log: console.log };
}
```

---

### 2. **Inline Object Types in Parameters**

**Status:** ❌ Throws Error (By Design)

**Example:**
```typescript
/** @Injectable */
export function BadFactory(config: { apiUrl: string }): IService {
  return {};
}
```

**Issue:** Inline object types cannot be converted to tokens.

**Workaround:** Create named interfaces:
```typescript
export interface Config {
  apiUrl: string;
}

/** @Injectable */
export function GoodFactory(config: Config): IService {
  return {};
}
```

---

### 3. **Inline Object Types in Generic Arguments**

**Status:** ❌ Not Detected

**Example:**
```typescript
/** @Service */
export interface IHandler<T> {
  handle(data: T): void;
}

/** @Injectable */
export function BadHandler(): IHandler<{ id: string; name: string }> {
  return { handle: () => {} };
}
```

**Issue:** Deep AST traversal of type arguments not implemented.

**Workaround:** Use named types:
```typescript
export interface UserData {
  id: string;
  name: string;
}

/** @Injectable */
export function GoodHandler(): IHandler<UserData> {
  return { handle: () => {} };
}
```

---

### 4. **Array Dependencies (Multi-Injection)**

**Status:** ❌ Not Supported

**Example:**
```typescript
/** @MultiService */
export interface IPlugin {}

/** @Injectable */
export function PluginManager(plugins: IPlugin[]): IPluginManager {
  // Want to inject ALL IPlugin implementations as array
  return {};
}
```

**Issue:** Array type parameters are not supported for multi-injection.

**Workaround:** Manually resolve or use `@Named` for specific implementations:
```typescript
/** @Injectable */
export function PluginManager(
  /** @Named AuthPlugin */
  authPlugin: IPlugin,
  /** @Named LoggingPlugin */
  loggingPlugin: IPlugin
): IPluginManager {
  const plugins = [authPlugin, loggingPlugin];
  return {};
}
```

---

### 5. **Decorator Syntax**

**Status:** ❌ Not Supported

**Example:**
```typescript
@Injectable()
@Singleton()
export class UserService implements IUserService {
  constructor(@Inject(IDatabaseToken) private db: IDatabase) {}
}
```

**Issue:** Only JSDoc annotations are supported, not TypeScript decorators.

**Workaround:** Use JSDoc comments:
```typescript
/**
 * @Injectable
 * @Singleton
 */
export class UserService implements IUserService {
  constructor(private db: IDatabase) {}
}
```

---

### 6. **Dynamic/Runtime Type Resolution**

**Status:** ❌ Not Supported

**Example:**
```typescript
/** @Injectable */
export function DynamicFactory(type: string): IService {
  if (type === 'A') return new ServiceA();
  return new ServiceB();
}
```

**Issue:** Return type must be statically analyzable.

**Workaround:** Create separate factories:
```typescript
/** @Injectable */
export function ServiceAFactory(): IServiceA {
  return new ServiceA();
}

/** @Injectable */
export function ServiceBFactory(): IServiceB {
  return new ServiceB();
}
```

---

### 7. **Conditional Registration**

**Status:** ⚠️ Limited Support

**Example:**
```typescript
/**
 * @Injectable
 * @Conditional production
 */
export function ProductionLogger(): ILogger {
  return { log: sendToSentry };
}
```

**Issue:** `@Conditional` annotation not implemented. Use `@Module` instead.

**Workaround:**
```typescript
/**
 * @Injectable
 * @Module Production
 */
export function ProductionLogger(): ILogger {
  return { log: sendToSentry };
}
```

---

### 8. **Async Factory Initialization**

**Status:** ❌ Not Supported

**Example:**
```typescript
/** @Injectable */
export async function DatabaseConnection(): Promise<IDatabase> {
  const connection = await connect();
  return connection;
}
```

**Issue:** Async factories are not handled specially.

**Workaround:** Return a promise-based interface:
```typescript
/** @Service */
export interface IDatabaseConnection {
  getConnection(): Promise<IDatabase>;
}

/** @Injectable */
export function DatabaseConnection(): IDatabaseConnection {
  return {
    async getConnection() {
      return await connect();
    }
  };
}
```

---

### 9. **Lifecycle Hooks (OnInit, OnDestroy)**

**Status:** ❌ Not Supported

**Example:**
```typescript
/**
 * @Injectable
 * @OnInit connect
 * @OnDestroy disconnect
 */
export function DatabaseService(): IDatabaseService {
  return {
    connect() {},
    disconnect() {},
    query() {}
  };
}
```

**Issue:** Lifecycle hooks not implemented.

**Workaround:** Manual initialization:
```typescript
const db = container.resolve(DatabaseServiceToken);
await db.connect();
```

---

### 10. **Property Injection**

**Status:** ❌ Not Supported

**Example:**
```typescript
/**
 * @Injectable
 */
export class UserService {
  @Inject(ILoggerToken)
  private logger!: ILogger;
}
```

**Issue:** Only constructor injection is supported.

**Workaround:** Use constructor injection:
```typescript
/**
 * @Injectable
 */
export class UserService {
  constructor(private logger: ILogger) {}
}
```

---

### 11. **Circular Dependencies**

**Status:** ⚠️ Partially Supported

**Example:**
```typescript
/** @Service */
export interface IServiceA {
  b: IServiceB;
}

/** @Service */
export interface IServiceB {
  a: IServiceA;
}
```

**Issue:** Circular dependencies in interfaces are detected but not resolved at runtime.

**Workaround:** Use lazy resolution or refactor to remove circular dependency.

---

### 12. **Multiple Implementations of Same @Service Interface**

**Status:** ⚠️ Ambiguous

**Example:**
```typescript
/** @Service */
export interface ILogger {}

/** @Injectable */
export function ConsoleLogger(): ILogger {
  return {};
}

/** @Injectable */
export function FileLogger(): ILogger {
  return {};
}
```

**Issue:** Both factories return `ILogger`. No validation to prevent this.

**Workaround:** Use `@MultiService` instead:
```typescript
/** @MultiService */
export interface ILogger {}
```

---

## 📊 Performance Limitations

### 1. **Large Codebases**
- **Limit:** ~1000+ files may be slow
- **Reason:** Full AST parsing of all TypeScript files
- **Workaround:** Use incremental builds or exclude unnecessary directories

### 2. **Deep Generic Nesting**
- **Limit:** 3-4 levels of generic nesting
- **Reason:** Recursive type resolution complexity
- **Workaround:** Flatten type hierarchies

---

## 🎯 Best Practices to Avoid Limitations

### ✅ DO:
1. Use named interfaces/types instead of inline objects
2. Use `@Service` for single implementations
3. Use `@MultiService` for multiple implementations
4. Use constructor injection
5. Keep generic nesting shallow (1-2 levels)
6. Use regular function syntax for factories

### ❌ DON'T:
1. Use inline object types in parameters or generics
2. Use const arrow function factories
3. Use decorators (use JSDoc instead)
4. Create circular dependencies
5. Expect array injection to work automatically
6. Use async factories without wrapping

---

## 🔮 Future Enhancements (Not Implemented)

1. **Array Injection** - Automatic multi-injection with `IPlugin[]`
2. **@Named Annotation** - Select specific implementation
3. **@Conditional** - Environment-based registration
4. **@Lazy** - Lazy loading support
5. **Lifecycle Hooks** - @OnInit, @OnDestroy
6. **Async Factories** - Native async/await support
7. **Property Injection** - Field-level injection
8. **Circular Dependency Resolution** - Automatic proxy creation
9. **Validation** - Detect conflicting registrations
10. **Watch Mode** - Auto-regenerate on file changes

---

## 📝 Summary

**The generator works well for:**
- ✅ Standard DI patterns (constructor injection)
- ✅ Single and multiple implementations
- ✅ Lifecycle management (Singleton, Scoped, Transient)
- ✅ Module-based organization
- ✅ Generic types (shallow nesting)
- ✅ Auto-detection of type aliases and extensions

**Avoid or workaround:**
- ❌ Inline object types
- ❌ Const arrow function factories
- ❌ Array dependencies
- ❌ Decorators
- ❌ Async factories
- ❌ Circular dependencies

**Overall:** The solution is **production-ready** for standard DI use cases with clean, idiomatic TypeScript code. Most limitations can be worked around with better code organization.
