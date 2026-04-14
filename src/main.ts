import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Command } from 'commander';
import { AppModule } from './app.module';
import { registerMigrateCommand } from './interfaces/cli/migrate.command';

const isCli = process.argv[2] === 'migrate' || process.argv[2] === 'analyze';

async function bootstrapApi() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.enableCors();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Legacy-to-Modern Architect API running on http://localhost:${port}`);
}

async function bootstrapCli() {
  const program = new Command();
  program
    .name('l2m')
    .description('Legacy-to-Modern Architect — AI-powered repository migration tool')
    .version('1.0.0');

  registerMigrateCommand(program);

  await program.parseAsync(process.argv);
}

if (isCli) {
  bootstrapCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  bootstrapApi().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
