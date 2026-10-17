# Fixed College Event Manager Backend

## Local setup
1. Copy `.env.example` to `.env`.
2. Fill `MONGODB_URI` and `JWT_SECRET`.
3. Run `npm install`.
4. Run `npm start`.

## Render
- Root Directory: `backend` if you copy this folder into your repository as `backend/`
- Build Command: `npm install`
- Start Command: `npm start`
- Required env: `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`
- Optional env: `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`

## Compatibility repairs included
- Restored auth, users, messages, notifications, motivation routes.
- Added both PUT and PATCH event updates.
- Supports admin UI statuses and operational event statuses.
- Corrected route/model/middleware relative imports.
- Added registrations export, certificate, and `/my`.
- Added `/api/health`.
- Added a Stripe payment-intent verification endpoint compatible with the observed frontend path.
