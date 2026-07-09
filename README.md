# DevPulse

> Community debugging platform for developers · Internship Project · 8-Week Program

**Stack**: FastAPI · Next.js 14 (App Router) · PostgreSQL 16 · SQLAlchemy + Alembic · Tailwind CSS

---

## Milestones

| # | Weeks | Theme | Status |
|---|-------|-------|--------|
| 1 | 1–2 | Foundation & Authentication | ✅ Complete |
| 2 | 3–4 | Posts, Engagement & Profiles | ✅ Complete |
| 3 | 5–6 | Social Graph & Chat | 🔲 Upcoming |
| 4 | 7–8 | Super Admin & Deployment | 🔲 Upcoming |

---

## Project Structure

```
devpulse/
├── backend/          # FastAPI application
│   ├── app/
│   │   ├── core/     # config, database, security, deps
│   │   ├── models/   # SQLAlchemy ORM models
│   │   ├── schemas/  # Pydantic request/response schemas
│   │   ├── routers/  # HTTP route handlers
│   │   └── services/ # Business logic
│   ├── alembic/      # Database migrations
│   ├── tests/        # pytest suite (Milestone 4)
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── requirements.txt
└── frontend/         # Next.js application
    ├── app/          # App Router pages
    │   ├── (auth)/   # login, register, verify-otp
    │   └── feed/     # Protected feed page
    ├── components/   # Reusable UI components
    ├── lib/          # API client, auth context
    └── middleware.ts # Route protection
```

---

## Local Setup — Milestone 1

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Postgres)
- [Python 3.12+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/) + npm

---

### 1 · Backend

```bash
cd devpulse/backend

# Copy env file and fill in your values
cp .env.example .env
# Edit .env — at minimum set SECRET_KEY, SMTP_* vars

# Start Postgres via Docker
docker-compose up -d db

# Install Python dependencies (use a virtual environment)
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload
# → API running at http://localhost:8000
# → Interactive docs at http://localhost:8000/docs
```

---

### 2 · Frontend

```bash
cd devpulse/frontend

# Install dependencies (already done if you ran create-next-app)
npm install

# Copy env file
cp .env.local.example .env.local  # or it's already at .env.local

# Start dev server
npm run dev
# → Frontend running at http://localhost:3000
```

---

### 3 · End-to-End Flow

1. Open **http://localhost:3000/register**
2. Fill in Full Name, Email, Password → **Create Account**
3. Check your email for a 6-digit OTP (or check the backend console logs if SMTP is not configured)
4. Enter the OTP at **/verify-otp** → redirected to feed
5. Log out → try navigating to **/feed** → redirected to login

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:5432/db` |
| `SECRET_KEY` | Random 32-byte hex string for JWT signing |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Default: `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Default: `30` |
| `FRONTEND_URL` | CORS allowed origin (default: `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | From [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GITHUB_CLIENT_ID` | From [GitHub Developer Settings](https://github.com/settings/developers) |
| `GITHUB_CLIENT_SECRET` | From GitHub Developer Settings |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | e.g. `587` (STARTTLS) or `465` (SSL) |
| `SMTP_USERNAME` | Your email / SMTP login |
| `SMTP_PASSWORD` | Your App Password (Gmail) or API key |
| `SMTP_FROM_EMAIL` | Sender email address |
| `SMTP_USE_TLS` | `true` for port 587, `false` for port 465 |

> **Note**: If `SMTP_USERNAME` or `SMTP_PASSWORD` is empty, the backend will log OTP codes to the console instead of sending emails — convenient for local dev without a mail server.

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend URL (default: `http://localhost:8000`) |

---

## Setting Up OAuth (Optional for Milestone 1)

### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new **OAuth 2.0 Client ID** (Web application)
3. Add Authorized redirect URI: `http://localhost:8000/auth/google/callback`
4. Copy Client ID and Secret to your `.env`

### GitHub

1. Go to [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set Authorization callback URL: `http://localhost:8000/auth/github/callback`
4. Copy Client ID and Secret to your `.env`

---

## API Endpoints — Milestone 1

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Register new user, send OTP email |
| POST | `/auth/login` | Public | Login with email + password |
| POST | `/auth/verify-otp` | Public | Verify OTP code |
| POST | `/auth/resend-otp` | Public | Resend OTP (rate-limited: 5/hr) |
| POST | `/auth/logout` | Public | Clear auth cookies |
| POST | `/auth/refresh` | Cookie | Rotate JWT tokens |
| GET | `/auth/me` | Cookie | Return current user |
| GET | `/auth/google` | Public | Initiate Google OAuth |
| GET | `/auth/google/callback` | Public | Google OAuth callback |
| GET | `/auth/github` | Public | Initiate GitHub OAuth |
| GET | `/auth/github/callback` | Public | GitHub OAuth callback |
| GET | `/health` | Public | API health check |

---

## Security Notes

- Passwords hashed with **bcrypt** via `passlib` — never stored or logged in plaintext
- JWT tokens stored as **httpOnly, Secure, SameSite=Lax cookies** — not localStorage
- OAuth `state` parameter validated to prevent CSRF attacks
- CORS locked to `FRONTEND_URL` only
- OTP codes expire in **10 minutes** and are **single-use**
- OTP resend rate-limited to **5 per user per hour**
- Admin role enforced server-side via `require_admin` dependency (not just hidden UI)

---

## Running with Docker (Full Stack)

```bash
cd devpulse/backend

# Make sure .env is filled in
docker-compose up --build
# API at http://localhost:8000, Postgres at localhost:5432

# In a separate terminal, run migrations:
docker exec devpulse_api alembic upgrade head
```

---

## Git Workflow

```bash
# Feature branch
git checkout -b feature/your-feature-name

# Commit with conventional commits
git commit -m "feat: add OTP rate limiting"

# Open a PR for review before merging to main
```

---

*Built as part of the DevPulse 8-week internship program.*
