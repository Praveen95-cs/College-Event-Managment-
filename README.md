# Avenor — Elevate Every Event.

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.3-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Google Gemini](https://img.shields.io/badge/AI-Gemini%20Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Groq](https://img.shields.io/badge/AI-Groq%20Cloud-F55036?logo=fastapi&logoColor=white)](https://groq.com/)
[![Judge0](https://img.shields.io/badge/Code%20Runner-Judge0%20CE-000000?logo=gnu-bash&logoColor=white)](https://judge0.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An enterprise-grade, modern MERN stack web platform for college event management, live coding arenas, and quota-resilient AI-driven online assessments.

---
Live Demo - https://college-event-manager-cxf4.onrender.com/

## 🌟 What is Avenor?

**Avenor** delivers a unified campus experience for students, organizers, and campus administrators. It bridges university event organization with automated programming competitions and interactive quizzes, powered by Google Gemini, Groq Cloud, and sandboxed code execution via Judge0.

### Core Highlights
- 🏛️ **Event & Campus Life Management**: Event lifecycle, RSVP/registration, capacity enforcement, announcements, and disk-cleaning cascade deletions.
- ⚡ **Quota-Resilient AI Engine**: Configurable provider layer (Google Gemini & Groq) with automatic fallback, free-tier cooldown timers, and request deduplication.
- 💾 **Zero-Quota MongoDB Question Bank (`QuestionCache`)**: Automatically indexes and reuses validated coding problems and MCQs across competitions with zero API quota consumption.
- 💻 **Real-Time Coding Arena**: Embedded Monaco Editor (VS Code engine) supporting Python 3, JavaScript (Node.js), C++ (GCC), and Java (OpenJDK) with public and hidden test cases.
- 📝 **Live Quiz Assessments**: Auto-saving MCQs, question palettes (answered, flagged, unvisited), negative marking, and server-side timer enforcement.
- 🏆 **Live Podium & Leaderboard**: Real-time rank calculation based on score (descending) and completion time (ascending), with one-click Excel (`.xlsx`) export.
- 🛡️ **Zero Secret Leakage**: Strict server-side payload sanitization. Hidden test cases, solution explanations, and API keys are never exposed to clients.

---

## 🏗️ Architecture & Modules

```
┌─────────────────────────────────────────────────────────────────┐
│                     AVENOR CLIENT (React 18)                   │
│   Navbar & Glass Header  │  Hero  │  Event Hub  │  Admin CRM     │
│   Competition Wizard     │  Quiz Arena  │  Monaco Coding Arena  │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTP / REST / JSON
┌────────────────────────────────▼────────────────────────────────┐
│                   EXPRESS & NODE.JS BACKEND                     │
│  - JWT & RBAC Middleware (Student, Organizer, Admin)            │
│  - In-Flight Request Deduplication Map                          │
│  - Cascade Deletion & Storage Reclamation Engine                │
├───────────────────────┬─────────────────────────┬───────────────┤
│    AI Provider Layer  │    Question Cache Bank  │ Judge0 Runner │
│  - BaseProvider       │  - MongoDB Collection   │ - Isolated CE │
│  - GeminiProvider     │  - SHA-256 Fingerprint  │ - Ephemeral   │
│  - GroqProvider       │  - 0 API Quota Consumed │   Sandboxes   │
└───────────┬───────────┴───────────┬─────────────┴───────┬───────┘
            │                       │                     │
    Google Gemini / Groq      MongoDB Atlas        Judge0 CE API
```

---

## 🚀 Key Features

### 1. Event & Competition Management (With Space Reclamation)
- **Cascade Deletion Engine**:
  - Deleting an Event automatically cleans up all associated Competitions, student `AssessmentAssignment` records, `Registration` entries, and `Notification` items.
  - Automatically unlinks and unlinks physical uploaded event photos from the server disk (`/uploads/`) to reclaim storage.
- **Competition Deletion**:
  - Permanently removes competition drafts, published assessments, participant code submissions, and scorecards from MongoDB.
- **Admin Dashboard**:
  - Dedicated Competitions tab and Events management with instant delete confirmations and status monitors.

### 2. Quota-Resilient AI Engine & MongoDB Question Bank
- **Free-Tier Optimization**:
  - Prioritizes Google's verified active free-tier models (`gemini-3.5-flash` and `gemini-3.5-flash-lite`).
  - Eliminates redundant API calls and periodic `listModels()` scans.
- **Provider Interchangeability**:
  - Plug-and-play architecture supporting **Google Gemini** or **Groq Cloud** via environment configuration without modifying business logic.
- **In-Flight Request Deduplication**:
  - Prevents burst API calls caused by rapid button clicks, page reloads, or concurrent submissions.
- **Active Cooldown Countdown (HTTP 429 Handling)**:
  - Parses HTTP 429 retry delays from response headers and Google error details.
  - Enforces active cooldown timers on backend and frontend with live second countdowns and immediate UI fallback prompts.
- **Zero-Quota MongoDB Cache**:
  - Checks MongoDB for pre-validated questions matching topic and difficulty before invoking AI.
  - Allows organizers to load questions directly from the database with **0 external quota consumed**.
- **Organizer Fallback**:
  - Organizers can write or edit questions manually in the Studio. Invalid or incomplete questions are strictly blocked from publishing.

### 3. Live Assessment & Coding Arena
- **Personalized Exam Variants**:
  - Participants receive locked question variants drawn from the approved pool. Questions remain persistent across reloads.
- **Monaco Code Editor**:
  - Syntax highlighting, auto-indentation, and shortcuts across **Python**, **JavaScript**, **C++**, and **Java**.
- **Judge0 Isolated Sandboxing**:
  - Untrusted participant code is executed in ephemeral Linux containers with CPU, memory, and time limits.
- **Negative Marking & Scoring Engine**:
  - Server-calculated grading with fractional penalties for incorrect MCQ answers.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, React Router v6, TailwindCSS, Monaco Editor (`@monaco-editor/react`), Heroicons, Axios, Framer Motion |
| **Backend** | Node.js, Express.js, Mongoose (MongoDB ODM), JWT, Helmet, Compression, CORS, Express-Rate-Limit |
| **AI Providers** | Google Gemini API (`@google/genai`), Groq Cloud API |
| **Code Execution** | Judge0 CE Runner (`https://ce.judge0.com`) |
| **Database** | MongoDB Atlas (Production) / Local MongoDB (Development) |
| **Export Engine** | ExcelJS (`.xlsx` formatted export) |
| **Deployment** | Render (Unified Blueprint `render.yaml`), Vercel, Railway, Docker |

---

## 📋 Environment Configuration

### Backend (`backend/.env`)

```ini
# Server & Environment
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your_secure_jwt_secret_key_here

# MongoDB Connection
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/college-event-manager?retryWrites=true&w=majority
MONGODB_URI_LOCAL=mongodb://127.0.0.1:27017/college-event-manager

# AI Configuration (Free Tier)
AI_PROVIDER=gemini
GEMINI_API_KEY=your_google_ai_studio_api_key_here
GEMINI_MODEL=gemini-3.5-flash

# Optional Alternate AI Provider (Groq)
GROQ_API_KEY=your_groq_api_key_here

# Judge0 Isolated Code Execution
JUDGE0_API_URL=https://ce.judge0.com

# Default Administrator Seed Account
ADMIN_NAME=Administrator
ADMIN_EMAIL=admin@collegeevents.com
ADMIN_PASSWORD=CampusAdmin#2026
```

### Frontend (`frontend/.env`)

```ini
REACT_APP_API_URL=http://localhost:5000
REACT_APP_BACKEND_URL=http://localhost:5000
```

> **Note**: In production, `frontend` serves from the same domain as `backend`, using relative paths (`/api/*`) automatically.

---

## 🚀 Quickstart & Local Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Praveen95-cs/College-Event-Managment-.git
cd College-Event-Managment-

# Install root, backend, and frontend packages in one step:
npm run install-all
```

### 2. Configure Environment Files
- Copy `backend/.env.example` to `backend/.env` and supply your `GEMINI_API_KEY` and MongoDB URI.

### 3. Seed Initial Competition & Admin (Optional)
```bash
cd backend
node scripts/seedCompetition.js
```

### 4. Run Automated Test Suite
Run the 15-stage verification suite covering AI generation, HTTP 429 quota delay parsing, deduplication, caching, Judge0 evaluation, scoring, deadline security, and cascade deletion:
```bash
# From root:
npm test --prefix backend

# Or directly:
cd backend
npm test
```
*Expected Result: `RESULTS: 15 PASSED, 0 FAILED`*

### 5. Start Development Servers
```bash
# From root directory:
npm run dev
```
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **Default Admin Account**: `admin@collegeevents.com` / `CampusAdmin#2026`

---

## 📡 API Reference

### Competitions API (`/api/competitions`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/gemini-status` | Public | Check AI provider status, model health, and quota cooldown |
| `GET` | `/` | Authenticated | List published competitions with user's status |
| `GET` | `/:id` | Authenticated | Get sanitized competition details |
| `GET` | `/:id/manage` | Organizer/Admin | Full competition data including question pool |
| `POST` | `/` | Organizer/Admin | Create competition draft |
| `PUT` | `/:id` | Organizer/Admin | Update competition settings and rules |
| `POST` | `/:id/generate-ai` | Organizer/Admin | Generate questions via AI or MongoDB question bank |
| `PUT` | `/:id/questions` | Organizer/Admin | Save, edit, or add manual questions to pool |
| `POST` | `/:id/publish` | Organizer/Admin | Validate questions and publish competition to live schedule |
| `DELETE`| `/:id` | Organizer/Admin | Permanently delete competition and all participant submissions |
| `POST` | `/:id/start` | Participant | Start/resume contest; assigns immutable personalized variant |
| `POST` | `/:id/save-answer` | Participant | Auto-save MCQ option or review flag |
| `POST` | `/:id/run-code` | Participant | Test code against sample cases via Judge0 |
| `POST` | `/:id/submit-code` | Participant | Run code against private hidden test cases |
| `POST` | `/:id/submit` | Participant | Final submit and calculate score |
| `GET` | `/:id/leaderboard` | Public | Real-time podium and ranked participant board |
| `GET` | `/:id/export` | Organizer/Admin | Export formatted results spreadsheet (`.xlsx`) |

### Events API (`/api/events`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/` | Public | List all upcoming and past events |
| `GET` | `/:id` | Public | Get event detail and organizer data |
| `POST` | `/` | Organizer/Admin | Create a new campus event |
| `PUT` | `/:id` | Organizer/Admin | Update event details and banner |
| `DELETE`| `/:id` | Organizer/Admin | Cascade delete event, linked competitions, bookings, and uploaded photos |

### Health & System API

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Healthcheck returning `{ ok: true, env: "production" }` |

---

## 🚢 Deployment Guide

### Option 1: Render (Unified Blueprint — Recommended)
The repository contains a pre-configured `render.yaml` blueprint with zero-downtime deployment:
1. Connect your repository in [Render Dashboard](https://dashboard.render.com/).
2. Select **Blueprints** and choose this repository.
3. Supply your `GEMINI_API_KEY` and `MONGODB_URI` under Service Environment Variables.
4. Render automatically runs `npm run render-build` and launches `npm run render-start`.

### Option 2: Split Hosting (Frontend on Vercel + Backend on Render/Railway)
- **Backend**:
  - Build Command: `npm install`
  - Start Command: `node server.js`
  - Set `FRONTEND_URL=https://your-frontend.vercel.app`
- **Frontend (Vercel)**:
  - Framework: `Create React App`
  - Root: `frontend`
  - Set `REACT_APP_BACKEND_URL=https://your-backend.onrender.com`

---

## 🔒 Security Architecture

1. **Zero Secret Leakage**:
   - Provider API keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `JWT_SECRET`) are loaded strictly on the server runtime.
   - `getSanitizedQuestions()` completely strips `correctOption`, `explanation`, and `hiddenTestCases` before dispatching questions to the student.
2. **Judge0 Sandboxed Execution**:
   - Untrusted code submitted by participants is executed in isolated containers on Judge0 CE with strict wall-time and memory caps. No student code ever executes on the main application server.
3. **Double-Submission & Deadline Enforcement**:
   - Database locking prevents double-submission or answer replay.
   - Server-side expiration checks automatically lock submissions when the contest window closes, ignoring client system clock discrepancies.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
