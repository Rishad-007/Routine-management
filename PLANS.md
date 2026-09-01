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
- ⚠️ schema.sql still needs to be RUN in Supabase SQL Editor
- **`supabase/demo-data.sql`** (added later): 🔥 deletes all data and inserts a large demo set (5 classes, 21 teachers, 24 rooms, 10 subjects, 15 sections, 525 routine cells) with deliberately planted conflict scenarios (4-consecutive red, 3-consecutive yellow, 6/day red, 5/day yellow, cross-section double-book red) + 2 date-scoped adjustments. Validated locally against Postgres 15; idempotent/re-runnable.

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

### Phase 5 — Public Routine Views ✅
- `(public)` route group + `PublicHeader` (Home / Class Routine / Teacher Routine / Teachers)
- Home: live "Currently Running" card (`CurrentPeriodCard` + `useCurrentPeriod`), class→section quick picker → `/routine?section=`, teacher cards grid
- Class routine: `RoutineViewer` (class+section selects) + `RoutineGrid` Days×Periods matrix with Tiffin separator after P4 and live current-period highlight
- Teacher routine: `TeacherRoutineViewer` (search by code/name) + compact matrix showing class-section per period
- Teachers directory: `TeachersDirectory` searchable cards → link to teacher routine
- `lib/routine-view.ts`: `buildSectionMatrix` + `buildTeacherMatrix`
- Build verified (routes: /, /routine, /teacher, /teachers)

### Phase 6 — Admin Routine Builder ✅
- `/admin/routine` page + `RoutineBuilder` editable Days×Periods grid
- Click a cell → editor panel to assign subject (→ teacher filtered by subject/open) + room; Clear button
- Drag & drop via `@dnd-kit` (grip handle) to swap assignments between periods within a day
- `saveSectionRoutine` server action: simulates the full routine set, detects busy (double-booked same period across sections → red) + overload (yellow/red daily load), returns warnings; blocks save unless "Save anyway" (force) via toast action
- Save does transactional delete+insert for the section (composite unique `section_id,day,period_number`)
- Optimistic-less but clean: invalidates queries + router.refresh on success
- Build verified (route: /admin/routine)

### Phase 7 — Adjust Routine + PDF ✅
- `/admin/adjust` page + `AdjustBuilder`: pick class/section + date, shows that date's day (Sun–Thu) with base subject/teacher per period, existing adjustments overlaid
- Per-period substitute-teacher dropdown + optional note + reset; "applies only to this date" banner; weekend guard
- `saveDayAdjustments` action: delete-then-insert date-scoped `adjustments` rows (original tracked from base routine)
- `getAdjustments()` added to `data.ts`
- PDF export: `/api/routine.pdf?section=ID` using `@react-pdf/renderer` (nodejs runtime, dynamic import), A4 landscape weekly grid; "PDF" button added to public RoutineViewer
- Build verified (routes: /admin/adjust, /api/routine.pdf)

### Phase 8 — Polish
- Animations, mobile/tablet optimization, skeleton loaders, empty states

### Phase 9 — Deploy Readiness
- Env config for Vercel/Firebase App Hosting, production build check

---

## Design System

Colors: deep navy `#1e3a5f` (primary), teal `#0d9488` (accent), soft gold (highlight), bg `#f8fafc`, text `#0f172a` / `#64748b`.
Formal header with school name + logo placeholder. Rounded grid cells, subtle shadows, generous whitespace.
