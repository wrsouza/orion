# Express

- [Overview](#overview)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Bootstrap](#bootstrap)
- [Routes](#routes)
- [Error Handling](#error-handling)
- [Validation](#validation)

---

## Overview

Express is a minimal, unopinionated Node.js web framework. Orion integrates with a single import at the app's entry point — no plugins, no adapters.

---

## Installation

```bash
npm install express
npm install -D @types/express ts-node typescript
```

---

## Project Structure

```
src/
  database.ts               ← Orion bootstrap (single source of truth)
  server.ts                 ← Express app entry point
  routes/
    users.ts
    posts.ts
  database/
    models/
      User.ts
      Post.ts
    migrations/
```

---

## Bootstrap

Create `src/database.ts` once — the CLI and all routes share this file:

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

Import it at the very top of `src/server.ts` — before any route is registered:

```ts
// src/server.ts
import './database';           // ← must come first
import express from 'express';
import { userRouter } from './routes/users';
import { errorHandler } from './middleware/errorHandler';

const app = express();
app.use(express.json());

app.use('/users', userRouter);

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
```

---

## Routes

A complete CRUD router using Orion models:

```ts
// src/routes/users.ts
import { Router, Request, Response, NextFunction } from 'express';
import { User } from '../database/models/User';

export const userRouter = Router();

// GET /users?page=1&perPage=15
userRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, perPage = 15 } = req.query;
    const users = await User.paginate(Number(perPage), Number(page));
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// GET /users/:id
userRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOrFail(req.params.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /users
userRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// PUT /users/:id
userRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOrFail(req.params.id);
    await user.update(req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id
userRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOrFail(req.params.id);
    await user.delete();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
```

---

## Error Handling

Map Orion exceptions to HTTP responses in a central error handler. See [Error Handling](/error-handling) for full details on each exception.

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

---

## Validation

Orion does not include input validation — use a library like `zod` alongside:

```ts
import { z } from 'zod';

const CreateUserSchema = z.object({
  name:     z.string().min(1),
  email:    z.string().email(),
  password: z.string().min(8),
});

userRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = CreateUserSchema.parse(req.body);
    const user = await User.create(data);
    res.status(201).json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ errors: err.errors });
    }
    next(err);
  }
});
```
