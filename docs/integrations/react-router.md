# React Router v7

- [Overview](#overview)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Bootstrap](#bootstrap)
- [Loaders](#loaders)
- [Actions](#actions)
- [JSON API Routes](#json-api-routes)
- [Important Constraints](#important-constraints)

---

## Overview

React Router v7 in Framework Mode runs loaders and actions on the server, making full database access possible. Orion integrates by importing `database.ts` in `app/root.tsx` — from that point on every loader and action in the app has the connection ready.

---

## Installation

```bash
npm install react-router @react-router/node @react-router/serve
npm install -D @react-router/dev typescript ts-node
```

---

## Project Structure

```
app/
  database.ts               ← Orion bootstrap
  root.tsx                  ← imports database.ts
  routes/
    users.tsx               ← loader + action + component
    users.$id.tsx
  database/
    models/
      User.ts
    migrations/
react-router.config.ts
```

---

## Bootstrap

```ts
// app/database.ts
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
  migrations: { path: './app/database/migrations' },
  preventLazyLoading: process.env.NODE_ENV !== 'production',
});
```

Import in `root.tsx` before anything else — loaders run after the root loader, so the connection is always established first:

```tsx
// app/root.tsx
import './database';           // ← bootstraps Orion
import { Outlet } from 'react-router';
import type { LoaderFunction } from 'react-router';

export const loader: LoaderFunction = async () => null;

export default function Root() {
  return <Outlet />;
}
```

---

## Loaders

Loaders run on the server and can query Orion models directly. Return plain objects — use `.toArray()` before returning so the data is serializable:

```tsx
// app/routes/users.tsx
import { useLoaderData } from 'react-router';
import type { LoaderFunction } from 'react-router';
import { User } from '../database/models/User';

export const loader: LoaderFunction = async ({ request }) => {
  const url    = new URL(request.url);
  const page    = Number(url.searchParams.get('page')    ?? 1);
  const perPage = Number(url.searchParams.get('perPage') ?? 15);

  const result = await User.paginate(page, perPage);
  return result;
};

export default function UsersPage() {
  const { data, meta } = useLoaderData<typeof loader>();

  return (
    <div>
      <ul>
        {data.map((user) => (
          <li key={user.id}>{user.name} — {user.email}</li>
        ))}
      </ul>
      <p>Page {meta.currentPage} of {meta.lastPage}</p>
    </div>
  );
}
```

---

## Actions

Actions handle form submissions and mutations. Return a redirect or data response:

```tsx
// app/routes/users.tsx (add to the same file as the loader)
import { redirect } from 'react-router';
import type { ActionFunction } from 'react-router';
import { User } from '../database/models/User';

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const intent   = formData.get('intent') as string;

  if (intent === 'create') {
    await User.create({
      name:  formData.get('name') as string,
      email: formData.get('email') as string,
    });
    return redirect('/users');
  }

  if (intent === 'delete') {
    const user = await User.findOrFail(formData.get('id') as string);
    await user.delete();
    return redirect('/users');
  }

  return { error: 'Unknown intent' };
};
```

Form in the component:

```tsx
import { Form } from 'react-router';

function NewUserForm() {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="create" />
      <input name="name"  placeholder="Name"  required />
      <input name="email" placeholder="Email" type="email" required />
      <button type="submit">Create</button>
    </Form>
  );
}
```

---

## JSON API Routes

For API-only routes that return JSON (without a UI component), use resource routes:

```ts
// app/routes/api.users.$id.ts
import { json, redirect } from 'react-router';
import type { LoaderFunction, ActionFunction } from 'react-router';
import { ModelNotFoundException } from '@wrsouza/orion';
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
  const user = await User.findOrFail(params.id!);

  if (request.method === 'PUT') {
    const body = await request.json();
    await user.update(body);
    return json(user);
  }

  if (request.method === 'DELETE') {
    await user.delete();
    return new Response(null, { status: 204 });
  }

  throw new Response('Method not allowed', { status: 405 });
};
```

---

## Important Constraints

::: warning Server-only
Loaders and actions run on the server. Never import `database.ts` in a client-side module (any file used in the browser bundle). React Router separates server and client code automatically based on the file boundaries.
:::

::: tip Returning model instances from loaders
When returning Orion models or collections from a loader, React Router serializes them with `JSON.stringify` for the client hydration payload. Because Orion implements `toJSON()`, this works automatically — no manual `.toArray()` call needed on the return value.
:::
