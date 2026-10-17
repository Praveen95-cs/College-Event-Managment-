# College Event Manager - AI Quiz & Coding Competition Platform

An enterprise MERN stack web application for university event management, enhanced with a comprehensive **AI-Powered Online Quiz & Coding Competition System** utilizing the Google Gemini API free tier and Judge0 isolated code execution.

---

## 🌟 Key Features

### 1. Existing Core Platform
- **Authentication & RBAC**: JWT-based authentication supporting Student, Organizer, and Admin roles.
- **Event Lifecycle**: Event discovery, multi-stage registration, attendance tracking, and capacity enforcement.
- **Community & Messaging**: Campus-wide announcements, real-time notifications, and department feeds.

### 2. AI Quiz & Coding Competition Module (New)
- **Google Gemini API Free-Tier Integration**:
  - Built with the official `@google/genai` JavaScript SDK.
  - Runtime model verification (`ai.models.list()`) dynamically verifies and whitelists free-tier models (defaulting to `gemini-3.8-flash`).
  - Generates structured JSON questions (MCQs with 4 distinct options) and programming problems with test cases.
  - Zero-cost guarantee: Prevents unauthorized model escalation to avoid charges.
  - Automated retry with exponential backoff and markdown-fenced JSON repair.
- **Organizer Studio**:
  - Full wizard for configuring quiz, coding, or hybrid competitions.
  - Set duration, marks, negative marking deduction, participant limits, and permitted languages.
  - AI question generation from customized organizer prompts, topics, and difficulty levels.
  - In-browser preview, inline editing, question regeneration, and pool approval prior to publishing.
- **Personalized Assessments**:
  - Distinct question set variants assigned to each participant from the approved pool.
  - Strict assignment locking: Page refreshes, network reconnects, or re-renders never regenerate questions.
  - Synchronized server deadline: Automatic expiry calculation based on `min(startTime + duration, contestEndTime)`.
- **Quiz Arena**:
  - Multiple-choice questions with instantaneous auto-save on selection.
  - Interactive question palette with real-time status indicators (Answered, Flagged, Unvisited).
  - "Mark for Review" toggling and synchronized countdown timer.
  - Client-side and server-enforced deadline auto-submission.
  - Negative marking evaluation and server-side answer evaluation.
- **Coding Arena**:
  - Embedded Monaco Editor (`@monaco-editor/react`) featuring VS Code syntax highlighting and keyboard shortcuts.
  - Multi-language support: **Python 3**, **JavaScript (Node.js)**, **C++ (GCC)**, and **Java (OpenJDK)**.
  - Isolated sandboxed execution via Judge0 CE (`https://ce.judge0.com`). Untrusted code is **never** executed on the application server.
  - "Run Sample Tests" for public test case verification.
  - Private submission evaluation against hidden test cases with execution time, memory tracking, and compilation error formatting.
- **Results & Real-time Leaderboard**:
  - Live podium and leaderboard calculating participant rankings by score (descending) and time taken (ascending).
  - Search and filter by student name or email.
  - Organizer Excel export (`.xlsx`) via `exceljs` containing complete audit trails, timestamps, and question-level breakdowns.
- **Security & Anti-Cheating**:
  - Complete isolation: API keys, correct MCQ answers (`correctOption`), and hidden test cases are stripped before sending payloads to clients.
  - Double-submission and replay protection via database locks.
  - Full audit logging: tracks IP addresses, user agents, answer timestamps, and code submission metrics.

---

## 🛠 Tech Stack

- **Frontend**: React 18, React Router v6, TailwindCSS, Monaco Editor (`@monaco-editor/react`), Heroicons, Axios
- **Backend**: Node.js, Express.js, MongoDB / Mongoose, JWT, Helmet, CORS, Rate Limiting
- **AI Engine**: Google Gemini API via official `@google/genai` SDK (`gemini-3.8-flash`)
- **Code Execution**: Judge0 Isolated CE Runner (`https://ce.judge0.com`)
- **Reporting**: ExcelJS for spreadsheet generation

---

## 📋 Environment Configuration

### Backend (`backend/.env`)
```ini
# Database
MONGODB_URI=mongodb+srv://.../college-event-manager?retryWrites=true&w=majority
MONGODB_URI_LOCAL=mongodb://127.0.0.1:27017/college-event-manager

# Security & Server
JWT_SECRET=your_jwt_secret_key_here
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Google Gemini API (Free Tier)
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.8-flash

# Judge0 Code Execution
JUDGE0_API_URL=https://ce.judge0.com

# Default Administrator Seed
ADMIN_NAME=Administrator
ADMIN_EMAIL=admin@collegeevents.com
ADMIN_PASSWORD=CampusAdmin#2026
```

### Frontend (`frontend/.env`)
```ini
REACT_APP_API_URL=http://localhost:5000
REACT_APP_BACKEND_URL=http://localhost:5000
```

---

## 🚀 Installation & Running

### 1. Install Dependencies
```bash
# Root & Monorepo
npm run install-all

# Or individually:
cd backend && npm install
cd ../frontend && npm install
```

### 2. Run Database & Seed
Make sure MongoDB is running locally (`mongodb://127.0.0.1:27017`) or configure MongoDB Atlas in `backend/.env`.
Seed the initial competition and admin account:
```bash
cd backend
node scripts/seedCompetition.js
```

### 3. Run Automated Test Suite
Run the 8-stage verification test suite covering AI generation, hidden-test isolation, scoring, deadline enforcement, Judge0 execution, and leaderboard calculations:
```bash
cd backend
npm test
```

### 4. Start Development Servers
From the root directory:
```bash
npm start
```
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **Default Admin Account**: `admin@collegeevents.com` / `CampusAdmin#2026`

---

## 📡 API Reference (`/api/competitions`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/gemini-status` | Public | Check Gemini model verification & free-tier health |
| `GET` | `/` | Authenticated | List published competitions with user's status |
| `GET` | `/:id` | Authenticated | Get sanitized competition details |
| `GET` | `/:id/manage` | Organizer/Admin | Full competition data including full question pool |
| `POST` | `/` | Organizer/Admin | Create competition draft |
| `PUT` | `/:id` | Organizer/Admin | Update competition settings and rules |
| `POST` | `/:id/generate-ai` | Organizer/Admin | Synthesize MCQs / coding problems via Gemini Flash |
| `POST` | `/:id/questions` | Organizer/Admin | Add or edit questions in pool |
| `POST` | `/:id/publish` | Organizer/Admin | Publish competition to live schedule |
| `POST` | `/:id/start` | Participant | Begin/resume assessment; locks personalized questions |
| `POST` | `/:id/save-answer` | Participant | Auto-save MCQ option or review flag |
| `POST` | `/:id/run-code` | Participant | Execute code against sample test cases via Judge0 |
| `POST` | `/:id/submit-code` | Participant | Submit coding solution against private hidden test cases |
| `POST` | `/:id/submit` | Participant | Final assessment submission and instant score calculation |
| `GET` | `/:id/leaderboard`| Public | Fetch ranks, scores, accuracy, and durations |
| `GET` | `/:id/export` | Organizer/Admin | Download formatted Excel (`.xlsx`) report |

---

## 🔒 Security Architecture

1. **Zero Secret Leakage**:
   - `GEMINI_API_KEY` is loaded only on the server runtime.
   - `getSanitizedQuestions()` completely strips `correctOption`, `explanation`, and `hiddenTestCases` before dispatching questions to the student.
2. **Server-Side Evaluation**:
   - The frontend never calculates marks. All answers and coding solutions are validated independently on the backend with negative marking equations applied.
3. **Judge0 Sandboxing**:
   - All participant code runs in ephemeral Linux container sandboxes with strict CPU, wall-time, and memory limits. Untrusted code cannot access server environment variables, filesystem, or database.
4. **Resilient Personalization**:
   - Variant generation uses randomized subsets from the approved pool. Once assigned, assignments are immutable to guarantee fair timing and consistent questions across reloads.
