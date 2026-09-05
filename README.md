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

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service role key, server-only) |
| `ADMIN_USERNAME` | Super admin username |
| `ADMIN_PASSWORD_HASH` | `bcrypt` hash of the admin password |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `SCHOOL_NAME` | Display name shown in the header / PDF reports |

### Database setup

Apply the SQL scripts in the Supabase SQL Editor (in order):

1. `supabase/schema.sql` — tables, RLS, and conflict-validation triggers.
2. `supabase/demo-data.sql` — demo classes/teachers/subjects/routines + sample daily adjustments.

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
