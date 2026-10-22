# UPSA Digital Collaboration and Supervisor Tracking System

*Developing a Digital Collaboration and Supervisor Tracking System to Optimize Group Project Workflows: A Case Study of UPSA* — final-year project.

Next.js 15 (App Router) · TypeScript · PostgreSQL · Prisma 6 · Zod · Vitest. No paid services are needed.
This is an independent student project; it is **not** an official UPSA system and has no integration with UPSA's student records.

## What it does

| Role | Can do |
|---|---|
| **Student** | Register; choose an academic category/semester and create a project with their own topic (becomes leader), or join a student-created project with a code; manage members; create/assign/update tasks; track milestones; submit documents and revised versions; read supervisor feedback and reply; see supervision meeting notes, dashboard, deadlines, notifications and the project activity timeline. |
| **Supervisor** | See **only projects an administrator assigned to them**; monitor and create project tasks; manage milestones; record supervision meetings and action items; review submissions with structured feedback (comment, request revision, accept); move a project to *revision required* / *completed*; reports and CSV export; notifications. |
| **Administrator** | Create broad academic categories and semesters for students to choose from; assign or reassign supervisors; create supervisor/admin accounts; change roles; activate/deactivate accounts; delete projects; read the audit log. Administrators do not create or edit student research topics or assign students to topic projects. Created by the seed script — never by public registration. |

Progress figures = completed ÷ recorded tasks (and milestones). They describe recorded activity, **not** quality, and the system never grades work: review decisions are made by the supervisor.

## 1. Required software (Windows)
- **Node.js 20.9 or newer** (LTS 22 recommended) – https://nodejs.org (check: `node -v`)
- **PostgreSQL 15+** – https://www.postgresql.org/download/windows/ (remember the `postgres` password you set; keep port 5432)
- VS Code (optional), pgAdmin (installed with PostgreSQL)

## 2. Install dependencies
```powershell
cd UPSA_Digital_Collaboration_System_Starter
npm install
```

## 3. Create the databases
In pgAdmin (Query Tool) or `psql -U postgres`:
```sql
CREATE DATABASE upsa_collaboration;
CREATE DATABASE upsa_collaboration_test;   -- used only by automated tests (gets wiped)
```

## 4. Configure `.env`
```powershell
Copy-Item .env.example .env
```
Edit `.env`: put your PostgreSQL password in both URLs (URL-encode special characters, e.g. `@` → `%40`), and choose `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (10+ characters, with a letter and a number). Never commit `.env` (it is in `.gitignore`).

## 5. Create the tables (migrations)
```powershell
npx prisma migrate dev --name init
```
This creates `prisma/migrations/…_init` from `prisma/schema.prisma` and applies it. **Commit the generated `prisma/migrations` folder.** Later schema changes: edit the schema and run `npx prisma migrate dev --name describe_change`.

## 6. Create the first administrator (development only)
```powershell
npm run db:seed
```
Creates the admin from your `.env` values with *must change password at first sign-in*. It refuses to run when `NODE_ENV=production`. Create supervisors from **Users → Create account** while signed in as admin.

For an approved first-production-admin bootstrap, use a one-time deployment command against the intended production database; do not enable public registration for privileged roles:
```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:BOOTSTRAP_ADMIN_PASSWORD = "<strong unique temporary password>"
$env:BOOTSTRAP_ADMIN_CONFIRM = "CREATE_FIRST_ADMIN"
npm run db:bootstrap-admin
Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL,Env:BOOTSTRAP_ADMIN_PASSWORD,Env:BOOTSTRAP_ADMIN_CONFIRM
```
The command serializes concurrent attempts, refuses to run if any administrator already exists, requires explicit confirmation, records an audit event, and forces a password change at first sign-in. Run it only from a trusted operator environment with access to the production database. Never store the bootstrap secret in deployment configuration or source control.

## 7. Run
```powershell
npm run dev
```
Open http://localhost:3000 (health check: http://localhost:3000/api/health).

Typical demo flow: admin creates broad categories/semesters and assigns supervisors → students register and create project topics under a category (or with a custom period) → a student leader shares the join code → leader moves the project to *In progress* → tasks/milestones → student submits a document → supervisor requests a revision → student uploads version 2 → supervisor accepts → supervisor completes the project.

## 8. Tests and build
```powershell
npm run typecheck
npm run lint
npm test            # needs DATABASE_URL_TEST (migrations are applied automatically)
npm run build
npm run check       # typecheck + lint + tests
```
Tests cover: registration/login/invalid credentials/rate limiting/sessions; role restrictions (student → admin actions, unrelated projects, unassigned supervisors); project creation and membership; tasks and assignment rules; submissions, versions, structured feedback, review status transitions, meeting records and file access; notifications; admin controls; dashboard/report data; CSV formula safety; input validation.

## Security design (summary)
- Passwords hashed with bcrypt (cost 12); 10–72 byte limit enforced.
- Server-side sessions: random token in an `HttpOnly`, `SameSite=Lax` (`Secure` in production) cookie; only its SHA-256 hash is stored, so logout, deactivation, role change and password change revoke access immediately. 8-hour expiry.
- Every page, action and API route re-checks the user on the server. `getProjectAccess` is the single rule for project visibility; unauthorised records return "not found" (no IDOR).
- Administrators manage project metadata and accounts but cannot read student submissions, downloads, or review feedback; those are limited to project members and the assigned supervisor.
- All mutations are Next.js Server Actions (built-in Origin check against CSRF). Zod validates every input on the server.
- Login/registration/join-code rate limiting (database counters); identical login errors for unknown email, wrong password and deactivated accounts.
- Uploads: extension allow-list, file-signature check, size limit, random storage names, private folder, download only through an authorised route (`Content-Disposition: attachment`, `nosniff`).
- `MAX_UPLOAD_MB` must be a whole number from 1 to 10 MB; Next.js Server Actions accept up to 12 MB of request data so multipart overhead remains covered.
- Audit log for sign-ins, account/role changes, supervisor assignment and project deletion; no secrets recorded. CSV export neutralises formula injection.

## Known limitations (be upfront about these in your report)
- **No email**: no verification or password-reset emails (no mail provider is configured). Admins can set a temporary password; users must change it at next sign-in.
- **Document storage**: local development uses private files in `./storage`; Vercel Blob operations use private objects. With a Vercel project connected to the Blob store, the Blob SDK uses Vercel OIDC and `BLOB_STORE_ID`; `BLOB_READ_WRITE_TOKEN` is optional for environments that use token-based authentication instead. Keep any configured token server-side (never as a `NEXT_PUBLIC_` variable). Downloads are authorized and streamed through `/api/files/[versionId]`; Blob URLs are not exposed to clients. The current storage branch selects Blob when `VERCEL=1` and `NODE_ENV=production`; it does not explicitly distinguish Production from Preview. Otherwise, it uses the local filesystem, which may be ephemeral in hosted environments. Existing local-file records remain readable where their files still exist, but local files from previous ephemeral Vercel instances cannot be migrated automatically.
- **Project deletion cleanup**: storage object deletions are recorded before project data is removed. Failed deletes remain queued and can be retried with `npm run db:cleanup-files`; schedule this command in a trusted operator environment to reconcile transient provider failures.
- **Deadline reminders** are created on the server when a user next opens the app (no background scheduler locally).
- Joining a project is by **join code or leader invitation**; there is no approval queue.
- One supervisor per project. Supervisors may create tasks for assigned projects; students update their own assigned task statuses.
- Public registration accepts any email address (no check against UPSA student IDs).
- Before real use with student data: HTTPS hosting, backups, storage/virus scanning, privacy review and institutional approval.

## Troubleshooting
- **`P1001 Can't reach database server`** – PostgreSQL service not running (Windows *Services* → `postgresql-x64-…` → Start), or wrong host/port.
- **`P1000 Authentication failed`** – wrong password in `DATABASE_URL`; URL-encode special characters.
- **`database "upsa_collaboration" does not exist`** – run the `CREATE DATABASE` statements in step 3.
- **Tests: "DATABASE_URL_TEST must point to a database whose name contains 'test'"** – safety check; fix `.env`.
- **`EADDRINUSE` / port 3000 busy** – `npm run dev -- -p 3001`.
- **Prisma `EPERM` rename error on Windows** – stop `npm run dev` and any Prisma Studio, then re-run `npx prisma generate`.
- **Stuck on the login page** – clear the `upsa_session` cookie; make sure you ran `npm run db:seed` and used the seed credentials.
