# Project Documentation

This repository is a **Next.js App Router** application that combines:

- **AI chat + AI-assisted project planning** (Gemini 3 Flash via OpenRouter)
- **Project management** (projects, WBS/phases/tasks, subtasks, scheduling)
- **Calendar** (events)
- **Budget tracking** (categories + income/expense transactions)
- **Authentication** (Clerk)
- **Backend + database** (Convex)

---

## Tech stack (what’s actually in the codebase)

### Frontend
- **Framework**: Next.js `16.1.6` (App Router, `app/`)
- **React**: `19.2.4`
- **Language**: TypeScript (`strict: true` in `tsconfig.json`)
- **UI**:
  - **shadcn/ui** configuration in `components.json` (style: `new-york`, icon set: `lucide`)
  - **Radix UI** primitives (`@radix-ui/*` dependencies)
  - **Tailwind CSS** `4.x` with CSS-first setup (see `app/globals.css` importing `tailwindcss`)
  - **Theme switching**: `next-themes`
  - **Icons**: `lucide-react`
  - **Toasts**: `sonner` + shadcn `Toaster`
- **Forms / validation**: `react-hook-form`, `zod`, `@hookform/resolvers`
- **Charts**: `recharts`
- **Drag & drop**: `@dnd-kit/core`, `@dnd-kit/utilities`
- **Markdown**: `react-markdown`, `remark-gfm`
- **Analytics**: `@vercel/analytics`

### Backend / data
- **Convex** `^1.32.0` for:
  - Database tables + indexes (`convex/schema.ts`)
  - Queries/mutations for projects, chats, tasks/subtasks, scheduling, budget, calendar
  - Auth config (`convex/auth.config.ts`) using a Clerk JWT issuer domain
- **Clerk** `@clerk/nextjs` for auth on the Next.js side and for Convex identity

### AI / LLM providers
- **OpenRouter**: API used from Next.js route handlers (`app/api/*`) via `OPENROUTER_API_KEY`
- **Model**: `google/gemini-3-flash-preview`
- **Streaming**: chat route returns an SSE stream (`text/event-stream`)

### Tooling
- **Package manager**: `pnpm` (`pnpm@10.32.1` in `package.json`)
- **Linting**: ESLint script exists (`pnpm lint` runs `eslint .`)

---

## High-level architecture

### Runtime pieces
- **Next.js UI**: pages under `app/*`
- **Next.js API routes**: server-side routes under `app/api/*`
  - Used for AI calls to OpenRouter and for owner-verified project content generation
- **Convex backend**: functions under `convex/*`
  - Stores canonical data (projects, tasks, chats, etc.)
  - Enforces access control server-side via `requireUserDoc`

### Auth flow (Clerk + Convex)
- Next.js uses **Clerk** for user sessions and protects non-public routes via a middleware proxy (`proxy.ts`).
- Convex uses Clerk-issued identity:
  - `convex/auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN`
  - `convex/lib/requireUser.ts` maps Clerk identity → a row in the Convex `users` table (creates one if missing).

### Data model (Convex)
Defined in `convex/schema.ts`:

- **`users`**: email, tokenIdentifier, optional dailyTaskLimit, etc.
- **`projects`**:
  - Owner + collaborators (`sharedWith`, `projectShares`)
  - Project metadata (name, objective, target date)
  - A **JSON string** `data` that stores the WBS-like project structure (phases + tasks + milestones)
- **`tasks`** + **`subtasks`**:
  - `tasks` table mirrors each WBS task by `(projectId, phaseOrder, taskOrder)`
  - `subtasks` attach to a `tasks` doc
- **`chats`** + **`chatMessages`**: project chat history
- **`calendarEvents`**: simple date-range events
- **`budgetCategories`** + **`transactions`**: budgeting
- **`schedulingSnapshots`**: snapshots used to undo/inspect scheduling engine runs

---

## Product features (what the app does)

### Chat (`/chat`)
- AI chat powered by OpenRouter using `google/gemini-3-flash-preview`.
- Streaming responses via `app/api/chat/route.ts`.
- Can be context-aware: when project/calendar context is available, the chat route advertises “tools” (function schemas) and the model can request actions like:
  - create a task
  - reschedule tasks
  - create/move calendar events
  - check time conflicts before scheduling actions

### Projects (`/projects`, `/projects/[projectId]`)
Backed by Convex functions in `convex/projects.ts` (create/update/delete/share/pin/rename/list).

Projects store a **WBS JSON envelope** in the `projects.data` string with fields like:
- `project_name`
- `project_summary` (name, objective, target date, etc.)
- `project_wbs` (phases containing tasks)
- `project_milestones`
- optionally `unassigned_tasks`

### Tasks + subtasks
- WBS tasks live in project JSON; Convex maintains a `tasks` table to anchor subtasks and indexes.
- Subtasks are managed through `convex/tasks.ts` (`createSubtasks`, `toggleSubtaskCompleted`, `deleteSubtask`, etc.).

### Scheduling engine
Implemented in `convex/scheduling.ts`.

- Schedules tasks within a phase date range, inside work hours (defaults are 9:00 AM–6:00 PM) with caps (8 hours/day).
- Supports:
  - anchored tasks (fixed)
  - flexible tasks (rescheduled automatically)
  - task dependencies (topological sort)
- Records snapshots (`schedulingSnapshots`) and can undo the last project-level run within a time window.

### Calendar (`/calendar`)
- Stores date-range events in `calendarEvents`.
- The AI tool schema includes `createCalendarEvent` + `moveCalendarEvent`.

### Budget (`/budget`)
- Budget categories and transactions stored in `budgetCategories` + `transactions` (see `convex/budget.ts`).
- Transactions can optionally link to a project.

---

## API routes (server-side)

Located in `app/api/*`. Key routes discovered in the repo:

- **`app/api/chat/route.ts`**: streaming chat completion via OpenRouter
- **`app/api/generate-project/route.ts`**: generates a new project plan JSON, validates with Zod schema
- **`app/api/generate-project-content/route.ts`**: incremental generation/regeneration for existing projects
  - Requires Clerk auth
  - Verifies project ownership via Convex using a Clerk JWT (template: `convex`)
- **`app/api/generate-chat-title/route.ts`**, **`generate-subtasks`**, **`generate-task-breakdown`**: AI helpers (OpenRouter)
- **`app/api/projects/[slug]/route.ts`**: project lookup by slug (used for routing/sharing patterns)
- **`app/api/account/delete-clerk/route.ts`**: account cleanup path (Clerk-side)

---

## Environment variables

### Required for core functionality
- **`OPENROUTER_API_KEY`**: server-side key for OpenRouter requests (used by `app/api/*` routes).
- **`NEXT_PUBLIC_CONVEX_URL`**: Convex deployment URL used by the client (`components/convex-client-provider.tsx`) and some server routes.

### Required for authentication (Clerk)
- **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`**: Clerk frontend key (checked in `proxy.ts`)
- **`CLERK_SECRET_KEY`**: Clerk server key (checked in `proxy.ts`)
- **`CLERK_JWT_ISSUER_DOMAIN`**: used by Convex auth provider config (`convex/auth.config.ts`)

### Local `.env` note
This repo currently contains an `.env` with a Convex/Clerk-related setting comment. In general, keep secrets in:
- local: `.env.local` (not committed)
- Vercel: Project → Settings → Environment Variables

---

## Scripts & common commands

From `package.json`:

- **Dev**: `pnpm dev`
- **Build**: `pnpm build`
- **Start**: `pnpm start`
- **Lint**: `pnpm lint`

Convex development is typically run separately (depending on how you’ve set it up):

- `npx convex dev` (runs Convex dev deployment + codegen)

---

## Repository layout (primary folders)

- **`app/`**: Next.js App Router pages, layouts, API routes, global styles
- **`components/`**: React components (includes shadcn/ui components under `components/ui/`)
- **`convex/`**: Convex schema + queries/mutations + generated API types in `convex/_generated/`
- **`lib/`**: shared utilities, Zod schemas, prompt builders, parsers
- **`hooks/`**: client hooks (e.g. chat state)

---

## Deployment notes (Vercel-oriented)

- The app uses `@vercel/analytics` and shows Vercel-specific env var guidance in UI.
- Ensure the required environment variables are set for the correct environments (Preview/Production) before deploying.

---

## Important implementation specifics / gotchas

- **TypeScript build errors are ignored** in `next.config.mjs` (`typescript.ignoreBuildErrors: true`). CI/build may succeed even if types are broken; rely on `pnpm lint` and editor TS diagnostics.
- **Next.js images are unoptimized** (`images.unoptimized: true`) in `next.config.mjs`.
- **Tailwind v4 setup**: there is no `tailwind.config.*` in this repo; styling is configured via `app/globals.css` imports + CSS variables (shadcn-style tokens).

---

## How to extend the project

### Add a new Convex function
- Create a new file under `convex/` (query/mutation/action).
- Update UI code to call it via the generated API (`convex/_generated/api`).
- Use `requireUserDoc` for authenticated access and add explicit authorization checks for project-scoped data.

### Add a new UI screen
- Add a route in `app/<route>/page.tsx`.
- Use shadcn/ui components from `components/ui/*` and Tailwind tokens from `app/globals.css`.

### Add a new AI capability
- Add a new server route under `app/api/*` (or extend existing routes).
- If it’s an “action” the assistant can take, add a tool schema entry (see `app/api/chat/route.ts`) and implement the corresponding write path in Convex.

