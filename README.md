# DevPulse

> Modern Developer Community & Real-Time E2EE Communication Platform  
> **Built with**: FastAPI · Next.js 14 (App Router) · PostgreSQL 16 · Signal Protocol E2EE · WebSockets · Tailwind CSS · Cloudinary

---

## 🌟 Key Features

### 🔒 1. Signal Protocol End-to-End Encrypted (E2EE) Chat
- **Client-Side Encryption**: Messages encrypted directly on device using Signal Protocol (PreKey & Whisper message envelopes).
- **Real-Time WebSockets**: Live messaging, instant reaction updates, read receipts, and online status badges.
- **Media & E2EE Previews**: Encrypted chat image attachments via Cloudinary and local plaintext caching for fast conversation list previews.
- **Desktop Push Notifications**: Desktop alerts for incoming messages when inactive.
- **Blocked State Handling**: Seamless UI indicators and disabled composer banners for blocked interactions.
- **Mobile Chat Flow**: Mobile-tailored side-by-side to single-pane navigation with back button support.

### 📱 2. Fully Responsive UI (320px–4K)
- **Universal Responsiveness**: Optimized across all viewports from 320px mobile devices to large desktop monitors.
- **Mobile App Experience**: Fixed bottom navigation bar, context-aware mobile top headers, mobile logout button, and floating action button (FAB) auto-hiding on chat views.
- **Optimized Tables & Grids**: Horizontally scrollable data tables and adaptive tab bars for admin & user management on small viewports.

### ⚡ 3. High-Performance Engagement & Feed
- **Optimistic UI Updates**: 0 ms lag when Liking or Reposting posts — zero full-page spinners or flickering.
- **Rich Post Content**: Code snippets with syntax-style pre-formatting, image attachments, comment threads, reposting, and archiving.
- **User Search & Explore**: Instant debounced search for developers and infinite-scrolling Explore feed.

### 👤 4. Social Graph & Profile Customization
- **Public & Private Accounts**: Privacy controls for user profiles with follow request approval workflows.
- **Custom Avatars & Bios**: Cloudinary-backed avatar uploads and profile customization.
- **User Blocking**: Block/unblock functionality automatically removing follow links and restricting message capability.

### 🛡️ 5. Super Admin Dashboard
- **Telemetry & Stats**: Platform overview with active user metrics, post statistics, and system counts.
- **User Management**: Search, update user roles (`admin`, `user`), and block/unblock accounts.
- **Content Moderation**: Filter, inspect, archive, or hard-delete posts across the platform.

---

## 🚀 Milestones

| # | Weeks | Theme | Status |
|---|-------|-------|--------|
| 1 | 1–2 | Foundation, Authentication & OAuth | ✅ Complete |
| 2 | 3–4 | Posts, Engagement & Profiles | ✅ Complete |
| 3 | 5–6 | Social Graph, Signal E2EE & Real-time Chat | ✅ Complete |
| 4 | 7–8 | Super Admin Dashboard, Responsive UI & Deployment | ✅ Complete |

---

## 🏗️ Project Architecture

```
Devpulse/
├── backend/                  # FastAPI Application
│   ├── app/
│   │   ├── core/             # Database, Security, Config, Dependencies
│   │   ├── models/           # SQLAlchemy ORM Models (User, Post, Chat, Block, Follow)
│   │   ├── schemas/          # Pydantic Schemas
│   │   ├── services/         # Cloudinary, E2EE Key Storage, Chat History
│   │   └── routers/          # Route Handlers (Auth, Posts, Users, Chat, Admin)
│   ├── alembic/              # Database Migrations
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
└── frontend/                 # Next.js 14 App Router Application
    ├── app/                  # App Pages (feed, chat, explore, profile, admin, auth)
    ├── components/           # UI Components (AppLayout, PostCard, ChatList, Modals)
    ├── lib/                  # Signal E2EE Engine, API Client, Socket Context, Auth
    └── public/               # Static Assets
```

---

## 🛠️ Local Setup Guide

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Python 3.12+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/)

---

### 1 · Backend Setup

```bash
cd backend

# Create & activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start PostgreSQL database in Docker
docker compose up -d db

# Run database migrations
alembic upgrade head

# Run FastAPI development server
uvicorn app.main:app --reload --port 8000
# → API Docs: http://localhost:8000/docs
```

---

### 2 · Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
# → Web App running at http://localhost:3000
```

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://...`) |
| `SECRET_KEY` | JWT signing secret key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifespan (default: `15`) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifespan (default: `30`) |
| `FRONTEND_URL` | Allowed CORS origin (default: `http://localhost:3000`) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for media uploads |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend HTTP API base URL |
| `NEXT_PUBLIC_WS_URL` | WebSocket server base URL |

---

## 📡 API Reference Overview

| Module | Method | Path | Auth | Description |
|--------|--------|------|------|-------------|
| **Auth** | POST | `/auth/register` | Public | Register user & dispatch OTP |
| | POST | `/auth/login` | Public | Authenticate user & issue JWT |
| | GET | `/auth/me` | Cookie | Retrieve active user session |
| **Posts** | GET | `/posts` | Token | Get feed posts |
| | POST | `/posts` | Token | Create new post with code/image |
| | POST | `/posts/{id}/like` | Token | Toggle post like state |
| | POST | `/posts/{id}/repost` | Token | Repost existing post |
| **Users** | GET | `/users/explore` | Token | Get explore users list |
| | POST | `/users/{username}/follow` | Token | Toggle follow / follow request |
| | POST | `/users/{username}/block` | Token | Block / unblock user |
| **Chat & E2EE**| GET | `/chat/conversations` | Token | Fetch user conversations & unread count |
| | GET | `/chat/history/{id}` | Token | Fetch conversation message history |
| | PUT | `/chat/me/key-bundle` | Token | Upload Signal E2EE key bundle |
| **Admin** | GET | `/admin/stats` | Admin | Fetch system telemetry |
| | GET | `/admin/users` | Admin | Paginated user management table |
| | PATCH | `/admin/users/{id}/block` | Admin | Administrative user block |

---

## 📄 License

This project is open-source and built as part of the DevPulse development program.
