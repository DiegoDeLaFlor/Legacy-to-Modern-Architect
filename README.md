# Legacy-to-Modern Architect

An AI agent system that performs reverse engineering of legacy repositories and migrates them to **Clean Architecture** in **Nest.js + Angular**, powered by LangGraph and RAG.

---

## What it does

Point it at any legacy codebase (Java, PHP, Python, TypeScript, COBOL, etc.) and it will:

1. **Analyze** the repository — extract classes, functions, business rules, data models, and dependency graphs
2. **Index** the entire codebase into a vector store for semantic search (RAG)
3. **Plan** the target architecture — map legacy modules to Nest.js bounded contexts and Angular features
4. **Generate** production-ready Clean Architecture code module by module
5. **Review** the output — validate structure, pattern compliance, and business logic coverage; retry automatically on failures
6. **Output** a complete Nest.js + Angular project with a migration quality report

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript 5 |
| Framework | Nest.js 10 |
| Agent Orchestration | LangGraph.js |
| LLM | OpenAI GPT-4o |
| Embeddings | OpenAI text-embedding-3-small |
| Vector Store | PostgreSQL + pgvector |
| AST Parsing | @typescript-eslint/typescript-estree |
| CLI | Commander.js |

---

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL + pgvector)
- OpenAI API key

---

## Setup

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

**3. Start the database**
```bash
docker compose up -d
```

---

## Usage

### As CLI

Migrate a local repository:
```bash
npx ts-node src/main.ts migrate ./path/to/legacy-repo --output ./output
```

Migrate from a Git URL:
```bash
npx ts-node src/main.ts migrate https://github.com/user/legacy-repo --output ./output
```

Options:
```
--output <dir>     Output directory (default: ./output)
--retries <n>      Max review/retry cycles (default: 3)
--no-progress      Disable progress output
```

### As REST API

Start the server:
```bash
npm run start:dev
```

Start a migration:
```bash
curl -X POST http://localhost:3000/api/migrations \
  -H "Content-Type: application/json" \
  -d '{ "repoSource": "./path/to/legacy-repo" }'
```

Poll status:
```bash
curl http://localhost:3000/api/migrations/<migrationId>
```

Health check:
```bash
curl http://localhost:3000/health
```

---

## Output

The tool generates a complete Nest.js project under the output directory:

```
output/
├── src/
│   ├── domain/           # Entities, ports, value objects per module
│   ├── application/      # Use cases per module
│   ├── infrastructure/   # Repository adapters per module
│   └── interfaces/       # Controllers and DTOs per module
├── angular/              # Angular feature modules
└── MIGRATION_REPORT.md   # Quality report with findings
```

---

## Supported Source Languages

| Language | Parser |
|----------|--------|
| TypeScript / JavaScript | AST (typescript-estree) |
| Java | LLM-assisted |
| PHP | LLM-assisted |
| Python | LLM-assisted |
| COBOL | LLM-assisted |
| Any other | Generic LLM fallback |

---

## Development

```bash
# Build
npm run build

# Type check
npx tsc --noEmit

# Lint (ESLint with Clean Architecture boundary rules)
npm run lint

# Tests
npm run test

# Watch mode
npm run start:dev
```

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design, pipeline stages, RAG strategy, and agent architecture.

---

## Author

Diego De La Flor — AI Developer Senior Portfolio Project
