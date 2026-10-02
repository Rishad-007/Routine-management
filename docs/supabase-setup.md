# Database Setup — SQL Run Order

All SQL lives in `supabase/`. Which files you run (and in what order) depends on
whether you are creating a **new** database, **upgrading** an existing one, or
loading **demo** data.

> Golden rule: **`schema.sql` is the current, complete, self-contained schema.**
> A fresh install only needs `schema.sql` + one data step. The other files exist
> to bring an *older* database up to date, and are not needed after a fresh
> `schema.sql`.

---

## File reference

| File | Purpose | Destructive? | Idempotent? |
| --- | --- | --- | --- |
| `schema.sql` | **Full reset.** Drops everything and creates the complete current schema: tables, normalized write model (`routine_slots` / `routine_assignments` / `adjustment_batches` / `adjustment_assignments`), `routines` & `adjustments` views, triggers, RLS policies, helper functions, and the JSON importer. | **Yes** — wipes all data | No (always a clean rebuild) |
| `seed.sql` | Baseline data: default super admin, sample classes, class period rules, sample rooms & subjects. Run **once**. | No | Partly — re-running duplicates classes (no `on conflict`) |
| `demo-data.sql` | Rich demo dataset (5 classes, 30 teachers, 20 sections, 700 routine cells, sample adjustments). | **Yes** — replaces all master data + routines | Yes (rebuilds) |
| `migrate-normalized-schema.sql` | Upgrade path for an **old** DB that still has plain `routines`/`adjustments` tables. Adds the normalized tables + views while keeping history. | No | Yes (`if not exists` guards) |
| `class-period-rules.sql` | Adds `class_period_rules`, seeds it, and adds the period-range triggers. | No | Yes |
| `import-routine.sql` | Adds `teachers.designation` + `class_teacher_section_id`, relaxes the one-room-per-section index, creates `import_routine_from_json()`. | No | Yes |
| `class-suspension.sql` | Adds `classes.is_suspended` + `suspension_reason` and the suspended-aware adjustment validator. | No | Yes |
| `class-period-rules-violations.sql` | Read-only report of rows that violate the period rules. Modifies nothing. | No | Yes |

---

## Scenario 1 — Fresh / empty Supabase project (recommended)

Run in the Supabase **SQL Editor**, top to bottom:

1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. Pick **one** data source:
   - **Real data:** open **Update Database → Import JSON** in the app and upload
     `public/oldData/teacher_routines.json`. (Or call
     `select import_routine_from_json('{ ... }'::jsonb);`.) This replaces the
     sample classes/rooms/subjects from `seed.sql`.
   - **Demo data:** instead of importing, run `supabase/demo-data.sql`, then
     `supabase/class-period-rules.sql` (see Scenario 3).

**That's it.** Do **not** run the migration files (`migrate-normalized-schema.sql`,
`class-period-rules.sql`, `import-routine.sql`, `class-suspension.sql`) — their
contents are already included in `schema.sql`.

---

## Scenario 2 — Upgrade an existing database

Run these **once, in this order**, in the Supabase SQL Editor:

1. `supabase/migrate-normalized-schema.sql` — **only if** your DB still has the
   original plain `routines` / `adjustments` tables (no normalized tables). Skip
   if it already uses the views/normalized model.
2. `supabase/class-period-rules.sql`
3. `supabase/import-routine.sql`
4. `supabase/class-suspension.sql`
5. *(optional, anytime)* `supabase/class-period-rules-violations.sql` — just
   prints any leftover violations.

All four are idempotent, so re-running is safe. Keep the order so the latest
adjustment validator (suspended-aware) is the one in place at the end.

> **Note on shared rooms:** `migrate-normalized-schema.sql` adds a unique index
> requiring one section per room. `import-routine.sql` later removes it because
> the real school data has sections sharing a room. If step 1 fails on that
> index, your data already has shared rooms — run `import-routine.sql` first, or
> resolve the duplicate rooms, then continue.

---

## Scenario 3 — Demo / testing project

For a throwaway project you want populated with sample data:

1. `supabase/schema.sql`
2. `supabase/demo-data.sql`
3. `supabase/class-period-rules.sql`

`seed.sql` is optional here (demo data creates the `admin` / `Admin@2026!`
account itself). Step 3 is required because `demo-data.sql` deletes and recreates
classes, which cascades away any `class_period_rules`; re-running
`class-period-rules.sql` re-seeds them against the new classes. Suspension
columns are already present from `schema.sql`.

---

## Rules of thumb

- **Never run `schema.sql` on a database with data you want to keep** — it drops
  everything.
- **`schema.sql` already contains** what `class-period-rules.sql`,
  `import-routine.sql`, and `class-suspension.sql` add. Migrations are only for
  databases created before those features.
- **`seed.sql` once.** Its class insert has no `on conflict`, so re-running
  duplicates classes.
- **Demo data wipes period rules.** Always follow `demo-data.sql` with
  `class-period-rules.sql`.
- **Admin login comes from the `admins` table**, so at minimum you need
  `seed.sql` (or `demo-data.sql`) for a usable account. Credentials are in
  `admin-credentials.txt` (`admin` / `Admin@2026!`).
- The new **class suspension** feature only needs `schema.sql` on a fresh DB, or
  `class-suspension.sql` on an existing one.
