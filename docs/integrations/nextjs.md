# Next.js

- [Overview](#overview)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Bootstrap](#bootstrap)
- [Route Handlers (App Router)](#route-handlers-app-router)
- [Server Actions](#server-actions)
- [API Routes (Pages Router)](#api-routes-pages-router)
- [Important Constraints](#important-constraints)

---

## Overview

Next.js runs server-side code (Route Handlers, Server Components, Server Actions) in a Node.js runtime where Orion works normally. The only requirement is ensuring `database.ts` is imported before any model is accessed — typically done once in the root layout.

---

## Installation

```bash
npm install next react react-dom
npm install -D typescript @types/react @types/node ts-node
```

---

## Project Structure

```
src/
  database.ts               ← Orion bootstrap
  app/
    layout.tsx              ← imports database.ts (App Router)
    api/
      users/
        route.ts
        [id]/
          route.ts
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
});
```

Import in the root layout so every server render has the connection ready:

```tsx
// src/app/layout.tsx
import '@/database';           // ← bootstraps Orion on every server render
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

---

## Route Handlers (App Router)

::: code-group

```ts [app/api/users/route.ts]
import { NextResponse } from 'next/server';
import { User } from '@/database/models/User';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page    = Number(searchParams.get('page')    ?? 1);
  const perPage = Number(searchParams.get('perPage') ?? 15);

  const users = await User.paginate(page, perPage);
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const body = await request.json();
  const user = await User.create(body);
  return NextResponse.json(user, { status: 201 });
}
```

```ts [app/api/users/[id]/route.ts]
import { NextResponse } from 'next/server';
import { ModelNotFoundException } from '@wrsouza/orion';
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

:::

---

## Server Actions

Server Actions run on the server and can use Orion directly:

```ts
// src/app/actions/users.ts
'use server';

import { revalidatePath } from 'next/cache';
import { User } from '@/database/models/User';

export async function createUser(formData: FormData) {
  await User.create({
    name:  formData.get('name') as string,
    email: formData.get('email') as string,
  });
  revalidatePath('/users');
}

export async function deleteUser(id: string) {
  const user = await User.findOrFail(id);
  await user.delete();
  revalidatePath('/users');
}
```

Use in a Server Component or Client Component:

```tsx
// src/app/users/page.tsx (Server Component)
import { User } from '@/database/models/User';
import { deleteUser } from '../actions/users';

export default async function UsersPage() {
  const users = await User.orderBy('name').get();

  return (
    <ul>
      {users.toArray().map((u) => (
        <li key={u.id}>
          {u.name}
          <form action={deleteUser.bind(null, u.id)}>
            <button type="submit">Delete</button>
          </form>
        </li>
      ))}
    </ul>
  );
}
```

---

## API Routes (Pages Router)

If using the Pages Router (`pages/api`), import `database.ts` at the top of each handler file:

```ts
// pages/api/users/index.ts
import '@/database';           // ← required per handler file in Pages Router
import type { NextApiRequest, NextApiResponse } from 'next';
import { User } from '@/database/models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.json(await User.all());
  }

  if (req.method === 'POST') {
    const user = await User.create(req.body);
    return res.status(201).json(user);
  }

  res.status(405).end();
}
```

---

## Important Constraints

::: warning Server-only
Database access must only happen in:
- Server Components
- Route Handlers (`app/api`)
- Server Actions (`'use server'`)
- Pages Router API routes (`pages/api`)

Never import `database.ts` in Client Components (`'use client'`). The Node.js runtime is not available in the browser bundle.
:::

::: tip Connection pooling in development
Next.js hot-reloads modules in development, which can create multiple pool instances. This is expected and harmless — Orion re-uses the same connection object across reloads.
:::
