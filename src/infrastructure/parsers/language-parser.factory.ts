import { Injectable, Inject } from '@nestjs/common';
import { ILanguageParser, LANGUAGE_PARSER_TOKEN } from '../../domain/ports/language-parser.port';
import { LanguageType } from '../../domain/value-objects/language-type.vo';
import { GenericLlmParserStrategy } from './generic/generic-llm-parser.strategy';

/**
 * Factory that selects the appropriate ILanguageParser strategy.
 * Iterates registered parsers in priority order; falls back to GenericLlmParserStrategy.
 */
@Injectable()
export class LanguageParserFactory {
  constructor(
    @Inject(LANGUAGE_PARSER_TOKEN) private readonly parsers: ILanguageParser[],
    private readonly fallback: GenericLlmParserStrategy,
  ) {}

  getParser(language: LanguageType): ILanguageParser {
    const parser = this.parsers.find((p) => p.supportsLanguage(language));
    return parser ?? this.fallback;
  }
}
