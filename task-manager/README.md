# IT Ticket System — 3-Tier Application

A ticketing app with two roles:

- **Users**: sign in, report a problem (title + description + auto-tracked time), see only their own tickets, mark their own tickets done / not done.
- **Admin**: sees a dashboard (total / done / not-done counts) plus a "View Database" button that shows every ticket from every user in a spreadsheet-style table (ID, reported by, problem, description, created time, closed time, status).

## Stack

- **Frontend** (`/frontend`): static HTML/CSS/JS served by nginx.
- **Backend** (`/backend`): Node.js + Express REST API, JWT authentication, bcrypt password hashing.
- **Database** (`/database`): PostgreSQL — `users` and `tickets` tables, created automatically on first run.

## Run it

```bash
docker compose up --build -d
```

- Frontend: http://localhost:8080 (or `http://<server-ip>:8080`)
- Backend health check: http://localhost:4000/api/health

## Default admin login

On first startup, the backend automatically creates one admin account (check the backend logs to confirm):

```bash
docker compose logs backend | grep -A3 "Default admin"
```

Default credentials (set in `docker-compose.yml`, change them there before deploying anywhere real):
- **username**: `admin`
- **password**: `admin123`

Any other login goes through **Create Account**, which always creates a regular user (not admin). There is currently no UI to promote a user to admin — if you need a second admin, either change `ADMIN_USERNAME` before first run, or manually update the `role` column in the `users` table:

```sql
UPDATE users SET role = 'admin' WHERE username = 'someuser';
```

## Important security notes before using this for real

This is a learning project — a few things to change before anyone but you touches it:

1. **Change `JWT_SECRET`** in `docker-compose.yml` to a long random string.
2. **Change `ADMIN_PASSWORD`** before first run (or immediately change it via the database once logged in — there's no "change password" UI yet).
3. Currently served over plain HTTP — for anything beyond local practice, put it behind HTTPS (e.g. an ALB with an ACM certificate, or nginx + Let's Encrypt).

## API endpoints

| Method | Path                    | Auth        | Description                              |
|--------|--------------------------|-------------|--------------------------------------------|
| POST   | /api/auth/register       | none        | Create a regular user account              |
| POST   | /api/auth/login          | none        | Log in, returns a JWT                       |
| GET    | /api/tickets             | user/admin  | List your own tickets                       |
| POST   | /api/tickets             | user/admin  | Create a ticket                             |
| PUT    | /api/tickets/:id         | owner/admin | Update status ('open' or 'done')            |
| GET    | /api/admin/stats         | admin only  | Total / done / open counts                  |
| GET    | /api/admin/tickets       | admin only  | All tickets from all users                  |

## Project structure

```
task-manager/
├── backend/    → server.js, package.json, Dockerfile
├── frontend/   → index.html, style.css, app.js, Dockerfile
├── database/   → init.sql, Dockerfile
├── docker-compose.yml
└── README.md
```
