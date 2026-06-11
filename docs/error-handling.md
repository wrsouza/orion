# Error Handling

- [Overview](#overview)
- [ModelNotFoundException](#modelnotfoundexception)
- [MassAssignmentException](#massassignmentexception)
- [QueryException](#queryexception)
- [Framework Integration](#framework-integration)
  - [Express](#express)
  - [Fastify](#fastify)
  - [NestJS](#nestjs)
  - [Next.js](#nextjs)
  - [React Router](#react-router)

---

## Overview

Orion exports three typed exception classes. Each extends `Error` and carries a `.name` property so you can catch them precisely in `instanceof` checks or framework error filters.

| Class | Thrown by | Catch for |
|---|---|---|
| `ModelNotFoundException` | `findOrFail()`, `firstOrFail()` | 404 Not Found responses |
| `MassAssignmentException` | `fill()`, `create()`, `update()` when a non-fillable key is assigned | 422 / developer guard |
| `QueryException` | any database query failure (unique violation, FK constraint, etc.) | 409 / 500 database errors |

```ts
import {
  ModelNotFoundException,
  MassAssignmentException,
  QueryException,
} from '@wrsouza/orion';
```

---

## ModelNotFoundException

Thrown by `findOrFail()` and `firstOrFail()` when no record matches. It carries the model name and, for `findOrFail`, the key that was looked up.

```ts
import { ModelNotFoundException } from '@wrsouza/orion';
import { User } from './database/models/User';

// findOrFail — throws if no row with that PK exists
try {
  const user = await User.findOrFail(99);
} catch (e) {
  if (e instanceof ModelNotFoundException) {
    console.log(e.message);
    // [orion] No query results for model [User] with key 99.
  }
}

// firstOrFail — throws if the WHERE clause returns no rows
try {
  const user = await User.where('email', 'unknown@example.com').firstOrFail();
} catch (e) {
  if (e instanceof ModelNotFoundException) {
    console.log(e.message);
    // [orion] No query results for model [User].
  }
}
```

Use `find()` and `first()` (without `OrFail`) when you want `null` instead of an exception:

```ts
const user = await User.find(99);   // User | null
const user = await User.where('email', 'x@example.com').first(); // User | null
```

---

## MassAssignmentException

Thrown when `fill()`, `create()`, or `update()` receives an attribute that is not in the model's `fillable` list, **and** strict mass assignment is enabled.

Strict mode is opt-in. Enable it once at application startup:

```ts
import { Model } from '@wrsouza/orion';

// Enable globally — any non-fillable assignment throws MassAssignmentException
Model.preventSilentlyDiscardingAttributes();
```

### Example

```ts
import { MassAssignmentException } from '@wrsouza/orion';
import { Model, table, fillable } from '@wrsouza/orion';

@table('users')
@fillable(['name', 'email'])
class User extends Model {
  declare name: string;
  declare email: string;
  declare role: string; // NOT fillable
}

Model.preventSilentlyDiscardingAttributes();

try {
  await User.create({ name: 'Alice', email: 'a@b.com', role: 'admin' });
} catch (e) {
  if (e instanceof MassAssignmentException) {
    console.log(e.message);
    // [orion] Add [role] to fillable on [User] to allow mass assignment.
  }
}
```

### When to use strict mode

Enable it in **development and staging** to catch accidental over-posting early. In production most applications either:
- Use input validation (Zod, `class-validator`) to strip unknown fields before they reach the model, or
- Keep `@fillable` tightly scoped so unknown keys are silently ignored

The exception is most useful as an early-warning tool during development — not as a runtime security guard in production (use input validation for that).

---

## QueryException

Thrown by any query execution that fails at the database level: unique constraint violations, foreign key violations, syntax errors, connection drops, etc.

It exposes three properties for structured error handling:

| Property | Type | Description |
|---|---|---|
| `sql` | `string` | The SQL statement that failed |
| `bindings` | `unknown[]` | The bound parameter values |
| `cause` | `Error` | The original driver error |

```ts
import { QueryException } from '@wrsouza/orion';
import { User } from './database/models/User';

try {
  await User.create({ name: 'Alice', email: 'duplicate@example.com' });
} catch (e) {
  if (e instanceof QueryException) {
    console.log(e.message);
    // [orion] Query failed: duplicate key value violates unique constraint "users_email_key"
    console.log(e.sql);
    // INSERT INTO "users" ("name", "email") VALUES ($1, $2) RETURNING "id"
    console.log(e.bindings);
    // ['Alice', 'duplicate@example.com']
    console.log(e.cause.message);
    // duplicate key value violates unique constraint "users_email_key"
  }
}
```

### Detecting specific constraint violations

Driver error codes are exposed via `e.cause`. PostgreSQL error codes:

```ts
import { QueryException } from '@wrsouza/orion';

function isUniqueViolation(e: QueryException): boolean {
  // PostgreSQL: 23505 — MySQL/MariaDB: ER_DUP_ENTRY
  return (e.cause as any).code === '23505' || (e.cause as any).code === 'ER_DUP_ENTRY';
}

try {
  await User.create({ email: 'taken@example.com' });
} catch (e) {
  if (e instanceof QueryException && isUniqueViolation(e)) {
    // return 409 Conflict
  }
  throw e; // re-throw unexpected errors
}
```

---

## Framework Integration

### Express

Centralise all Orion exceptions in a single error-handling middleware:

```ts
// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import {
  ModelNotFoundException,
  MassAssignmentException,
  QueryException,
} from '@wrsouza/orion';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ModelNotFoundException) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (err instanceof MassAssignmentException) {
    return res.status(422).json({ error: err.message });
  }

  if (err instanceof QueryException) {
    const isUnique = (err.cause as any).code === '23505';
    if (isUnique) return res.status(409).json({ error: 'Already exists' });
    console.error('[db]', err.sql, err.cause.message);
    return res.status(500).json({ error: 'Database error' });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
```

Register it last in `server.ts`:

```ts
app.use(errorHandler);
```

---

### Fastify

```ts
// src/server.ts
import {
  ModelNotFoundException,
  MassAssignmentException,
  QueryException,
} from '@wrsouza/orion';

app.setErrorHandler((err, _request, reply) => {
  if (err instanceof ModelNotFoundException) {
    return reply.status(404).send({ error: 'Not found' });
  }

  if (err instanceof MassAssignmentException) {
    return reply.status(422).send({ error: err.message });
  }

  if (err instanceof QueryException) {
    const isUnique = (err.cause as any).code === '23505';
    if (isUnique) return reply.status(409).send({ error: 'Already exists' });
    app.log.error({ sql: err.sql, cause: err.cause.message });
    return reply.status(500).send({ error: 'Database error' });
  }

  app.log.error(err);
  reply.status(500).send({ error: 'Internal server error' });
});
```

---

### NestJS

Use an exception filter that catches all Orion exceptions at once and register it globally:

```ts
// src/filters/orion-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  ModelNotFoundException,
  MassAssignmentException,
  QueryException,
} from '@wrsouza/orion';
import { Response } from 'express';

@Catch(ModelNotFoundException, MassAssignmentException, QueryException)
export class OrionExceptionFilter implements ExceptionFilter {
  catch(
    exception: ModelNotFoundException | MassAssignmentException | QueryException,
    host: ArgumentsHost,
  ) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ModelNotFoundException) {
      return res.status(HttpStatus.NOT_FOUND).json({ error: 'Not found' });
    }

    if (exception instanceof MassAssignmentException) {
      return res
        .status(HttpStatus.UNPROCESSABLE_ENTITY)
        .json({ error: exception.message });
    }

    if (exception instanceof QueryException) {
      const isUnique = (exception.cause as any).code === '23505';
      if (isUnique) {
        return res.status(HttpStatus.CONFLICT).json({ error: 'Already exists' });
      }
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Database error' });
    }
  }
}
```

Register in `main.ts`:

```ts
app.useGlobalFilters(new OrionExceptionFilter());
```

---

### Next.js

Handle exceptions inside each Route Handler:

```ts
// app/api/users/route.ts
import { NextResponse } from 'next/server';
import {
  ModelNotFoundException,
  MassAssignmentException,
  QueryException,
} from '@wrsouza/orion';
import { User } from '@/database/models/User';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await User.create(body);
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    if (e instanceof MassAssignmentException) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    if (e instanceof QueryException) {
      const isUnique = (e.cause as any).code === '23505';
      if (isUnique) return NextResponse.json({ error: 'Already exists' }, { status: 409 });
    }
    throw e;
  }
}

export async function GET(_req: Request) {
  // No try/catch needed for reads that don't use findOrFail
  const users = await User.orderBy('name').get();
  return NextResponse.json(users);
}
```

```ts
// app/api/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { ModelNotFoundException, QueryException } from '@wrsouza/orion';
import { User } from '@/database/models/User';

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await User.findOrFail(params.id);
    return NextResponse.json(user);
  } catch (e) {
    if (e instanceof ModelNotFoundException)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    throw e;
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await User.findOrFail(params.id);
    await user.update(await request.json());
    return NextResponse.json(user);
  } catch (e) {
    if (e instanceof ModelNotFoundException)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (e instanceof QueryException) {
      const isUnique = (e.cause as any).code === '23505';
      if (isUnique) return NextResponse.json({ error: 'Already exists' }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await User.findOrFail(params.id);
    await user.delete();
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof ModelNotFoundException)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    throw e;
  }
}
```

---

### React Router

Handle in loaders and actions:

```ts
// app/routes/api.users.$id.ts
import { json } from 'react-router';
import type { LoaderFunction, ActionFunction } from 'react-router';
import {
  ModelNotFoundException,
  MassAssignmentException,
  QueryException,
} from '@wrsouza/orion';
import { User } from '../database/models/User';

export const loader: LoaderFunction = async ({ params }) => {
  try {
    const user = await User.findOrFail(params.id!);
    return json(user);
  } catch (e) {
    if (e instanceof ModelNotFoundException)
      throw new Response('Not found', { status: 404 });
    throw e;
  }
};

export const action: ActionFunction = async ({ request, params }) => {
  if (request.method === 'PUT') {
    try {
      const user = await User.findOrFail(params.id!);
      await user.update(await request.json());
      return json(user);
    } catch (e) {
      if (e instanceof ModelNotFoundException)
        throw new Response('Not found', { status: 404 });
      if (e instanceof QueryException) {
        const isUnique = (e.cause as any).code === '23505';
        if (isUnique) throw new Response('Already exists', { status: 409 });
      }
      if (e instanceof MassAssignmentException)
        throw new Response(e.message, { status: 422 });
      throw e;
    }
  }

  throw new Response('Method not allowed', { status: 405 });
};
```
