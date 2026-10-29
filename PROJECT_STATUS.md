# Project Status: Afiyah Charitable Medical Complex (مجمع عافية الطبي الخيري)

Last updated: 2026-10-29 (brought up to date through backend stages 2A-2G, frontend stages 3A-3F, the Stage 6 live-testing findings and fixes, and the final compliance fixes A-E with their verification). Sections written earlier are kept as history and are marked where they are superseded.
Stable rules and constraints are in `CLAUDE.md`. This file records progress, results, and open items.

**Labels.**
- **[Report]**: stated in the frozen graduation report `تقرير المشروع معدل.docx` (project root), the highest authority for functional requirements and the database design.
- **[Owner-approved]**: an approval or decision given by the project owner.
- **[Owner-reported]**: information supplied by the owner that cannot be checked from the repository.
- **[Verified]**: confirmed by inspecting repository files or by tests actually run in the workflow described below. **[Verified: offline]** means the
  check ran against fake databases, copies of pure utilities, or a build, never against the live backend and database.
- **[Owner-reported: live]**: a result the owner confirms from the running application (Stage 6). It was not independently executed by Claude in the
  documentation task.
- **[Deferred]** / **[Pending]**: not done; see the sections below.

## Sources and limits
- The graduation report `تقرير المشروع معدل.docx` is in the project root. It was read in full in Phase 5 and is the binding reference for scope,
  functionality, and the database design [Report, Verified]. It is **frozen and immutable**: never edit, rename, move, regenerate, or delete it, and
  never propose changing it; the implementation adapts to it (see `CLAUDE.md`). Its checksum when read was `4d9d53f7bdf1ea472e6c9554003aaf99`. The older
  `تقرير المشروع.docx` is superseded and is not in the repository. Phase 0-3 deliverables are also not in the repository.
- Browser-based functional and regression testing performed in an earlier Claude conversation is historical and
  owner-reported; it was not re-run here. [Owner-reported]
- The repository is not under Git (no `.git`; the only `.gitignore` is `backend/.gitignore`). Version control is to be discussed separately. [Verified]

## Current phase (2026-10-29)
| Phase | Status |
|---|---|
| 0 Environment, 1 Analysis, 2 Architecture, 3 UI/UX planning | Complete [Owner-reported] |
| 4 Frontend, public pages A1-A10 | **COMPLETE and LOCKED** [Owner-approved]. The designs stay locked; A6, A7, A8, and A10 were later integrated with the real backend with the owner's approval |
| 5 Backend and PostgreSQL | **Backend stages 2A-2G CLOSED** [Owner-reported]. The Express backend, the SQL scripts, and their tests exist in `backend/` [Verified: files]. [Owner-reported] The local `afiyah_test` database runs with the schema, the initial catalog (19 specialties, 61 doctors), and the administrator account (not queried by Claude) |
| Frontend integration and authenticated areas (Stage 3) | 3A and 3B CLOSED; 3C, 3D, and 3E CLOSED on offline checks; **3F Admin Dashboard CLOSED** (complete, confirmed by the owner) |
| **Stage 6: live integration and functional verification** | **IN PROGRESS.** Most flows confirmed live by the owner; two defects fixed (offline-verified); open items listed in "Stage 6 log" |
| **Final verification against the graduation report** | **PERFORMED — PARTIALLY VERIFIED** (2026-10-29). Source inspection, a complete backend test run, the frontend validation harness, the production build, and the owner-reported manual checks are done; five confirmed deviations (A-E) were fixed. Not fully completed: see "Verification status", part C |

## Pages and routes
| Page | Route | Code [Verified] | Approval |
|---|---|---|---|
| A1 Home (including the redesigned Hero) | `/` | Implemented | **Approved and locked** [Owner-approved] |
| A2 About | `/about` | Implemented; now shows the official address (plain text) | **Approved and locked** [Owner-approved] |
| A3 Specialties Directory | `/specialties` | Implemented | **Approved and locked** [Owner-approved] |
| A4 Doctors Directory | `/doctors` | Implemented; 61 images fixed; card button reads «عرض التفاصيل» | **Approved and locked** [Owner-approved] |
| A5 Doctor Details | `/doctors/:id` | Implemented (`DoctorDetailsPage.jsx`); its «احجز موعداً» button now links to A6 | **Approved and locked** [Owner-approved] |
| **A6 Appointment Booking** | `/doctors/:id/book` | Implemented (`AppointmentBookingPage.jsx`); **now uses real availability and real booking via the backend** (Stage 3D) | **Design approved and locked** [Owner-approved] |
| **A7 Login Page** | `/login` | Implemented (`LoginPage.jsx`); **now real login** (`POST /api/auth/login`, httpOnly cookie) | **Design approved and locked** [Owner-approved] |
| **A8 Registration** | `/register` | Implemented (`RegisterPage.jsx`, shares `AuthLayout` with A7); **now real registration** (`POST /api/auth/register`) | **Design approved and locked** [Owner-approved] |
| A9 Donations | `/donations` | Implemented (demo data only) | **Approved and locked** [Owner-approved] |
| **A10 Contact Us** | `/contact` | Implemented (`ContactPage.jsx`); **now sends through the backend** (`POST /api/contact`, SMTP) | **Design approved and locked** [Owner-approved] |
| Shared Footer (every page) | all routes | Official address, phone, and email shown (`Footer.jsx`) | **Approved** [Owner-approved] |
| Patient: My Appointments | `/patient/appointments` (`/patient` redirects here) | Implemented (`pages/patient/MyAppointmentsPage.jsx`); patient role only | Stage 3D; booking, cancellation, and slot release confirmed live [Owner-reported: live] |
| Patient: Profile | `/patient/profile` | Implemented (`pages/patient/PatientProfilePage.jsx`); patient role only; contains the shared password-change form | Stage 3D; profile editing and password change confirmed live [Owner-reported: live] |
| Doctor: Schedule | `/doctor` | Implemented (`pages/doctor/DoctorSchedulePage.jsx`); doctor role only, read-only | Stage 3E; schedule and appointment views confirmed live [Owner-reported: live] |
| Doctor: Appointments | `/doctor/appointments` | Implemented (`pages/doctor/DoctorAppointmentsPage.jsx`); doctor role only, read-only | Stage 3E; confirmed live as above |
| Doctor: Password | `/doctor/password` | Implemented (`pages/doctor/DoctorPasswordPage.jsx`, shared `PasswordChangeForm`); doctor role only; own password only | Stage 6; password change confirmed live [Owner-reported: live]; responsive check of the third navbar link pending |
| Admin: Home | `/admin` | Implemented (`pages/admin/AdminHomePage.jsx`: pending-change summary and section cards); admin role only | Stage 3F, closed |
| Admin: Specialties, Doctors | `/admin/specialties`, `/admin/doctors` | Implemented (`AdminSpecialtiesPage.jsx`, `AdminDoctorsPage.jsx`); immediate additions, deferred edits and deletions | Stage 3F; management confirmed live [Owner-reported: live] |
| Admin: Patients, Appointments | `/admin/patients`, `/admin/appointments` | Implemented (`AdminPatientsPage.jsx`, `AdminAppointmentsPage.jsx`); read-only, paged | Stage 3F; views confirmed live [Owner-reported: live] |
| Admin: Pending changes | `/admin/pending-changes` | Implemented (`AdminPendingChangesPage.jsx`); list and cancel | Stage 3F; creation and cancellation of pending changes confirmed live [Owner-reported: live] |
| Admin: Password | `/admin/password` | Implemented (`AdminPasswordPage.jsx`, shared `PasswordChangeForm` with a 12-character minimum); admin role only; own password only | Stage 6; password change confirmed live [Owner-reported: live]; responsive check of the seven-tab bar pending |

Routes in `src/App.jsx` [Verified]: the public routes and `/login` and `/register` (inside the pathless `AuthLayout`, wrapped by `GuestOnly`) are
unchanged from the approved pages; `RequireRole` guards `/patient/*` (patient), `/doctor`, `/doctor/appointments`, and `/doctor/password` (doctor), and
`/admin/*` (admin, rendered inside `AdminLayout`). Only the catch-all `*` ("الصفحة غير موجودة") renders `PlaceholderPage`. A patient's home stays `/`.

Approved navigation flow, connected on the frontend: Specialties → Doctors → Doctor Details (A5) → Appointment Booking (A6) → (login if needed) → booking → «مواعيدي». Login (A7) and Registration (A8) switch into each other without a page reload.

## Phase 4 closeout [Owner-approved]
The owner visually reviewed and approved all ten public pages, A1 to A10, the shared Footer update, and the final About address correction.
**Phase 4 (frontend implementation) is complete for the approved A1-A10 public-page scope, and those pages are locked.** This is a closeout of the
public pages only, **not** of the whole application: nothing below is operational yet.
- **[Superseded 2026-10-28]** The backend-dependent functionality that this closeout listed as pending (authentication and authorization, registration,
  booking and cancellation with persistence, double-booking prevention, redirects and return-to-booking, contact delivery, and the patient and doctor
  areas) now exists in the backend and was integrated in Stages 3C-3E (see below), first verified offline only. **[Superseded 2026-10-29]** The admin area
  was completed in Stage 3F, and Stage 6 confirmed most flows live [Owner-reported: live] (see "Stage 6 log"). **[Superseded 2026-10-29]** The final verification was then performed (partially verified; see "Final compliance fixes A-E"). The original requirement list is kept in `CLAUDE.md` ("Current state" and "Backend and database").
- **Locked does not mean frozen against integration.** Phase 5 may require carefully scoped frontend changes (real login, booking, contact delivery).
  Each must follow the approved requirements, preserve the approved visual design, avoid unnecessary component or CSS refactoring, be proposed and
  reviewed before implementation, and be tested for regressions. Several `src/api/*.js` functions, the A6 availability shape, and the form validators
  were designed to be swapped or reused for that integration.

## Stage status [Owner-approved workflow: Inspect → Plan → Review → Approval → Implement → Test → Stop]
Stage identifiers and completion are as reported by the owner; scopes are given only where the repository or the owner's task descriptions record them.

| Stage | Status | Scope and evidence |
|---|---|---|
| Phase 5 Stage 0, design reviews, Stage 1A documentation alignment | Complete (history) | Details below and in earlier sections |
| Backend 2A-2G | **CLOSED** [Owner-reported] | Per-stage names are not recorded in the repository and are not asserted here. Repository evidence: the Express backend (`backend/src`), SQL scripts `backend/db/001-006`, SQL tests, and 14 backend test files (13 at the time of the original closeout; `dueChanges.test.js` was added in Stage 6). SQL script headers carry labels "1B-2a" to "1B-2f" (tables; functions and indexes; booking triggers; pending changes; privileges; integration test), whose mapping to 2A-2G is not recorded |
| Frontend 3A | **CLOSED** [Owner-reported] | No scope recorded |
| Frontend 3B | **CLOSED** [Owner-reported] | Public pages and shared API integration (`api/http.js`, doctors, specialties, availability) |
| Frontend 3C | **CLOSED (offline)** | Authentication, registration, login/logout, session handling, and role guards (`AuthContext`, `RequireRole`, `GuestOnly`, `utils/redirect.js`, `api/auth.js`) |
| Frontend 3D | **CLOSED (offline)** | D1 patient API functions and appointment utilities; D2 real booking confirmation in A6; D3 patient appointments and profile UI |
| Frontend 3E | **CLOSED (offline)** | Doctor portal (schedule and appointments, read-only) |
| Navbar responsiveness fix | **CLOSED (offline)** | Patient and doctor roles use the slide-out menu below 1400px |
| Doctor appointment boundary fix | **CLOSED (offline)** | Past and upcoming requests no longer overlap on today's date |
| Frontend 3F Admin Dashboard | **CLOSED** (confirmed complete by the owner) | Six admin sections under `AdminLayout` (home, specialties, doctors, patients, appointments, pending changes); see "Stage 3F: what was built". The admin password page was added in Stage 6 |
| Stage 6 live integration and functional verification | **IN PROGRESS** | See "Stage 6 log" and "Verification status" |
| Final verification against the graduation report | **PERFORMED — PARTIALLY VERIFIED** (2026-10-29) | See "Final compliance fixes A-E" and "Verification status". F1 live, biography with real text, the restriction notice with a real pending change, and cross-browser and real-device checks remain unverified |

**Latest recorded frontend production build: PASS** (Vite 8.3.5, 110 modules, no warnings or errors), run once on 2026-10-29 after the compliance fixes A-E and
written to a temporary directory outside the repository. It was not re-run for the documentation update. (Earlier builds: 95 modules at the end of Stage 3E,
109 after the doctor password page, 110 after the admin password page.)

Stage 0 results (read-only checks run in this workflow) [Verified]:
- Postgres.app **PostgreSQL 18.6** was running and accepted connections on `localhost:5432` (`pg_isready` and `psql` over TCP and the local socket).
  The connected role was the macOS account `omarsh`, a superuser, with no password required (local trust authentication). The `psql` client is also 18.6.
- The server `TimeZone` was `Asia/Damascus` (from this Mac's configuration, which application code must not rely on). Asia/Damascus converted 12:00 UTC to
  15:00 in both January and July 2026 and Damascus 09:00 to 06:00 UTC in January 2026, July 2026, and July 2030: a fixed +03:00 with no daylight saving.
- The `btree_gist` extension is available (version 1.8) but **not installed**; it is not needed with the approved schema, so it will not be installed.
- The only databases were `omarsh` and `postgres`; **no `afiyah_dev`, `afiyah_test`, or `afiyah` database and no `afiyah*` role existed** at that check.
  (Historical, at that check. The schema, test, and verify scripts in `backend/db/` are guarded to `afiyah_test`; see "Backend and database" below.)
- Limits: the authentication configuration file and the data-directory permissions were not inspected.
## Verification status (2026-10-29)
Three kinds of evidence are kept apart. Nothing in this documentation update was executed: no tests, builds, queries, or servers were run for it.

**A. Live results from the running application [Owner-reported: live].** Confirmed by the owner in Stage 6:
- patient registration and login; appointment booking and cancellation; cancelled slots becoming available again;
- prevention of conflicting patient appointments, and prevention of double booking by competing patients;
- doctor schedule and appointment views (patient names and phones); patient profile editing;
- admin specialty and doctor management; admin patient and appointment views;
- password changes for the patient, the doctor, and the admin; role-based access restrictions;
- the Contact Us form: the backend reported `contact form email: configured`, a real message was submitted through the website, the success notice
  appeared, and the email arrived in the administration Gmail inbox with the sender's name, email, and message.
Earlier in Stage 6 (before the lists above were extended) the owner also confirmed: public pages and navigation, specialty and doctor listing, search and
filtering, doctor images, light/dark switching, doctor login, admin login and dashboard, admin creation and editing of specialties and doctors, and
creation and cancellation of pending changes.

**A2. Live results after the compliance fixes A-E [Owner-reported: live], 2026-10-29.** The project was running locally; the owner confirmed:
- Contact Us: the subject field appears correctly; leaving it empty shows the expected validation error; the form layout is correct; a real message was
  sent and Gmail received it; the subject appeared correctly in both the email header and body; Reply-To targets the sender's email.
- Registration: the note states that blood type is optional; registration succeeds with blood type left empty; the admin patient view shows «لا أعلم» for
  that patient.
- Doctor details: existing doctors without a biography display correctly and no empty biography section appears.
- Responsive layout: registration at 320px, doctor navigation at 1400px and 1500px, and admin tabs and layout at 375px passed. The browser, the theme, and
  whether these were done in a browser's responsive mode or on real devices are not recorded; they are **not** counted as real-device tests. Dark mode
  and other widths for the admin tab bar are not recorded.

**B. Offline results [Verified: offline]:**
- Backend tests (fake databases, no PostgreSQL): **latest complete `npm test` run, 2026-10-29, after fixes A-E: 130 passed, 0 failed, 0 skipped.** The earlier
  figures (the owner's 112/112 before the Stage 6 fixes, and 115/115 in a run of 11 of the 14 test files after them) are superseded. This run added two
  tests (subject limits; biography present, null, and absent from the list) to the previous 128 and updated the affected contact and catalog tests.
- Frontend validation harness (copies of the pure utilities in a scratchpad, outside the repository): **11/11 passed** (subject limits and control
  characters, blood type empty/unknown/eight groups, the corrected overdue message).
- Frontend: 98/98 UI tests and 48/48 responsive checks were reported before Stage 6 (owner-reported).
  In Stage 6, a Node logic check of `passwordChangeValidation.js` and `redirect.js` (copied to a scratchpad) passed 21/21, and the production build passed
  (110 modules; it passed again with 110 modules after fixes A-E). The frontend 98/98 and 48/48 figures come from the owner's task description; their scripts are not in the repository.
- Stages 3C-3E were originally closed on offline evidence only (static checks, headless-Chrome harness renders, mocked-API logic harness, builds of 85, 90,
  and 95 modules).
- The SQL tests in `backend/db/tests/` were not re-run.

**C. Not verified / unresolved:**
- The doctor biography **displayed with actual biography text** (only the no-biography case was confirmed; the backend and harness logic is offline-tested).
- The booking restriction notice **triggered by a real pending change** (offline-tested logic only; the notice first appears on the day after the change is
  created, because the change takes effect at the start of day C+14 and the window is C..C+13).
- **F1:** the live execution of an overdue pending change after the F1 fix (needs a database write on `afiyah_test` and the owner's separate
  authorization; the cloned-database procedure that was proposed was **not approved**).
- **Cross-browser testing** (Safari, Firefox, Edge) and **real-device and screen-reader** accessibility and responsiveness checks; the browser used for the
  owner's live tests is not recorded. Desktop or emulated responsive checks are not real-device tests.
- The patient/doctor/admin browser cross-checks the owner has not listed (for example the 429 message, session expiry, the booking-window edge, and
  the previous-appointments section, which needs time to pass), and the admin tab bar in dark mode and at widths other than 375px.
- The SQL tests (`backend/db/tests/`) were not re-run (the integration test `t2f` also requires empty tables).

## Backend and database (repository evidence only)
The implementation is described in `CLAUDE.md` ("Backend and database"): Express 5 backend with cookie-based JWT sessions and role guards, API routes for
public catalog, authentication, patient, doctor (read-only), admin catalog and views, and contact; SQL scripts `001-006` (six tables with `CHECK`
constraints, seven helper functions, unique and partial indexes, booking and pending-change triggers, the pending-change executor, and `afiyah_app`
privileges); SQLSTATE codes `AF102`-`AF114` and `AF120`-`AF122`. The pending-change executor runs at backend startup **and, since the Stage 6 fix, before the
requests that depend on pending-change state** (`middleware/dueChanges.js`; see "Stage 6 log"). A catalog seed script exists at `backend/db/seed/001_catalog.sql`.
- `_guard.sql`, included by every schema, test, and verify script, aborts unless the connected database is exactly `afiyah_test` and the user is `omarsh`
  [Verified in the file].
- **Existence is not execution.** [Superseded 2026-10-29 for the items the owner has since reported] Owner-reported: the local `afiyah_test` database holds
  the schema, the initial catalog of 19 specialties and 61 doctors, and the administrator account; SMTP for the contact form is configured and delivery
  works (Stage 6). Claude did not query the database. Still not claimed: a fresh complete result of the backend test suite or of the SQL tests.

## Stages 3C-3E: what was built (2026-10-28)
- **3C [Verified in code]:** `AuthProvider` / `useAuth` restore the session from `GET /api/auth/me`; login, registration, and logout call the backend; a 401
  `UNAUTHENTICATED` clears the signed-in state; `RequireRole` and `GuestOnly` guard routes; `utils/redirect.js` keeps `next` safe and sends each role home
  (`/` patient, `/doctor`, `/admin`). A7 and A8 keep their approved designs.
- **3D [Verified in code]:** `api/appointments.js` (availability, create, list, cancel) and `api/patient.js` (profile, update, change password);
  `utils/appointments.js`; A6 confirms real bookings (visitors go to `/login` with a safe `next`; success notice «تم حجز موعدك بنجاح.»; server refusals shown
  and availability refreshed); My Appointments groups by the server's `phase` and cancels with a two-step inline confirmation only when `canCancel`; the
  profile edits only first name, last name, phone, and address, keeps the navbar name in sync after a successful save, and changes the password with the
  existing validators. Navbar links «مواعيدي» and «ملفي الشخصي» (patients only).
- **3E [Verified in code]:** `api/doctorPortal.js` (GET only), `DoctorAppointmentItem`, the two doctor pages, and `doctor-portal.css`. `/doctor` has day
  (default) and week views with previous/next/today navigation and the view and date in the URL; `/doctor/appointments` lists upcoming (today to
  today+30) and past appointments (31-day windows; «عرض مواعيد أقدم» loads older windows and hides after an empty one). Cancelled appointments are not shown
  (the doctor endpoints return booked appointments only), phones are plain text, and the greeting has the name only (no endpoint exposes the specialty).
- **Navbar fix [offline harness]:** before the fix, the patient and doctor bars overflowed the page at 992px (by 69px and 52px), and the patient bar at 1100px
  and 1200px (15px and 5px; larger with a long name). After the fix (menu below 1400px for those two roles), there was no overflow at 992, 1100, 1200,
  1399, and 1400px for either role, with short and long names; the admin bar was unchanged; the mobile bar and open menu fitted at 375px and 320px. Limits: the
  open menu was simulated by adding its class; taps, focus trapping, and the keyboard were not tested; the 768px and 500px widths were not re-measured.
- **Doctor appointment boundary fix [offline harness with a mock backend]:** the old design fetched today in two overlapping parallel requests, which
  could duplicate or drop an appointment starting between them (both orders were reproduced). Now the past request ends yesterday and the other starts
  today, both within 31 days; after the fix, five boundary scenarios (including both processing orders) gave no duplicate and no omission, and the exact
  start-time boundary follows the backend's `phase`.

## Stage 3F: what was built (2026-10-29; recorded from the repository, closed by the owner)
- **[Verified in code]** `components/admin/AdminLayout.jsx` (page header, a tab bar built from `ADMIN_SECTIONS`, and the section page), `PendingBadge.jsx`,
  `api/admin.js`, `utils/adminValidation.js`, `utils/pendingChanges.js`, `styles/admin.css`, and six pages in `pages/admin/`: home (pending-change
  summary and section cards), specialties, doctors, patients (read-only, paged), appointments (read-only, paged, filter by date or doctor), and pending
  changes (list and cancel). Additions are immediate (201); edits and deletions register deferred requests (202) that show their effective date; the
  doctor form omits the specialty on edit; a specialty with doctors cannot be deleted.
- Closure was confirmed by the owner; the original 3F plan and approval are not recorded in the repository.
- Live use of the specialty, doctor, patient, appointment, and pending-change sections is [Owner-reported: live] (see "Verification status").

## Stage 6 log: live integration and functional verification (2026-10-29)
Stage 6 verifies the running application against the approved requirements and fixes confirmed defects only. The **final comprehensive verification
against the graduation report is a separate phase** (when this log was written it had not started; **[Superseded 2026-10-29]** it was then performed and is
PARTIALLY VERIFIED: see "Final compliance fixes A-E" and "Verification status").

**1. Read-only QA review by Claude (no files changed).** It covered the backend source, the SQL scripts `001`-`006`, the test titles, the frontend
authentication, routing, patient and admin code, and the report text. Result: two confirmed defects (below); backend validation, authorization, role
isolation, transactions, database-level booking rules, SQL-injection and XSS exposure, cookie and Origin handling, and the frontend guards showed **no
issues**. The review recorded areas it did not read line by line: the booking, registration, and several public and doctor pages, and all styling.

**2. F1 (HIGH), fixed, offline-verified only.** Due pending changes were executed only at backend startup. On a running server, after a change's effective
date the change stayed unapplied, the admin could no longer cancel it, and every date for the affected doctor (or all doctors in the specialty) was blocked
(AF106) until the next restart. Fix: `middleware/dueChanges.js` runs `runDuePendingChanges` before `/specialties`, `/doctors`, `/appointments`, `/doctor`,
`/admin`, `POST /auth/login`, and `GET /auth/me`; `server.js` injects it through `createApp({ processDueChanges })` (default no-op); a failure returns 503
`TRY_AGAIN` and the route does not run. The 14-day rules, the SQL, and the transactions are unchanged. Offline tests (`dueChanges.test.js`): the processor
runs first and once on nine route patterns, never on six independent routes, failures are handled safely without leaking details, and `server.js` wiring is
checked. **Live verification (an overdue change applied by the next request) has not been done**; it needs a database write on `afiyah_test` and the owner's
separate authorization.

**3. F2 (LOW), fixed, offline-verified.** The login rate limit (10 per 15 minutes) counted successful logins. Now only failed attempts count
(`skipSuccessfulRequests: true` on the login limiter only; the helper passes the option through). Test added in `auth.test.js`.

**4. Doctor password change.** The backend already allowed doctors on `POST /api/auth/change-password`; no UI existed. Not specified and not excluded by the
report (`CLAUDE.md` already treats a doctor's own password change as immediate). Added: the shared `components/auth/PasswordChangeForm` (extracted from the
patient profile page with its body unchanged), `pages/doctor/DoctorPasswordPage.jsx`, the route `/doctor/password`, and a third doctor navbar link
«كلمة المرور». No profile editor and no new permissions.

**5. Admin password change.** The backend now also allows the admin on the same endpoint (own password only). Because admin accounts are created with at
least 12 characters, the backend requires **at least 12 characters for the admin** (from the session role; patient and doctor keep 8). The shared form takes an
optional `minLength` prop (admin page passes 12); `pages/admin/AdminPasswordPage.jsx`, the route `/admin/password`, and a seventh admin tab «كلمة المرور» were
added. Offline tests: role-specific minimums, the admin's other rules, and only the admin's hash changing (`profile.test.js`).

**6. Incident: stale backend process.** The first live attempt returned «ليس لديك صلاحية للوصول إلى هذا المورد.» for the admin. Cause (process table and
listening port, read-only): an older `node src/server.js` from the previous day still held port 3001 and served pre-fix code, while the new `npm run dev`
could not bind. No code defect. The owner has since reported the password changes (patient, doctor, admin) passing [Owner-reported: live]. Lesson recorded in
`CLAUDE.md`: confirm a single, newly started backend process before debugging live behaviour.

**7. Contact Us email.** The code path needed no change; only the six SMTP variables had to be set in `backend/.env` (names are listed in `CLAUDE.md`; values
are never recorded). [Owner-reported: live] The backend now reports `contact form email: configured`, and a real submission was delivered to the
administration Gmail inbox. Limits: startup does not test the credentials, a failed send is not stored, inbox delivery depends on spam filtering, and the
rate limit is 5 messages per hour per IP.

**8. Open items from Stage 6** (status updated 2026-10-29; the original wording is kept as history):
- [RESOLVED, fix E] `OVERDUE_MESSAGE` in `frontend/src/utils/pendingChanges.js` said overdue requests are processed "when the clinic server is started".
  It was replaced with an accurate message (see "Final compliance fixes A-E"). The "حان موعدها ولم تُعالَج" counter label on the admin home was not changed.
- [RESOLVED as owner-reported, not real-device] Responsive checks for the doctor navbar with three links (1400px and 1500px passed) and the admin tab bar
  (375px passed); dark mode and other widths for the admin tabs are not recorded.
- [PARTLY RESOLVED] A fresh complete backend `npm test` result now exists (130 passed, 0 failed, 0 skipped). **Live verification of F1 (above) is still open.**
- [RESOLVED in code, fix C; not verified with a real pending change] When a pending change restricted a doctor's booking dates, the booking page showed fewer or
  no days without an explanation; it now shows an Arabic notice built from `bookingRestrictedFrom`.
- The admin password rule exists in two places: the backend constant (authoritative) and the frontend copy used for the hint and early validation.
- Existing deferred items below that were not resolved remain open; none was silently closed.

## Final compliance fixes A-E (2026-10-29) [Owner-approved; implemented]
Five confirmed deviations from the frozen report (`تقرير المشروع معدل.docx`, not modified) were corrected in one focused pass. The owner explicitly authorized the
minimum necessary changes to the locked A5, A6, A8, and A10 for these corrections only. No schema, scheduling, authentication, or authorization rule changed.
- **A. Contact subject** (functional requirement 12, use case 13). The form now has four required fields: name, email, subject, message. Subject: free text,
  3-100 characters, trimmed with inner whitespace collapsed, control characters (including CR and LF) rejected, validated in the browser and on the server. The
  email subject is `رسالة جديدة من نموذج تواصل معنا: <الموضوع>` and the body has an «الموضوع:» line. SMTP settings, sender, Reply-To, and the 5-per-hour rate
  limit are unchanged.
- **B. Doctor biography** (functional requirement 4). `GET /api/doctors/:id` returns `biography` (text or null); the list endpoint is unchanged. A5 shows a
  «نبذة تعريفية» row only when it is non-empty, as plain text. No existing doctor was given a biography (all 61 seeded doctors have NULL).
- **C. Booking restriction notice** (use case 6). A6 shows an Arabic note above the date picker, in both the normal and the empty states, when
  `bookingRestrictedFrom` is set: no appointments are available from {date} because of a scheduled administrative change affecting the doctor or the specialty.
  It uses the existing date formatter and `af-note` style; booking rules are untouched.
- **D. Optional blood type** (use case 1; `patients.blood_type` optional). Registration accepts an empty value, «لا أعلم», and the eight blood groups. The note
  reads «جميع الحقول مطلوبة عدا زمرة الدم» and the placeholder «اختر زمرة الدم (اختياري)». The backend already stored NULL for empty and unknown values; no
  backend or schema change.
- **E. Overdue message.** The text now describes automatic processing of due changes by the first relevant request; the stale comment in
  `AdminPendingChangesPage.jsx` was corrected. The executor and `dueChanges` middleware were not modified.
- **Files changed.** Backend: `src/validation/contact.js`, `src/services/mailer.js`, `src/repositories/catalogRepository.js`, `src/routes/doctors.js`,
  `test/contact.test.js`, `test/catalog.test.js`. Frontend: `utils/contactValidation.js`, `api/contact.js`, `pages/public/ContactPage.jsx`,
  `pages/public/DoctorDetailsPage.jsx`, `api/doctors.js` (comment only), `pages/public/AppointmentBookingPage.jsx`, `utils/registrationValidation.js`,
  `pages/public/RegisterPage.jsx`, `utils/pendingChanges.js`, `pages/admin/AdminPendingChangesPage.jsx` (comment only).
- **Automated results [Verified: offline].** Backend complete `npm test`: 130 passed, 0 failed, 0 skipped. Frontend validation harness: 11/11. Production
  build: successful, 110 modules, no warnings or errors.
- **Manual results [Owner-reported: live]** and **unverified scenarios**: see "Verification status", parts A2 and C. In short, not verified: biography with real
  text, the restriction notice with a real pending change, F1 live execution, and cross-browser and real-device checks.
- **Status of the final verification: PERFORMED — PARTIALLY VERIFIED** (not "not started", not fully completed).

## Approved six-table schema and decisions [Report / Owner-approved]
The full table definitions and the deferred-change rules are in `CLAUDE.md` ("Approved database schema" and "Deferred administrative changes").
- **Decisions recorded in Stage 1A [Owner-approved]:** exactly six tables and no `schema_migrations` table; `years_of_experience` as the column name; allowed
  values `update` and `delete` for `change_type` and `pending`, `executed`, `cancelled`, and `failed` for `status`; «لا أعلم» is stored as SQL NULL in
  `patients.blood_type`; emails are lower-cased in application logic; every foreign key is `RESTRICT` / `NO ACTION` except
  `pending_changes.specialty_id` with `ON DELETE CASCADE` (deleting a specialty also removes its pending-change history, which is not required to
  be preserved); `pending_changes` is the only persistence for deferred changes.
- **Report inconsistencies adapted without touching the report:** the definition table spells `years_of_experince` (implementation uses
  `years_of_experience`); the attribute list has the typos `bioghraphy` and `chang_type` (the definition table's `biography` and `change_type`
  govern); the appointment `status` attribute description was copied from the account status (the definition table's `booked` / `cancelled` governs);
  `address` is mandatory in the registration use case but optional in the definition table (the frontend requires it, which is compatible).
- **Technical review of the `ON DELETE CASCADE` design (no blocking problem found):** a due specialty deletion can run in one transaction even though
  deleting the specialty also deletes its own pending row; a concurrent cancel updates zero rows; a concurrent doctor insert is serialized by the foreign-key
  locks; a failure is recorded as `failed` in the same transaction. Consequences accepted by the owner: a successfully deleted specialty keeps no record of
  its execution, and a raw `DELETE` of a specialty would also remove its pending rows, so deletions must go only through the deferred flow.
- **Implemented in the repository SQL [Verified in the files; execution not verified]** (previously listed as open proposals): `CHECK` constraints (exactly
  one pending-change target; allowed `role`, `change_type`, and `status` values; `new_data` shape through a whitelist function; `execute_at`;
  `failure_reason`), partial unique indexes (one admin; one booked appointment per doctor slot and per patient slot; one pending change per doctor and per
  specialty), booking triggers (overlap, booking horizon, and specialty immutability), and the pending-change guard, executor, and cancel function.
- **Future frontend review items [RESOLVED 2026-10-29: all four were implemented as fixes A-D with the owner's approval; see "Final compliance fixes A-E". The table below is kept as history, and its "Approved frontend" column describes the state before the fixes]:**

| Item | Report | Approved frontend |
|---|---|---|
| Contact subject | The contact form includes name, email, subject, and message (functional requirement 12, use case 13) | A10 has name, email, and message only |
| Doctor biography | `doctors.biography` exists and doctor information includes introductory details | A5 shows no biography |
| Pending-change message | Availability shows an explanatory message when a pending change restricts booking (use case 6) | A6 has no such message (the API supplies `bookingRestrictedFrom`) |
| Blood type | Optional: may be left unselected or set to unknown | A8 requires a choice, including «لا أعلم» (stored as NULL either way) |

Booking, cancellation, and message-sent success messages (use cases 7, 9, 13) now exist in the integrated pages.

## A1 Hero: final state [Owner-approved; locked]
The owner visually approved the redesigned Hero. **Do not change it without an explicit owner request.**
Implementation, as found in the code [Verified]:
- Files: `src/pages/public/HomePage.jsx` (Hero markup) and `src/styles/home.css` (`.af-hero*` rules).
- Background is the existing `public/images/hero-charitable-clinic.jpg` (1376x768 JPEG, 795 KB) as a full-section
  `cover` background, positioned `42% 60%` below 992px and `center 60%` from 992px. Layers from the top:
  a soft corner scrim behind the logo, a dark teal text-side scrim, the photograph, and a dark gradient fallback
  if the image fails to load. On desktop the scrim is strongest on the right (RTL text side) and fades toward the left.
- The large green decorative panel and its three chips were removed (no remaining references in `src`).
- A standalone white heart logo (`LogoMark`, class `af-hero-logo`) sits at the top-left (`inset-inline-end` in RTL),
  48px below 768px, 64px from 768px, 96px from 992px, with a soft drop shadow and no card or border.
- The Hero scopes a light-text palette (white heading, light lead and kicker, white-bordered buttons, white focus ring)
  in both light and dark themes. Hero height is unchanged (505px on desktop, 460.06px at 390px).
- Buttons, labels, Arabic wording and destinations are unchanged: "احجز موعداً" goes to `/doctors` and
  "تصفّح التخصصات" goes to `/specialties`.

Verification run in this workflow (headless Chrome driven over the DevTools Protocol with viewport emulation) [Verified].
These results were measured against the original Hero image (1376x768 JPEG, 795 KB). The image file was later replaced
outside this workflow; see "Asset changes detected after A5 testing" below for the re-run against the current file.
- 96 contrast checks over widths 320, 390, 768, 991, 1024, 1440 in light and dark: **0 failures**. Text (kicker,
  heading, lead, outline-button text) was measured against the worst-case rendered backdrop pixel behind each text
  line and is at least 4.5:1. Button borders, the focus ring, and the logo are at least 3:1.
- No horizontal overflow, and no overlap between the logo and any text, at all six widths.
- The photograph loads (HTTP 200, decodes at 1376x768). No console errors on the Home page.
- Real mouse clicks on both Hero buttons navigate correctly. Keyboard Tab reaches both buttons with a visible focus state, in both themes.
- Limits: tested in Chrome only, with emulated viewports (not real devices, Safari, or Firefox). Layout was inspected
  visually in screenshots at 1440 (light and dark), 768 (dark) and 390 (light), and the numeric checks cover the rest.

## A4 Doctors Directory and doctor images [Owner-approved; complete]
- Exactly **61 doctor records**, each with its own image. [Verified]
- Image files in `public/images/doctors/` intentionally have mixed extensions [Verified]:
  **53 `.png`** (1278x1230), **7 `.jpg`** (ids 14, 15, 16, 17, 19, 21, 29; 1024x1024), and **1 JPEG named
  `doctor-18.jpg.jpg`** (id 18, 1024x1024; real JPEG, referenced exactly as named). No files are missing or duplicated.
  (At the time of this check every extension matched its content. Two files were later found with mismatched content; see
  "Asset changes detected after A5 testing" below.)
- Fix: `src/mock/doctors.js` previously built `doctor-NN.jpg` for every doctor, so 54 of 61 paths failed and showed
  the fallback avatar. It now defaults to `doctor-NN.png` with an explicit override map for the JPEG files. 54 paths
  changed; the doctor records, names, IDs, specialties and other data are unchanged. No image file was modified. [Verified]
- Verification [Verified]: all 61 records point to distinct existing files; all 61 URLs return HTTP 200 (53 `image/png`,
  8 `image/jpeg`); in the browser the Doctors page showed 61 cards, 61 images loaded, 0 fallback avatars, no overflow
  and no console errors at 1440px and 390px in both light and dark themes; the 4 featured doctors on Home also load.
- Directory behavior re-checked this session [Verified]: Arabic name search works (e.g. "بتول", "د. بتول", and variants
  "الاء" for "آلاء" and "اسماء" for "أسماء" each return exactly 1 doctor; no match shows the empty state);
  `?specialty=14` (طب العيون) shows 5 doctors with the select set to 14; an invalid `?specialty=999` shows all 61, cleans
  the URL and shows the notice; specialty plus name search combine (AND).

## A5 Doctor Details [Owner-approved; complete]
The owner visually reviewed and approved A5 (implementation, functionality, responsive design, and both themes).
**Do not change it without an explicit owner request.**
*Update after A6:* the booking-button wording below describes A5 as approved; that button has since been connected to A6
(the only change to A5 for A6, see the A6 section). The statements about a "temporary" button are kept as history and are superseded.

Implementation, as found in the code [Verified]:
- **Files created:** `src/pages/public/DoctorDetailsPage.jsx` and `src/styles/doctor-details.css`.
  **Files modified:** `src/App.jsx` (route connected; the stale "temporary routes" comment corrected), `src/main.jsx`
  (stylesheet import), `src/api/doctors.js`, `src/utils/constants.js`, and `src/components/cards/DoctorCard.jsx` (label only).
  `src/mock/doctors.js`, the images, the Hero, and the other pages were not touched.
- **Data:** `fetchDoctorById(id)` in `src/api/doctors.js` returns the public doctor object, or `null` for a missing or
  inactive doctor. The existing mapping was extracted into a private helper `toPublicDoctor` shared with `fetchDoctors`,
  whose behavior is unchanged. Public-data restrictions are preserved (no birth date, no phone). New constant:
  `BOOKING_WINDOW_DAYS = 14`.
- **Content:** header with breadcrumb (الرئيسية ‹ الأطباء ‹ name), the doctor's name as the single H1 and the specialty as the
  subtitle; portrait (`DoctorAvatar`, fallback icon retained); "معلومات الطبيب" card (name, specialty as a link to
  `/doctors?specialty=ID`, age, years of experience; age display approved by the owner); "الدوام والمواعيد" card (Saturday – Thursday,
  Friday off, 9:00 ص – 5:00 م بتوقيت دمشق, appointment duration from the specialty, booking window of 14 days); and a
  "حجز موعد" card with the booking button. No phone, email, biography, qualifications, ratings, or doctor-specific schedules are shown.
  **[Update 2026-10-29, fix B: superseded in part]** A5 now shows an optional «نبذة تعريفية» row, only when the doctor has a non-empty biography; phone and
  email are still not shown. Display with a real biography is not manually verified.
- **States:** loading skeleton that mirrors the real layout; invalid ids (via `parsePositiveIntParam`) and unknown or inactive
  doctors show a not-found state with a link back to the directory; data errors use `ErrorState` with working retry.
  The inner component is keyed on the id so changing doctors starts fresh. Document title is "name | عافية".
- **Layout:** two columns from 992px with the portrait on the right (RTL); a single column below that (portrait, information,
  schedule, booking), portrait capped at 320px and centered, button full-width on narrow screens. Existing tokens and classes
  are reused, so both themes work.
- **A4 card button:** the label «الملف والمواعيد» was replaced by «عرض التفاصيل». Its link to `/doctors/:id`, its layout,
  styling, and all other A4 behavior are unchanged (this was the only approved change to A4).
- **Accessibility note:** `DoctorAvatar` fixes `alt=""` and was outside the authorized files, so the portrait frame carries
  `role="img"` and an Arabic `aria-label` ("صورة" plus the doctor's name).

**[Superseded by A6] The booking button was temporary when A5 was approved.** «احجز موعداً» was a real `<button>` that navigated
nowhere and booked nothing; clicking it revealed the note "سيُربط هذا الزر بصفحة حجز الموعد عند تنفيذها." in a live region. It was
isolated in `BookingAction` so it could be replaced by a link later. That replacement is now done (see A6).

Verification run in this workflow (headless Chrome driven over the DevTools Protocol, with viewport emulation) [Verified]:
- **All 61 doctors:** each page matched the mock data (name, specialty, age, experience, appointment duration, image loaded
  with no fallback, specialty link, document title). 0 mismatches and no console problems.
- **Invalid and unknown ids** `abc`, `0`, `-1`, `003`, `3.5`, `1e1`, `62`, `99999999999999999999`, and `%20` all show the not-found state with one H1.
- **Navigation:** A4 → A5 (correct doctor), Back and Forward, breadcrumb to the directory and Home, specialty link (lands on
  `?specialty=14` with the select set and 5 doctors), Back from there, and in-app switching between ids (skeleton shown, then the new doctor).
- **Booking button:** a `<button>` with no `href`; after a mouse click the URL is unchanged and the note appears in a `role="status"` region.
- **Error and retry:** a failure was injected in the browser by intercepting the API module (no file was modified); the error state
  appeared with its retry button and link, and retry recovered the page.
- **Responsive and themes:** widths 320, 390, 768, 1024, 1440 in light and dark: no horizontal overflow, no card overlap, one H1,
  portrait on the right at the tested desktop widths (1024 and 1440) and stacked at the narrower ones, no image distortion (`object-fit: cover`), direction RTL. Minimum text contrast
  (computed from the real colors on solid backgrounds, worst of the header gradient's two ends) was 4.84:1 in light and 5.25:1 in dark.
  Keyboard tab order is breadcrumb links → specialty link → booking button, with a visible focus state in both themes.
- **Loading shift:** skeleton and loaded content heights were identical (1017px at 1440, 1345px at 390; header heights equal).
- **Regression:** A4 still shows 61 cards with 61 images loaded and 0 fallbacks at 1440 and 390 in both themes; Arabic search and
  specialty filtering still work; all 61 «عرض التفاصيل» buttons link to `/doctors/N`; the 4 featured doctors on Home load; all 61
  image paths still resolve; `home.css` and `HomePage.jsx` (the Hero) have unchanged modification times; no image had a
  modification time in this work at the time of that check (images changed afterwards, outside this workflow; see the next section).
- `npm run build` succeeded (Vite 8.3.5, 65 modules, no warnings or errors printed), written to a temporary directory.
- Limits: Chrome only, emulated viewports (not real devices, Safari, or Firefox); contrast was computed from styles, not sampled from
  pixels; A2, A3, and A9 were not re-screenshotted (their files were not changed).

## Asset changes detected after A5 testing [Verified by inspection on 2026-10-25, 16:30]
While updating this document, two image files were found to differ from what had been tested. They were **not changed by
Claude or this workflow**; most likely the owner replaced them. No image file was modified by this documentation task.
- **Hero image:** `public/images/hero-charitable-clinic.jpg` is now a **1679x937 PNG-format file (2,142,361 bytes) that keeps
  the `.jpg` name**; it was a 1376x768 JPEG of 795,122 bytes when the Hero was tested and approved. The aspect ratio is
  nearly the same (about 1.79:1), so the existing `cover` positioning still applies. The Hero code is unchanged.
- **Doctor images for ids 17 and 44 appear swapped:** `doctor-17.jpg` now contains PNG data (1278x1230, 1,903,996 bytes) and
  `doctor-44.png` now contains JPEG data (1024x1024, 651,192 bytes), i.e. the contents moved but the filenames did not.
  Filenames and counts by name are unchanged (53 `.png`, 7 `.jpg`, 1 `.jpg.jpg`; 61 files); by actual content there are still
  53 PNG and 8 JPEG. `src/mock/doctors.js` is unchanged and still points at the same filenames.
- **Re-verification against the current files (read-only):**
  - Hero: the same 96 contrast and layout checks were re-run at widths 320, 390, 768, 991, 1024, 1440 in light and dark:
    **0 failures** (text at least 4.5:1; button borders, focus ring, and logo at least 3:1), no horizontal overflow, no
    logo/text overlap, Hero height unchanged (505px desktop, 460.06px at 390px), and the photo loads (HTTP 200, 1679x937).
  - Doctors: A4 shows 61 cards with 61 images loaded and 0 fallbacks; A5 loads correctly for ids 17, 44, and 18.
- **Risk to note, not fixed:** two files (the Hero image and `doctor-17.jpg`) have a JPEG extension on PNG content, and
  `doctor-44.png` has a PNG extension on JPEG content. The dev server labels them by extension and Chrome still displays them
  by sniffing the content; stricter servers or headers (for example `X-Content-Type-Options: nosniff`) could reject them.
  Whether to correct the names or formats is the owner's decision (images must not be renamed, converted, or modified without approval).
- Whether the doctor-17 / doctor-44 swap resolved the earlier photo/name mismatch noted for id 17 has **not been reviewed**.

## A6 Appointment Booking [Owner-approved; design locked; history: frontend-only with mock availability, now integrated]
> **[Superseded in part, 2026-10-28]** This section records A6 as approved while it was frontend-only. The visual design and the validation rules below remain approved and
> locked, but the "frontend-only", "no request", and "not implemented / pending" statements (and the mock or informational notices) are **history**: A6 now uses the real
> backend (see "Stages 3C-3E: what was built"). Its test results below are historical and were not re-run.
The owner visually reviewed and approved A6 (implementation, behaviour, responsive layouts, and both themes). It is an approved
frontend milestone: **do not change it without an explicit owner request.** Backend, authentication, and real booking are **not** part of it.

Implementation, as found in the code [Verified]:
- **Files created:** `frontend/src/pages/public/AppointmentBookingPage.jsx`, `frontend/src/styles/appointment-booking.css`,
  `frontend/src/utils/schedule.js`, `frontend/src/api/appointments.js`, `frontend/src/mock/appointments.js`.
- **Files modified:** `frontend/src/utils/constants.js` (added `CLINIC_TIME_ZONE = 'Asia/Damascus'` and `CLOSED_WEEKDAY = 5`),
  `frontend/src/App.jsx` (route `/doctors/:id/book`), `frontend/src/main.jsx` (stylesheet import), and
  `frontend/src/pages/public/DoctorDetailsPage.jsx` (A5's «احجز موعداً» button now navigates to A6; nothing else on A5 changed).
  No image, doctor or specialty record, other page, or dependency was changed.
- **Rules implemented:** unified hours 09:00–17:00, Saturday–Thursday; Friday visible but disabled and labelled «عطلة»; all day and time
  calculations in Asia/Damascus using native `Intl` (no date library, independent of the browser's time zone); a window of exactly
  **14 calendar dates starting with today in Damascus**; slots that already started today are hidden; slots are generated from the
  doctor's specialty `appointmentDuration` and never extend past 17:00 (durations that do not divide 480 minutes work; an invalid or
  missing duration is a data error shown with retry).
- **Interface:** doctor strip (photo, name, specialty, duration); demo notice «المواعيد المعروضة تجريبية»; date picker (responsive grid
  of native radio inputs; Friday disabled; days with no available slot show «لا مواعيد» but stay selectable to show why); slot grid
  (Arabic 12-hour times with Western digits); booked slots tinted, disabled, struck through, with hidden «محجوز» text; selected slot filled
  with a check icon; summary card (doctor, specialty, date, time range, duration, hint, «تأكيد الحجز»). Two columns on desktop (main
  content on the right, sticky summary on the left) and one column on mobile. The first date with an available future slot is
  preselected; no slot is preselected.
- **URL state:** `?date=YYYY-MM-DD&time=HH:mm`, written with `replace` and with a literal colon, validated on load. Invalid, booked,
  expired, Friday, and out-of-window values are rejected and the URL is cleaned (with a notice when a real request was dropped);
  a time is accepted only together with its own valid date; changing the date clears the time.
- **States:** loading skeleton, not-found (invalid, unknown, or inactive doctor), error with retry, a window-wide empty state when nothing
  is available, and per-day messages (all booked; day finished).
- **Mock availability** (`mock/appointments.js`; explicit and deterministic, no randomness, no patient data, same for every doctor),
  chosen by weekday: Saturday, Tuesday, Thursday = mixed (slots #1, 3, 4, 8 of the day are booked); Sunday, Wednesday = all
  available; Monday = fully booked; Friday = closed. Booked flags follow the slot's position in the full day, so they stay the same as
  earlier slots pass.
- **Confirm button:** enabled only for a valid selection. On click it re-fetches mock availability and rejects a slot that is no longer
  valid ("لم يعد هذا الموعد متاحاً", selection cleared); otherwise it shows the neutral notice that confirmation requires login and
  server integration that are not implemented yet and that **no appointment was saved**. It never shows a success message and stores nothing.

**Not implemented (backend-dependent, pending) [Pending]:** real appointment booking and database persistence; real availability from
a backend; authentication and authorization (including rejecting doctor and manager accounts as patients); login and registration
redirects and return-to-booking behaviour (no `next` parameters exist); prevention of double booking of a doctor's slot and of
overlapping active appointments for the same patient (the backend and PostgreSQL must enforce this; frontend checks are not protection);
appointment cancellation and making cancelled slots available again.

**Known limitation (accepted for the frontend-only phase):** availability does not refresh automatically while the page remains
open, so a slot that passes in time can stay visible. A fresh availability check happens when «تأكيد الحجز» is pressed. This must be
revisited during backend integration.

Test results reported from the A6 implementation task, run in this workflow with headless Chrome driven over the DevTools Protocol
(controlled clock and request interception; no project file was modified for testing). They were **not re-run during this documentation update**:
- **33 isolated logic checks** (schedule utility and availability API), identical under four browser time zones (Asia/Damascus,
  America/Los_Angeles, Pacific/Kiritimati, UTC): durations 20, 25, 30, 45, 480, 481, and invalid values; window boundaries; Friday;
  midnight rollover in Damascus; the 16:39/16:40 boundary; mock scenarios.
- **85 booking behaviour checks**: window and Friday, the three mock scenarios, selection and summary, URL restore and ten invalid-URL
  cases, no extra history entries, the neutral confirm notice (no success wording, nothing stored), a stale slot at confirm and a midnight
  rollover, A5 → A6 → A5 navigation and breadcrumb, and invalid or unknown doctor ids.
- **Edge-case scenarios, all passing:** after closing time; Friday as today; no availability in the whole window; durations 25, 45, 30,
  480, and 500 (no slot fits); invalid durations (null, 0, a string, 12.5) shown as an error with retry; an inactive doctor; a load failure
  with retry; and a failure during confirm.
- **65 responsive UI checks** at 320, 390, 768, 1024, and 1440px in light and dark: no horizontal overflow, no card overlap, one H1, RTL,
  correct two-column or stacked layout, tap targets of at least 44px, no clipped labels, legends inside their cards, active text contrast
  of at least 4.84:1 (light) and 5.25:1 (dark), one tab stop per radio group with a visible focus ring, arrow keys that skip Friday and
  booked slots, and identical results under four browser time zones.
- **Regression:** A5 for all 61 doctors (0 mismatches) and its loading skeleton height equal to the loaded page; A4 with 61 images
  loaded and 0 fallbacks at 1440 and 390 in both themes, plus its search; the 4 featured doctors on Home; the other public pages render in both
  themes with one H1, no overflow, and no console errors; the Hero intact; all 61 doctor image paths valid.
- **Production build** succeeded (Vite 8.3.5, 70 modules), written to a temporary directory.
- Limits: Chrome only with emulated viewports (not real devices, Safari, Firefox, or a real screen reader); contrast was computed from
  styles, not sampled from pixels; the A6 mock availability is not real availability.

## A7 Login Page [Owner-approved; design locked; history: frontend-only, now integrated]
> **[Superseded in part, 2026-10-28]** This section records A7 as approved while it was frontend-only. The visual design and the validation rules below remain approved and
> locked, but the "frontend-only", "no request", and "not implemented / pending" statements (and the mock or informational notices) are **history**: A7 now uses the real
> backend (see "Stages 3C-3E: what was built"). Its test results below are historical and were not re-run.
*Update after A8:* the page shell described below (card, tabs, illustration column, and the `useIsDesktop` hook) was moved unchanged into the shared `AuthLayout` during A8; `LoginPage.jsx` now holds only the heading, form, and notice, and `PasswordField.jsx` gained an optional `hint` prop. A7's behaviour and appearance are unchanged (see the A8 verification).
**A7 — Login Page: IMPLEMENTED, TESTED, VISUALLY APPROVED, AND LOCKED.** The owner visually reviewed and approved A7, including the
illustration's current appearance (its white background in dark mode is accepted and is **not** a pending issue). **Do not change it
without an explicit owner request.** Authentication itself is **not** part of it.

Implementation, as found in the code [Verified]:
- **Route:** `/login` (`LoginPage`). One unified form for patients, doctors, and the manager; **email and password only, no role
  selector**. The backend will later determine the role. No social login, SMS login, password recovery, or remember-me.
- **Files created:** `frontend/src/pages/public/LoginPage.jsx`, `frontend/src/components/auth/AuthTabs.jsx`,
  `frontend/src/components/auth/PasswordField.jsx`, `frontend/src/utils/validation.js`, `frontend/src/styles/auth.css`.
  **Files modified:** `frontend/src/App.jsx` (import and the `/login` element only) and `frontend/src/main.jsx` (stylesheet import).
  No other source file, image, or dependency was changed. **Illustration:** the existing
  `frontend/public/images/auth/login-illustration.jpeg` (owner-provided; unmodified).
- **Layout:** Arabic RTL, light and dark themes. Desktop (992px and up): the form card on the right and the illustration on the left
  (1:1, not cropped or stretched, on a white panel). **Below 992px the illustration is not rendered** (the `<img>` is created only when
  `matchMedia('(min-width: 992px)')` matches, so it is not downloaded on narrow screens) and the form is centred. The card starts with two
  equal-width links, «تسجيل الدخول» (active) and «إنشاء حساب» (to `/register`): plain router links with `aria-current`, not ARIA tabs.
  Then the H1 «مرحباً بعودتك إلى مجمع عافية», a short sentence, the form, and the status region.
- **Form:** email (`type="email"`, `autocomplete="username"`, LTR input) and password (`autocomplete="current-password"`) with a
  show/hide button (`type="button"`, 44×44px, fixed position inside the field, label switches between «إظهار كلمة المرور» and
  «إخفاء كلمة المرور»). `noValidate`, with custom Arabic errors (icon plus text, `aria-invalid` and `aria-describedby`). Email is trimmed,
  required, and format-checked; the password only has to be non-empty (no complexity rules, not trimmed). Errors clear when the field
  becomes valid; blur validation applies only to fields the user has typed in (or after a submit attempt); focus moves to the first invalid
  field after an invalid submit.
- **Submission is frontend-only.** A valid submission prevents the default, sends nothing, stores nothing, creates no session or JWT, infers
  no role, and does not redirect. It clears the password, hides it again, keeps the trimmed email, and shows in a `role="status"` region
  the informational notice «تسجيل الدخول الفعلي غير متاح بعد؛ سيتوفر بعد ربط النظام بالخادم. لم يتم تسجيل دخولك ولم تُحفظ أي بيانات.»
  The notice is not a success message and disappears on the next invalid submit. No fake loading state.
- **Illustration file:** it is a **PNG-encoded 1254x1254 file (about 1.25 MB) with a `.jpeg` extension**. It displays correctly in the tested
  browser (Chrome sniffs the content). The owner approved its appearance and did **not** authorize conversion, renaming, optimisation, or
  redesign (see also the extension/content mismatches under "Asset changes detected after A5 testing").

**Not implemented (backend-dependent, pending) [Pending]:** real authentication, sessions or tokens, credential verification, role
detection, role-based redirects, login errors from a server, and the return-to-booking behaviour (no `next` parameters; A6 is unchanged).

Verification run in this workflow with headless Chrome driven over the DevTools Protocol and **emulated viewports** (no project file was
modified for testing) [Verified]:
- **41 of 41 functional checks passed:** empty, missing-field, and invalid-email cases; whitespace trimming; error clearing; blur behaviour;
  password toggle (value kept, position stable, keyboard Enter and Space, no accidental submit, reset after a valid submit); Enter-key submit;
  informational notice; a 1-character password accepted; form semantics (no ARIA tab roles, one H1, labels, autocomplete, `required`).
- **No authentication behaviour:** no POST and no request carrying credentials, no URL parameters, nothing written to local or session storage
  or cookies, no success wording, no console errors.
- **213 of 213 automated responsive, layout, theme, and accessibility-related checks passed** at 320, 390, 768, 1024, and 1440px in light and
  dark: no horizontal overflow or clipped text, aligned inputs and tabs, inputs of about 48px, touch targets of at least 44px, text contrast of
  at least 4.5:1, normal input border contrast of about 3.4-3.6:1, RTL direction. The illustration appears from 992px up (left of the form, 1:1)
  and is absent below it, with **no network download of it at 320, 390, 768, and 991px**; it appears and disappears correctly on live resize.
  Visible focus rings were checked on the tabs, inputs, and toggle; a scoped outline was added for the submit button.
- **Navigation:** the existing Navbar links to `/login` and `/register`, the A7 «إنشاء حساب» link, browser Back and Forward, the logo, the public
  navigation links, the mobile menu, and the theme toggle all worked.
- **Regression:** Home, About, Specialties, Doctors, Doctor Details (including ids 17 and 44), Booking, Donations, Register, and Contact each had
  one H1, no overflow, and no broken images at 1440 and 390px in both themes; A4 showed 61 cards with 61 images loaded; the A4 → A5 → A6 click
  flow and A6 slot selection (`?date=&time=`) worked; the Hero height was unchanged (505px); no console or HTTP errors.
- **Production build** succeeded (Vite 8.3.5, 75 modules), written to a temporary directory.
- **Limits:** Chrome only, with emulated viewports. **Not tested:** real devices, Safari, Firefox, or a real screen reader. Contrast was computed
  from styles, not sampled from pixels.
- **Noted, not changed:** at 1024px the existing Navbar's own buttons wrap onto two lines. That is Navbar behaviour (outside A7) and was left as is.

## A8 Registration [Owner-approved; design locked; history: frontend-only, now integrated]
> **[Superseded in part, 2026-10-28]** This section records A8 as approved while it was frontend-only. The visual design and the validation rules below remain approved and
> locked, but the "frontend-only", "no request", and "not implemented / pending" statements (and the mock or informational notices) are **history**: A8 now uses the real
> backend (see "Stages 3C-3E: what was built"). Its test results below are historical and were not re-run.
> **[Update 2026-10-29, fix D: superseded in part]** Blood type is now **optional**: the sections below that say nine required fields, the note
> «جميع الحقول مطلوبة», or a required, disabled placeholder describe the state before the fix. Now: eight required fields, the note «جميع الحقول مطلوبة عدا زمرة الدم»,
> and the selectable placeholder «اختر زمرة الدم (اختياري)»; empty, «لا أعلم», and the eight groups are accepted, and empty or unknown is stored as NULL.
**A8 — Registration (إنشاء حساب): IMPLEMENTED, TESTED, VISUALLY APPROVED, AND LOCKED.** The owner completed the manual visual review and
approved A8, including the «لا أعلم» blood-type correction. **Do not change it without an explicit owner request.** Real account creation is
**not** part of it.

Implementation, as found in the code [Verified]:
- **Files created:** `frontend/src/components/auth/AuthLayout.jsx` (shared shell), `frontend/src/components/auth/AuthField.jsx` (label, control,
  optional hint, and error for the input, textarea, and select), `frontend/src/pages/public/RegisterPage.jsx`, and
  `frontend/src/utils/registrationValidation.js`. **Files modified:** `frontend/src/App.jsx` (the `login` and `register` routes now sit in one
  pathless `AuthLayout` route; no other route changed), `frontend/src/pages/public/LoginPage.jsx` (shell and `useIsDesktop` removed; form logic
  untouched), `frontend/src/components/auth/PasswordField.jsx` (optional `hint`; unchanged output without it), and `frontend/src/styles/auth.css`
  (A8 rules appended; the A7 rules are unchanged). `AuthTabs.jsx`, `validation.js`, `main.jsx`, `PublicLayout`, the Navbar and Footer, the images,
  and the documents were not touched by the implementation.
- **Shared authentication layout:** `/login` and `/register` are separate routes rendered inside the same `AuthLayout`. Switching is client-side
  React Router navigation with no full page reload; the card, tabs, and illustration stay mounted (the illustration `<img>` is the same DOM
  node and is not requested again). Opening `/register` directly shows the registration form with «إنشاء حساب» active. On `/login` the
  illustration keeps the approved A7 alignment; on `/register` it is top-aligned beside the taller form (a route-specific class,
  `af-auth-art-col--top`), in normal document flow with no `sticky` or `fixed` positioning. Below 992px the illustration is not rendered
  and not downloaded. The illustration file is unchanged and its dark-mode white background is the approved A7 appearance.
- **Content:** H1 «إنشاء حساب جديد», the lead «أنشئ حسابك كمريض للاستفادة من خدمات حجز المواعيد في مجمع عافية الطبي الخيري.», and the note
  «جميع الحقول مطلوبة». Patient-only, Arabic-only, RTL, light and dark themes. **Nine required fields**, in order: first name, last name,
  email, password, phone number, birthdate, residential address, gender, blood type. No confirm password, username, role selector, CAPTCHA,
  social or SMS login, or verification step; doctor and manager accounts are not created through public registration.
- **Layout:** from 576px up, three pairs sit in two columns (first name and last name; phone and birthdate; gender and blood type) with the
  first field on the right (RTL), and email, password, and address are full width; below 576px everything stacks. Controls are about 48px
  high; gender is two radio pills (at least 44px) in a `fieldset` with a `legend`; the password reuses `PasswordField` with the toggle and
  the hint «8 أحرف على الأقل» (`autoComplete="new-password"`).
- **Validation rules** (`registrationValidation.js`, plain JavaScript, no library; Arabic messages; `noValidate`):
  names 2-50 characters, Unicode letters and combining marks with inner spaces, hyphens, and apostrophes, no digits or symbols (trimmed,
  inner spaces collapsed); email via the existing shared `validateEmail`; password at least 8 characters (not trimmed, no complexity rules;
  the login `validatePassword` is unchanged); phone `09xxxxxxxx` with Arabic-Indic (٠-٩) and Persian (۰-۹) digits converted to Western digits
  on blur, rejecting inner spaces, hyphens, and country codes; birthdate a valid calendar date, not before `1900-01-01`, and strictly before
  today in **Asia/Damascus** (string comparison, never a local `Date`; the native input's `max` is yesterday in Damascus; a half-typed date
  gets its own message; no minimum-age or guardian rule); address required, trimmed, at most 200 characters; gender `male` or `female`;
  blood type one of eight ABO/Rh values **or «لا أعلم»**. All fields validate on submit with focus on the first invalid control; touched
  fields validate on blur; errors clear when valid; untouched fields show no error when tabbed over.
- **Blood type «لا أعلم» (final owner-approved correction):** the field is still required and its placeholder «اختر زمرة الدم» is unchanged
  (disabled, empty value), so an unselected field still shows the existing required error. The ninth option «لا أعلم» has the internal value
  `unknown` (`BLOOD_TYPE_UNKNOWN`), distinct from the empty value and from all eight ABO/Rh values, and validation accepts it. `BLOOD_TYPES`
  still holds only the eight real blood types, and «لا أعلم» is never treated as, or converted to, a blood type. In Phase 5 the backend stores
  SQL NULL in `patients.blood_type` for this option; the frontend is not changed.
- **Submission is frontend-only.** A valid submission prevents the default and does **not** create an account, call a backend API, persist
  anything (no local or session storage, no cookies), create a session or token, or redirect. It clears the password, returns it to hidden,
  keeps the other (normalized) values, and shows in a `role="status"` region the notice «إنشاء الحساب الفعلي غير متاح بعد؛ سيتوفر بعد ربط
  النظام بالخادم. لم يُنشأ أي حساب ولم تُحفظ أي بيانات.» (no success wording; removed on the next invalid submit). The form also carries
  `method="post"` purely as a guard so credentials could never reach the URL if the handler failed.

**Not implemented (backend-dependent, pending) [Pending]:** real account creation, database persistence, authentication and sessions,
server-side validation (including duplicate-email checks), and any redirect after registration. The length limits (names 50, address 200) and
the 1900 lower bound are frontend UX limits; the length limits fit the report's columns (`VARCHAR(100)` names, `VARCHAR(255)` address and email,
`VARCHAR(20)` phone).

Verification run in this workflow with headless Chrome driven over the DevTools Protocol and **emulated viewports** (no project file was
modified for testing) [Verified]:
- **Registration functionality and validation: 139 of 139 passed**, including 71 validator boundary checks run against the real module in the
  browser (names, password 7 vs 8, phones and digit normalization, birthdates including the Asia/Damascus midnight rollover, address length,
  gender, blood type) and real-event UI checks (empty form, each of the nine fields missing, error clearing, first-invalid focus, password
  toggle and hint association, the exactly-nine-fields check). Frontend-only safety was checked: no request after a valid submit, no storage or
  cookie change, no URL parameters, no redirect, no success wording, and the password absent from the DOM.
- **Shared authentication layout and navigation: 47 of 47 passed:** direct `/login` and `/register`, correct active tab, real mouse and
  keyboard switching with no document navigation, the card, tabs, and illustration remaining the same DOM nodes, no illustration re-request on
  switching, Back and Forward, Navbar buttons, top alignment without `sticky`/`fixed` on `/register` and the A7 alignment on `/login`, and the
  992px breakpoint on both routes (absent and not downloaded at 320, 390, 768, and 991px; present at 992px and above; live resize).
- **Responsive layout and themes: 320 of 320 passed** at 320, 390, 768, 1024, and 1440px in light and dark, in the clean, all-errors, and notice
  states: no horizontal overflow or clipped text, correct two-column and stacked layouts with the first field on the right, controls at least
  48px high, radio pills and the toggle at least 44px, text contrast at least 4.5:1, control borders at least 3:1, select arrow visible.
  Keyboard: 8 of 8 passed (logical tab order, one tab stop for the radio group, a visible 3px focus outline on every control type, both themes).
- **«لا أعلم» correction: 22 of 22 focused checks passed** (nine selectable options in order, placeholder unchanged, empty still invalid,
  `unknown` accepted and kept, each of the eight blood types still valid, no error from tabbing over the untouched select, and the selected
  text in normal colour with contrast of at least 4.5:1 in light and dark at 1440 and 320px).
- **A7 Login preserved:** a baseline of `/login` was captured before the refactor (7 widths x 2 themes x 4 states = 56 states). After the layout
  extraction, with A8 otherwise complete, and again after the final «لا أعلم» correction, the **DOM and layout rectangles were identical in all
  56 states** (0 differences); the comparison made before the blood-type correction also showed 0 screenshot differences. Re-captures after that
  correction showed minor screenshot hash differences in a few dark-theme states (a different few each run) despite identical DOM and layout
  measurements; this is treated as capture noise, and full pixel identity after the final correction is **not** claimed. The earlier A7 suites also passed again: 41 of 41 functional and 213 of 213 responsive; the
  navigation and regression run passed 61 of 63, the two misses being old expectations of the former placeholder H1 («إنشاء حساب» is now
  «إنشاء حساب جديد»), and navigation itself worked.
- **Other pages:** Home, About, Specialties, Doctors, Doctor Details, Booking, Donations, and Contact each had one H1, no overflow, and no
  broken images at 1440 and 390px in both themes; A4 showed 61 cards with 61 images and 0 fallbacks; the A4 → A5 → A6 click flow with A6 slot
  selection passed (11 of 11); the Hero was unchanged; no console or HTTP errors.
- **Production build** succeeded (Vite 8.3.5, 79 modules), written to a temporary directory.
- **Limits:** Chrome only (headless, emulated viewports). **Not tested:** Safari, Firefox, real mobile devices, or a screen reader. Headless
  Chrome used an English locale, so the native date field was seen as `mm/dd/yyyy`; how browsers render it in an Arabic locale (including digit
  shapes) was not observed, and the native select dropdown popup could not be captured. Contrast was computed from styles, not sampled from
  pixels. A browser's own "save password" prompt cannot be controlled. The owner separately completed and approved the visual review.
- **Noted, not changed:** typed values are not kept when switching between login and registration (each form remounts); the Navbar's button
  wrapping at 1024px remains outside A7 and A8.

## A10 Contact Us [Owner-approved; design locked; history: frontend-only, now integrated]
> **[Superseded in part, 2026-10-28]** This section records A10 as approved while it was frontend-only. The visual design and the validation rules below remain approved and
> locked, but the "frontend-only", "no request", and "not implemented / pending" statements (and the mock or informational notices) are **history**: A10 now uses the real
> backend (see "Stages 3C-3E: what was built"). Its test results below are historical and were not re-run.
> **[Update 2026-10-29, fix A: superseded in part]** The form now has **four** required fields (name, email, subject, message); the statements below that say
> three fields or "no subject field" describe the state before the fix. The request is `POST /api/contact { name, email, subject, message }`.
**A10 — Contact Us (تواصل معنا): IMPLEMENTED, TESTED, VISUALLY APPROVED, AND LOCKED.** The owner reviewed and approved A10. **Do not change it
without an explicit owner request.** Real message delivery is **not** part of it.

Implementation, as found in the code [Verified]:
- **Files created:** `frontend/src/pages/public/ContactPage.jsx`, `frontend/src/utils/contactValidation.js`, `frontend/src/styles/contact.css`.
  **Files modified:** `frontend/src/App.jsx` (import and the `/contact` element only) and `frontend/src/main.jsx` (stylesheet import). The page
  reuses `AuthField` and the `af-auth-*` field, button, and notice styles by import only (so those locked A7/A8 files are shared, not changed);
  `contact.css` is scoped under `.af-contact` and defines the `--af-auth-field-border` token (light and dark) that `auth.css` defines only inside
  `.af-auth`. Existing links to `/contact` (Navbar, Footer quick links, and the Home, About, and Donations buttons) now reach the real page.
- **Access and layout:** public, no authentication, Arabic-only, RTL, light and dark themes. A single centred column of at most about 720px at every
  width: the shared `PageHeader` (breadcrumb الرئيسية ‹ تواصل معنا, H1 «تواصل معنا», subtitle «أرسل رسالتك أو استفسارك إلى إدارة مجمع عافية
  الطبي الخيري.»); the form card «أرسل رسالة إلى الإدارة» with «جميع الحقول مطلوبة» (responsive card padding), all fields stacked at full width and a
  full-width 48px button «إرسال الرسالة»; the restrained emergency note «هذا النموذج مخصص للاستفسارات العامة، وليس للحالات الطبية الطارئة.»
  (no emergency numbers, no medical advice); and the «ساعات العمل» card (Saturday-Thursday 9:00 ص - 5:00 م بتوقيت دمشق, Friday closed, from the
  existing constants). No address, phone, email, map, or social links appear on the page itself.
- **Fields and validation** (`contactValidation.js`, plain JavaScript; Arabic messages; reuses `validateEmail` and `normalizeName`; the A8 rules are
  unchanged): **name** (`autoComplete="name"`) trimmed with inner spaces collapsed, 2-100 characters, Unicode letters and combining marks with
  inner spaces, hyphens, and apostrophes, no digits or symbols («أدخل اسمك.» / «أدخل اسماً صحيحاً من حرفين إلى 100 حرف، دون أرقام أو رموز.»);
  **email** (`type="email"`, `dir="ltr"`, `autoComplete="email"`) via the existing `validateEmail` plus a 254-character maximum («البريد الإلكتروني
  طويل جداً.»); **message** (textarea, 5 rows) trimmed, 10-2000 characters, newlines and punctuation allowed, no `maxLength` attribute so pasted
  text is never truncated, static hint «حتى 2000 حرف», no live counter («اكتب رسالتك.» / «الرسالة قصيرة جداً؛ اكتب 10 أحرف على الأقل.» /
  «الرسالة طويلة جداً (2000 حرف كحد أقصى).»). No subject, phone, category, or attachment field. Interaction follows A8: `noValidate`, validate all
  on submit with focus on the first invalid field, touched fields validate on blur, errors clear when valid, nothing shown for untouched fields,
  `aria-invalid` and `aria-describedby`, errors as icon plus text.
- **Submission is frontend-only. No email is sent.** A valid submission prevents the default and makes **no** backend or external request, stores
  nothing (no local or session storage, no cookies), logs nothing, creates no session, and does not redirect. The three values stay in the form
  (normalized), and the only feedback is the `role="status"` notice «إرسال الرسائل الفعلي غير متاح بعد؛ سيتوفر بعد ربط النظام بالخادم. لم تُرسَل
  رسالتك ولم تُحفظ أي بيانات.» (no success wording, no spinner; removed on the next invalid submit). The form carries `method="post"` purely as a
  guard so the message could never reach the URL if the handler failed.

**Not implemented (backend-dependent, pending) [Pending]:** real email delivery to the administration's inbox (SMTP via Nodemailer), server-side
validation, rate limiting and spam protection, and any storage of messages. These are Phase 5 tasks.

Verification run in this workflow with headless Chrome driven over the DevTools Protocol and **emulated viewports** (no project file was modified
for testing) [Verified]:
- **Functional: 73 of 73 passed** (run before the Footer change below): direct access and arrival from the Navbar, Footer, Home, About, Donations,
  and mobile-menu links with the correct title, breadcrumb, H1, and active nav state and no login or redirect; 21 validator boundary checks on the
  real module; each field missing; name, email (254 vs 255), and message (9, 10, 2000, 2001, whitespace-only, multiline) cases; first-invalid focus;
  blur and correction; untouched fields; and frontend-only safety (zero requests on submit, no storage, cookie, or history change, no URL
  parameters or redirect, the exact notice, values kept, nothing logged, no success wording).
- **Responsive and themes: 220 of 220 passed** at 320, 390, 768, 1024, and 1440px in light and dark, in the clean, all-errors, and notice states,
  plus a stress case (120-character name, 255-character email, 2001-character message): no overflow or clipping, fields at least 48px, text
  contrast at least 4.5:1, control borders at least 3:1.
- **Accessibility: 12 of 12 passed:** tab order, a visible 3px focus outline on the three fields and the button in both themes, Enter on the button,
  label and control association, `aria-invalid` and `aria-describedby` resolving to the error (and the hint), icon plus text errors, the status
  region, one H1, RTL.
- **Regression:** the DOM of nine approved pages (Home, About, Specialties, Doctors, Doctor Details, Booking, Donations, Login, Register) was
  identical before and after A10 in all 36 captured states; the A7 and A8 suites passed again (A8 139, 47, 320, and 22 checks; A7 41 and 213 checks)
  and the A4 → A5 → A6 flow passed. `/login` showed identical DOM and layout rectangles to the pre-A8 baseline on re-capture; differences seen at
  320px in one run were attributed to the web font loading intermittently in the test environment.
- **Production build** succeeded (Vite 8.3.5, 82 modules), written to a temporary directory.
- **Limits:** Chrome only (headless, emulated viewports). **Not tested:** Safari, Firefox, real devices, or a screen reader. Contrast was computed
  from styles.

## Shared Footer and About address update [Owner-approved]
After A10, the owner supplied the official contact details and approved replacing the temporary placeholders.
- **Footer** (`frontend/src/components/layout/Footer.jsx`, shared by every page), under «تواصل معنا», in the original order and with the original
  icons: the address «دمشق - البرامكة، بجانب ملعب تشرين» as plain text (not a link); the phone **+963 932 132 132**, an `<a>` to
  `tel:+963932132132`; and the email **Aafya_Charity@gmail.com**, an `<a>` to `mailto:Aafya_Charity@gmail.com`. The phone and email carry
  `dir="ltr"` and the existing `af-footer-link` class, so they read left to right inside the RTL page. Because the contact column is only half the
  page width on phones, the email would otherwise overflow (the page became up to 64px wider than the screen at 320 and 390px), so a one-rule change
  was made in `frontend/src/styles/main.css` (`.af-footer-contact a { overflow-wrap: anywhere; }`) plus a `<wbr />` after the `@`; the email may
  therefore wrap on narrow screens. The Footer's layout, column distribution, typography, colours, and light and dark appearance are otherwise unchanged.
- **About (A2)** (`frontend/src/pages/public/AboutPage.jsx`): the location row now shows the same address as plain text, with the existing icon,
  label, and layout (the row is about 5px shorter than with the old placeholder pill). The page remains approved and locked. The `PlaceholderValue`
  import was removed from it and from the Footer.
- **Not added:** no map, map link, social links, or other contact information.
- **Footer verification: 289 of 289 passed** at 320, 390, 768, 1024, and 1440px in light and dark on `/`, `/contact`, `/login`, and `/register`: exact
  texts and order, the exact `tel:` and `mailto:` targets, the address not being a link, left-to-right rendering (also when wrapped), no page
  overflow or clipping, contrast, and keyboard focus (Tab reaches the phone then the email, with a visible 3px outline in both themes). The Footer's
  column positions and widths were identical to the baseline in all 40 states. Production build succeeded (82 modules).
- **About verification: 73 of 73 passed** at the same five widths in both themes (exact address, not clickable, same typography as the hours text,
  the label and icon kept, no placeholder, and the Footer's three details still correct); its DOM differed from the baseline only by the address
  fragment, and no section, row, icon, or button changed position or width. Production build succeeded (81 modules).
- **Limits:** Chrome only with emulated viewports; Safari, Firefox, real devices, and screen readers were **not** tested; dialing or composing from
  the links was not tested (it is browser and operating-system behaviour).

## Build and checks at the project closeout before A5 (historical; the latest build is in "Stage status")
- `npm run build` (Vite 8.3.5, 63 modules) succeeded on the code at that time, run during that closeout; no warnings or errors were printed. [Verified]
  The build output was written to a temporary directory so no `dist/` folder exists in the project.
- Files changed in the work up to that closeout: `frontend/src/pages/public/HomePage.jsx`, `frontend/src/styles/home.css`,
  `frontend/src/mock/doctors.js`, plus `CLAUDE.md` and `PROJECT_STATUS.md`. No other project file had a modification
  time in that window, and no image had one. [Verified] (A5's files are listed in the A5 section above.)
- **Not done (be aware):** a full pixel regression comparison of A2, A3, A4, A9 and the rest of A1 after the *final*
  Hero redesign was not completed (it was interrupted). An earlier comparison, taken against an intermediate Hero version,
  showed A2 and A3 identical and the part of Home below the Hero identical. A9 and A4 showed differences: for A9 a
  lazily loaded image (the QR code) was seen not yet loaded in the later capture; the A4 difference was not investigated
  (A4 has since been checked directly, see above). Repeated captures of identical code were also seen to differ on these pages. The final
  changes touch only `.af-hero*` CSS, the Hero markup, and the doctor image mapping, so no other page is expected to change.
  The Doctors page was visually checked after the image fix.

## Deferred, non-blocking items [Deferred]
1. **Doctor photo/name consistency.** Some photographs may show details inconsistent with the fictional doctor's name or
   specialty (for example, the photo for id 17, د. مها الشهابي, shows an "OPHTHALMOLOGY" sign and a different name tag, and the
   portrait on A5 for id 18, د. طارق زيدان, shows a badge reading "DR. A. AL-FAYYAD SURGEON").
   Not all 61 photos have been reviewed. The owner will handle replacements separately.
2. **Image size.** The doctor images total about 100 MB (PNGs are about 1.8-2.1 MB each) and the Hero image is 795 KB;
   the Doctors page downloads them all (lazy loading is used). Optimisation (resize, convert, compress) is deferred until the owner explicitly approves it.
3. **`doctor-18.jpg.jpg`** has a duplicated extension. It is referenced as-is; renaming is the owner's decision.
   Also deferred to the owner: the extension/content mismatches on the Hero image, `doctor-17.jpg`, and `doctor-44.png`
   (see "Asset changes detected after A5 testing"), and the A7 illustration `login-illustration.jpeg` (PNG data with a `.jpeg`
   extension; displays correctly, appearance approved, no conversion or renaming authorized).
4. **Contact details (resolved).** The official address, phone, and email are now shown in the Footer (and the address on About), so the earlier
   placeholder contact details no longer exist in the pages. Do not add other contact information (map, social links, extra numbers) without the
   owner's approval.
5. **Version control** is not set up (no Git, no `.gitignore`); to be discussed separately.
6. **Button focus ring outside the Hero.** The site-wide Bootstrap `.btn` focus ring is a 50%-opacity primary box-shadow;
   measured on the original Hero it was about 2.0-2.7:1 against its backdrop (below 3:1). This predates the work above. It is
   not addressed (the Hero's own buttons now use a white ring that passes). Raise with the owner if a site-wide fix is wanted.
7. Minor: the catch-all route shows "under construction" wording for a not-found page; no README or linter, and no automated frontend tests (the backend has test files).
   (The stale route comment in `App.jsx` was corrected during A5.)
8. **Backend-dependent booking functionality [Superseded 2026-10-29].** Real booking, availability, authentication, redirects, double-booking and overlap
   prevention, and cancellation are implemented in the backend and integrated in the frontend (Stages 3C-3D). The owner has since confirmed them live
   [Owner-reported: live] (see "Verification status"); the previous-appointments section and the booking-window edges are not in the owner's list.
9. **A6 availability does not auto-refresh** while the page stays open; it is refreshed after a booking attempt. Still accepted; revisit with real
   integration testing.
10. **Documentation discrepancy found:** a comment in `frontend/src/styles/specialties.css` (line 3) says field-style unification is
    postponed to "form screens (A6 and A7)". A6 is now the Appointment Booking page, so that comment is out of date. It was not changed
    (outside the documentation task); the owner can decide which screens it should refer to.
11. **A8 provisional limits.** The registration length limits (names 50, address 200) and the 1900 birthdate lower bound are frontend-only UX
    limits and fit the report's columns (see the A8 section); the 1900 bound is not a report rule. The native date input's appearance depends on the
    browser locale (not verified for Arabic locales).
12. **Unused component.** `src/components/common/PlaceholderValue.jsx` and its `.af-placeholder` rule in `main.css` have no importers since the
    Footer and About placeholders were replaced. They were left in place on purpose; deleting them is a separate cleanup the owner may approve.
13. **Outdated assertions in the ad hoc browser test scripts.** The scripts used for A7-A10 ran from a temporary scratchpad outside the repository
    (no test framework exists), and a few assertions describe superseded behaviour: two navigation and regression assertions still expect the former
    `/register` placeholder heading («إنشاء حساب» instead of «إنشاء حساب جديد»), and one A10 functional assertion expects the Footer's old three
    placeholders and no `tel:` or `mailto:` links. These are outdated tests, **not** application defects, and not every old script passes unchanged.
    Update or rebuild the affected assertions during the next appropriate testing phase.
14. **A10 reuses A8's field components and styles** (`AuthField`, `af-auth-*`); a future change to those locked files would also affect Contact.
    The email wrapping on narrow screens (Footer) and the native date input's locale rendering (A8) were noted, not changed.

15. **Future frontend review items** (contact subject, doctor biography on A5, pending-change message on A6, A8 blood type) **[RESOLVED 2026-10-29]**: all four
    were implemented with the owner's approval (fixes A-D; see "Final compliance fixes A-E"). Not verified live: biography with real text and the A6 notice
    with a real pending change.
16. **Logout and token revocation.** The backend uses a JWT in an `httpOnly` cookie and re-reads the role and `is_active` from PostgreSQL on every
    protected request; logout clears the cookie, and there is no revocation list (the schema has no column for one). Whether anything more is required
    has not been decided.
17. **Browser coverage.** The report's non-functional requirements name Chrome, Firefox, Edge, and Safari; all verification so far used headless Chrome
    with emulated viewports only.
18. **End-to-end integration testing [Partly superseded 2026-10-29].** The owner confirmed most flows live in Stage 6, including contact delivery
    [Owner-reported: live]. Not covered by any recorded live result: the F1 live check, other browsers and real devices, and the
    items in "Verification status", part C. The responsive checks of the new navigation were later reported as passed [Owner-reported: live, 2026-10-29].
    The final verification against the graduation report was performed and is PARTIALLY VERIFIED.
19. **Live database state [Owner-reported, not queried].** The local `afiyah_test` database holds the schema, the 19 specialties, the 61 doctors, and the
    administrator account. `HomePage.jsx` hard-codes featured specialty ids `[18, 2, 15, 14, 1, 19]` and doctor specialty ids `[18, 2, 15, 14]`, so catalog data must keep the original
    numbering (specialties 1-19, doctors 1-61).
20. **Doctor portal shows no specialty.** No session-scoped backend endpoint exposes it; showing it would need a backend change that has not been approved.
21. **Navbar on reload.** While the session is being checked, the bar uses the visitor breakpoint, so a patient or doctor reloading at 992-1399px may see a
    brief layout shift. Not measured.
22. **`frontend/src/mock/` is unused** (nothing imports it). The owner decided to keep it unchanged; no cleanup task is planned.
23. **Backend runtime prerequisites [Partly superseded 2026-10-29].** The backend `.env` is never read by Claude. [Owner-reported: live] SMTP for the
    contact form is configured and delivery works, and the admin account exists. Still not recorded: a fresh complete `npm test` result.
24. **Stage 6 open items** (details in "Stage 6 log", item 8) **[Updated 2026-10-29]**: the `OVERDUE_MESSAGE` text is fixed (E); the responsive checks were reported as
    passed (owner-reported, not real-device); the missing booking-page explanation is implemented (C, not verified with a real pending change). **Still open:
    the live check of the F1 fix.**

## Next planned task
No further task is recorded as planned or approved. The final verification against the approved graduation report (`تقرير المشروع معدل.docx`, unmodified) was
**PERFORMED — PARTIALLY VERIFIED** on 2026-10-29. Remaining optional follow-up, each needing the owner's explicit authorization (and, for anything touching a
database or starting a server, separate approval):
- **F1 live check** of an overdue pending change on `afiyah_test` (the cloned-database procedure proposed earlier was not approved);
- the doctor biography displayed with actual biography text, and the A6 restriction notice with a real pending change;
- cross-browser testing (Safari, Firefox, Edge) and real-device and screen-reader checks;
- any SQL tests the owner wants re-run (the integration test `t2f` requires empty tables).
Follow Inspect → Plan → Review → Approval → Implement → Test → Stop; do not invent features, tables, columns, roles, or libraries; preserve the locked designs.

## Not started (do not begin unless instructed)
The live check of the F1 fix; verification of the biography display with real text and of the A6 notice with a real pending change; cross-browser and real-device
checks; image optimisation; and version control setup (the project is not under Git; a `backend/.gitignore` exists).
