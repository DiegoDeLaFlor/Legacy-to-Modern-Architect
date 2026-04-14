import { ModuleBoundary } from '../value-objects/module-boundary.vo';

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requestDto?: string;
  responseDto?: string;
}

export interface NestModulePlan {
  name: string;
  description: string;
  boundary: ModuleBoundary;
  entities: string[];
  useCases: string[];
  controller?: string;
  endpoints: ApiEndpoint[];
  /** Ordered by dependency — this module depends on these */
  dependsOn: string[];
  /** Legacy source files mapped to this module */
  legacySourcePaths: string[];
}

export interface AngularFeaturePlan {
  name: string;
  description: string;
  components: string[];
  services: string[];
  /** Nest.js module names this feature talks to */
  backendModules: string[];
  routes: Array<{ path: string; component: string }>;
}

export class MigrationPlan {
  constructor(
    public readonly repoId: string,
    public readonly nestModules: NestModulePlan[],
    public readonly angularFeatures: AngularFeaturePlan[],
    public readonly globalEntities: string[],
    public readonly plannedAt: Date,
    public readonly plannerReasoning: string,
  ) {}

  /** Modules sorted so dependencies come first (leaf → root order) */
  get modulesInDependencyOrder(): NestModulePlan[] {
    const resolved: NestModulePlan[] = [];
    const visited = new Set<string>();

    const visit = (mod: NestModulePlan) => {
      if (visited.has(mod.name)) return;
      visited.add(mod.name);
      for (const dep of mod.dependsOn) {
        const depMod = this.nestModules.find((m) => m.name === dep);
        if (depMod) visit(depMod);
      }
      resolved.push(mod);
    };

    for (const mod of this.nestModules) visit(mod);
    return resolved;
  }
}
