# School Routine Management App — Build Plan

**School:** Cantonment Public School & College, Rangpur
**Framework:** Next.js 15 (App Router) + TypeScript
**UI:** Tailwind CSS v4 + shadcn/ui + Lucide icons
**DB:** Supabase (PostgreSQL)
**Animations:** Framer Motion
**PDF:** `@react-pdf/renderer`
**State/Data:** TanStack Query + Zustand
**Auth:** Custom (username + bcrypt hash in DB, HTTP-only cookie session)

---

## Locked Decisions

| Area | Decision |
|------|----------|
| Database | Supabase PostgreSQL — raw `schema.sql` run in Supabase SQL Editor; app connects via `supabase-js` (browser + SSR + service-role) |
| Auth | Custom — username + bcrypt hash in `admins` table, HTTP-only `school_session` cookie, `middleware.ts` + `/admin/layout.tsx` guard |
| Super admin creds | Env vars + gitignored `admin-credentials.txt` backup; password stored hashed in DB |
| Assignment input | Click-to-assign (default) + drag & drop via `@dnd-kit` |
| PDF generation | `@react-pdf/renderer` server-side in a Route Handler |

---

## Env / Credentials Files

- `.env.local` (gitignored) — real values
- `.env.local.example` (committed) — template
- `admin-credentials.txt` (gitignored) — raw super admin username + password backup

Required env vars:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD_HASH=
SESSION_SECRET=
SCHOOL_NAME=
```

---

## Database Schema (Supabase SQL)

File: `supabase/schema.sql`

Tables:

- `admins` — id, username (unique), password_hash, role (`super`/`admin`), created_by, created_at
- `classes` — id, name, sort_order
- `sections` — id, class_id FK, name, room_id FK, fixed_room
- `rooms` — id, name
- `subjects` — id, name, short_name
- `teachers` — id, teacher_code (unique), full_name, short_name, is_open_teacher, primary_subject_id FK
- `teacher_subjects` — teacher_id, subject_id (many-to-many)
- `routines` — id, section_id, day (0–4), period_number (1–7), teacher_id, subject_id, room_id, is_adjusted, original_teacher_id; UNIQUE(section_id, day, period_number)
- `adjustments` — id, adjust_date, section_id, period_number, original_teacher_id, new_teacher_id, reason, created_by, created_at (date-scoped: temp changes last only that day)
- `settings` — key, value (`season`, `school_name`, `period_durations`)

RLS: public reads for master data/routines; writes via service-role after session verify.

Seed file: `supabase/seed.sql` — default super admin + sample classes/sections/subjects/teachers.

---

## Build Phases (sequential, one at a time)

### Phase 0 — Scaffold & Foundation ✅
- Scaffold Next.js 15 (TS, App Router, Tailwind v4)
- Install deps + shadcn/ui components
- Write planning/config/credential files
- Set up folder structure

### Phase 1 — Database Schema + Supabase clients ✅
- Write `supabase/schema.sql` + `supabase/seed.sql`
- Supabase client factories (browser `client.ts` / SSR `server.ts` / service-role `admin.ts`)
- Data-access layer `lib/data.ts`, types, constants, query provider
- User provides Supabase URL + keys (env vars filled in `.env.local`)
- ⚠️ schema.sql + seed.sql still need to be RUN in Supabase SQL Editor

### Phase 2 — Auth ✅
- `lib/auth.ts` — signed HTTP-only `school_session` cookie (HMAC + expiry), bcrypt verify
- Login page + server action
- `middleware.ts` protecting `/admin/*`, `/login` redirect
- `/admin/layout.tsx` session guard, admin nav, logout
- Admin dashboard with stats

### Phase 3 — Master Data CRUD ✅
- Server actions in `app/admin/master-data/actions.ts` (auth-wrapped, service-role writes)
- Tabbed UI: Classes, Sections, Rooms, Subjects, Teachers, Admins
- Validation, search, edit/delete confirmations, multi-select subjects, open-teacher toggle
- Super admin can create/delete admins; self-delete blocked

### Phase 4 — Period + Conflict Engine ✅
- `lib/periods.ts` season-aware schedule (summer start 08:30, winter 09:10; same durations/gaps, tiffin after period 4)
- `getCurrentPeriod` + `getSchoolDayIndex` helpers
- `useCurrentPeriod` live hook (30s tick), `useSeason` query hook
- `lib/conflicts.ts` — consecutive (≥3 yellow, ≥4 red) + daily-total (≥5 yellow, ≥6 red) warnings; teacher-busy-across-sections; weekly load
- Verified with runtime tests against spec timings

### Phase 5 — Public Routine Views
- Home + live current-period card + search
- Class+Section routine grid
- Teacher routine grid + Teachers directory

### Phase 6 — Admin Routine Builder
- Editable full-week grid
- Click-to-assign + drag & drop (`@dnd-kit`)
- Conflict badges, busy-in-period warning, force override
- Optimistic save + toasts

### Phase 7 — Adjust Routine + PDF
- Date-scoped overlay (base routine + adjustments)
- Adjust via Teacher OR Class+Section
- PDF report via route handler (`@react-pdf/renderer`)

### Phase 8 — Polish
- Animations, mobile/tablet optimization, skeleton loaders, empty states

### Phase 9 — Deploy Readiness
- Env config for Vercel/Firebase App Hosting, production build check

---

## Design System

Colors: deep navy `#1e3a5f` (primary), teal `#0d9488` (accent), soft gold (highlight), bg `#f8fafc`, text `#0f172a` / `#64748b`.
Formal header with school name + logo placeholder. Rounded grid cells, subtle shadows, generous whitespace.
