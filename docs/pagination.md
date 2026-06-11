# Pagination

- [Introduction](#introduction)
- [paginate()](#paginate)
- [simplePaginate()](#simplepaginate)
- [Chunking Results](#chunking-results)
- [Cursors and Lazy Iteration](#cursors-and-lazy-iteration)

---

## Introduction

Orion provides two pagination strategies and several large-result-set helpers. Choose the right one based on your needs:

| Method | Queries | Returns total count | Use when |
|--------|---------|-------------------|----------|
| `paginate()` | 2 (count + data) | Yes | You need page count, total, "page X of Y" |
| `simplePaginate()` | 1 | No | You only need next/previous, no total count |
| `chunk()` | N (one per chunk) | No | Background jobs, bulk processing |
| `cursor()` | Streaming | No | Memory-efficient row-by-row iteration |
| `lazy()` | N (batched) | No | Async iteration in batches |

---

## paginate()

`paginate(perPage, page?)` runs a `COUNT(*)` query followed by a `LIMIT/OFFSET` data query. It returns a `Paginator<T>` object.

Available as a **static method** directly on any model, or chained after any query builder expression:

```ts
// Static — paginate all rows
const page = await User.paginate(15);       // perPage=15, page=1 (default)
const page = await User.paginate(15, 3);    // perPage=15, page=3

// Query builder — paginate a filtered set
const page = await User.where('is_active', true)
  .orderBy('name')
  .paginate(15);

// With eager loading and ordering
const page = await User
  .with('profile')
  .whereHas('posts')
  .orderBy('created_at', 'desc')
  .paginate(20);

// Paginator<User> properties:
page.data         // ModelCollection<User> — models on this page
page.total        // 248 — total matching rows
page.perPage      // 15
page.currentPage  // 1 (default)
page.lastPage     // 17 (Math.ceil(248 / 15))
page.from         // 1 — first row index on this page
page.to           // 15 — last row index on this page
page.hasMorePages // true
```

Works with all query builder features:

```ts
const page = await User
  .with('profile')
  .whereHas('posts')
  .orderBy('created_at', 'desc')
  .paginate(20);
```

**Typical API response:**

```ts
app.get('/users', async (req, res) => {
  const perPage = parseInt(req.query.per_page ?? '15');
  const page    = parseInt(req.query.page ?? '1');

  const result = await User.where('is_active', true)
    .orderBy('name')
    .paginate(perPage, page);

  res.json({
    data: result.data.toArray(),
    meta: {
      total:        result.total,
      per_page:     result.perPage,
      current_page: result.currentPage,
      last_page:    result.lastPage,
      from:         result.from,
      to:           result.to,
    },
    links: {
      next: result.hasMorePages
        ? `/users?page=${result.currentPage + 1}&per_page=${result.perPage}`
        : null,
      prev: result.currentPage > 1
        ? `/users?page=${result.currentPage - 1}&per_page=${result.perPage}`
        : null,
    },
  });
});
```

---

## simplePaginate()

`simplePaginate(perPage, page?)` runs a single query with `LIMIT perPage + 1`. It checks whether there's a next page by seeing if more rows were returned than requested. It does **not** count total rows.

Available as a **static method** or chained on the query builder:

```ts
// Static — simplePaginate all rows
const page = await User.simplePaginate(20);     // perPage=20, page=1
const page = await User.simplePaginate(20, 2);  // perPage=20, page=2

// Query builder
const page = await User.where('is_active', true).simplePaginate(15);

// SimplePaginator<User> properties:
page.data         // ModelCollection<User>
page.perPage      // 15
page.currentPage  // 1
page.hasMorePages // true or false
```

Use `simplePaginate` when:
- You display "Load more" or "Next →" buttons instead of numbered pages
- The table is very large and `COUNT(*)` would be slow
- You only need to know if there's a next page, not the total

```ts
app.get('/feed', async (req, res) => {
  const cursor = parseInt(req.query.page ?? '1');
  const page   = await Post.latest().simplePaginate(20, cursor);

  res.json({
    data:      page.data.toArray(),
    next_page: page.hasMorePages ? cursor + 1 : null,
  });
});
```

---

## Chunking Results

Process large result sets in batches without loading everything into memory at once.

### chunk()

Executes a query for each chunk and passes the `ModelCollection` to your callback. If the callback returns `false`, processing stops.

Available as a **static method** or chained on the query builder:

```ts
// Static — chunk all rows
await User.chunk(200, async (users) => {
  for (const user of users) {
    await sendNewsletter(user.email);
  }
});

// Query builder — chunk a filtered set
await User.where('is_active', true).chunk(200, async (users) => {
  for (const user of users) {
    await sendNewsletter(user.email);
  }
});

// Stop early
await User.chunk(100, async (users) => {
  if (shouldStop) return false;
  await process(users);
});
```

### chunkById()

Like `chunk()`, but uses `WHERE id > lastId` instead of `OFFSET` for stable results under concurrent inserts:

```ts
await User.chunkById(500, async (users) => {
  await bulkExport(users);
});

// Custom PK column
await Order.chunkById(200, async (orders) => {
  await reindex(orders);
}, 'order_id');
```

---

## Cursors and Lazy Iteration

### cursor()

An async generator that yields one model at a time. Ideal for row-by-row processing with minimal memory usage.

Available as a **static method** or chained on the query builder:

```ts
// Static — iterate all rows
for await (const user of User.cursor()) {
  await sendEmail(user);
}

// Query builder — iterate a filtered set
for await (const user of User.where('country', 'BR').cursor()) {
  await sendLocalizedEmail(user);
}
```

### lazy()

Yields models in batches but presents them one at a time to your code. Uses fewer connections than `cursor()` on some drivers.

Available as a **static method** or chained on the query builder:

```ts
// Static — iterate all rows in batches of 1000 (default)
for await (const user of User.lazy()) {
  await process(user);
}

// Static with custom batch size
for await (const user of User.lazy(500)) {
  await process(user);
}

// Query builder
for await (const user of User.where('is_active', true).lazy(100)) {
  await process(user);
}
```

### lazyById()

Same as `lazy()` but uses `WHERE id > lastId` for stability:

```ts
for await (const user of User.lazyById(500)) {
  await archiveUser(user);
}

// Custom column
for await (const order of Order.lazyById(200, 'order_id')) {
  await processOrder(order);
}
```
