# School Routine Coordinator
## Complete Feature & Sales Report

**Product:** A digital daily class routine management system
**Reference Deployment:** Cantonment Public School & College, Rangpur
**Created by:** MD. Rishad Nur (Assistant Teacher, ICT) & the ICT Department
**Technology:** Next.js 15 · Supabase (PostgreSQL) · React PDF · Tailwind CSS · PWA

---

## 1. Executive Summary

The **School Routine Coordinator** replaces the traditional manual process of drafting, copying, and re-issuing class timetables — paper registers, hand-drawn grids, teacher substitutions arranged over the phone, and routines that are out of date by the first staff meeting of the day.

Built and proven live at **Cantonment Public School & College, Rangpur**, the system lets a school:

- **Draft the entire weekly routine digitally** — every class, section, subject, teacher and room in one smart grid.
- **Never double-book a teacher or a room** — conflict prevention runs at the database level.
- **Manage daily teacher substitutions** in minutes, with automatic checks that the substitute is actually free.
- **Publish routines instantly** — to staff, students and parents online, and as branded PDF reports.
- **Show what is happening right now** — a live "current period" display for notice boards and screens.

The result is a dramatic reduction in the time, errors, and stress of running a school day, and a single always-current source of truth for the whole school timetable.

---

## 2. The Problem With the Traditional Method

Before this software, a school's routine is typically managed like this:

| Traditional activity | Effort & pain | How people cope today |
| --- | --- | --- |
| Drafting the master timetable at term start | **1–2+ weeks** of manually crossing out conflicts, often by a single senior teacher | Handwritten retries, arbitration meetings |
| Checking a teacher isn't double-booked | Manual scanning of every grid; errors slip through | Teachers discover clashes only when two classes wait in the same room |
| Checking a room isn't double-booked | None — rooms clash constantly | Teachers swap rooms on the spot; classes overlap |
| Publishing the routine to students/staff | Photocopied sheets, notices updated by hand every change | Outdated paper pinned on walls |
| Daily teacher substitution (absence) | Phone calls, guesswork over who is free that period, manual log | Disruptions, unsupervised classes, missed periods |
| Answering "what is running right now?" | Walking to the notice board | Ask the office, wait, guess |
| Producing the daily "who substituted for whom" report | Manual tallying at day's end | Never produced; no audit trail |
| Keeping main & substitute routines in sync | Impossible to maintain | Conflicting versions everywhere |

**Consequences:** wasted staff hours, double-booked teachers and rooms, unreliable published routines, lost or unsupervised periods during absence, and no record of substitutions for review or payroll.

---

## 3. The Solution — Feature by Feature

This section details every feature and, for each, explains **how it lifts the burden of the traditional method**.

---

### 3.1 Master Data Management (the "Update Database" panel)

Six fully-managed registries replace scattered registers and sign-in sheets:

- **Classes** — named and ordered (e.g. Class 6 → Class 10).
- **Sections** — each class divided into sections, each section tied to a **mandatory fixed room** and a "fixed room" setting.
- **Rooms** — every physical room (classrooms + labs + halls) catalogued with a unique name.
- **Subjects** — full name + short code (e.g. "English" → "Eng") for compact timetables.
- **Teachers** — unique teacher code, name, **primary subject**, **multiple subjects taught**, and an "**open teacher**" flag for those who can take any subject.
- **Admins** — the system's own users, with **Super Admin / Admin** roles.

**Vs. the traditional method:** updates are made once, in one place, and every downstream view (routines, PDFs, directories) stays consistent automatically — no more correcting the same name in five different registers.

*Technical note: master-data changes cascade cleanly and are protected by database foreign keys — e.g. a room still in use cannot be accidentally deleted.*

---

### 3.2 The Routine Builder (the "Update Routine" panel)

An **interactive 5-day × 7-period editable grid per section**:

- Click any cell to assign **subject, teacher, and room** from valid dropdowns.
- **Teachers are auto-filtered** to those who actually teach the chosen subject (or are "open teachers") — the system physically prevents assigning someone to a subject they don't offer.
- **"Tag" (two-teacher) sessions** supported — a second subject/teacher/room can share a period (e.g. co-taught or split groups), shown in a distinct colour.
- **Drag-and-drop** to swap periods within a day.
- **Auto-fill**: the room defaults to the section's fixed room for you.
- **Unsaved-changes indicator** so nothing is lost by a stray click.

**Vs. the traditional method:** drafting a term's timetable shrinks from *days to hours*. The grid is always clean, the teacher-subject filter removes entire classes of error before they happen, and a whole section's layout can be corrected in seconds by dragging cells around.

---

### 3.3 The Conflict-Prevention Engine (the key differentiator)

This is the heart of the product. Rather than trusting humans to spot problems, the system **guarantees** three things at the database level:

| Guarantee | How it is enforced | What it prevents |
| --- | --- | --- |
| **A teacher is never double-booked** at the same (day, period) in two sections | Database unique index + validation trigger on every save | The classic clash where one teacher is expected in two rooms at once |
| **One primary session per cell** | Validation trigger | Two activities colliding in one slot |
| **Substitute teacher is genuinely free** | Separate validation trigger on adjustments | Assigning a daily substitute who is already teaching elsewhere that period |
| **Adjustments only on school days** | Validation trigger blocks Fri / Sat | Accidental weekend substitutions |

Beyond hard constraints, a **conflict-warning engine** flags workload problems and lets the coordinator decide:

- **Daily load** — a teacher with **5 periods a day** is flagged (amber); **6+** is flagged red.
- **Continuous periods** — **3+ back-to-back** is amber; **4+** is red. (The lunch/tiffin break after period 4 correctly resets the run.)
- **Cross-section double-booking** is **hard-blocked** — the system never lets it be saved, even on "force".

**Vs. the traditional method:** the very errors that cause corridor chaos, teacher frustration, and wasted time — double-booked teachers, clashing rooms, overloaded staff — are *prevented automatically*, with warnings the coordinator can review and override intentionally, instead of discovering them at the classroom door.

---

### 3.4 Smart Room Auto-Fill

When a section's **fixed room is changed**, the system automatically updates that section's routine cells to the new room — while **preserving any per-cell overrides** (e.g. a period deliberately held in the Science Lab instead of the class room).

**Vs. the traditional method:** changing a classroom in the manual system means whiting-out and rewriting every line that referenced it. Here it is one click, and deliberate exceptions are protected automatically.

---

### 3.5 Daily Adjust Routine (teacher substitutions)

A dedicated, **teacher-centred** daily substitution workflow:

- Pick a **date** (weekends are blocked with a clear notice).
- Pick an **absent teacher** from a searchable rail — each shows a colour-coded load badge (**green / amber / red**) and "continuous periods" hint.
- See that teacher's full day: every period, the class & section, subject, and current status, with existing substitutions overlaid as amber badges.
- Click a period to open an assignment sheet listing **all teachers sorted free-first**, each with live stats:
  - **classes today**, **continuous stretch**, **weekly total**, and a warning like "already 5 classes today" or "4 continuous".
  - Busy teachers shown (dimmed) for reference; available teachers highlighted.
- Assign a substitute in seconds; **update a tag session's subject/room/teacher** where needed.
- A "**Dangerous Assignment**" confirmation appears for red-level loads, with "Save anyway".
- Every assigned substitution is **re-validated server-side** — a busy substitute is hard-blocked.

**Vs. the traditional method:** a substitution that once took phone calls, guesswork and a teacher chasing down who is free now takes *under a minute*, with the system doing the "who is actually free and not overloaded" thinking for you.

---

### 3.6 Automatic Cleanup of Temporary Adjustments

Adjustments are **date-scoped** — they apply to one specific day and are **automatically removed once the date has passed** (a database trigger purges expired entries on the next change).

**Vs. the traditional method:** no more stale substitution lists carried forward by mistake, and no manual "yesterday's changes are done, clear the board" chore. The routine automatically reverts to the master timetable the next day.

---

### 3.7 Live "Current Period" Display (public)

A real-time live card (refreshes every 30 seconds) shows **exactly what is running right now**:

- The current period number and its start/end time.
- The subject, teacher, and room of the class in session, **including today's substitutions**.
- "Adjusted" badge when the running period has been changed.
- Live status states: **before school / in period 3 / tiffin break / school over**, and the season (summer/winter) start-time.
- A pulsing "LIVE" indicator.

**Vs. the traditional method:** staff, students and visitors no longer walk to a wall to check — the answer is on any phone or on a lobby screen, accurate to the live substitutions, not the stale printed copy.

---

### 3.8 Public Routine & Directory Views

Any stakeholder can view, without login:

- **Class Routine viewer** — pick a class & section and see its full weekly grid, with the **current period highlighted live**, adjusted cells marked amber, tag (2-teacher) sessions underlined, and a clear tiffin divider.
- **Teacher Routine viewer** — search any teacher by name/code and see their weekly load as a compact matrix, with today's substitutions marked.
- **Teachers Directory** — a searchable grid of all teachers, each linking to their routine.

**Vs. the traditional method:** the routine is *published* and always current — on phones, computers and screens — instead of pinned paper that is outdated by the first substitution of the day.

---

### 3.9 PDF Reports & Exports (branded, ready to print)

Three server-generated PDFs, all branded with the school, printable, and exportable for notice boards, records, and submission:

1. **Class Routine PDF** — A4 landscape weekly grid, one per section, showing subject/teacher/room per cell (both primary and tag sessions, adjusted cells flagged). *Ideal for printing per class.*
2. **Teacher Routine PDF** — A4 landscape of a teacher's weekly load. *Ideal for giving each teacher their own copy.*
3. **Daily Adjustment Report** — A4 portrait, **whole-school**, **grouped by the unavailable (original) teacher**, with a table of *Class & Section | Period | Subject | New Assigned Teacher | Signature*. Includes a header with the date and counts of substitutions / unavailable teachers, and paginates cleanly. *The single most valuable report for administration — a complete audit trail of the day's substitutions.*

**Vs. the traditional method:** the end-of-day substitution register — normally never kept — becomes a one-click, signed, printable report that satisfies record-keeping and allows pattern analysis (which teachers cover most, which periods are the hardest to fill).

---

### 3.10 Security & Roles

- **Password-protected admin area** with secure, hashed credentials and signed, encrypted session cookies.
- **Two roles** — **Super Admin** (full control, can create/delete admins) and **Admin** (routine management tasks). Only a super admin can manage other admins.
- **Public read-only, private write** — everyone can *view* routines, but only authenticated staff can *change* anything.
- **Route protection** enforced at two layers (network edge + server verification).

**Vs. the traditional method:** tamper-safe, with a clear record of who can change the timetable, versus paper sheets that anyone could alter.

---

### 3.11 PWA — Installable & Offline-Capable

The site is an **installable Progressive Web App**:

- Adds to home screen on phones/tablets like a native app.
- A **network-first service worker** keeps the app shell usable even when offline.
- Works on any device — phone, tablet, PC — no app-store install required.

**Vs. the traditional method:** staff and students get the routine in their pocket with no app to install and no paperwork.

---

### 3.12 Season-Aware Schedule Engine

The system understands **two academic seasons** — Summer (starts 08:30) and Winter (starts 09:10) — with correct period durations and a **20-minute tiffin break after period 4**. The active season is stored as a setting and used across the current-period display and PDFs.

**Vs. the traditional method:** no more remembering two different timetables or re-printing routines when the clock changes; it's accurate automatically.

---

## 4. Who Benefits, and How Much

| Persona | What they gain |
| --- | --- |
| **Routine Coordinator / Senior Teacher** | Timetable drafting drops from *days to hours*; conflicts prevented by the engine; substitutions in under a minute; no manual re-checking |
| **Teachers** | A personal, always-current routine; no more double-booked clashes or room chaos; a fair, visible workload |
| **Students & Parents** | An accurate published routine online; live "current period" info; no more outdated paper |
| **School Administration** | A daily signed substitution report for the record; a single source of truth; time savings that free staff for teaching |
| **ICT Department** | A low-cost, in-house, maintainable system (open source stack, installable PWA, no per-seat licence) |

---

## 5. Reliability & Technology (for the technically confident buyer)

- **PostgreSQL with real integrity** — conflicts are prevented by database *constraints and triggers*, not just by polite warnings in the UI. This is a strong guarantee against data corruption.
- **Row-level security** — public views are read-only; writes require a verified server-side session.
- **Fast, modern stack** — Next.js 15 (App Router, Turbopack), Tailwind CSS, and a polished shadcn/ui interface.
- **Mobile responsive** — usable on phones and tablets, not just desktops.
- **Three server-rendered PDF engines** — reliable, branded document generation.
- **Transaction-safe demo setup** — schema + seed data scripts that are idempotent and safe to re-run.

---

## 6. Sales Positioning — What You Are Buying

You are not buying "a spreadsheet that looks like a timetable." You are buying:

1. **Hours back every week** — for the coordinator who currently drafts and re-drafts by hand.
2. **A conflict-free school day** — enforced by the system, so teachers and rooms never clash.
3. **Ten-minute substitutions** — replacing a chaotic, phone-based process.
4. **An always-current published routine** — for staff, students, parents, and notice screens.
5. **A complete daily audit trail** — the signed substitution report administration has always wanted but never had.

---

## 7. A Typical Day With the System

1. **08:00** — A teacher reports absent.
2. **08:05** — The coordinator opens **Adjust Routine**, picks the date, selects the absent teacher, and sees their day at a glance.
3. **08:07** — Opens the period, chooses a free, under-loaded teacher from the ranked list, assigns, saves. The system confirms the substitute is not double-booked.
4. **09:10** — The lobby screen shows **period 1** with the actual (substituted) teacher for the running class, live and accurate.
5. **During the day** — Students can check any class routine and its live status on their phones.
6. **14:30** — The coordinator clicks **Download** on the Daily Adjustment Report; a signed, grouped-by-unavailable-teacher PDF is generated for the record and for display.
7. **Tomorrow** — Yesterday's adjustments auto-purge; the master routine is automatically back in force.

---

*Prepared for evaluation and acquisition presentation.*
*For a guided demo or to trial the system with your own data, contact the ICT Department.*
