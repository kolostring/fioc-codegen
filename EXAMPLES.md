# @Service, @MultiService, and Lifecycle Examples

## Basic @Service Usage

### Single Implementation

```typescript
// ILogger.ts
/** @Service */
export interface ILogger {
  log(message: string): void;
}

// ConsoleLogger.ts
/** @Injectable */
export function ConsoleLogger(): ILogger {
  return {
    log(message) {
      console.log(message);
    }
  };
}
```

**Generated tokens.ts:**
```typescript
export const ILoggerToken = createDIToken<ILogger>().as("ILogger");
```

**Generated factories.ts:**
```typescript
export const ConsoleLoggerFactory = defineFactory(ConsoleLogger);
```

**Generated container.ts:**
```typescript
export const container = buildDIContainer()
  .registerFactory(Tokens.ILoggerToken, Factories.ConsoleLoggerFactory)
  .getResult();
```

---

## @MultiService Usage

### Plugin System

```typescript
// IPlugin.ts
/**
 * @MultiService
 */
export interface IPlugin {
  name: string;
  execute(): void;
}

// AuthPlugin.ts
/** @Injectable */
export function AuthPlugin(): IPlugin {
  return {
    name: 'Authentication',
    execute() {
      console.log('Auth plugin executing');
    }
  };
}

// LoggingPlugin.ts
/** @Injectable */
export function LoggingPlugin(): IPlugin {
  return {
    name: 'Logging',
    execute() {
      console.log('Logging plugin executing');
    }
  };
}

// ValidationPlugin.ts
/** @Injectable */
export function ValidationPlugin(): IPlugin {
  return {
    name: 'Validation',
    execute() {
      console.log('Validation plugin executing');
    }
  };
}
```

**Generated tokens.ts:**
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

export const ValidationPluginToken = createDIToken<IPlugin>().as("ValidationPlugin", {
  implements: [IPluginToken]
});
```

**Generated factories.ts:**
```typescript
export const AuthPluginFactory = defineFactory(AuthPlugin);
export const LoggingPluginFactory = defineFactory(LoggingPlugin);
export const ValidationPluginFactory = defineFactory(ValidationPlugin);
```

**Generated container.ts:**
```typescript
export const container = buildDIContainer()
  .registerFactory(Tokens.AuthPluginToken, Factories.AuthPluginFactory)
  .registerFactory(Tokens.LoggingPluginToken, Factories.LoggingPluginFactory)
  .registerFactory(Tokens.ValidationPluginToken, Factories.ValidationPluginFactory)
  .getResult();
```

**Usage:**
```typescript
// Resolve individual plugins
const authPlugin = container.resolve(Tokens.AuthPluginToken);
const loggingPlugin = container.resolve(Tokens.LoggingPluginToken);
const validationPlugin = container.resolve(Tokens.ValidationPluginToken);

authPlugin.execute();
loggingPlugin.execute();
validationPlugin.execute();

// Or get all plugins (if FIoC supports metadata queries)
const allPlugins = container.resolveByMetadata({
  implements: [Tokens.IPluginToken]
});
```

---

## Event Handlers with Generics

```typescript
// IEventHandler.ts
/**
 * @MultiService
 */
export interface IEventHandler<T> {
  handle(event: T): Promise<void>;
}

// UserCreatedEvent.ts
export interface UserCreatedEvent {
  userId: string;
  email: string;
}

// SendWelcomeEmail.ts
/** @Injectable */
export function SendWelcomeEmail(): IEventHandler<UserCreatedEvent> {
  return {
    async handle(event) {
      console.log(`Sending welcome email to ${event.email}`);
      // await sendEmail(event.email, 'Welcome!');
    }
  };
}

// CreateUserProfile.ts
/** @Injectable */
export function CreateUserProfile(): IEventHandler<UserCreatedEvent> {
  return {
    async handle(event) {
      console.log(`Creating profile for user ${event.userId}`);
      // await createProfile(event.userId);
    }
  };
}

// SendSlackNotification.ts
/** @Injectable */
export function SendSlackNotification(): IEventHandler<UserCreatedEvent> {
  return {
    async handle(event) {
      console.log(`Sending Slack notification for ${event.email}`);
      // await sendSlack(`New user: ${event.email}`);
    }
  };
}
```

**Generated tokens.ts:**
```typescript
export const IEventHandlerToken = createDIToken<IEventHandler>()
  .as("IEventHandler");

export const UserCreatedEventToken = createDIToken<UserCreatedEvent>()
  .as("UserCreatedEvent");

export const SendWelcomeEmailToken = createDIToken<IEventHandler<UserCreatedEvent>>()
  .as("SendWelcomeEmail", {
    implements: [IEventHandlerToken],
    generics: [UserCreatedEventToken]
  });

export const CreateUserProfileToken = createDIToken<IEventHandler<UserCreatedEvent>>()
  .as("CreateUserProfile", {
    implements: [IEventHandlerToken],
    generics: [UserCreatedEventToken]
  });

export const SendSlackNotificationToken = createDIToken<IEventHandler<UserCreatedEvent>>()
  .as("SendSlackNotification", {
    implements: [IEventHandlerToken],
    generics: [UserCreatedEventToken]
  });
```

**Usage:**
```typescript
// Resolve all UserCreatedEvent handlers
const handlers = [
  container.resolve(Tokens.SendWelcomeEmailToken),
  container.resolve(Tokens.CreateUserProfileToken),
  container.resolve(Tokens.SendSlackNotificationToken)
];

// Execute all handlers
const event: UserCreatedEvent = {
  userId: '123',
  email: 'john@example.com'
};

await Promise.all(handlers.map(h => h.handle(event)));
```

---

## Mixed @Service and @MultiService

```typescript
// ILogger.ts (single implementation)
/** @Service */
export interface ILogger {
  log(message: string): void;
}

// IPlugin.ts (multiple implementations)
/** @MultiService */
export interface IPlugin {
  execute(): void;
}

// ConsoleLogger.ts
/** @Injectable */
export function ConsoleLogger(): ILogger {
  return { log: console.log };
}

// PluginA.ts
/** @Injectable */
export function PluginA(): IPlugin {
  return { execute() { console.log('Plugin A'); } };
}

// PluginB.ts
/** @Injectable */
export function PluginB(): IPlugin {
  return { execute() { console.log('Plugin B'); } };
}

// App.ts
/** @Injectable */
export function App(
  logger: ILogger,        // Single instance
  /**
   * @Named PluginA
   */
  pluginA: IPlugin,       // Specific plugin
  /**
   * @Named PluginB
   */
  pluginB: IPlugin        // Specific plugin
): IApp {
  return {
    start() {
      logger.log('Starting app...');
      pluginA.execute();
      pluginB.execute();
    }
  };
}
```

**Generated container.ts:**
```typescript
export const container = buildDIContainer()
  // Single service
  .registerFactory(Tokens.ILoggerToken, Factories.ConsoleLoggerFactory)
  
  // Multi-service implementations
  .registerFactory(Tokens.PluginAToken, Factories.PluginAFactory)
  .registerFactory(Tokens.PluginBToken, Factories.PluginBFactory)
  
  // App with dependencies
  .registerFactory(Tokens.AppToken, Factories.AppFactory)
  .getResult();
```

---

## Benefits

### 1. **Automatic Token Generation**
No need to manually add `@Token` to each implementation:

```typescript
// ❌ Without @MultiService
/** @Token */
export function AuthPlugin(): IPlugin { }

/** @Token */
export function LoggingPlugin(): IPlugin { }

// ✅ With @MultiService
/** @MultiService */
export interface IPlugin { }

/** @Injectable */
export function AuthPlugin(): IPlugin { }

/** @Injectable */
export function LoggingPlugin(): IPlugin { }
```

### 2. **Metadata Tracking**
Each implementation has metadata linking it to the base interface:

```typescript
AuthPluginToken {
  implements: [IPluginToken]
}
```

### 3. **Type Safety**
Generator validates usage at build time.

### 4. **Discoverability**
Easy to find all implementations of an interface by looking for `implements: [IPluginToken]`.

---

## Backward Compatibility

The old `@Token` annotation still works:

```typescript
/** @Token */
export interface ILegacyService {
  doSomething(): void;
}
```

This generates the same output as `@Service`.

---

## Lifecycle Management

Control instance lifetime with `@Singleton` and `@Scoped` annotations.

### `@Singleton` - Single Instance

```typescript
/** @Service */
export interface IConfig {
  apiUrl: string;
  timeout: number;
}

/**
 * @Injectable
 * @Singleton
 */
export function Config(): IConfig {
  console.log('Config created once!');
  return {
    apiUrl: 'http://localhost',
    timeout: 5000
  };
}
```

**Behavior:**
- Created **once** per container
- Same instance returned on every resolve
- Perfect for configuration, caches, connection pools

**Console Output:**
```
🏭 PASS 2: Collecting @Injectable factories...
  ✓ Config() → IConfig [@Singleton]
```

---

### `@Scoped` - Instance Per Scope

```typescript
/** @Service */
export interface IRequestContext {
  requestId: string;
  userId?: string;
}

/**
 * @Injectable
 * @Scoped
 */
export function RequestContext(): IRequestContext {
  return {
    requestId: generateId(),
    userId: undefined
  };
}
```

**Behavior:**
- Created **once per scope** (e.g., per HTTP request)
- Same instance within the scope
- New instance for each new scope
- Perfect for request-specific data

**Console Output:**
```
🏭 PASS 2: Collecting @Injectable factories...
  ✓ RequestContext() → IRequestContext [@Scoped]
```

---

### Default: Transient

Without any lifecycle annotation, factories are **transient** (new instance every time):

```typescript
/** @Service */
export interface ILogger {
  log(msg: string): void;
}

/** @Injectable */
export function Logger(): ILogger {
  console.log('New logger created');
  return { log: console.log };
}
```

**Behavior:**
- Created **every time** it's resolved
- No caching
- Perfect for stateless services

---

### Mixed Lifecycles Example

```typescript
// Singleton - Created once
/**
 * @Injectable
 * @Singleton
 */
export function DatabaseConnection(): IDatabase {
  console.log('Connecting to database...');
  return createConnection();
}

// Scoped - Per request
/**
 * @Injectable
 * @Scoped
 */
export function RequestLogger(): ILogger {
  const requestId = generateId();
  return {
    log(msg) {
      console.log(`[${requestId}] ${msg}`);
    }
  };
}

// Transient - Every time
/** @Injectable */
export function EmailService(): IEmailService {
  return {
    send(to, subject, body) {
      // Send email
    }
  };
}
```

**Console Output:**
```
🏭 PASS 2: Collecting @Injectable factories...
  ✓ DatabaseConnection() → IDatabase [@Singleton]
  ✓ RequestLogger() → ILogger [@Scoped]
  ✓ EmailService() → IEmailService
```

---

### Lifecycle with @MultiService

```typescript
/** @MultiService */
export interface IPlugin {
  execute(): void;
}

/**
 * @Injectable
 * @Singleton
 */
export function CachePlugin(): IPlugin {
  const cache = new Map();
  return {
    execute() {
      // Use shared cache
    }
  };
}

/** @Injectable */
export function LoggingPlugin(): IPlugin {
  return {
    execute() {
      console.log('Logging...');
    }
  };
}
```

**Console Output:**
```
🏭 PASS 2: Collecting @Injectable factories...
  ✓ CachePlugin() → IPlugin [multi-impl] [@Singleton]
  ✓ LoggingPlugin() → IPlugin [multi-impl]
```

---

### Lifecycle Comparison

| Lifecycle | Created | Use Case | Example |
|-----------|---------|----------|---------|
| **Transient** (default) | Every resolve | Stateless services | Email sender, validators |
| **@Singleton** | Once per container | Shared state | Config, DB connection, cache |
| **@Scoped** | Once per scope | Request-specific | Request context, user session |

---

### Best Practices

1. **Use @Singleton for:**
   - Configuration objects
   - Database connections
   - Caches
   - Expensive-to-create objects

2. **Use @Scoped for:**
   - Request context
   - User session data
   - Transaction managers

3. **Use Transient (default) for:**
   - Stateless services
   - Lightweight objects
   - Services that should be isolated
