# Pruning

- [Introduction](#introduction)
- [Prunable â€” Per-Row Deletion](#prunable--per-row-deletion)
- [MassPrunable â€” Bulk Deletion](#massprunable--bulk-deletion)
- [Running the Pruner](#running-the-pruner)
- [Scheduling Pruning](#scheduling-pruning)

---

## Introduction

Pruning removes records that are no longer needed â€” for example, activity logs older than 90 days or expired tokens. Orion provides two strategies:

| Mixin | Method | Events fired | `pruning()` hook | Use when |
|-------|--------|-------------|-----------------|----------|
| `Prunable` | Row-by-row `delete()` | Yes | Yes | You need events or per-row cleanup |
| `MassPrunable` | Single bulk `DELETE` | No | No | Maximum performance, no per-row logic |

---

## Prunable â€” Per-Row Deletion

Apply `Prunable` to a model and implement `prunable()` to define which records should be deleted:

```ts
import { Model, Prunable, table } from '@wrsouza/orion';

@table('activity_logs')
class ActivityLog extends Prunable(Model) {
  declare id: number;
  declare created_at: Date;

  // Define which records are pruneable
  prunable() {
    const cutoff = new Date(Date.now() - 90 * 86400_000); // 90 days ago
    return ActivityLog.where('created_at', '<', cutoff);
  }

  // Optional hook â€” called just before each row is deleted
  pruning(): void {
    // Perform any per-row cleanup here (e.g. delete related files from S3)
    console.log(`Pruning activity log ${this.id}`);
  }
}
```

The `pruning()` hook is called once per record, before `delete()`. If the model has `SoftDeletes`, `delete()` soft-deletes the row â€” use `forceDelete()` inside `pruning()` if you need a hard delete.

---

## MassPrunable â€” Bulk Deletion

Apply `MassPrunable` when you want a single `DELETE ... WHERE` with no per-row processing:

```ts
import { Model, MassPrunable, table } from '@wrsouza/orion';

@table('telemetry')
class Telemetry extends MassPrunable(Model) {
  prunable() {
    const cutoff = new Date(Date.now() - 30 * 86400_000); // 30 days
    return Telemetry.where('created_at', '<', cutoff);
  }
}
```

MassPrunable executes a single bulk `DELETE` â€” no model events fire and no `pruning()` hook is called. It is orders of magnitude faster than `Prunable` for large tables.

---

## Running the Pruner

### CLI

```bash
# Prune all registered Prunable/MassPrunable models
npx orion model:prune

# Prune a specific model
npx orion model:prune --model=ActivityLog

# Override the chunk size (default: 1000 rows per batch for Prunable)
npx orion model:prune --chunk=500
```

### Programmatic API

```ts
// Prunable â€” fires events, calls pruning() hook per row
await ActivityLog.pruneAll();
await ActivityLog.pruneAll(500); // custom chunk size

// MassPrunable â€” single bulk DELETE
await Telemetry.pruneAll();
```

---

## Scheduling Pruning

Run pruning on a schedule using your application's job scheduler. Example with `node-cron`:

```ts
import cron from 'node-cron';

// Every day at 3 AM
cron.schedule('0 3 * * *', async () => {
  await ActivityLog.pruneAll();
  await Telemetry.pruneAll();
  await ExpiredToken.pruneAll();
});
```

Or add it to the CLI command in a Procfile / systemd unit:

```
# Procfile
pruner: npx orion model:prune
```
