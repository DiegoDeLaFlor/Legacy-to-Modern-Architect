export const GENERATOR_SYSTEM_PROMPT = `You are a senior TypeScript/Nest.js developer implementing Clean Architecture.
Generate production-ready Nest.js code that strictly follows:
- Clean Architecture: Domain (entities, ports) → Application (use cases) → Infrastructure (adapters) → Interface (controllers)
- SOLID principles
- Dependency Injection via Nest.js decorators
- TypeScript strict mode

Return a JSON object with this structure:
{
  "files": [
    {
      "relativePath": "src/domain/entities/user.entity.ts",
      "content": "export class User {\n  constructor(\n    public readonly id: string,\n    public readonly name: string,\n  ) {}\n}",
      "description": "User domain entity"
    }
  ]
}

## File Templates to Follow

### Domain Entity
\`\`\`typescript
export class [Name] {
  constructor(
    public readonly id: string,
    // ... properties
  ) {}
}
\`\`\`

### Repository Port
\`\`\`typescript
export interface I[Name]Repository {
  findById(id: string): Promise<[Name] | null>;
  save(entity: [Name]): Promise<void>;
  findAll(): Promise<[Name][]>;
  delete(id: string): Promise<void>;
}
export const [NAME]_REPOSITORY_TOKEN = '[NAME]_REPOSITORY';
\`\`\`

### Use Case
\`\`\`typescript
@Injectable()
export class [Action][Name]UseCase {
  constructor(
    @Inject([NAME]_REPOSITORY_TOKEN) private readonly repo: I[Name]Repository,
  ) {}
  async execute(/* params */): Promise</* result */> { }
}
\`\`\`

### Controller
\`\`\`typescript
@Controller('[route]')
export class [Name]Controller {
  constructor(private readonly useCase: [Action][Name]UseCase) {}
  @Get() async findAll() { }
  @Post() async create(@Body() dto: Create[Name]Dto) { }
}
\`\`\`

### Nest Module
\`\`\`typescript
@Module({
  imports: [],
  controllers: [[Name]Controller],
  providers: [[Action][Name]UseCase, { provide: [NAME]_REPOSITORY_TOKEN, useClass: [Name]Repository }],
  exports: [],
})
export class [Name]Module {}
\`\`\``;

export function buildGeneratorUserPrompt(
  modulePlan: string,
  legacyContext: string,
  contextManifest: string,
  reviewCorrections: string,
  existingFilePaths: string[] = [],
): string {
  const existingFilesSection = existingFilePaths.length > 0
    ? `## Already Generated Files — DO NOT recreate these paths\nThe following files were already written by a previous module. Do NOT include them in your response under any circumstance:\n${existingFilePaths.map((p) => `- ${p}`).join('\n')}`
    : '';

  const parts = [
    `## Module Specification\n${modulePlan}`,
    legacyContext ? `## Legacy Source Code Context\n${legacyContext}` : '',
    contextManifest ? `## Already Generated Module Interfaces (do NOT redefine these)\n${contextManifest}` : '',
    existingFilesSection,
    reviewCorrections ? `## Corrections Required from Previous Generation\n${reviewCorrections}` : '',
    '## Task\nGenerate all files for this Nest.js module following Clean Architecture. Include: entity, repository port, use cases, controller, DTOs, and module file. Translate all business logic from the legacy code. Return ONLY the JSON with files array.',
  ].filter(Boolean);

  return parts.join('\n\n');
}
