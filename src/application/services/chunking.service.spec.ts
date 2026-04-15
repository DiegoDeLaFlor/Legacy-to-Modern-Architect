import { ChunkingService } from './chunking.service';
import { FileAnalysis, ClassInfo, MethodInfo } from '../../domain/entities/file-analysis.entity';
import { LanguageType } from '../../domain/value-objects/language-type.vo';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface AnalysisOverrides {
  filePath?: string;
  language?: LanguageType;
  classes?: ClassInfo[];
  functions?: MethodInfo[];
  imports?: FileAnalysis['imports'];
  exports?: string[];
  businessRules?: FileAnalysis['businessRules'];
  dataModels?: FileAnalysis['dataModels'];
  rawContent?: string;
  parseError?: string;
}

function makeAnalysis(overrides: AnalysisOverrides = {}): FileAnalysis {
  return new FileAnalysis(
    overrides.filePath ?? 'src/foo.ts',
    overrides.language ?? LanguageType.TypeScript,
    overrides.classes ?? [],
    overrides.functions ?? [],
    overrides.imports ?? [],
    overrides.exports ?? [],
    overrides.businessRules ?? [],
    overrides.dataModels ?? [],
    overrides.rawContent ?? '',
    overrides.parseError,
  );
}

// MIN_CHUNK_TOKENS = 50, TOKENS_PER_CHAR = 0.25 → need > 200 chars of content per chunk
const SMALL_CLASS_CONTENT = `import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';

/**
 * UserService encapsulates all user-related business logic.
 * It delegates persistence to UserRepository.
 */
@Injectable()
export class UserService {
  private readonly name: string;
  private readonly email: string;
  private readonly age: number;

  constructor(private readonly repo: UserRepository) {
    this.name = '';
    this.email = '';
    this.age = 0;
  }

  greet(): string {
    return \`Hello, my name is \${this.name} and my email is \${this.email}\`;
  }

  isAdult(): boolean {
    return this.age >= 18;
  }
}
`;

const SMALL_CLASS: ClassInfo = {
  name: 'UserService',
  startLine: 9,
  endLine: 27,
  methods: [
    { name: 'greet', startLine: 20, endLine: 22, parameters: [], isPublic: true },
    { name: 'isAdult', startLine: 24, endLine: 26, parameters: [], isPublic: true },
  ],
  fields: [
    { name: 'name', type: 'string', isPublic: false },
    { name: 'email', type: 'string', isPublic: false },
    { name: 'age', type: 'number', isPublic: false },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(() => {
    service = new ChunkingService();
  });

  // ── chunk IDs ──────────────────────────────────────────────────────────────

  it('assigns a unique UUID to every chunk', () => {
    const analysis = makeAnalysis({
      classes: [SMALL_CLASS],
      rawContent: SMALL_CLASS_CONTENT,
    });
    const chunks = service.chunkFile(analysis, 'repo-1');
    const ids = chunks.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[0-9a-f-]{36}$/));
  });

  it('sets repoId on every chunk metadata', () => {
    const analysis = makeAnalysis({
      classes: [SMALL_CLASS],
      rawContent: SMALL_CLASS_CONTENT,
    });
    const chunks = service.chunkFile(analysis, 'my-repo');
    chunks.forEach((c) => expect(c.metadata.repoId).toBe('my-repo'));
  });

  // ── small class ────────────────────────────────────────────────────────────

  describe('small class (fits in one chunk)', () => {
    let chunks: ReturnType<ChunkingService['chunkFile']>;

    beforeEach(() => {
      const analysis = makeAnalysis({
        classes: [SMALL_CLASS],
        rawContent: SMALL_CLASS_CONTENT,
      });
      chunks = service.chunkFile(analysis, 'repo-1');
    });

    it('produces at least one code chunk', () => {
      const codeChunks = chunks.filter((c) => c.metadata.type === 'code');
      expect(codeChunks.length).toBeGreaterThanOrEqual(1);
    });

    it('code chunk contains the class name', () => {
      const codeChunk = chunks.find((c) => c.metadata.type === 'code');
      expect(codeChunk?.content).toContain('UserService');
    });

    it('code chunk carries className metadata', () => {
      const codeChunk = chunks.find((c) => c.metadata.type === 'code');
      expect((codeChunk?.metadata as any).className).toBe('UserService');
    });

    it('includes import block in chunk content', () => {
      const codeChunk = chunks.find((c) => c.metadata.type === 'code');
      expect(codeChunk?.content).toContain("import { Injectable }");
    });
  });

  // ── large class ────────────────────────────────────────────────────────────

  describe('large class (exceeds MAX_CHUNK_TOKENS)', () => {
    it('splits into per-method chunks', () => {
      // Generate a class content long enough to exceed 1500 tokens (~6000 chars)
      const longBody = Array.from({ length: 200 }, (_, i) => `  line${i}(): void { /* placeholder */ }`).join('\n');
      const largeContent = `class BigService {\n${longBody}\n}`;

      const methods: MethodInfo[] = Array.from({ length: 5 }, (_, i) => ({
        name: `method${i}`,
        startLine: 2 + i * 40,
        endLine: 2 + i * 40 + 38,
        parameters: [],
        isPublic: true,
      }));

      const largeClass: ClassInfo = {
        name: 'BigService',
        startLine: 1,
        endLine: largeContent.split('\n').length,
        methods,
        fields: [],
      };

      const analysis = makeAnalysis({
        classes: [largeClass],
        rawContent: largeContent,
      });

      const chunks = service.chunkFile(analysis, 'repo-1');
      const codeChunks = chunks.filter((c) => c.metadata.type === 'code');
      // Should have one chunk per method (5)
      expect(codeChunks.length).toBe(5);
      codeChunks.forEach((c) => {
        expect((c.metadata as any).className).toBe('BigService');
        expect((c.metadata as any).functionName).toBeDefined();
      });
    });
  });

  // ── top-level functions ────────────────────────────────────────────────────

  describe('file with top-level functions (no classes)', () => {
    it('produces one code chunk per function', () => {
      // Each function chunk must exceed MIN_CHUNK_TOKENS (50 tokens ≈ 200 chars)
      const content = [
        'import { helper } from "./utils";',
        'import { validator } from "./validator";',
        '',
        '/** Adds two numbers together and returns the sum of the two operands. */',
        'export function add(a: number, b: number): number {',
        '  // validate inputs before adding them to prevent NaN propagation',
        '  if (typeof a !== "number" || typeof b !== "number") throw new Error("invalid");',
        '  return a + b;',
        '}',
        '',
        '/** Multiplies two numbers and returns the product of the two operands. */',
        'export function multiply(a: number, b: number): number {',
        '  // validate inputs before multiplying them to prevent NaN propagation',
        '  if (typeof a !== "number" || typeof b !== "number") throw new Error("invalid");',
        '  return a * b;',
        '}',
      ].join('\n');

      const functions: MethodInfo[] = [
        { name: 'add', startLine: 4, endLine: 9, parameters: ['a', 'b'], isPublic: true },
        { name: 'multiply', startLine: 11, endLine: 16, parameters: ['a', 'b'], isPublic: true },
      ];

      const analysis = makeAnalysis({ functions, rawContent: content });
      const chunks = service.chunkFile(analysis, 'repo-1');
      const codeChunks = chunks.filter((c) => c.metadata.type === 'code');

      expect(codeChunks.length).toBe(2);
      expect((codeChunks[0].metadata as any).functionName).toBe('add');
      expect((codeChunks[1].metadata as any).functionName).toBe('multiply');
    });
  });

  // ── sliding window fallback ────────────────────────────────────────────────

  describe('sliding window fallback (no classes or functions)', () => {
    it('produces chunks for unstructured content', () => {
      const lines = Array.from({ length: 250 }, (_, i) => `line ${i + 1} of content`);
      const content = lines.join('\n');
      const analysis = makeAnalysis({ rawContent: content });

      const chunks = service.chunkFile(analysis, 'repo-1');
      // With 250 lines and windowSize=100, overlap=20 → windows at 0, 80, 160, 240
      expect(chunks.length).toBeGreaterThanOrEqual(3);
      chunks.forEach((c) => expect(c.metadata.type).toBe('code'));
    });

    it('does not produce empty chunks', () => {
      const content = 'single line of code';
      const analysis = makeAnalysis({ rawContent: content });
      const chunks = service.chunkFile(analysis, 'repo-1');
      chunks.forEach((c) => expect(c.content.trim().length).toBeGreaterThan(0));
    });
  });

  // ── business rule chunks ───────────────────────────────────────────────────

  describe('business rule chunks', () => {
    it('emits a business_rule chunk for each rule', () => {
      const content = [
        'class OrderService {',
        '  validateMinimumOrder(amount: number): void {',
        '    if (amount < 10) throw new Error("too low");',
        '  }',
        '}',
      ].join('\n');

      const analysis = makeAnalysis({
        classes: [
          {
            name: 'OrderService',
            startLine: 1,
            endLine: 5,
            methods: [{ name: 'validateMinimumOrder', startLine: 2, endLine: 4, parameters: ['amount'], isPublic: true }],
            fields: [],
          },
        ],
        businessRules: [
          {
            name: 'OrderService::validateMinimumOrder',
            description: 'Validates minimum order amount',
            startLine: 2,
            endLine: 4,
            category: 'validation',
          },
        ],
        rawContent: content,
      });

      const chunks = service.chunkFile(analysis, 'repo-1');
      const ruleChunks = chunks.filter((c) => c.metadata.type === 'business_rule');

      expect(ruleChunks.length).toBe(1);
      expect(ruleChunks[0].content).toContain('// Business Rule: OrderService::validateMinimumOrder');
      expect(ruleChunks[0].content).toContain('// Category: validation');
      expect((ruleChunks[0].metadata as any).ruleName).toBe('OrderService::validateMinimumOrder');
      expect((ruleChunks[0].metadata as any).ruleCategory).toBe('validation');
    });
  });

  // ── dependency chunks ──────────────────────────────────────────────────────

  describe('dependency chunks', () => {
    it('emits a dependency chunk when imports are present', () => {
      // Dependency chunk content is ~120 chars for 2 imports; need > 200 chars → use many imports
      const analysis = makeAnalysis({
        imports: [
          { source: '@nestjs/common', specifiers: ['Injectable'] },
          { source: '@nestjs/common', specifiers: ['Module'] },
          { source: './user.repository', specifiers: ['UserRepository'] },
          { source: './auth.service', specifiers: ['AuthService'] },
          { source: './email.service', specifiers: ['EmailService'] },
          { source: './logger.service', specifiers: ['LoggerService'] },
          { source: './config.service', specifiers: ['ConfigService'] },
        ],
        exports: ['UserService', 'UserModule', 'UserController'],
        rawContent: "import { Injectable } from '@nestjs/common';\n",
      });

      const chunks = service.chunkFile(analysis, 'repo-1');
      const depChunks = chunks.filter((c) => c.metadata.type === 'dependency');

      expect(depChunks.length).toBe(1);
      expect(depChunks[0].content).toContain('@nestjs/common');
      expect(depChunks[0].content).toContain('./user.repository');
      expect(depChunks[0].content).toContain('UserService');
      expect((depChunks[0].metadata as any).imports).toContain('@nestjs/common');
      expect((depChunks[0].metadata as any).exports).toContain('UserService');
    });

    it('does NOT emit a dependency chunk when there are no imports', () => {
      const analysis = makeAnalysis({ rawContent: 'const x = 1;' });
      const chunks = service.chunkFile(analysis, 'repo-1');
      const depChunks = chunks.filter((c) => c.metadata.type === 'dependency');
      expect(depChunks.length).toBe(0);
    });
  });

  // ── MIN_CHUNK_TOKENS filter ────────────────────────────────────────────────

  describe('MIN_CHUNK_TOKENS filter', () => {
    it('discards chunks below the minimum token threshold', () => {
      // Very short content that would produce a tiny chunk
      const analysis = makeAnalysis({ rawContent: 'x' }); // 1 char ≈ 0.25 tokens → filtered
      const chunks = service.chunkFile(analysis, 'repo-1');
      // Sliding window produces 1 chunk, but it's < 50 tokens → should be filtered
      expect(chunks.length).toBe(0);
    });
  });

  // ── metadata correctness ───────────────────────────────────────────────────

  describe('metadata correctness', () => {
    it('sets filePath and language on every chunk', () => {
      const analysis = makeAnalysis({
        classes: [SMALL_CLASS],
        rawContent: SMALL_CLASS_CONTENT,
        filePath: 'src/user/user.service.ts',
        language: LanguageType.TypeScript,
      });
      const chunks = service.chunkFile(analysis, 'repo-x');
      chunks.forEach((c) => {
        expect(c.metadata.filePath).toBe('src/user/user.service.ts');
        expect(c.metadata.language).toBe(LanguageType.TypeScript);
      });
    });

    it('sets startLine and endLine on code chunks', () => {
      const analysis = makeAnalysis({
        classes: [SMALL_CLASS],
        rawContent: SMALL_CLASS_CONTENT,
      });
      const chunks = service.chunkFile(analysis, 'repo-1');
      const codeChunks = chunks.filter((c) => c.metadata.type === 'code');
      codeChunks.forEach((c) => {
        expect(typeof c.metadata.startLine).toBe('number');
        expect(typeof c.metadata.endLine).toBe('number');
        expect(c.metadata.startLine!).toBeGreaterThan(0);
        expect(c.metadata.endLine!).toBeGreaterThanOrEqual(c.metadata.startLine!);
      });
    });
  });
});
