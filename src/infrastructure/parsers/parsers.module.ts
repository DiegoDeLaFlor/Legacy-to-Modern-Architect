import { Module } from '@nestjs/common';
import { LANGUAGE_PARSER_TOKEN } from '../../domain/ports/language-parser.port';
import { TypeScriptParserStrategy } from './typescript/typescript-parser.strategy';
import { GenericLlmParserStrategy } from './generic/generic-llm-parser.strategy';
import { LanguageParserFactory } from './language-parser.factory';

// GenericLlmParserStrategy now owns its own OpenAI client (gpt-4o-mini),
// so LlmModule is no longer required here.
@Module({
  imports: [],
  providers: [
    TypeScriptParserStrategy,
    GenericLlmParserStrategy,
    {
      provide: LANGUAGE_PARSER_TOKEN,
      useFactory: (tsParser: TypeScriptParserStrategy) => [tsParser],
      inject: [TypeScriptParserStrategy],
    },
    LanguageParserFactory,
  ],
  exports: [LanguageParserFactory],
})
export class ParsersModule {}
