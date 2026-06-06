# Contributing to orion

Thank you for your interest in contributing! This guide explains everything you need to get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Adding a New Database Driver](#adding-a-new-database-driver)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

---

## Code of Conduct

Be respectful. Critique code, not people. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9
- PostgreSQL >= 14 (for running integration tests)
- TypeScript knowledge (strict mode is enforced)

### Setup

```bash
# Fork the repo, then clone your fork
git clone https://github.com/<your-username>/orion.git
cd orion

# Install dependencies
npm install

# Verify the build passes
npm run build

# Verify types pass
npx tsc --noEmit
```

### Running Tests

> Integration tests require a running PostgreSQL instance.

```bash
# Copy the test environment template
cp .env.test.example .env.test

# Edit .env.test with your local Postgres credentials
# Then run tests
npm test
```

---

## Project Structure

```
src/
├── connection/          # Database adapters and connection manager
│   ├── Connection.ts        # Core interface (QueryResult, Connection)
│   ├── ConnectionManager.ts # Named connection registry
│   └── adapters/
│       └── PostgresAdapter.ts
│
├── schema/              # DDL layer — Blueprint, Schema facade, Grammars
│   ├── Blueprint.ts
│   ├── ColumnDefinition.ts
│   ├── ForeignKeyDefinition.ts
│   ├── IndexDefinition.ts
│   ├── Schema.ts
│   └── grammars/
│       ├── SchemaGrammar.ts         # Interface all grammars must implement
│       └── PostgresSchemaGrammar.ts
│
├── migrations/          # Migration runner and repository
│   ├── Migration.ts         # Abstract base class
│   ├── MigrationRepository.ts
│   └── Migrator.ts
│
├── cli/                 # Terminal interface
│   ├── index.ts             # Entry point (bin: orion)
│   ├── commands/
│   └── utils/
│
└── index.ts             # Public API barrel
```

**Key design principles:**
- Every layer depends only on the layer below it — CLI → Migrator → Schema → Connection.
- `SchemaGrammar` is an interface: adding a new driver means adding a new grammar class, nothing else changes upstream.
- The `Connection` interface is the only contract between the ORM and the database; adapters are plug-and-play.

---

## Development Workflow

### Branching

```
main          — stable, tagged releases
dev           — integration branch for next release
feature/<name>  — your feature branch (branch off dev)
fix/<name>      — bug fix branch (branch off dev)
```

Always branch from `dev`, not `main`.

```bash
git checkout dev
git pull origin dev
git checkout -b feature/mysql-driver
```

### Making Changes

1. Make your changes in `src/`.
2. Keep TypeScript strict — no `any` without a comment explaining why.
3. Run `npx tsc --noEmit` before committing. Zero errors are required.
4. Add or update tests for any changed behaviour.
5. Update `CHANGELOG.md` under `[Unreleased]`.

### Building

```bash
npm run build        # compile src/ → dist/
npm run build:watch  # watch mode
```

---

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `refactor` | Code change with no new feature or bug fix |
| `test` | Adding or updating tests |
| `chore` | Build, tooling, deps — no production code change |
| `perf` | Performance improvement |

**Scopes** (optional but encouraged): `connection`, `schema`, `migrations`, `cli`, `query`, `model`

**Examples:**

```
feat(schema): add JSONB support to Blueprint
fix(migrations): handle missing migration file gracefully
docs: update README with foreign key examples
chore(deps): upgrade pg to 8.12.0
```

---

## Pull Request Process

1. **Ensure CI passes** — type check and tests must be green.
2. **One concern per PR** — don't mix a bug fix with a refactor. Split them.
3. **Update the changelog** — add an entry under `[Unreleased]` in `CHANGELOG.md`.
4. **Write a clear description** — explain *why*, not just *what*. Link any related issues.
5. **Target the `dev` branch** — PRs to `main` are only for releases.

A maintainer will review within a few days. We may ask for changes; please don't take it personally — we want the codebase to stay consistent and well-tested.

---

## Adding a New Database Driver

orion is designed to make adding drivers straightforward. You need to provide two things:

### 1. A connection adapter

Create `src/connection/adapters/<Name>Adapter.ts` implementing the `Connection` interface:

```ts
import { Connection, QueryResult } from '../Connection';

export class MySQLAdapter implements Connection {
  async query(sql: string, bindings?: unknown[]): Promise<QueryResult> { ... }
  async transaction<T>(callback: (conn: Connection) => Promise<T>): Promise<T> { ... }
  async disconnect(): Promise<void> { ... }
  isConnected(): boolean { ... }
}
```

### 2. A schema grammar

Create `src/schema/grammars/<Name>SchemaGrammar.ts` implementing `SchemaGrammar`:

```ts
import { SchemaGrammar, CompiledSchema } from './SchemaGrammar';

export class MySQLSchemaGrammar implements SchemaGrammar {
  compileCreate(blueprint: Blueprint): CompiledSchema { ... }
  compileAlter(blueprint: Blueprint): CompiledSchema { ... }
  compileDrop(table: string): string { ... }
  compileDropIfExists(table: string): string { ... }
  compileTableExists(table: string, schema?: string): string { ... }
  compileColumnListing(table: string, schema?: string): string { ... }
}
```

Then:
- Register the new driver name in `ConnectionManager` (`DriverName` union type + `createAdapter` switch).
- Export both classes from `src/index.ts`.
- Add the new peer dependency to `package.json`.
- Open a PR and we'll get it merged!

---

## Reporting Bugs

Open an issue with:
- orion version
- Node.js version
- Database + version
- Minimal reproducible example (a few lines of code that trigger the bug)
- Expected vs actual behaviour

---

## Suggesting Features

Open an issue tagged `enhancement`. Describe the use case — not just the solution — so we can discuss the best API design together. Check the [Roadmap](./README.md#roadmap) first to see if it's already planned.
