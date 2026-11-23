# AttendQR — Classroom Attendance Register

A real-time QR code classroom attendance web application. Instructors sign in to their administrator account, manage saved course codes, and project a live rotating QR code during class. Students scan from their phone browser and enter their **Student ID** and **Full Name** — no pre-loaded student roster or app installation required.

## Core Features
- **Teacher Administrator Accounts**: Each instructor registers/signs in and manages their own saved course codes.
- **Student ID & Full Name Check-In**: Students scan the live QR code and submit only their Student ID and full name.
- **Anti-Screenshot Rotating QR Codes**: Tokens rotate every 5 seconds (configurable 5s / 8s / 10s) with a strict 2.5-second boundary grace window.
- **Anti-Link-Sharing Tickets**: On scan, the token is immediately exchanged for a single-use, device-bound ticket locked to an `HttpOnly; SameSite=Strict` cookie and wiped from the browser URL bar.
- **One Submission Per Device**: Blocks checking in twice on the same phone for an absent classmate.
- **Optional Classroom GPS Radius**: Optionally require students to be physically within 75m of the classroom (supported automatically over HTTPS when hosted).
- **Live Roll Call & CSV Export**: Real-time attendance list via Server-Sent Events and downloadable Excel-compatible CSV registers.

## Local Development & Testing

```bash
npm install
npm run build
npm test
npm start
```

Open `http://localhost:3001` in your browser (or double-click `start.bat` on Windows).

## Environment Variables (For Hosting)
- `PORT` — HTTP port (set automatically by cloud hosts such as Render, Railway, or Fly.io; defaults to `3001`).
- `ATTENDQR_SECRET` — Strong random secret string used to sign administrator sessions and device cookies in production.
