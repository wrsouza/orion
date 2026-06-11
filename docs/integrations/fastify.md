# Fastify

- [Overview](#overview)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Bootstrap](#bootstrap)
- [Routes](#routes)
- [Error Handling](#error-handling)
- [Schema Validation](#schema-validation)

---

## Overview

Fastify is a fast, low-overhead Node.js framework with a built-in JSON schema validation system. Because Fastify calls `JSON.stringify` internally, Orion models serialize automatically when returned from route handlers.

---

## Installation

```bash
npm install fastify
npm install -D ts-node typescript
```

---

## Project Structure

```
src/
  database.ts               ← Orion bootstrap
  server.ts                 ← Fastify entry point
  routes/
    users.ts
  plugins/
    error-handler.ts
  database/
    models/
      User.ts
    migrations/
```

---

## Bootstrap

```ts
// src/database.ts
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL ?? {
    driver:   'postgres',
    host:     process.env.DB_HOST ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
    ssl:      process.env.DB_SSL === 'true',
  },
  migrations: { path: './src/database/migrations' },
  preventLazyLoading: process.env.NODE_ENV !== 'production',
});
```

```ts
// src/server.ts
import './database';           // ← bootstraps Orion before any plugin or route
import Fastify from 'fastify';
import { userRoutes } from './routes/users';

const app = Fastify({ logger: true });

app.register(userRoutes, { prefix: '/users' });

app.listen({ port: Number(process.env.PORT ?? 3000) }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
```

---

## Routes

Fastify uses a plugin-based route registration. Each file exports a plugin function:

```ts
// src/routes/users.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ModelNotFoundException } from '@wrsouza/orion';
import { User } from '../database/models/User';

export async function userRoutes(app: FastifyInstance) {

  // GET /users?page=1&perPage=15
  app.get('/', async (request: FastifyRequest<{ Querystring: { page?: number; perPage?: number } }>) => {
    const { page = 1, perPage = 15 } = request.query;
    return User.paginate(perPage, page);
  });

  // GET /users/:id
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = await User.find(request.params.id);
    if (!user) return reply.status(404).send({ error: 'Not found' });
    return user;
  });

  // POST /users
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name:  { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const user = await User.create(request.body as object);
    return reply.status(201).send(user);
  });

  // PUT /users/:id
  app.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = await User.findOrFail(request.params.id);
    await user.update(request.body as object);
    return user;
  });

  // DELETE /users/:id
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = await User.findOrFail(request.params.id);
    await user.delete();
    return reply.status(204).send();
  });
}
```

---

## Error Handling

Register a global error handler in `server.ts` to map Orion exceptions to HTTP responses. See [Error Handling](/error-handling) for full details on each exception.

```ts
// src/server.ts (add after app creation)
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

## Schema Validation

Fastify validates request bodies against JSON Schema before the handler runs. The schema is declared inline on each route (shown in the POST example above) or extracted for reuse:

```ts
const UserBodySchema = {
  type: 'object',
  required: ['name', 'email', 'password'],
  properties: {
    name:     { type: 'string', minLength: 1 },
    email:    { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
  },
} as const;

app.post('/', { schema: { body: UserBodySchema } }, async (request, reply) => {
  const user = await User.create(request.body as object);
  return reply.status(201).send(user);
});
```

Fastify returns a `400` automatically when validation fails — no try/catch needed for input errors.
