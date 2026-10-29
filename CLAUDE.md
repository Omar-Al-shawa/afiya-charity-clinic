# Afiyah Charitable Medical Complex (مجمع عافية الطبي الخيري)

Graduation project: an Arabic-only, RTL web application for a **single** charitable medical complex
(not a multi-branch system). All services are free. Light and dark themes are supported.
See `PROJECT_STATUS.md` for current progress and open items.

## How to read this file
- **[Report]**: stated in the frozen graduation report `تقرير المشروع معدل.docx` (project root), which was read and verified in Phase 5.
  It is the highest authority for functional requirements and the database design (see "Graduation report: frozen specification").
- **[Owner-reported]**: decisions supplied by the project owner that cannot be checked from the repository. Treat these statements as
  authoritative, and ask the owner if something is unclear.
- **[Verified]**: confirmed by inspecting repository files (existence and content only, not execution or deployment).
- **[Owner-approved]**: a visual or functional approval given by the project owner for a finished page or design.
- Never present an owner-reported statement as something verified in the repository, or the reverse.

## Graduation report: frozen specification [Owner-approved]
`تقرير المشروع معدل.docx` (project root) is the final, authoritative, **immutable** specification for the entire remaining project.
- **NEVER** edit, rewrite, regenerate, rename, move, or delete it, and never propose modifying it to solve an implementation problem.
  Adapt the implementation to the report, not the report to the implementation.
- If the report is inconsistent (it contains typos), explain the inconsistency and propose a technical solution that leaves the report untouched.
- The older `تقرير المشروع.docx` is **superseded** (it is not in the repository) and must not be used as a specification.
- Do not add tables or columns beyond the report without the owner's explicit approval.
- Source priority for the database design and functional behaviour: (1) the report; (2) explicit owner-approved decisions that do not contradict it;
  (3) this file and `PROJECT_STATUS.md`; (4) the existing frontend contracts. Report any disagreement instead of silently choosing a design.

## Current state (updated 2026-10-29; details in `PROJECT_STATUS.md`)
- **Stages [Owner-reported]:** backend stages 2A-2G are CLOSED. Frontend stages 3A-3F are CLOSED: 3A and 3B; 3C (authentication, registration,
  login/logout, session handling, and role guards); 3D (patient API functions and utilities, real booking, patient appointments and profile UI); 3E
  (doctor portal, plus its navbar-responsiveness and appointment-boundary fixes); and 3F (Admin Dashboard, confirmed complete by the owner).
  **Stage 6 (live integration and functional verification) is in progress.** The **final verification against the graduation report is PERFORMED —
  PARTIALLY VERIFIED** (2026-10-29): source inspection, a complete backend test run, the frontend validation harness, the production build, and the owner's
  manual checks are done, and five confirmed deviations from the report (A-E below) were fixed; the scenarios listed under "Not verified" remain open and
  it is **not** a fully completed verification. Stage names and scopes beyond these are not recorded in the repository: do not invent them.
- **Verification evidence (be precise about which kind it is).**
  - **[Owner-reported: live]** results from the running application (Stage 6): patient registration and login; appointment booking and cancellation;
    cancelled slots becoming available again; prevention of conflicting patient appointments; prevention of double booking by competing patients;
    doctor schedule and appointment views; admin specialty and doctor management; admin patient and appointment views; patient profile editing;
    password changes for patient, doctor, and admin; role-based access restrictions; and the Contact Us form (success message and delivery to the
    administration Gmail inbox, with the sender's name, email, and message). These were not independently executed in the documentation task.
    **After the compliance fixes A-E (2026-10-29), also [Owner-reported: live]** on the locally running application: the Contact Us subject field (shown,
    empty-subject validation error, correct layout; a real message sent and received in Gmail with the subject correct in both the email header and body
    and Reply-To set to the sender's email); the registration note stating that blood type is optional, a registration with blood type left empty
    succeeding, and the admin patient view showing «لا أعلم» for that patient; existing doctors without a biography displaying correctly with no empty
    biography section; and passed responsive checks at registration 320px, doctor navigation 1400px and 1500px, and admin tabs and layout 375px. The
    browser, the theme, and whether a real device or the browser's responsive mode was used are not recorded (these are not real-device tests).
  - **[Verified: offline]** only what was actually run in a session. Latest results (2026-10-29, after fixes A-E): the complete backend `npm test` run,
    **130 passed, 0 failed, 0 skipped** (fake databases; the earlier 112/112 and 115-of-11-files figures are superseded); the frontend validation harness
    on copies of the pure utilities, **11/11**; and the production build, **successful, 110 modules, no warnings or errors**. The SQL tests
    (`backend/db/tests/`) were not re-run.
  - **Not verified:** (1) the doctor biography displayed with actual biography text; (2) the booking restriction notice triggered by a real pending
    change; (3) F1, the live execution of an overdue pending change (offline-tested only; it needs a database write on `afiyah_test` and the owner's
    separate authorization); (4) cross-browser testing (Safari, Firefox, Edge) and real-device or screen-reader accessibility and responsiveness checks.
    Not recorded either: the admin tab bar in dark mode and at widths other than 375px.
- **Phase 4 public pages A1-A10 and the shared Footer are APPROVED and LOCKED** [Owner-approved]: A1 Home, A2 About, A3 Specialties Directory,
  A4 Doctors Directory, A5 Doctor Details, A6 Appointment Booking, A7 Login, A8 Registration, A9 Donations, A10 Contact Us. Their visual designs stay
  locked. A6, A7, A8, and A10 were frontend-only when approved and have since been **integrated with the real backend, with the owner's approval**;
  the page bullets below describe their current behaviour.
- **Authenticated areas on the frontend:** patient (`/patient/appointments`, `/patient/profile`, which also holds the password change); doctor,
  read-only (`/doctor`, `/doctor/appointments`, and `/doctor/password` for the doctor's own password change only); admin (`/admin` home,
  `/admin/specialties`, `/admin/doctors`, `/admin/patients`, `/admin/appointments`, `/admin/pending-changes`, and `/admin/password`). The admin adds doctors
  and specialties immediately, requests edits and deletions as deferred changes, and views patients and bookings read-only (see "Architecture conventions").
- **Catalog data.** The specification has 19 specialties and 61 doctors. The frontend reads them from the API. [Owner-reported] The local `afiyah_test`
  database contains the initial catalog (19 specialties, 61 doctors) and the administrator account; the database was not queried to check this, and
  the repository seed script is `backend/db/seed/001_catalog.sql`. `HomePage.jsx` hard-codes featured specialty ids `[18, 2, 15, 14, 1, 19]` and doctor specialty ids `[18, 2, 15, 14]`
  (numbering of the original mock catalog: specialties 1-19, doctors 1-61), so any catalog data must keep those ids.
- **A1 Hero redesign is APPROVED and locked.** It uses the photograph `public/images/hero-charitable-clinic.jpg`
  as a full-section background, a standalone white heart logo (`LogoMark`) at the top-left, and a Hero-scoped
  light-text palette. The old green decorative panel and its three chips no longer exist. Do not change the Hero's
  image, logo, colours, overlays, layout, or CSS without the owner's explicit request.
- **A4 is complete.** The catalog specification has exactly 61 doctor records, each with its own image in `public/images/doctors/`; A4 reads doctors
  from `GET /api/doctors`. Do not reopen A4's approved layout, doctor records, or specialties. `src/mock/doctors.js` (the original image mapping) is kept
  unchanged but is currently unused.
- **A5 Doctor Details is implemented, tested, visually reviewed, and APPROVED** (route `/doctors/:id`). It shows the
  doctor's photo, name, specialty, age, years of experience, the unified working schedule, and a booking button, with
  loading, error/retry, and not-found states. The A4 doctor-card button now reads «عرض التفاصيل». Do not change A5
  without the owner's explicit request. Contact details (phone, email) are intentionally not shown. **Biography (owner-approved fix B, 2026-10-29):**
  `GET /api/doctors/:id` also returns the optional `biography` (text or null; the list endpoint `GET /api/doctors` does not), and A5 shows a «نبذة تعريفية»
  row inside the doctor-information card only when the text is non-empty, as plain text (tags are escaped, line breaks kept). No existing doctor was
  given a biography (all 61 seeded doctors have NULL), so nothing visible changes for them [Owner-reported: live]. Display with a real biography is
  **not manually verified**.
- **A5's «احجز موعداً» button now links to A6** (`BookingAction` in `DoctorDetailsPage.jsx` renders a `Link` to
  `/doctors/:id/book`; it was a temporary non-navigating button until A6 was approved). The approved flow is
  A4 → A5 → A6.
- **A6 Appointment Booking is implemented, tested, visually reviewed, and APPROVED** (route `/doctors/:id/book`; works
  for all 61 doctors). It is an approved frontend milestone: preserve its design and behaviour unless the owner
  explicitly requests a change. Approved behaviour:
  - Arabic-only, RTL, Bootstrap-based responsive layout (two columns on desktop with a sticky summary, one column on
    mobile), light and dark themes.
  - **Browsing availability is public** (no authentication). The page shows the doctor, specialty, and appointment
    duration (from the specialty's `appointmentDuration`).
  - **Rules:** unified hours 09:00–17:00 Saturday–Thursday; **Friday closed** (visible but disabled, labelled «عطلة»);
    time zone **Asia/Damascus** (never the browser's); booking window = **14 calendar days including today in
    Damascus**; slots that have already started are excluded; slots never extend past 17:00, for any valid duration.
  - **Slot states:** booked slots are visually distinct, disabled, and struck through (with hidden «محجوز» text); the
    selected slot is distinct without relying on colour alone; the summary updates with the selection.
  - Times use the Arabic 12-hour format (e.g. 9:00 ص) with Western digits.
  - **The selection lives in the URL** (`?date=YYYY-MM-DD&time=HH:mm`), written with `replace` (no history spam) and
    validated on load; invalid, booked, expired, Friday, or out-of-window values are rejected safely.
  - Loading, error with retry, and not-found states follow A5's patterns; keyboard navigation and focus indicators are supported.
  - Code: `pages/public/AppointmentBookingPage.jsx`, `styles/appointment-booking.css`, `utils/schedule.js` (pure
    Damascus date and slot logic; takes `now` as a parameter for testing), `utils/appointments.js` (grouping and error classification),
    `api/appointments.js` (`fetchDoctorAvailability`, `createAppointment`, `fetchMyAppointments`, `cancelAppointment`).
- **A6 IS INTEGRATED WITH THE REAL BACKEND** [Owner-approved]. Availability comes from `GET /api/doctors/:id/availability` (the response also carries
  `bookingRestrictedFrom`, which the page now uses for the restriction notice below). «تأكيد الحجز»: a visitor is sent to `/login` with a safe
  `next` that returns them to the chosen date and time; a patient sends `POST /api/appointments { doctorId, date, time }` (no patient id: identity
  comes from the session) and sees the success notice «تم حجز موعدك بنجاح.» with a link «عرض مواعيدي»; doctor and admin accounts get a patient-only
  message and send nothing. Server refusals (AF107 slot booked, AF108 overlapping patient appointment, AF103-AF106, AF109, AF111 invalid slot) show the
  server's message and refresh availability; a network failure after sending warns that the booking may have succeeded and points to «مواعيدي». The
  backend (with PostgreSQL triggers and indexes) is the authority on availability, double booking, and overlap; frontend checks are not protection.
- **A6 restriction notice (owner-approved fix C, 2026-10-29).** When `bookingRestrictedFrom` is a date, A6 shows an Arabic `af-note` above the date
  picker, in both the normal and the empty availability states: «لا تتوفر مواعيد للحجز لدى هذا الطبيب ابتداءً من {التاريخ}، بسبب تغيير إداري مجدول يخص
  الطبيب أو اختصاصه.» It reveals no detail of the change and changes no booking rule or calculation. Note: a change created on day C takes effect at the
  start of day C+14 while the window is C..C+13, so the notice first appears on day C+1. Not manually verified with a real pending change.
- **A6 known limitation:** availability does not refresh automatically while the page stays open (e.g. a slot that passes in time stays visible); it is
  refreshed after a booking attempt (success or refusal).
- **A7 Login Page is IMPLEMENTED, TESTED, VISUALLY APPROVED, AND LOCKED** [Owner-approved] (route `/login`). Preserve its
  design and behaviour unless the owner explicitly requests a change. Approved behaviour:
  - One unified login form for patients, doctors, and the manager. **Email and password fields only; no role selector**, and no
    social login, SMS login, password recovery, or remember-me. A password show/hide toggle (fixed position, 44×44px target).
  - Arabic-only, RTL, light and dark themes. Desktop: the form on the right and the illustration on the left. **Below 992px the
    illustration is not rendered** (the `<img>` is created only when `matchMedia('(min-width: 992px)')` matches, so the file is
    not downloaded on narrow screens) and the form is centred. On `/login` the illustration keeps its original A7 alignment
    (vertically centred against the card).
  - Two equal-width navigation links at the top of the card, «تسجيل الدخول» (active) and «إنشاء حساب» (to `/register`): plain
    router links with `aria-current`, not ARIA tabs.
  - Validation (`utils/validation.js`): email trimmed, required, lenient format check; password required only (no complexity
    rules, not trimmed). Custom Arabic errors with `aria-invalid` / `aria-describedby`, focus moves to the first invalid field,
    native browser validation disabled (`noValidate`).
  - **A7 IS INTEGRATED WITH THE REAL BACKEND** [Owner-approved]. A valid submission calls `POST /api/auth/login` through `AuthContext.login`. The session
    is an `httpOnly` cookie set by the server; no token is kept in the frontend (no localStorage or sessionStorage). The redirect after login is done only
    by `GuestOnly`: to the safe `next` allowed for the user's role, or to the role's home (`/` patient, `/doctor` doctor, `/admin` admin) via
    `utils/redirect.js`. Server errors (invalid credentials, inactive account, rate limit, network) are shown under the form.
  - The owner approved the illustration's current appearance, **including its white background in dark mode**. It is not a
    pending issue. Do not recolour, restyle, convert, rename, or optimise it without an explicit request.
  - Code: `pages/public/LoginPage.jsx` (the heading, form and notice only; the shell moved to `AuthLayout` during A8),
    `components/auth/AuthTabs.jsx`, `components/auth/PasswordField.jsx`, `utils/validation.js`, `styles/auth.css` (scoped
    `af-auth-*`). Illustration: `public/images/auth/login-illustration.jpeg` (a PNG-encoded 1254x1254 file with a `.jpeg`
    extension; it displays correctly; see Assets). A8 changed A7 only to extract the shared shell; a before/after comparison of
    `/login` showed identical DOM and layout rectangles in all 56 captured states (see `PROJECT_STATUS.md`).
- **A8 Registration is IMPLEMENTED, TESTED, VISUALLY APPROVED, AND LOCKED** [Owner-approved] (route `/register`). Preserve its
  design and behaviour unless the owner explicitly requests a change. Approved behaviour:
  - **Shared authentication layout.** `/login` and `/register` are separate React Router routes that both render inside one
    pathless `AuthLayout` route (within `PublicLayout`). Switching between them replaces only the form, with no full page reload:
    the card, tabs, and illustration stay mounted (the illustration `<img>` is the same DOM node and is not re-requested). Opening
    `/register` directly shows the registration form with «إنشاء حساب» active. On `/login` the illustration keeps the A7 alignment;
    on `/register` it is **top-aligned** beside the taller form, in normal document flow (no `sticky` or `fixed`). **Below 992px the
    illustration is not rendered.** The login page is visually and functionally preserved.
  - **Patient-only form, Arabic-only, RTL, light and dark themes, eight required fields and an optional blood type** (since fix D, 2026-10-29), in this order: first name (الاسم الأول),
    last name (اسم العائلة), email, password, phone (رقم الهاتف), birthdate (تاريخ الميلاد), residential address (عنوان السكن),
    gender (الجنس), blood type (زمرة الدم). No confirm password, username, role selector, CAPTCHA, or verification. Doctor and
    manager accounts are not created through public registration. A note «جميع الحقول مطلوبة عدا زمرة الدم» is shown; `noValidate`, with
    `method="post"` only as a guard against credentials reaching the URL.
  - **Validation** (`utils/registrationValidation.js`, no validation library): names 2-50 characters, Unicode letters and combining
    marks with inner spaces, hyphens, and apostrophes, no digits or symbols (trimmed, inner spaces collapsed); email via the existing
    shared `validateEmail`; password at least 8 characters (not trimmed, no complexity rules; separate from the login
    `validatePassword`, which is unchanged); phone `09xxxxxxxx` (exactly 10 digits) after converting Arabic-Indic and Persian
    digits to Western digits (normalised on blur; inner spaces, hyphens, and country codes are rejected); birthdate a valid date
    not before `1900-01-01` and **strictly before today in Asia/Damascus** (no minimum-age rule); address required, trimmed,
    at most 200 characters; gender `male` or `female`; blood type optional: left empty, one of the eight ABO/Rh values, **or «لا أعلم»**.
  - **Blood type «لا أعلم» and optional blood type.** [Superseded in part by owner-approved fix D, 2026-10-29: the field was required with the
    placeholder «اختر زمرة الدم» disabled; it is now **optional**, as the report says.] The placeholder is now the selectable empty option
    «اختر زمرة الدم (اختياري)», and `validateBloodType` accepts the empty value, `unknown`, and the eight ABO/Rh values (any other value is still
    rejected). The ninth option's internal value is `unknown` (`BLOOD_TYPE_UNKNOWN`), distinct from the empty value and from all eight ABO/Rh values.
    It is **never** a blood type: `BLOOD_TYPES` holds only the eight real values, and «لا أعلم» must never be converted to one. The backend (unchanged)
    stores SQL NULL in `patients.blood_type` for an empty or unknown value (see "Approved database schema"); there is no schema change.
  - **UX:** all fields validate on submit, focus moves to the first invalid control (the first radio for gender), touched fields
    validate on blur, errors clear when the value becomes valid, and tabbing over untouched fields shows no errors. Errors use
    `aria-invalid` and `aria-describedby` (the gender `fieldset` uses `aria-describedby` only). The password uses
    `autoComplete="new-password"` with the hint «8 أحرف على الأقل». Phone is `type="tel"` (`inputMode="numeric"`, `dir="ltr"`);
    birthdate is a native `type="date"` (`max` = yesterday in Damascus, `min` = 1900-01-01); address is a 2-row textarea; gender is two
    radio pills in a `fieldset`; blood type is a native select with a custom chevron.
  - **Layout:** from 576px up the pairs (first name and last name, phone and birthdate, gender and blood type) sit in two columns with
    the first field on the right (RTL); below 576px all fields stack. Inputs are about 48px high with 44px or larger touch targets.
  - **A8 IS INTEGRATED WITH THE REAL BACKEND** [Owner-approved]. A valid submission sends `POST /api/auth/register` (no automatic login and no cookie). On
    success it navigates to `/login` (keeping a safe `next`) with the notice «تم إنشاء حسابك بنجاح. سجّل الدخول للمتابعة.»; server field errors
    (including `EMAIL_TAKEN` under the email field) are shown on their fields, and other failures (rate limit, network) under the form. The server
    validates again; the length limits above are frontend UX limits that fit the report's columns (names 50 within `VARCHAR(100)`, address 200 within
    `VARCHAR(255)`, a 10-digit phone within `VARCHAR(20)`, email 254 within `VARCHAR(255)`).
  - Code: `pages/public/RegisterPage.jsx`, `components/auth/AuthLayout.jsx`, `components/auth/AuthField.jsx`,
    `utils/registrationValidation.js`; modified for A8: `App.jsx` (the shared `AuthLayout` route), `pages/public/LoginPage.jsx` (shell
    removed), `components/auth/PasswordField.jsx` (optional `hint`), `styles/auth.css` (A8 rules appended).
- **A10 Contact Us is IMPLEMENTED, TESTED, VISUALLY APPROVED, AND LOCKED** [Owner-approved] (route `/contact`; it replaced the last public
  `PlaceholderPage`). Preserve its design and behaviour unless the owner explicitly requests a change. Approved behaviour:
  - **Public:** no login or authentication is needed (visitors, patients, doctors, and the manager can all use it). Arabic-only, RTL, light and
    dark themes. A single centred column (at most about 720px) at every width: `PageHeader` (H1 «تواصل معنا», subtitle «أرسل رسالتك أو استفسارك
    إلى إدارة مجمع عافية الطبي الخيري.»), the form card «أرسل رسالة إلى الإدارة» with the note «جميع الحقول مطلوبة», then the restrained
    emergency note «هذا النموذج مخصص للاستفسارات العامة، وليس للحالات الطبية الطارئة.» (no emergency numbers or medical advice), then the
    working-hours card (Saturday-Thursday 9:00 ص - 5:00 م بتوقيت دمشق; Friday closed). The page itself shows no address, phone, email, map, or social links.
  - **Exactly four required fields:** name, email, subject, message (the subject was added by owner-approved fix A, 2026-10-29, per functional
    requirement 12 and use case 13; before it the form had three). Validation (`utils/contactValidation.js`, no library; it reuses `validateEmail` and
    `normalizeName`): name trimmed with inner spaces collapsed, 2-100 characters, Unicode letters and combining marks with inner spaces, hyphens, and
    apostrophes, no digits or symbols (the A8 name policy); email via the existing `validateEmail` plus a 254-character maximum; **subject** («الموضوع»,
    free text, between email and message) trimmed with inner whitespace collapsed, 3-100 characters, control characters including CR and LF rejected
    (it enters the email header), validated again by the backend; message trimmed,
    10-2000 characters, newlines allowed, **no `maxLength` attribute** (pasted text is never truncated) and a static hint «حتى 2000 حرف»
    (no live counter). Submit button «إرسال الرسالة». It follows the A8 interaction model (`noValidate`, validate all on submit, first invalid
    field focused, touched fields validated on blur, errors clear when valid, `aria-invalid` and `aria-describedby`, `method="post"` guard only).
  - **A10 IS INTEGRATED WITH THE REAL BACKEND** [Owner-approved]. A valid submission sends `POST /api/contact { name, email, subject, message }`; the server
    delivers it by SMTP (Nodemailer), stores nothing, and rate-limits it (5 requests per hour per IP). The email subject is
    `رسالة جديدة من نموذج تواصل معنا: <الموضوع>` and the body includes an «الموضوع:» line; the sender, Reply-To, SMTP settings, and rate limit are unchanged. On success the notice «تم إرسال رسالتك إلى
    الإدارة. شكراً لتواصلك.» is shown; server field errors appear on their fields, and `CONTACT_UNAVAILABLE` (SMTP not configured),
    `MAIL_DELIVERY_FAILED`, `RATE_LIMITED`, and network errors appear under the form. [Owner-reported: live] With SMTP
    configured (see "Contact email configuration"), a real submission showed the success notice and the message arrived in the administration Gmail inbox;
    after fix A a real message with a subject was also received with the subject correct in the header and body and Reply-To set to the sender.
  - Code: `pages/public/ContactPage.jsx`, `utils/contactValidation.js`, `styles/contact.css` (scoped under `.af-contact`; it defines the
    `--af-auth-field-border` token that `auth.css` defines only inside `.af-auth`); modified: `App.jsx` (the `/contact` element) and `main.jsx`
    (stylesheet import). It reuses `AuthField` and the `af-auth-*` field, button, and notice styles by import only, so a future change to those
    locked A7/A8 files also affects A10.
- **Official contact details are now approved and displayed [Owner-approved].** The shared Footer shows, under «تواصل معنا», the address
  «دمشق - البرامكة، بجانب ملعب تشرين» (plain text, not a link), the phone «+963 932 132 132» (link `tel:+963932132132`), and the email
  «Aafya_Charity@gmail.com» (link `mailto:Aafya_Charity@gmail.com`). The phone and email are `dir="ltr"` inside the RTL page, the email may wrap on
  narrow screens (a `<wbr />` after the `@` and `overflow-wrap: anywhere` on `.af-footer-contact a` in `main.css`) so it never overflows, and the
  Footer's layout, icons, and light and dark appearance are unchanged. The **About page (A2)** shows the same address as plain text in its
  working-hours and location card (the earlier placeholder is gone); About stays approved and locked. No other contact information (map, social
  links, other numbers) is approved: do not add any without the owner's approval.
- **Locked frontend scope and integration.** The approved A1-A10 pages are **locked**: preserve their approved visual designs. Their integration with
  the backend (Stages 3B-3D) was owner-approved. Any further change to a locked page must follow the approved requirements, avoid unnecessary component or
  CSS refactoring, be **proposed and reviewed before implementation**, and be tested for regressions.
- **Backend, database, and requirements.** The implemented backend and database scripts are described in "Backend and database". Requirements
  [Report] and owner-approved decisions that still govern all work: Node.js + Express.js; PostgreSQL with the **six** tables in "Approved database
  schema"; the deferred-change rules in "Deferred administrative changes"; role-based authentication and authorization; secure password hashing and
  `httpOnly` authentication cookies; **database-level prevention of double booking**; the scheduling rules (09:00-17:00 Saturday-Thursday, Friday
  closed, 14-day window, per-specialty durations, Asia/Damascus); contact delivery over SMTP; server-side validation and security protections. Do not
  invent additional features, tables, columns, roles, libraries, or architectural decisions.
- **Compliance fixes A-E [Owner-approved, implemented 2026-10-29; previously "future frontend review items"].** Five confirmed deviations from the
  report were fixed, with the owner's explicit authorization to touch the locked A5, A6, A8, and A10 for these corrections only: (A) the contact
  form subject; (B) the optional doctor biography on A5; (C) the explanatory booking notice when a pending change restricts availability; (D) optional
  blood type at registration; (E) the `OVERDUE_MESSAGE` text in `utils/pendingChanges.js`, now «حان موعد تنفيذ هذا الطلب. تُنفَّذ الطلبات المستحقة
  تلقائياً عند أول طلب يصل إلى النظام، فحدّث الصفحة بعد لحظات لعرض النتيجة. لا يمكن إلغاؤه الآن.» (the related admin-page comment was corrected; the
  executor and middleware were not modified). Details are in the A5, A6, A8, and A10 bullets above and in `PROJECT_STATUS.md`. The locked designs
  otherwise stay locked. No report difference is recorded as open any more; the unverified scenarios are listed under "Not verified".

## Stack (do not change without explicit approval)
- Frontend (`frontend/`): React 19, JavaScript/JSX, Vite, React Router, Bootstrap 5.3 RTL, Bootstrap Icons, plain CSS. [Verified]
- Backend (`backend/`): Node.js >=22 (ES modules), Express 5, `pg`, `bcrypt`, `jsonwebtoken`, `cookie-parser`, `helmet`, `express-rate-limit`,
  `nodemailer`; tests with `node:test` and `supertest`. [Verified in `package.json`]
- Database: PostgreSQL 18 with exactly six tables [Report]; the schema scripts are in `backend/db/` (see "Backend and database").
- Do NOT introduce TypeScript, Tailwind CSS, or any new dependency without explicit approval.

## Backend and database [Verified in repository files; live behaviour as labelled]
- **Layout:** `backend/src/app.js` (Express app factory: `helmet`, `cookie-parser`, an origin guard on `/api`, JSON body limit 100kb; injected
  `db`, `config`, `clock`, `mailer`, and `processDueChanges`), `src/server.js` (startup: database ping, processes due pending changes, then listens and
  injects the real `processDueChanges`), `src/config.js`, `src/routes/`, `src/repositories/` (parameterized SQL), `src/services/` (availability, doctor
  schedule, mailer), `src/validation/`, `src/middleware/` (`authenticate`, `originGuard`, `errorHandler`, `dueChanges`), `src/auth/`, `src/db/`,
  `src/errors/`, `scripts/create-admin.js`, `test/*.test.js` (14 files), and `db/` (SQL, including `db/seed/001_catalog.sql`). Commands
  (`package.json`): `npm start`, `npm run dev` (`node --watch`), `npm test`, `npm run admin:create`. The backend reads its configuration from a `.env`
  file: never read or print it.
- **Contact email configuration (variable NAMES only; never write values here or in chat).** The backend sends Contact Us messages with Nodemailer when
  all six variables are set in `backend/.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (a plain address, no display name),
  and `CONTACT_RECIPIENT`. If none is set the startup log says `contact form email: not configured` and `POST /api/contact` answers 503
  `CONTACT_UNAVAILABLE`; if only some are set the backend refuses to start and names the missing variables (never their values). Port 465 uses implicit TLS;
  any other port requires STARTTLS (TLS 1.2 minimum). Gmail needs an App Password, not the account password. Startup does not verify the credentials: a
  wrong one first shows as `MAIL_DELIVERY_FAILED` (the log prints only an error code such as `EAUTH`). [Owner-reported: live] The backend reported
  `contact form email: configured` and a real message was delivered.
- **API (all under `/api`; errors are `{ error: { code, message, fields? } }`):** public `GET health`, `specialties`, `doctors`, `doctors/:id`,
  `doctors/:id/availability` and `POST contact`; auth `POST register`, `login`, `logout`, `change-password` (patient, doctor, and admin: own password only; the
  new password needs at least 8 characters, and **at least 12 for the admin**, enforced by the backend from the session role) and `GET me`; patient
  `POST appointments`, `GET appointments`, `POST appointments/:id/cancel`, `GET` and `PUT patient/profile` (only first name, last name, phone, address are
  updatable); doctor, **GET only**, `doctor/schedule?view=day|week&date=` and `doctor/appointments?from=&to=` (range at most 31 days; booked appointments
  only, so cancelled ones are never returned; patient first name, last name, and phone only; no specialty); admin `GET`/`POST` `admin/specialties` and
  `admin/doctors` (immediate additions), `PATCH`/`DELETE` on them (deferred, HTTP 202, via `pending_changes`), `GET admin/pending-changes`,
  `POST admin/pending-changes/:id/cancel`, and read-only `GET admin/patients`, `admin/patients/:id`, `admin/appointments`.
- **Authentication and security:** a JWT in an `httpOnly`, `SameSite=Lax` cookie; every protected request re-reads the user's role and `is_active` from
  PostgreSQL (the token alone is not trusted); `requireRole` guards each router; the patient or doctor is identified from the session, never from a request
  parameter; logout clears the cookie (there is no revocation list); passwords use bcrypt; rate limits apply to register, login (10 per 15 minutes per IP;
  only failed attempts count, successful logins are skipped), change-password, and contact (5 per hour per IP); modifying requests with a foreign `Origin`
  are rejected. The single admin account is created manually once with `npm run admin:create` (password of at least 12 characters).
- **SQL scripts (`backend/db/`):** `001_tables.sql` (six tables with `CHECK` constraints, e.g. exactly one pending-change target and the allowed `role`,
  `change_type`, and `status` values), `002_functions.sql` (seven helper functions), `003_indexes.sql` (`users_one_admin`,
  `appointments_doctor_slot_uq`, `appointments_patient_slot_uq`, `pending_changes_one_per_doctor`, `pending_changes_one_per_specialty`,
  `doctors_specialty_id_idx`), `004_booking_triggers.sql` (booking rules, specialty immutability), `005_pending_changes.sql` (guard triggers,
  `execute_next_pending_change`, `cancel_pending_change`), `006_privileges.sql` (the `afiyah_app` connection role with column-level write privileges).
  Rule violations raise SQLSTATE codes `AF102`-`AF114` and `AF120`-`AF122`, which the backend maps to API errors. Tests: `db/tests/*.sql`, concurrency
  scripts in `db/tests/concurrency/`, and read-only `db/admin/verify_2a.sql` and `verify_2b.sql`.
- **Guard:** `_guard.sql` is included by every schema, test, and verify SQL script. It aborts the connection unless the current database is exactly
  `afiyah_test` (and equals `-v expect_db`) and the user is `omarsh` (the database owner) [Verified in `_guard.sql`].
- **Existence is not execution.** The scripts and tests being present does not show that any database was created, migrated, or seeded. [Owner-reported]
  The local `afiyah_test` database is running with the schema, the initial catalog (19 specialties, 61 doctors), and the administrator account. Ask the
  owner for anything else about the database state; never connect to a database to find out without separate explicit authorization.
- **A stale backend process can hide new code.** If a new `npm run dev` fails to bind port 3001 (`EADDRINUSE`), an older backend keeps serving the old
  code and the Vite proxy still reaches it (this produced a false 403 for the admin password change). Before debugging live behaviour after a code
  change, confirm that a single backend process holds the port (for example `lsof -nP -iTCP:3001 -sTCP:LISTEN`) and that it started after the change.

## Roles [Owner-reported]
Four roles: **Visitor**, **Patient**, **Doctor**, **Admin**.
- Visitor: public browsing, no account.
- Patient: books appointments (login required to confirm a booking).
- Doctor: **read-only** access to their own schedules and patient booking information. Doctors do not edit
  appointments or schedules.
- Admin: the single administrative account, also called the manager in the interface and in older notes (database `users.role` value `admin`, created
  manually once with `npm run admin:create` and never through public registration). [Report] The admin adds doctors and specialties immediately, manages deferred updates and
  deletions of existing ones (see "Deferred administrative changes"), views bookings, and views registered patients read-only. The admin can also
  change their own password (12-character minimum); there is no admin profile editor. Do not assume more than the report says.

## Approved database schema [Report]
PostgreSQL 18, exactly **six** tables, as defined in the frozen report (names, types, and constraints below are from its definition tables).
There is **no** `schema_migrations` table and no other table: do not add tables or columns without the owner's explicit approval.

| Table | Columns (type, constraint) |
|---|---|
| `users` | `user_id` INTEGER PK auto; `email` VARCHAR(255) required, UNIQUE; `password_hash` VARCHAR(255) required; `role` VARCHAR(20) required (`patient`, `doctor`, or `admin`); `is_active` BOOLEAN required, default TRUE |
| `patients` | `patient_id` INTEGER PK auto; `user_id` INTEGER FK required, UNIQUE; `first_name`, `last_name` VARCHAR(100) required; `phone` VARCHAR(20) required; `birth_date` DATE required; `address` VARCHAR(255) optional; `gender` VARCHAR(10) required; `blood_type` VARCHAR(5) optional |
| `doctors` | `doctor_id` INTEGER PK auto; `user_id` INTEGER FK required, UNIQUE; `specialty_id` INTEGER FK required; `first_name`, `last_name` VARCHAR(100) required; `birth_date` DATE required; `phone` VARCHAR(20) required; `image_url` VARCHAR(500) optional; `biography` TEXT optional; `years_of_experience` INTEGER optional |
| `specialties` | `specialty_id` INTEGER PK auto; `specialty_name` VARCHAR(100) required, UNIQUE; `appointment_duration` INTEGER required (minutes) |
| `appointments` | `appointment_id` INTEGER PK auto; `patient_id`, `doctor_id` INTEGER FK required; `appointment_date` DATE required; `appointment_time` TIME required (the start time only); `status` VARCHAR(20) required, default `booked` (`booked` or `cancelled`) |
| `pending_changes` | `change_id` INTEGER PK auto; `doctor_id` INTEGER FK optional; `specialty_id` INTEGER FK optional; `change_type` VARCHAR(20) required (`update` or `delete`); `new_data` JSONB optional (replacement values for an update); `status` VARCHAR(20) required, default `pending` (`pending`, `executed`, `cancelled`, or `failed`); `created_at` TIMESTAMPTZ required, set automatically; `execute_at` TIMESTAMPTZ required; `failure_reason` TEXT optional |

Relationships [Report]: user to patient and user to doctor are one-to-one; specialty to doctor is one-to-many; patient and doctor to appointment are
one-to-many; doctor and specialty each have a one-to-many relationship to pending changes (a request targets exactly one of them, and at most one
request per target may be pending at a time). The report also requires preventing conflicting booked appointments for the same doctor while allowing
a slot to be booked again after cancellation. The `appointments` table has **no** end-time or duration column: the end is derived from the doctor's
specialty duration, and past or cancelled appointments show the start time only.

Settled decisions [Owner-approved]:
- **Column spelling:** use `years_of_experience`. The report's definition table spells it `years_of_experince` (a typo, also `bioghraphy` and `chang_type`
  in its attribute list); the report is never edited, so the implementation adapts.
- **Foreign keys:** every foreign key is `RESTRICT` / `NO ACTION`, except `pending_changes.specialty_id` to `specialties.specialty_id`, which is
  `ON DELETE CASCADE`. Never cascade to appointments or doctors. Permanently deleting a specialty therefore also deletes its `pending_changes` rows,
  including its own executed deletion request; preserving that history is not required. A specialty may be deleted only when **no** doctor row
  references it, including inactive doctors. There is no `is_active` on specialties.
- **Blood type:** when the patient chooses «لا أعلم» (or leaves it unselected), store SQL NULL in `patients.blood_type` (`VARCHAR(5)`, nullable); never
  the string `unknown` or the Arabic label. The registration page is not redesigned.
- **Emails** are normalized to lower case in application logic before storing and looking up; no extra column.
- **`pending_changes` is the only mechanism for deferred changes:** no JSON file, JSON log, SQLite, second database, large objects, or extra table.

Implemented in the repository SQL (`backend/db/001-006`; previously listed as proposals) [Verified in the files; execution not verified]: `CHECK`
constraints (exactly one pending-change target; allowed `role`, `change_type`, and `status` values; `new_data` shape; `execute_at`; `failure_reason`),
partial unique indexes (one admin; one booked appointment per doctor slot and per patient slot; one pending change per doctor and per specialty), booking
triggers (including overlap and booking-horizon rules and specialty immutability), and the pending-change guard, executor, and cancel function.

## Deferred administrative changes [Owner-approved]
- The admin adds doctors and specialties **immediately**. Every update or deletion of an **existing** doctor or specialty is deferred by **14 calendar
  days**: doctor profile fields (phone, image, biography, other editable fields), the doctor's account email, a specialty's name and appointment
  duration, doctor deletion, and specialty deletion. A doctor's specialty is immutable. A doctor's own password change is immediate (as is the admin's
  and a patient's: password changes are not deferred).
- **Effective moment:** `pending_changes.execute_at` is **00:00 Asia/Damascus on the creation date plus 14 calendar days** (created on 1 October, effective
  15 October at 00:00 Damascus), derived from the Damascus calendar in the database, never by adding 336 hours and never from the operating system's
  time zone. A request is due when the current time is at or after `execute_at`.
- **One pending change per doctor or specialty.** The admin may cancel it before its effective time; cancelling immediately restores the booking
  horizon unless another applicable pending change still restricts it.
- **Booking horizon:** the normal window is today through today + 13 (Saturday-Thursday, Friday closed). While a doctor has a pending change, bookings must
  stay before its effective date; a pending change on a specialty applies to every doctor in it; if both exist, the earlier date controls. When a request
  is cancelled, applied, or fails, the restriction is lifted unless another applies. Adding a doctor to a specialty with a pending deletion is blocked.
- **Soft deletion of a doctor:** at the effective time, `users.is_active` becomes FALSE (hidden from public listings, no new bookings, no login); the doctor
  row and all historical appointments are preserved. Specialty deletion is prohibited while any doctor row references it, even an inactive doctor.
- **Execution:** applied inside PostgreSQL transactions with row locking and idempotent status transitions; a conflict records `failed` with a
  `failure_reason`. Due changes are processed at backend startup and before operations that depend on them, so downtime on the effective date is
  recovered safely. **No scheduler, cron, Redis, message broker, or other persistence mechanism.**
  - **Implementation (Stage 6 fix):** `middleware/dueChanges.js` calls `runDuePendingChanges` (`db/pendingChanges.js`, which repeats the database function
    `execute_due_pending_change()` until it returns NULL) once per request, before `authenticate`, on `/specialties`, `/doctors`, `/appointments`,
    `/doctor`, `/admin`, `POST /auth/login`, and `GET /auth/me`. `server.js` passes it to `createApp({ processDueChanges })`; the default is a no-op so
    tests stay isolated (a test checks the `server.js` wiring). If processing throws, the request fails with 503 `TRY_AGAIN` and the route is not run, so
    stale data is never served. Before this fix, an overdue change stayed unapplied (and blocked all bookings for its doctor or specialty) until the next restart.
  - **Verification:** offline tests only (fake databases). The live execution of an overdue change has **not** been verified; it needs a database write on
    `afiyah_test` with the owner's separate authorization.

## Business rules [Owner-reported]
- Booking window: **14 days**.
- Working hours: **09:00-17:00, Saturday-Thursday**. **Friday is closed**. Timezone: **Asia/Damascus**.
- **Appointment duration is configured per specialty** by the Admin. Do not assume a fixed set of values or that
  durations must be 20 or 30 minutes. (The original mock data, now unused, used 20 and 30 as sample values only.)
- All services are free; the system handles no real payments. Donation details shown are demo data.

## Permanent safety and workflow rules [Owner-approved]
1. Follow the workflow: Inspect → Plan → Review → Approval → Implement → Test → Stop.
2. Obtain explicit approval before modifying project files.
3. Never execute database operations (queries, migrations, seeds, or any script that connects to a database) without separate explicit authorization.
4. Never read or expose `.env` files or secrets.
5. Do not start servers or install dependencies without approval.
6. One coherent task per prompt.
7. Test essential functionality without unnecessary repeated testing.
8. Fix confirmed bugs minimally.
9. No unauthorized features, redesigns, or scope expansion.
10. Keep reports concise.

## Mandatory working rules
1. Existing project files and previously approved architecture are authoritative.
2. Do not restart the project, redesign approved pages, or recreate existing components.
3. Do not invent requirements or expand the approved scope. If something is unspecified, ask.
4. Before implementing, inspect the relevant files and present a precise plan; after implementing, run appropriate functional, responsive,
   accessibility, and regression checks, and say clearly what was and was not verified (offline checks are not integration tests).
5. Stop after each approved task and wait for review. Do not begin the next stage or phase (for example any further verification or development phase) unless
   instructed, and never implement a screen before its plan has been approved.
6. Do not modify unrelated files.
7. Do not create Git commits without explicit approval. Do not initialize Git or add Git configuration (e.g. `.gitignore`) unless version control has
   been explicitly approved as a task. (A `backend/.gitignore` exists; the project root and `frontend/` have none.)
8. Be transparent about incomplete work, assumptions, and test limitations.
9. `تقرير المشروع معدل.docx` is frozen and immutable (see "Graduation report: frozen specification").

## Repository layout [Verified]
```
backend/
  src/         app.js, server.js, config.js; routes/, repositories/, services/, validation/, middleware/ (incl. dueChanges), auth/, db/, errors/, utils/
  db/          001-006 SQL, _guard.sql, seed/ (001_catalog.sql), tests/ (SQL and concurrency), admin/ (read-only verify scripts)
  scripts/     create-admin.js
  test/        *.test.js, 14 files (node:test + supertest)
frontend/
  src/
    api/         http.js (apiRequest, ApiError), auth, doctors, specialties, appointments, patient, contact, doctorPortal, admin
    mock/        original mock data and simulated latency; kept unchanged, currently UNUSED (nothing imports it)
    hooks/       useAsyncData, useDocumentTitle
    context/     AuthContext (session, login, logout, updateUser), ThemeContext
    layouts/     PublicLayout
    components/  auth/ (AuthLayout, AuthTabs, AuthField, PasswordField, PasswordChangeForm, GuestOnly, RequireRole), admin/ (AdminLayout, PendingBadge),
                 cards/, common/ (PlaceholderValue is currently unused), doctor/ (DoctorAppointmentItem), layout/ (Navbar, Footer)
    pages/       public/ (Home, About, Specialties, Doctors, DoctorDetails, AppointmentBooking, Login, Register, Donations, Contact),
                 patient/ (MyAppointmentsPage, PatientProfilePage), doctor/ (DoctorSchedulePage, DoctorAppointmentsPage, DoctorPasswordPage),
                 admin/ (AdminHomePage, AdminSpecialtiesPage, AdminDoctorsPage, AdminPatientsPage, AdminAppointmentsPage, AdminPendingChangesPage,
                 AdminPasswordPage), PlaceholderPage (used only by the catch-all route)
    styles/      main.css + one CSS file per page area (auth.css for A7 and A8; contact.css; patient.css; doctor-portal.css; admin.css)
    utils/       adminValidation, appointments, arabicText, constants, contactValidation, format, passwordChangeValidation, pendingChanges, queryParams,
                 redirect, registrationValidation, schedule, validation
    content/     quran-verse-261.txt
  public/images/ hero-charitable-clinic.jpg, auth/ (login-illustration.jpeg), doctors/, donations/
```

## Architecture conventions [Verified]
- Data flow: page -> `src/api/*.js` -> `apiRequest` (`api/http.js`) -> `/api` on the same origin (the Vite dev server proxies `/api` to
  `127.0.0.1:3001`, see `vite.config.js`). The session cookie is sent automatically (`credentials: 'same-origin'`). Server errors become `ApiError`
  (`code`, `message`, `fields`); a 401 `UNAUTHENTICATED` clears the signed-in state in `AuthContext`. `src/mock/` is retained but unused: do not delete it
  without the owner's approval. Pages do not call `fetch` directly.
- Authentication on the frontend: `AuthProvider` / `useAuth` (status `loading | authenticated | guest | error`); `RequireRole` guards `/patient/*`,
  `/doctor/*`, and `/admin` (a guest goes to `/login?next=...`, a wrong role to its own home); `GuestOnly` wraps `/login` and `/register`;
  `utils/redirect.js` validates `next` and gives each role's home. Patients' home stays `/`; `/patient` redirects to `/patient/appointments`.
- Patient area (D3): «مواعيدي» groups appointments by the server's `phase`; cancellation is a two-step inline confirmation and is offered only when the server
  says `canCancel`; the profile edits only first name, last name, phone, and address (email, birthdate, gender, and blood type are read-only), and the
  navbar name is synchronized through `updateUser` only after the server confirms the save; the password change is the shared `PasswordChangeForm`
  (`components/auth`), which the doctor page (`/doctor/password`) and the admin page (`/admin/password`) reuse. It takes an optional `minLength`
  (default 8; the admin page passes `ADMIN_PASSWORD_MIN` = 12 from `utils/passwordChangeValidation.js`); the backend is the authority on the minimum.
- Doctor portal (3E), read-only: `/doctor` shows a day or week schedule (view and date in the URL, only booked slots), `/doctor/appointments` shows
  upcoming (today to today+30) and past (31-day windows ending yesterday, older windows on demand; the button hides after an empty window) appointments.
  Classification uses the backend's `phase` through `groupAppointments` and is never recomputed on the frontend; two requests must never overlap on
  today's date (that caused duplicated or missing appointments). The greeting shows the doctor's name only: no endpoint exposes the specialty. Patient
  phones are plain text (no `tel:` link). Doctors cannot create, edit, or cancel anything.
- Admin dashboard (3F): `/admin/*` is `AdminLayout` (page header, then a tab bar built from `ADMIN_SECTIONS`, then the section page) behind
  `RequireRole roles={['admin']}`. Sections: home (pending-change summary and section cards), specialties, doctors, patients and appointments
  (read-only, paged), pending changes, and password. Additions are immediate; edits and deletions send `PATCH`/`DELETE` and show the deferred request
  (HTTP 202) with its effective date; a doctor's specialty cannot be edited; the admin shell has no profile editor. API functions are in `api/admin.js`,
  validators in `utils/adminValidation.js`, and pending-change display helpers in `utils/pendingChanges.js`.
- Navbar: patients and doctors have extra links, so they use the slide-out menu below 1400px (`BREAKPOINTS` in `Navbar.jsx`); visitors and the admin keep
  992px (the admin navigates through the `AdminLayout` tab bar, not extra navbar links). The patient links are «مواعيدي» and «ملفي الشخصي»; the doctor
  links are «جدولي», «المواعيد», and «كلمة المرور» (the 1400px breakpoint was measured with two doctor links; with the third link the owner reported passed checks at 1400px and 1500px
  [Owner-reported: live; the method, browser, and theme are not recorded, and this is not a real-device test]).
- Async state: `useAsyncData(loader, deps)` returns `loading | success | error` plus `retry`. The loader must have a
  stable reference (define it outside the component) or be given matching `deps` (A5 passes the parsed id).
- Public API shapes must not expose `birthDate` or phone numbers. `age` is computed from birth date, never stored.
  Both doctor functions share one private mapper, `toPublicDoctor`, in `src/api/doctors.js`. `fetchDoctorById(id)`
  returns `null` for a missing or inactive doctor (the backend answers 404 `DOCTOR_NOT_FOUND`).
- Route parameters are validated with `parsePositiveIntParam`; an invalid or unknown id shows a not-found state.
  A5 keys its inner component on the id so that changing doctors starts from a fresh loading state.
- Shared constants (working hours and days, `BOOKING_WINDOW_DAYS` = 14, `CLINIC_TIME_ZONE`, `CLOSED_WEEKDAY`) live in
  `utils/constants.js`; reuse them.
- Dates and appointment slots: all day and time logic is in `utils/schedule.js` (native `Intl`, no date library). Dates are
  carried as `YYYY-MM-DD` strings and never parsed into local `Date` objects, so results do not depend on the visitor's
  time zone. The page renders what `fetchDoctorAvailability` returns (`{ doctorId, timeZone, slotDuration, days: [{ date,
  closed, slots: [{ startTime, endTime, booked }] }] }`), so a real backend can return the same shape without page changes.
  The appointment fields in the API responses are not the database columns: use the report's `appointments` columns (no end-time column; derive the end from the specialty duration).
- Page title: `useDocumentTitle`. Page header: shared `PageHeader` (breadcrumb + H1).
- Shared states: `Skeleton`, `EmptyState`, `ErrorState`. Reuse them rather than creating parallel versions.
- The clinic's official address, phone, and email are now approved and shown in the Footer (and the address on the About page); `tel:` and
  `mailto:` links exist only for that official phone and email, in the Footer. Any other clinic data that is still unknown uses
  `PlaceholderValue` (currently unused, kept for that purpose). Never invent real-looking data, never create `tel:` / `mailto:` links from
  placeholders or for unapproved values, and do not add other contact information (map, social links, extra numbers) without the owner's approval.
- Demo data must be labelled as demo (see the Donations page).

## Styling conventions [Verified]
- Design tokens for light and dark live in `styles/main.css` as `--af-*` variables bound to Bootstrap variables
  through `data-bs-theme`. Use tokens, not hard-coded colours.
- One CSS file per page, imported in `src/main.jsx`. Shared styles belong in `main.css`.
- Class prefix `af-`. Use CSS logical properties (`margin-inline-start`, `inset-inline-end`) for RTL.
- Every change must work in both light and dark themes.
- The approved A1 Hero deliberately scopes a light-text palette on `.af-hero` (it overrides `--af-*` tokens and the
  Bootstrap button variables inside the Hero only) in both themes. Leave this as is; do not "fix" it to match the theme tokens.

## Arabic / RTL rules
- Website is Arabic-only and RTL (`<html lang="ar" dir="rtl">`). All user-facing text is Arabic.
- Numbers are displayed with Latin digits (0-9) as currently implemented. [Verified]
- Counts and plurals use the helpers in `utils/format.js`. Search and sort use `normalizeArabic` / `compareArabic`
  (`utils/arabicText.js`); displayed names are never altered. [Verified]
- Code comments follow the existing convention (Arabic); identifiers are English. [Verified]

## Accessibility baseline (match existing pages) [Verified]
Skip link; semantic landmarks; no heading-level jumps; labelled form controls; `aria-live` for result counts;
`role="status"` with visually-hidden text for loading; visible `:focus-visible`; 16px form inputs; 44-48px touch
targets; decorative images use `alt=""`, informative images need real alt text; sufficient contrast in both themes.
(On A5 the doctor photo's frame has `role="img"` and an Arabic `aria-label`, because the shared `DoctorAvatar`
fixes `alt=""`.)

## Testing
- **Backend:** `cd backend && npm test` runs `node --test` over `backend/test/` (14 files, with `supertest` and fake databases, so they never touch
  PostgreSQL). SQL tests are in `backend/db/tests/` and run only through explicitly authorized execution (see the permanent rules). Latest recorded result
  (2026-10-29, a complete `npm test` run after fixes A-E): **130 passed, 0 failed, 0 skipped**. Earlier figures (112/112 reported by the owner before the Stage 6
  fixes; 115 in a partial run) are superseded. The SQL tests were not re-run. A passing offline suite proves the repository code, not the process running on port 3001.
- **Frontend:** no test framework or linter is installed [Verified]. Verification means `npm run build` in `frontend/` plus checks: static checks of the
  code, small Node logic harnesses on copies of the pure utilities, and browser checks (functional, responsive, light/dark, keyboard, RTL, console/network
  errors). Stages 3C-3E were closed on offline checks only; Stage 6 then exercised the running application [Owner-reported: live] (see "Current state").
  **The final verification against the graduation report is PERFORMED — PARTIALLY VERIFIED** (see "Current state"): the automated results above and the
  owner-reported manual checks are done; biography display with real text, the restriction notice with a real pending change, F1 live execution, and
  cross-browser and real-device checks are not.
- Earlier browser-based functional and regression testing of A1-A10 was reported by the owner as performed in a previous
  Claude conversation. Those results are historical, owner-reported, and have **not** been re-verified in the
  current workflow. Re-test whatever a new task touches, and say clearly what was and was not verified.
- The ad hoc browser test scripts used for A7-A10 ran from a temporary scratchpad outside the repository and are not part of the project; a
  few of their assertions are now outdated (see `PROJECT_STATUS.md`, deferred items). Browser coverage by Claude so far is headless Chrome with emulated
  viewports only; the owner's Stage 6 live tests used the running application in their own browser (browser and version not recorded). No Safari,
  Firefox, real devices, or screen readers are recorded.
- Dev server: `cd frontend && npm run dev` (it proxies `/api` to the backend on port 3001); backend: `cd backend && npm run dev` (needs its `.env`, which
  must never be read). Start servers only with approval.
- Practical notes: the project root and `frontend/` have no `.gitignore`, so build with `npm run build -- --outDir <temp dir> --emptyOutDir`
  to avoid leaving a `dist/` folder in the project. For narrow-viewport checks use real viewport emulation (e.g. the
  Chrome DevTools Protocol `Emulation.setDeviceMetricsOverride`, or an iframe of the target width); headless Chrome's `--window-size` clips below about
  500px, so those screenshots are unreliable.

## Assets
Do not assume images are correct. Verify existence, actual file format (not just extension), dimensions, and
visual content. Do not rename, convert, optimise, resize, replace, or otherwise modify image files without explicit approval.
- Doctor photographs (`public/images/doctors/`, 61 files named `doctor-NN`) intentionally have **mixed extensions**:
  53 `.png`, 7 `.jpg` (ids 14, 15, 16, 17, 19, 21, 29), and one JPEG named `doctor-18.jpg.jpg`. `src/mock/doctors.js`
  (currently unused) maps each id to its real filename (default `.png`, plus an explicit override map for the JPEG files). The live image path comes from
  the backend (`doctors.image_url`); this file does not verify what a database holds. Do not assume one extension.
- The doctor image collection (~100 MB) and any optimisation are deferred until the owner approves. See `PROJECT_STATUS.md`.
- The A7 illustration `public/images/auth/login-illustration.jpeg` is a PNG-encoded 1254x1254 file (about 1.25 MB) with a `.jpeg`
  extension. It displays correctly in the tested browser, and the owner approved its current appearance. No conversion, renaming,
  or optimisation was authorized.
- As of 2026-10-25 some image files were changed outside this workflow (presumably by the owner): the Hero image is now a
  1679x937 PNG-format file still named `hero-charitable-clinic.jpg`, and the contents of `doctor-17.jpg` (now PNG data) and
  `doctor-44.png` (now JPEG data) appear swapped. Filenames and the `doctors.js` mapping are unchanged, and everything displays
  and passes the Hero and A4/A5 checks (see `PROJECT_STATUS.md`). Treat an extension as not guaranteed to match the content
  (check with `file`), do not "fix" these by renaming or converting without the owner's approval, and re-run the Hero contrast
  check if the Hero image changes again.
