import { LanguageParserFactory } from './language-parser.factory';
import { ILanguageParser } from '../../domain/ports/language-parser.port';
import { LanguageType } from '../../domain/value-objects/language-type.vo';
import { FileAnalysis } from '../../domain/entities/file-analysis.entity';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockParser(supportedLanguage: LanguageType): jest.Mocked<ILanguageParser> {
  return {
    supportsLanguage: jest.fn((lang: LanguageType) => lang === supportedLanguage),
    parseFile: jest.fn().mockResolvedValue(
      new FileAnalysis('mock.ts', supportedLanguage, [], [], [], [], [], [], ''),
    ),
  };
}

function makeFallback(): jest.Mocked<any> {
  return {
    supportsLanguage: jest.fn((_lang: LanguageType) => true), // fallback handles everything
    parseFile: jest.fn().mockResolvedValue(
      new FileAnalysis('generic.cbl', LanguageType.Generic, [], [], [], [], [], [], ''),
    ),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LanguageParserFactory', () => {
  let tsParser: jest.Mocked<ILanguageParser>;
  let javaParser: jest.Mocked<ILanguageParser>;
  let phpParser: jest.Mocked<ILanguageParser>;
  let fallback: jest.Mocked<any>;
  let factory: LanguageParserFactory;

  beforeEach(() => {
    tsParser = makeMockParser(LanguageType.TypeScript);
    javaParser = makeMockParser(LanguageType.Java);
    phpParser = makeMockParser(LanguageType.PHP);
    fallback = makeFallback();

    factory = new LanguageParserFactory(
      [tsParser, javaParser, phpParser],
      fallback,
    );
  });

  // ── getParser — known languages ───────────────────────────────────────────

  it('returns the TypeScript parser for TypeScript language', () => {
    const parser = factory.getParser(LanguageType.TypeScript);
    expect(parser).toBe(tsParser);
  });

  it('returns the Java parser for Java language', () => {
    const parser = factory.getParser(LanguageType.Java);
    expect(parser).toBe(javaParser);
  });

  it('returns the PHP parser for PHP language', () => {
    const parser = factory.getParser(LanguageType.PHP);
    expect(parser).toBe(phpParser);
  });

  // ── getParser — fallback ─────────────────────────────────────────────────

  it('falls back to GenericLlmParserStrategy for an unsupported language (Python)', () => {
    // None of [tsParser, javaParser, phpParser] supports Python
    const parser = factory.getParser(LanguageType.Python);
    expect(parser).toBe(fallback);
  });

  it('falls back for COBOL', () => {
    const parser = factory.getParser(LanguageType.COBOL);
    expect(parser).toBe(fallback);
  });

  it('falls back for Generic language type', () => {
    const parser = factory.getParser(LanguageType.Generic);
    expect(parser).toBe(fallback);
  });

  // ── priority order ────────────────────────────────────────────────────────

  it('returns the first matching parser when multiple claim support', () => {
    const universalParser: jest.Mocked<ILanguageParser> = {
      supportsLanguage: jest.fn((_lang: LanguageType) => true),
      parseFile: jest.fn(),
    };
    const secondParser: jest.Mocked<ILanguageParser> = {
      supportsLanguage: jest.fn((_lang: LanguageType) => true),
      parseFile: jest.fn(),
    };
    const priorityFactory = new LanguageParserFactory(
      [universalParser, secondParser],
      fallback,
    );

    const result = priorityFactory.getParser(LanguageType.TypeScript);
    expect(result).toBe(universalParser);
    expect(secondParser.supportsLanguage).not.toHaveBeenCalled();
  });

  // ── supportsLanguage delegation ───────────────────────────────────────────

  it('calls supportsLanguage on each parser until a match is found', () => {
    factory.getParser(LanguageType.PHP);

    // tsParser and javaParser should have been consulted before phpParser matched
    expect(tsParser.supportsLanguage).toHaveBeenCalledWith(LanguageType.PHP);
    expect(javaParser.supportsLanguage).toHaveBeenCalledWith(LanguageType.PHP);
    expect(phpParser.supportsLanguage).toHaveBeenCalledWith(LanguageType.PHP);
  });

  it('does not call supportsLanguage on parsers after the first match', () => {
    factory.getParser(LanguageType.TypeScript);

    expect(tsParser.supportsLanguage).toHaveBeenCalledWith(LanguageType.TypeScript);
    // javaParser and phpParser should NOT have been called because tsParser matched first
    expect(javaParser.supportsLanguage).not.toHaveBeenCalled();
    expect(phpParser.supportsLanguage).not.toHaveBeenCalled();
  });

  // ── return value is usable ────────────────────────────────────────────────

  it('the returned parser can parse a file without throwing', async () => {
    const parser = factory.getParser(LanguageType.Java);
    await expect(parser.parseFile('class Foo {}', 'Foo.java')).resolves.toBeDefined();
  });

  it('the fallback parser can parse a file without throwing', async () => {
    const parser = factory.getParser(LanguageType.COBOL);
    await expect(parser.parseFile('IDENTIFICATION DIVISION.', 'main.cbl')).resolves.toBeDefined();
  });
});
