# Simplified GDPR Consent Manager

[![CI](https://github.com/GTX-Pradeep/TEAM-6_Simplified-GDPR-Consent-Manager/actions/workflows/ci.yml/badge.svg)](https://github.com/GTX-Pradeep/TEAM-6_Simplified-GDPR-Consent-Manager/actions/workflows/ci.yml)

A full-stack web application for recording, reviewing and withdrawing user consent for data-processing purposes, with
**versioned privacy policies**, an **append-only, SHA-256 hash-chained audit trail** and **point-in-time ("time travel")
consent queries** for auditors.

> Academic software-engineering project (Team 6). It demonstrates GDPR-style consent management; it is not a legal
> compliance certification.

## Features

| For | What they can do |
|---|---|
| **Users** | See every processing purpose, grant or withdraw consent with one click, read the current policy, view their full consent history |
| **Administrators** | Manage purposes, draft and publish policy versions (old versions are locked), manage users and roles |
| **DPO / Auditors** | Read-only access to consent records and the audit trail, search and filter, see a user's consent state at any past moment, verify the integrity of the hash chain |

Every consent decision stores the **UTC timestamp** and the **policy version** the user saw. Records are never
updated or deleted - database triggers reject it - so the history is complete and tamper-evident.

## Tech stack

| Layer | Technology |
|---|---|
| Front end | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| Back end | Node.js 20, Express, TypeScript, Zod, Helmet, pino |
| Database | PostgreSQL 16, Prisma ORM |
| Testing | Jest + Supertest (API), Vitest + React Testing Library (UI) |
| DevOps | Docker Compose, GitHub Actions CI |

## Project structure

```
client/                  React single-page app
  src/api/               typed API client
  src/components/        shared UI components
  src/pages/             screens (dashboard, policy, history, admin, DPO)
server/                  Express REST API
  prisma/                schema.prisma + migrations (incl. append-only triggers)
  src/middleware/        error handling (auth, RBAC and validation added per module)
  src/modules/           auth, purposes, policies, consents, audit, query
  src/routes/            health check
docs/                    SRS, SAD and Test Plan
```

## Getting started (local)

**Prerequisites:** [Node.js 20+](https://nodejs.org), [Docker Desktop](https://www.docker.com/products/docker-desktop/), Git.

```bash
# 1. install dependencies (client + server)
npm install

# 2. start PostgreSQL in Docker
npm run db:up

# 3. configure the server
#    Windows CMD:   copy server\.env.example server\.env
#    macOS/Linux:   cp server/.env.example server/.env

# 4. create the database tables and the Prisma client
npm run db:migrate -w server
npm run db:generate -w server

# 5. run API (http://localhost:4000) and web app (http://localhost:5173) together
npm run dev
```

Open http://localhost:5173 - the badge in the top-right corner shows whether the API and database are online.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web app with hot reload |
| `npm test` | all unit tests (server and client) |
| `npm run typecheck` | TypeScript checks for both apps |
| `npm run build` | production build |
| `npm run db:studio -w server` | browse the database in Prisma Studio |
| `npm run db:down` | stop the database container |

## API

Base path `/api/v1`. Implemented so far: `GET /health`. The full endpoint list is in the SAD (Section 4.3).

## How we work

1. Pick an issue from the GitHub Project board and create a branch: `feature/<short-name>` (e.g. `feature/consent-optin`).
2. Commit with clear messages: `feat: ...`, `fix: ...`, `test: ...`, `docs: ...`.
3. Push and open a Pull Request into `main` using the template; write `Closes #<issue>`.
4. CI must pass; the repo owner reviews and merges.

## Documentation

- [Software Requirements Specification (SRS)](docs/01-SRS/)
- [Software Architecture & Design (SAD)](docs/02-SAD/)
- [Software Test Plan](docs/03-Test-Plan/)

## Team 6

| Name | SRN |
|---|---|
| Vilas | PES1UG24AM415 |
| Suman Diddimani | PES1UG24AM409 |
| Pranaav Prabhakaran | PES1UG24AM387 |
| Pradeep T | PES1UG24AM385 |
