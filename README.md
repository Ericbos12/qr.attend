# AttendQR — Classroom Attendance Register

A real-time QR code classroom attendance web application. Instructors create an administrator account, manage saved course codes, and project a live rotating QR code during class. Students scan from their phone browser and enter their **Student ID** and **Full Name** — no pre-loaded student roster or app installation required.

## Core Features
- **Teacher Administrator Accounts**: Register/sign in, change password in-app, and reset forgotten passwords via 15-minute single-use reset codes.
- **Student ID & Full Name Check-In**: Students scan the live QR code and submit only their Student ID and full name.
- **Anti-Screenshot Rotating QR Codes**: Tokens rotate every 5–10 seconds with a strict 2.5-second boundary grace window.
- **Anti-Link-Sharing Tickets**: On scan, the token is immediately exchanged for a single-use, device-bound ticket locked to an `HttpOnly; SameSite=Strict` cookie and wiped from the browser URL bar.
- **One Submission Per Device**: Blocks checking in twice on the same phone for an absent classmate.
- **Late Check-In Tracking**: Optional late arrival threshold per session (5–30 minutes after start), automatic `Present` / `Late` tagging, and one-click manual status override.
- **Attendance Reports & Bulk CSV Export**: Filter by course and date range, view course & per-student attendance rates, and export single sessions, student summaries, or bulk registers as Excel-compatible CSV files.
- **Optional Classroom GPS Radius**: Optionally require students to be physically within 75m of the classroom (supported automatically over HTTPS when hosted).
- **PostgreSQL & SQLite Storage**: Uses PostgreSQL automatically when `DATABASE_URL` is configured (recommended for production hosting), or built-in SQLite (`server/data/attendqr.db`) when running with a persistent disk.

## Production Deployment

### Environment Variables
See `.env.example`:
- `PORT` — HTTP port (set automatically by cloud hosts; defaults to `3001`).
- `ATTENDQR_SECRET` — **Required**: cryptographically random string of at least 32 bytes.
- `DATABASE_URL` — PostgreSQL connection string (Render Postgres, Railway, Neon, Supabase).
- `SQLITE_PATH` — Optional SQLite file path if deploying with a persistent volume instead of PostgreSQL.
- `DATABASE_SSL` — Optional; defaults to SSL enabled for remote PostgreSQL (`false` disables SSL).

### Build & Start Commands (Render / Railway / Fly.io)
- **Build Command**: `npm ci --include=dev && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`
- **Node.js Version**: `>= 22.5.0`

A `render.yaml` Blueprint is included for one-click deployment on Render with a managed PostgreSQL database and auto-generated `ATTENDQR_SECRET`.
