# School Routine Coordinator

A daily class **routine management system** for **Cantonment Public School & College, Rangpur**. Built with Next.js (App Router), Supabase, and React PDF.

## Features

- **Public pages** — view the whole-school class routine, any teacher's weekly routine, and the teacher directory.
- **Live "current period"** panel showing what is running right now.
- **Admin panel** (password-protected):
  - **Update Database** — manage classes, sections, subjects, teachers, rooms & admins.
  - **Update Routine** — build a section's full weekly routine (primary + tag periods).
  - **Adjust Routine** — temporary, date-scoped teacher substitutions (history kept permanently; downloadable as a daily report by any date).
  - **Daily Adjustment Report** — whole-school PDF grouped by unavailable teacher.
- **PDF export** — class routine, teacher routine, and daily adjustment report.
- **PWA** — installable, with offline app-shell support.
- **Footer** with admin contact and ICT department credits.

## Tech Stack

- [Next.js 15](https://nextjs.org) (App Router, Turbopack)
- [Supabase](https://supabase.com) (Postgres + auth/session)
- [@react-pdf/renderer](https://react-pdf.org) (server-side PDF generation)
- [Tailwind CSS](https://tailwindcss.com) + shadcn/ui
- TypeScript

## Getting Started

Requirements: **Node.js ≥ 22** (the project is tested on `24.18.0`)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Note: the repo pins the Node runtime via `nvm` in some tooling:
> `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24.18.0`

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in real values:

| Variable                        | Where to get it                                                   |
| ------------------------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon key)                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase → Project Settings → API (service role key, server-only) |
| `ADMIN_USERNAME`                | Super admin username                                              |
| `ADMIN_PASSWORD_HASH`           | `bcrypt` hash of the admin password                               |
| `SESSION_SECRET`                | `openssl rand -hex 32`                                            |
| `SCHOOL_NAME`                   | Display name shown in the header / PDF reports                    |

### Database setup

For a new/empty Supabase project, apply these SQL scripts in the Supabase SQL Editor (in order):

1. `supabase/schema.sql` — tables, RLS, and conflict-validation triggers.
2. `supabase/demo-data.sql` — demo classes/teachers/subjects/routines + sample daily adjustments.

`demo-data.sql` stages its generated legacy-shaped rows temporarily, then converts them into the
normalized routine and adjustment tables. It is compatible with the current schema views.

For an existing database that still has the original `routines` and `adjustments` tables, run
`supabase/migrate-normalized-schema.sql` once instead. It preserves existing routine and adjustment
history while creating the normalized tables required by the admin save actions.

---

## Importing the Routine JSON — Step-by-Step Run Guide

The app can (re)build the **entire** master data + weekly routine from the offline export file
`public/oldData/teacher_routines.json`. "JSON wins": classes, sections, rooms, subjects, teachers
and the weekly routine are rebuilt from the file, and any rows in the DB that are **not** in the
file are deleted. Admins and adjustment history are kept.

### 1. Prerequisites

- **Node.js ≥ 22** (repo pins `24.18.0` via `.nvmrc`). If your shell Node is old, run:
  ```bash
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use
  node -v   # >= v22
  ```
- Install dependencies:
  ```bash
  npm install
  ```
- A Supabase project reachable via `.env.local` (see "Environment Variables" above).

### 2. Apply the schema to your database

In the **Supabase SQL Editor**, run:

- **Fresh / empty project:** run `supabase/schema.sql` (full schema + triggers + RLS).
- **Existing project** (upgrades an older DB or the demo DB): run `supabase/import-routine.sql`
  instead — it adds the new teacher columns, drops the per-room unique index, and creates the
  `import_routine_from_json(payload jsonb)` function. It is idempotent, so re-running is safe.

If you just ran `schema.sql` on a fresh project, you do **not** need `import-routine.sql` as well
(the function is already included in `schema.sql`).

### 3. Run the app

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and log in as an admin
(`/login`, credentials in `admin-credentials.txt`).

### 4. Open the Import tab

Go to **Update Database** → **Import JSON** tab (route `/admin/master-data`).

### 5. Upload the JSON file

- Drag and drop `public/oldData/teacher_routines.json` onto the dashed area (or click to browse).
- The file is parsed **in the browser**. A preview card shows the expected counts:
  teachers 167 · classes 10 · sections 124 · rooms 106 · subjects 32 · routine slots 3023 · tag pairs 37 · class teachers 120.

  The 37 **tag pairs** are co-taught slots (two teachers at the same section/day/period, same
  subject & room, e.g. a home-science period shared by two teachers). They import as one `primary`
  + one `tag` assignment, so both teachers show in that period.
- Any **source-file notes** (e.g. ambiguous subject short codes, auto-short-names) are shown in an
  amber alert. Read them before importing.

### 6. Confirm the destructive replace

- The import **deletes everything not present in the file** and rebuilds the routine.
- Tick **"I understand — JSON data wins and replaces existing data."**

### 7. Import

- Click **Import routine data**.
- On success the report card shows what was written:

| Report key            | Expected value |
| --------------------- | -------------- |
| `imported_classes`    | 10             |
| `imported_sections`   | 124            |
| `imported_rooms`      | 106            |
| `imported_subjects`   | 32             |
| `imported_teachers`   | 167            |
| `routine_slots`       | 3023           |
| `primary_assignments` | 3023           |
| `tag_assignments`     | 37             |

If it fails, the error is returned in a red alert and **no changes are applied** (the DB function
runs in a single transaction).

### 8. Verify & tidy up afterwards

- Check the **Teachers** and **Subjects** tabs. Short names and full subject names are
  **auto-generated from the source file** (initials for short names; a guess for ambiguous subject
  codes) — edit any mis-guesses there.
- Optionally set **designation** and **class teacher of** per teacher in the Teachers tab.

### What is replaced vs. kept

| Rebuilt from JSON | Kept as-is |
| ----------------- | ---------- |
| Classes + `class_period_rules` | `admins` |
| Sections (room = the section's single used room) | `settings` |
| Rooms | Adjustment history: rows referencing a removed teacher are kept (teacher becomes `NULL`); adjustment batches tied to a removed section are cascade-deleted |
| Subjects (full names from `meta.subjects` mapping) | |
| Teachers (`designation`, `class_teacher_section_id`, `primary_subject_id`) | |
| Weekly routine: `routine_slots` + `routine_assignments` (primary + tag) | |

### Calling the API directly (optional)

The same import can be triggered programmatically (e.g. for a deployment script) with any
authenticated browser session cookie:

```bash
curl -X POST http://localhost:3000/api/admin/import-routine \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <your session cookie>' \
  --data-binary @public/oldData/teacher_routines.json
```

## Scripts

```bash
npm run dev       # development server (Turbopack)
npm run build     # production build
npm run start     # start the production server
npm run lint      # run ESLint
```

### Regenerating PWA icons

Icons are pre-generated from `public/logo/cant logo.png` (squared, transparent, maskable-safe):

```bash
node scripts/gen-icons.cjs
```

This writes `public/icon-192.png`, `public/icon-512.png`, `src/app/icon.png`, and `src/app/apple-icon.png`.

## PDF Routes

- `/api/routine.pdf?section=<id>` — weekly class routine PDF
- `/api/teacher-routine.pdf?teacher=<id>` — teacher routine PDF
- `/api/adjust-report.pdf?date=YYYY-MM-DD` — daily adjustment report (whole school, grouped by unavailable teacher; returns `400` on non-school days)

These require the Node.js runtime. See `vercel.json` for runtime pinning.

## PWA

The app is installable (manifest + theme color + `apple-icon.png`) with a network-first service worker (`public/sw.js`) providing offline app-shell caching. Registration only runs in production builds.

## Deployment

Deployed on **Vercel**. After adding the environment variables above, deploy and trigger a redeploy (Vercel inlines `NEXT_PUBLIC_*` at build time).

Created by **MD. Rishad Nur** (Assistant Teacher, ICT) & the ICT Department, Cantonment Public School & College, Rangpur.
