import { Module } from '@nestjs/common';
import { LANGUAGE_PARSER_TOKEN } from '../../domain/ports/language-parser.port';
import { TypeScriptParserStrategy } from './typescript/typescript-parser.strategy';
import { JavaParserStrategy } from './java/java-parser.strategy';
import { PhpParserStrategy } from './php/php-parser.strategy';
import { GenericLlmParserStrategy } from './generic/generic-llm-parser.strategy';
import { LanguageParserFactory } from './language-parser.factory';

// GenericLlmParserStrategy owns its own OpenAI client (gpt-4o-mini) — no LlmModule needed.
@Module({
  imports: [],
  providers: [
    TypeScriptParserStrategy,
    JavaParserStrategy,
    PhpParserStrategy,
    GenericLlmParserStrategy,
    {
      provide: LANGUAGE_PARSER_TOKEN,
      useFactory: (
        ts: TypeScriptParserStrategy,
        java: JavaParserStrategy,
        php: PhpParserStrategy,
      ) => [ts, java, php],
      inject: [TypeScriptParserStrategy, JavaParserStrategy, PhpParserStrategy],
    },
    LanguageParserFactory,
  ],
  exports: [LanguageParserFactory],
})
export class ParsersModule {}
