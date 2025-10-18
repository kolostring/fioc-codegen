import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from 'ts-morph';
import { GeneratorState } from '../types.js';
import { collectTokens, autoDetectTokens } from '../collectors/tokenCollector.js';
import { collectFactories } from '../collectors/factoryCollector.js';
import { generateTokens } from '../generators/tokensGenerator.js';
import { generateFactories } from '../generators/factoriesGenerator.js';
import { generateContainers } from '../generators/containerGenerator.js';
import { toPascalCase, toCamelCase, isPrimitive } from '../utils.js';

describe('Token Generator', () => {
  let project: Project;
  let state: GeneratorState;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: 99,
        module: 99,
      },
    });

    state = {
      tokens: new Map(),
      multiServices: new Set(),
      factories: [],
      tokensImports: new Map(),
      factoriesImports: new Map(),
    };
  });

  describe('Utilities', () => {
    it('should convert to PascalCase', () => {
      expect(toPascalCase('my-module')).toBe('MyModule');
      expect(toPascalCase('user_service')).toBe('UserService');
      expect(toPascalCase('frontend')).toBe('Frontend');
    });

    it('should convert to camelCase', () => {
      expect(toCamelCase('my-module')).toBe('myModule');
      expect(toCamelCase('Frontend')).toBe('frontend');
    });

    it('should identify primitive types', () => {
      expect(isPrimitive('string')).toBe(true);
      expect(isPrimitive('number')).toBe(true);
      expect(isPrimitive('User')).toBe(false);
    });
  });

  describe('@Service', () => {
    it('should collect @Service interfaces', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IUserRepository {
          findById(id: string): Promise<User | null>;
        }
        `
      );

      collectTokens(state, [sourceFile]);

      expect(state.tokens.has('IUserRepository')).toBe(true);
      expect(state.tokens.get('IUserRepository')).toBe('IUserRepositoryToken');
      expect(state.multiServices.has('IUserRepository')).toBe(false);
    });

    it('should work with @Injectable factories', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface ILogger {
          log(msg: string): void;
        }

        /** @Injectable */
        export function ConsoleLogger(): ILogger {
          return { log: console.log };
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories.length).toBe(1);
      expect(state.factories[0].returnType).toBe('ILogger');
      expect(state.factories[0].isMultiServiceImpl).toBe(false);
    });
  });

  describe('@MultiService', () => {
    it('should collect @MultiService interfaces', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @MultiService */
        export interface IPlugin {
          execute(): void;
        }
        `
      );

      collectTokens(state, [sourceFile]);

      expect(state.tokens.has('IPlugin')).toBe(true);
      expect(state.multiServices.has('IPlugin')).toBe(true);
    });

    it('should create unique tokens for each implementation', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @MultiService */
        export interface IPlugin {
          execute(): void;
        }

        /** @Injectable */
        export function AuthPlugin(): IPlugin {
          return { execute() {} };
        }

        /** @Injectable */
        export function LoggingPlugin(): IPlugin {
          return { execute() {} };
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories.length).toBe(2);
      expect(state.factories[0].returnType).toBe('AuthPlugin');
      expect(state.factories[0].isMultiServiceImpl).toBe(true);
      expect(state.factories[1].returnType).toBe('LoggingPlugin');
      expect(state.factories[1].isMultiServiceImpl).toBe(true);
    });

    it('should handle generics in multi-service implementations', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @MultiService */
        export interface IEventHandler<T> {
          handle(event: T): Promise<void>;
        }

        export interface UserCreatedEvent {
          userId: string;
        }

        /** @Injectable */
        export function SendWelcomeEmail(): IEventHandler<UserCreatedEvent> {
          return { async handle(event) {} };
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories[0].isMultiServiceImpl).toBe(true);
      expect(state.factories[0].metadata?.implements).toContain('IEventHandler');
    });
  });

  describe('Lifecycle', () => {
    it('should detect @Singleton', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IConfig {}

        /**
         * @Injectable
         * @Singleton
         */
        export function Config(): IConfig {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories[0].lifecycle).toBe('singleton');
    });

    it('should detect @Scoped', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IRequestContext {}

        /**
         * @Injectable
         * @Scoped
         */
        export function RequestContext(): IRequestContext {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories[0].lifecycle).toBe('scoped');
    });

    it('should default to transient', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface ILogger {}

        /** @Injectable */
        export function Logger(): ILogger {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories[0].lifecycle).toBe('transient');
    });
  });

  describe('Auto-detection', () => {
    it('should auto-detect interface extensions', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface INotification<T> {
          payload: T;
        }

        export interface UserCreatedNotification extends INotification<UserPayload> {}

        export interface UserPayload {
          userId: string;
        }
        `
      );

      collectTokens(state, [sourceFile]);
      autoDetectTokens(state, [sourceFile]);

      expect(state.tokens.has('UserCreatedNotification')).toBe(true);
    });

    it('should auto-detect type aliases', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IHandler<T> {
          handle(data: T): void;
        }

        export type UserHandler = IHandler<User>;

        export interface User {
          id: string;
        }
        `
      );

      collectTokens(state, [sourceFile]);
      autoDetectTokens(state, [sourceFile]);

      expect(state.tokens.has('UserHandler')).toBe(true);
    });
  });

  describe('Dependencies', () => {
    it('should extract dependencies from function parameters', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IDatabase {}
        
        /** @Service */
        export interface ILogger {}

        /** @Service */
        export interface IUserRepository {}

        /** @Injectable */
        export function UserRepository(db: IDatabase, logger: ILogger): IUserRepository {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories[0].deps).toContain('IDatabaseToken');
      expect(state.factories[0].deps).toContain('ILoggerToken');
    });

    it('should handle optional parameters', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IConfig {}
        
        /** @Service */
        export interface ILogger {}

        /** @Service */
        export interface IService {}

        /** @Injectable */
        export function Service(config: IConfig, logger?: ILogger): IService {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories[0].deps).toContain('IConfigToken');
      expect(state.factories[0].deps).toContain('ILoggerToken');
    });
  });

  describe('Classes', () => {
    it('should handle class factories', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IService {}
        
        /** @Service */
        export interface IDatabase {}

        /** @Injectable */
        export class MyService implements IService {
          constructor(private db: IDatabase) {}
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories[0].isClass).toBe(true);
      expect(state.factories[0].deps).toContain('IDatabaseToken');
    });
  });

  describe('@Module', () => {
    it('should extract module from @Module annotation', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IFrontendService {}

        /**
         * @Injectable
         * @Module Frontend
         */
        export function FrontendService(): IFrontendService {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories[0].module).toBe('Frontend');
    });

    it('should group factories by module', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IService1 {}
        
        /** @Service */
        export interface IService2 {}

        /** @Injectable */
        export function Service1(): IService1 { return {}; }

        /**
         * @Injectable
         * @Module Frontend
         */
        export function Service2(): IService2 { return {}; }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      const modules = new Set(state.factories.map(f => f.module));
      expect(modules.has('default')).toBe(true);
      expect(modules.has('Frontend')).toBe(true);
    });
  });

  describe('Token Generation', () => {
    it('should generate tokens with metadata', () => {
      const sourceFile = project.createSourceFile(
        'src/test.ts',
        `
        /** @Service */
        export interface INotification<T> {
          payload: T;
        }

        export interface UserCreatedNotification extends INotification<UserPayload> {}

        export interface UserPayload {
          userId: string;
        }
        `
      );

      const tokensFile = project.createSourceFile('src/ioc/tokens.ts', '');

      collectTokens(state, [sourceFile]);
      autoDetectTokens(state, [sourceFile]);
      generateTokens(state, tokensFile, [sourceFile]);

      const content = tokensFile.getFullText();
      
      expect(content).toContain('INotificationToken');
      expect(content).toContain('UserCreatedNotificationToken');
      expect(content).toContain('implements:');
      expect(content).toContain('generics:');
    });
  });

  describe('Namespaces', () => {
    it('should collect tokens from namespaces', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        export namespace Services {
          /** @Service */
          export interface IUserService {
            getUser(): User;
          }

          export interface User {
            id: string;
          }
        }
        `
      );

      collectTokens(state, [sourceFile]);

      expect(state.tokens.has('IUserService')).toBe(true);
    });

    it('should collect factories from namespaces', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        export namespace Services {
          /** @Service */
          export interface IUserService {}

          /** @Injectable */
          export function UserService(): IUserService {
            return {};
          }
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.tokens.has('IUserService')).toBe(true);
      expect(state.factories.length).toBe(1);
      expect(state.factories[0].name).toBe('UserService');
    });
  });

  describe('Combined Annotations', () => {
    it('should handle @Injectable + @Singleton + @Module together', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @MultiService */
        export interface IPlugin {}

        /**
         * @Injectable
         * @Singleton
         * @Module Frontend
         */
        export function CachePlugin(): IPlugin {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      const factory = state.factories[0];
      expect(factory.lifecycle).toBe('singleton');
      expect(factory.module).toBe('Frontend');
      expect(factory.isMultiServiceImpl).toBe(true);
    });

    it('should handle @MultiService + @Scoped', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @MultiService */
        export interface IHandler {}

        /**
         * @Injectable
         * @Scoped
         */
        export function RequestHandler(): IHandler {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      const factory = state.factories[0];
      expect(factory.lifecycle).toBe('scoped');
      expect(factory.isMultiServiceImpl).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle factories with no dependencies', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IConfig {}

        /** @Injectable */
        export function Config(): IConfig {
          return { apiUrl: 'localhost' };
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories[0].deps).toHaveLength(0);
    });

    it('should handle deeply nested generics', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IWrapper<T> {
          value: T;
        }

        export interface IDoubleWrapper<T> extends IWrapper<IWrapper<T>> {}
        `
      );

      collectTokens(state, [sourceFile]);
      autoDetectTokens(state, [sourceFile]);

      expect(state.tokens.has('IWrapper')).toBe(true);
      expect(state.tokens.has('IDoubleWrapper')).toBe(true);
    });

    it('should handle marker interfaces', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IMarker {}

        /** @Injectable */
        export function MarkerImpl(): IMarker {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.tokens.has('IMarker')).toBe(true);
      expect(state.factories.length).toBe(1);
    });

    it.skip('should handle variable declaration factories', () => {
      // TODO: Variable declarations with arrow functions need better JSDoc detection
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface ILogger {}

        /** @Injectable */
        export const LoggerFactory = (): ILogger => {
          return { log: console.log };
        };
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories.length).toBe(1);
      expect(state.factories[0].name).toBe('LoggerFactory');
    });

    it('should handle circular interface references', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IUserService {
          getUser(): User;
        }

        export interface User {
          id: string;
          posts?: Post[];
        }

        export interface Post {
          id: string;
          author?: User;
        }
        `
      );

      collectTokens(state, [sourceFile]);
      
      expect(state.tokens.has('IUserService')).toBe(true);
    });

    it('should handle Promise return types', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface IAsyncService {
          getData(): Promise<string>;
        }

        /** @Injectable */
        export function AsyncService(): IAsyncService {
          return {
            async getData() {
              return 'data';
            }
          };
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.factories.length).toBe(1);
    });

    it('should handle union types', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Service */
        export interface ILogger {
          log(message: string | Error): void;
        }

        /** @Injectable */
        export function Logger(): ILogger {
          return {
            log(message) {
              console.log(message);
            }
          };
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);

      expect(state.tokens.has('ILogger')).toBe(true);
      expect(state.factories.length).toBe(1);
    });
  });

  describe('Factory Generation', () => {
    it('should generate factory with dependencies', () => {
      const sourceFile = project.createSourceFile(
        'src/UserRepository.ts',
        `
        /** @Service */
        export interface IDatabase {}
        
        /** @Service */
        export interface IUserRepository {}

        /** @Injectable */
        export function UserRepository(db: IDatabase): IUserRepository {
          return {};
        }
        `
      );

      const factoriesFile = project.createSourceFile('src/ioc/factories.ts', '');

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);
      generateFactories(state, factoriesFile);

      const content = factoriesFile.getFullText();
      
      expect(content).toContain('import { withDependencies');
      expect(content).toContain('UserRepositoryFactory');
      expect(content).toContain('withDependencies(Tokens.IDatabaseToken)');
      expect(content).toContain('.defineFactory(UserRepository)');
    });

    it('should generate factory for classes', () => {
      const sourceFile = project.createSourceFile(
        'src/MyService.ts',
        `
        /** @Service */
        export interface IDatabase {}

        /** @Injectable */
        export class MyService {
          constructor(private db: IDatabase) {}
        }
        `
      );

      const factoriesFile = project.createSourceFile('src/ioc/factories.ts', '');

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);
      generateFactories(state, factoriesFile);

      const content = factoriesFile.getFullText();
      
      expect(content).toContain('constructorToFactory');
      expect(content).toContain('constructorToFactory(MyService)');
    });

    it('should generate factory without dependencies', () => {
      const sourceFile = project.createSourceFile(
        'src/Config.ts',
        `
        /** @Service */
        export interface IConfig {}

        /** @Injectable */
        export function Config(): IConfig {
          return { apiUrl: 'localhost' };
        }
        `
      );

      const factoriesFile = project.createSourceFile('src/ioc/factories.ts', '');

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);
      generateFactories(state, factoriesFile);

      const content = factoriesFile.getFullText();
      
      expect(content).toContain('ConfigFactory');
      expect(content).toContain('defineFactory(Config)');
    });

    it('should generate factory tokens for multi-service implementations', () => {
      const sourceFile = project.createSourceFile(
        'src/Plugin.ts',
        `
        /** @MultiService */
        export interface IPlugin {}

        /** @Injectable */
        export function AuthPlugin(): IPlugin {
          return {};
        }
        `
      );

      const factoriesFile = project.createSourceFile('src/ioc/factories.ts', '');

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);
      generateFactories(state, factoriesFile);

      const content = factoriesFile.getFullText();
      
      expect(content).toContain('AuthPluginFactory');
      expect(content).toContain('AuthPluginToken');
    });
  });

  describe('Container Generation', () => {
    it('should generate default container', () => {
      const sourceFile = project.createSourceFile(
        'src/Service.ts',
        `
        /** @Service */
        export interface IService {}

        /** @Injectable */
        export function Service(): IService {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);
      generateContainers(state, project);

      const containerFile = project.getSourceFile('src/ioc/containers/container.ts');
      expect(containerFile).toBeDefined();
      
      const content = containerFile!.getFullText();
      expect(content).toContain('buildDIContainer');
      expect(content).toContain('registerFactory');
      expect(content).toContain('ServiceFactory');
    });

    it('should generate multiple containers for different modules', () => {
      const sourceFile = project.createSourceFile(
        'src/Services.ts',
        `
        /** @Service */
        export interface IService1 {}
        
        /** @Service */
        export interface IService2 {}

        /** @Injectable */
        export function Service1(): IService1 {
          return {};
        }

        /**
         * @Injectable
         * @Module Frontend
         */
        export function Service2(): IService2 {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);
      generateContainers(state, project);

      const defaultContainer = project.getSourceFile('src/ioc/containers/container.ts');
      const frontendContainer = project.getSourceFile('src/ioc/containers/frontendContainer.ts');

      expect(defaultContainer).toBeDefined();
      expect(frontendContainer).toBeDefined();
    });

    it('should group factories by module in containers', () => {
      const sourceFile = project.createSourceFile(
        'src/Services.ts',
        `
        /** @Service */
        export interface IBackendService {}
        
        /** @Service */
        export interface IFrontendService {}

        /**
         * @Injectable
         * @Module Backend
         */
        export function BackendService(): IBackendService {
          return {};
        }

        /**
         * @Injectable
         * @Module Frontend
         */
        export function FrontendService(): IFrontendService {
          return {};
        }
        `
      );

      collectTokens(state, [sourceFile]);
      collectFactories(state, [sourceFile]);
      generateContainers(state, project);

      const backendContainer = project.getSourceFile('src/ioc/containers/backendContainer.ts');
      const frontendContainer = project.getSourceFile('src/ioc/containers/frontendContainer.ts');

      expect(backendContainer).toBeDefined();
      expect(frontendContainer).toBeDefined();

      const backendContent = backendContainer!.getFullText();
      const frontendContent = frontendContainer!.getFullText();

      expect(backendContent).toContain('BackendServiceFactory');
      expect(backendContent).not.toContain('FrontendServiceFactory');

      expect(frontendContent).toContain('FrontendServiceFactory');
      expect(frontendContent).not.toContain('BackendServiceFactory');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for inline object types', () => {
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
        /** @Injectable */
        export function BadFactory(config: { apiUrl: string }): IService {
          return {};
        }

        /** @Service */
        export interface IService {}
        `
      );

      collectTokens(state, [sourceFile]);
      
      expect(() => {
        collectFactories(state, [sourceFile]);
      }).toThrow(/Inline object type/);
    });
  });
});
