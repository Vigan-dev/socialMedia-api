# SocialMedia API

NestJS backend API for the SocialMedia internship demo project.

This service powers the Next.js frontend, stores data in MongoDB, and exposes REST endpoints for auth, users, posts, relationships, conversations, notifications, support chat, reports, moderation, and admin tools.

## Features

- Cookie-based authentication with access and refresh tokens
- Login, register, refresh, logout, forgot password, and reset password
- One-time password reset tokens
- User profiles, avatars, status, privacy, and notification settings
- Follow, block, mute, followers, following, and user suggestions
- Posts, likes, comments, replies, hiding, and feed visibility filtering
- Reporting for posts, comments, and users
- Moderator report queue
- Admin dashboard data and admin-only actions
- Direct conversations, unread counts, and typing state
- Support chat history isolated per user
- Demo seed script with normal, moderator, and admin accounts

## Tech Stack

- NestJS
- TypeScript
- MongoDB
- Mongoose
- Passport JWT
- bcrypt
- Jest

## Project Structure

```text
src/auth/              auth, cookies, refresh, password reset, role helpers
src/users/             profiles, relationships, privacy, notification settings
src/posts/             posts, comments, replies, reports, feed visibility
src/conversations/     direct messages, unread counts, typing state
src/notifications/     notification inbox
src/admin/             admin bootstrap and admin/moderation data
src/ai/                support chat
scripts/seed-demo.ts   local demo data
API_ENDPOINTS.md       simple endpoint documentation
```

## API Documentation

See:

```text
API_ENDPOINTS.md
```

## Local Development

Prerequisites:

- Node.js and npm
- MongoDB running locally

Create the env file:

```bash
copy .env.example .env
```

Recommended local values:

```env
MONGODB_URI=mongodb://localhost:27017/socialmedia
CLIENT_ORIGINS=http://localhost:3001
PUBLIC_API_URL=http://localhost:3000
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-chars
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
ADMIN_EMAIL=admin@example.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=AdminPassword1
```

Install dependencies:

```bash
npm install
```

Start the API:

```bash
npm run start:dev
```

Default API URL:

```text
http://localhost:3000
```

## Demo Seed

With MongoDB running:

```bash
npm run seed:demo
```

The seed script creates demo users, posts, comments, replies, relationships, and reports. It is safe to rerun for local review.

Demo accounts:

```text
Admin:     admin@example.com / AdminPassword1
Moderator: mod@example.com / ModPassword1
User:      demo@example.com / DemoPassword1
```

The admin account is created or updated from the `ADMIN_*` env variables on startup. If you change those values, use your `.env` login instead.

## Scripts

```bash
npm run start:dev
npm run build
npm run start:prod
npm run seed:demo
npm run lint
npm test
npm run test:e2e
npm run test:cov
```

Note: `npm run lint` currently runs ESLint with `--fix`, so it may edit files.

## Frontend Connection

The frontend should point to this API with:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

The backend must allow the frontend origin:

```env
CLIENT_ORIGINS=http://localhost:3001
```

Use a comma-separated list when you need to allow dev, preview, and production
frontends:

```env
CLIENT_ORIGINS=http://localhost:3001,https://preview.example.com,https://app.example.com
```

`CLIENT_ORIGIN` is still accepted for older local `.env` files.

Set `PUBLIC_API_URL` to the public origin where this API is reachable. Uploaded
image responses are built from this trusted value. If it is omitted, upload
responses use relative `/uploads/...` paths.

## GitHub Push

This folder can be pushed as its own backend repository.

Before pushing, make sure you do not commit:

- `.env`
- `node_modules/`
- `dist/`
- `coverage/`

Suggested commands:

```bash
git init
git add .
git commit -m "Initial backend commit"
git branch -M main
git remote add origin <your-backend-repo-url>
git push -u origin main
```

## Recommended Checks

```bash
npm run build
npm test
```

Run the frontend separately from `../socialMedia-app`.
