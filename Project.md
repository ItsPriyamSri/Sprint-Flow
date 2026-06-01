# CLAUDE CODE MASTER PROMPT

You are acting as a Senior Staff Engineer, Solutions Architect, Product Architect, Backend Lead, Frontend Lead, Database Architect, and Technical Project Planner.

Your job is NOT to immediately generate code.

Your first responsibility is to fully analyze the project requirements, create a production-quality architecture, identify risks, design the database, APIs, import pipeline, frontend architecture, deployment strategy, scalability strategy, and then create an implementation roadmap before writing any code.

You should think as if this system will eventually become a company-wide internal project management platform used daily by multiple teams.

---

# IMPLEMENTATION STATUS (as of 2026-06-01)

**Shipped.** The repo implements Phases 0–6. See [PROGRESS.md](PROGRESS.md) and [README.md](README.md) for runbooks and handoff detail.

| Area | Status |
|------|--------|
| Auth (JWT + refresh, seeded admin) | Done |
| Excel import (upload → map → preview → commit → rollback) | Done |
| CARR workbook (`Scrum for CARR.xlsx`, Master Task List, ~45 tasks) | Done |
| Flow Kanban (`/board`) — drag-and-drop, filters P0/P1/P2 | Done |
| **Scrum dashboard** — Overview, per-sprint board, My Work, Team, Backlog | Done |
| **Projects** — `Project`, `ProjectMember`, `TaskAssignment`, hour planning | Done |
| Onboarding wizard (project + sprints + epics) | Done (invite-by-email still partial) |
| Docker production stack | Done |
| AI features | Not started (see `AI_ROADMAP.md`) |

### Product shape today

- **Primary entry:** `/overview` (project health, sprint capacity, buffer).
- **Import:** `/import` — binds to **active project**; success CTA → Overview (not only Flow).
- **Flow:** `/board` — workspace Kanban; all tasks on the default board regardless of `projectId`.
- **Scrum views** filter by **project** and **project-scoped sprints**; imported tasks must have `projectId` + sprint linked to that project to appear on Overview (import commit enforces this).

### Import pipeline (implemented behavior)

1. Upload → parse **Master Task List** (dynamic header row; decimal IDs via SheetJS `.w`).
2. Column mapping UI (including Hrs N/I, Total, Status, Epic, Sprint, Owner).
3. Preview (VALID / WARNING / ERROR / SKIPPED).
4. Commit in one transaction: resolve `projectId`, adopt/create project sprints, epics, tasks, `TaskAssignment` from hour columns when owner matches a `ProjectMember` (e.g. Nate, Iris, Shared split).
5. Rollback deletes tasks created by that import only.

**Recent fixes (2026-06-01):** Import no longer mixes user IDs with project-member IDs for assignments (was causing 500 on commit/preview step). Workspace id resolved from API when missing in client storage. Missing upload file returns a clear 404 on re-map.

### Local dev

- API: `http://localhost:3001` — Web: `http://localhost:3002`
- Login: `admin@sprintflow.local` / `Admin1234!` (after `pnpm db:seed`)

---

# PROJECT OVERVIEW

We need to build an internal task management platform inspired by Trello and Jira.

The company currently manages all project work using Excel workbooks.

The goal is NOT to build a generic Trello clone.

The goal is:

Convert the existing Excel-based workflow into a modern Scrum workflow with minimal friction.

Users should be able to upload the current Excel workbook and immediately see a live Scrum board.

The platform should be designed for future scalability and future company-wide adoption.

---

# EXISTING EXCEL WORKBOOK STRUCTURE

The workbook contains the following sheets:

* Overview
* Sprint 1
* Sprint 2
* Sprint 3
* Sprint 4
* Master Task List
* Personal Boards
* Deferred Backlog

The most important sheet is:

Master Task List

Columns:

* Sprint
* ID
* Task / Story
* Epic
* Owner
* Hrs (N)
* Hrs (I)
* Total
* Priority
* Notes
* Status

Current workbook contains approximately 46 tasks.

Task IDs can contain decimal values such as:

* 0.7
* 13.5
* 22.3

These MUST be stored as strings.

---

# CORE PRODUCT VISION

The platform should behave similarly to Trello.

Users should be able to:

* View boards
* View cards
* Move cards
* Update cards
* Filter cards
* Track progress

However the system should also understand Scrum concepts.

The system should support:

* Backlog
* Sprint Planning
* Sprint Boards
* Personal Boards
* Team Boards
* Priority Tracking
* Epic Tracking

The workbook should be treated as a legacy import source.

The database should become the source of truth after import.

---

# TECHNOLOGY STACK

Frontend:

* Next.js
* TypeScript
* TailwindCSS
* App Router
* React Query
* Zustand
* dnd-kit

Backend:

* Node.js
* Express
* TypeScript

Database:

* PostgreSQL

ORM:

* Prisma

Authentication:

* JWT
* Refresh Tokens

File Storage:

* Local storage initially
* Design abstraction for future S3 migration

Excel Processing:

* SheetJS (xlsx)

Validation:

* Zod

Deployment:

* Docker

Monorepo:

* Turborepo

---

# ARCHITECTURE REQUIREMENTS

Design the system using a modular architecture.

Suggested structure:

apps/
web/
api/

packages/
db/
shared/
ui/

The architecture should support future migration into:

* Microservices
* Event-driven architecture
* Multi-team usage

without major rewrites.

---

# WORKSPACE MODEL

**Implemented model (Phase 6):**

```
Workspace
├── Project(s)          ← Scrum planning unit (e.g. "CARR Release")
│   ├── ProjectMember   ← hours/day, role; used for capacity + TaskAssignment
│   ├── Sprint(s)       ← projectId set; goal, days, release fields
│   ├── Epic(s)
│   └── Tasks           ← projectId + sprintId + boardId/columnId
├── Board(s)            ← Flow Kanban (workspace-scoped)
│   └── BoardColumn → Task (same Task rows as Scrum views)
└── Import → ImportRow
```

A user belongs to a workspace via `WorkspaceMember`.

**Scrum views** (Overview, My Work, Team, Backlog, sprint board) scope data by **active project**.

**Flow board** loads tasks by **boardId** (workspace-wide).

Legacy workspace-scoped sprints (`projectId = null`) are adopted onto a project during import when names match.

---

# MVP FEATURES

### Shipped

| Feature | Notes |
|---------|--------|
| Authentication | Login, logout, JWT + rotating refresh, change password |
| Excel import | Full pipeline + rollback; CARR column map |
| Task CRUD + move | Audited; fractional positions |
| Flow board | Kanban DnD, column reorder, filters |
| Task details | Drawer (Flow + Scrum); comments, activity |
| Scrum dashboard | Overview, sprint board, My Work, Team, Backlog |
| Projects | Create via onboarding; members, capacity hours |
| Priorities | P0 / P1 / P2 |
| Audit logging | Tasks, moves, imports |

### Not yet / partial

| Feature | Notes |
|---------|--------|
| Multi-sheet import | Deferred / single-sheet only |
| Personal Boards sheet | Not a separate view |
| Invite-by-email in onboarding | Members without `userId` dropped |
| In-board Flow toggle on sprint view | Flow is separate route |
| AI-assisted mapping | Future (`AI_ROADMAP.md`) |

---

# EXCEL IMPORT REQUIREMENTS

This is the most important feature.

The import process must:

1. Upload workbook
2. Parse workbook
3. Detect Master Task List (fuzzy sheet name match, e.g. `📊 Master Task List`)
4. Detect header row dynamically
5. Extract rows
6. Normalize data (status → column key; priority → P0/P1/P2; hours N/I/total)
7. Preview import
8. Validate import
9. Commit import **into the active project** (sprints/epics/tasks/assignments)

The parser must:

* Trim whitespace
* Handle empty values
* Handle special symbols (checkbox-prefixed statuses)
* Preserve task IDs as **strings** (e.g. `0.7`, `13.5`)
* Preserve sprint names, epic names, owner names
* Never assume fixed row numbers
* Detect columns by header patterns + user-editable mapping

**Post-import:** Tasks appear on **Overview** and sprint boards when `projectId` and project-scoped `sprintId` are set. Re-import upserts by `workspaceId` + `externalId`. Users should use **View project overview** after import, not only Flow.

---

# IMPORT PIPELINE DESIGN

Design a complete import pipeline.

Include:

* Upload stage
* Validation stage
* Mapping stage
* Transformation stage
* Preview stage
* Commit stage
* Rollback strategy

Design for future support of:

* Multiple Excel formats
* CSV imports
* AI-assisted mapping

---

# DATABASE DESIGN

Create a complete database schema.

Include:

Users

Roles

Workspaces

Boards

BoardColumns

Tasks

Sprints

Comments

Attachments

ActivityLogs

Imports

ImportRows

Labels

TaskLabels

Notifications

UserPreferences

The schema should be normalized and scalable.

---

# BOARD DESIGN

The board should behave like Trello.

Support:

* Drag cards
* Reorder cards
* Move cards
* Infinite future columns

Default columns:

* Backlog
* Todo
* In Progress
* Review
* Done

Columns should be configurable.

---

# API DESIGN

Design REST APIs.

Provide:

Endpoint

Method

Request

Response

Validation

Authorization

Error handling

Versioning strategy

Future compatibility considerations

---

# FRONTEND DESIGN

Design:

Routes

Layouts

Components

State management

API layer

Caching strategy

Error handling

Loading states

Optimistic updates

Accessibility

Responsive behavior

Design component hierarchy.

---

# SECURITY REQUIREMENTS

Include:

JWT Authentication

Refresh Tokens

Password Hashing

Rate Limiting

Input Validation

File Upload Validation

SQL Injection Prevention

XSS Prevention

CSRF Considerations

Role-Based Access Control

Audit Logging

---

# PERFORMANCE REQUIREMENTS

The system should remain responsive with:

* 10,000+ tasks
* 100+ users
* Multiple concurrent boards

Provide:

Database indexing strategy

Caching strategy

Pagination strategy

Query optimization strategy

Future scaling strategy

---

# AI ROADMAP (NOT MVP)

Do NOT include AI in the MVP implementation.

Design AI as a future module.

Potential future capabilities:

* Column mapping
* Epic detection
* Priority prediction
* Task categorization
* Sprint recommendation
* Assignment recommendation

AI must be isolated behind a service layer.

The application must function fully without AI.

---

# DELIVERABLES REQUIRED

Before generating any code:

Generate a complete implementation plan including:

1. System Architecture Diagram
2. Database Schema Diagram
3. Entity Relationships
4. API Specification
5. Folder Structure
6. Import Pipeline Design
7. Frontend Component Tree
8. Backend Module Design
9. Security Architecture
10. Deployment Architecture
11. Development Roadmap
12. Risk Analysis
13. Future Scaling Strategy

After producing the implementation plan, generate the project in implementation phases.

Each phase should be independently runnable and testable.

Do not skip planning.

Do not jump directly into coding.

Act like a senior engineering team preparing a production-grade internal platform.

--- 


The architecture section tells Claude **what to build**.

The raw context section tells Claude **why it exists**, which often produces much better decisions when it starts making tradeoffs on its own.



---

# RAW PROJECT CONTEXT (IMPORTANT)

This section contains informal context from the project owner. Treat it as high-level product intent.

The technical specifications above are the source of truth, but this section explains the actual problem we are trying to solve.

---

The company currently manages tasks through Excel sheets.

The Excel sheets are not broken.

They actually work reasonably well.

The problem is that they are difficult to manage as the number of tasks grows and it becomes harder to visualize progress across the team.

The goal is not to force people to completely change how they work.

The goal is to make their current workflow easier.

Ideally a manager should be able to upload the same Excel workbook they already use and immediately get a modern interactive board without manually recreating everything.

---

A very important point:

We are NOT trying to build Jira.

We are NOT trying to build a massive enterprise platform.

We are building a focused internal tool that solves one real problem well.

If there is ever a conflict between:

* adding more features
* making the Excel-to-board workflow smoother

always prioritize the Excel-to-board workflow.

That is the main value of the product.

---

The board experience should feel familiar to anyone who has used Trello.

Simple.

Visual.

Easy to understand.

A user should be able to open the board and immediately understand:

* what needs to be done
* what is currently being worked on
* what is blocked
* what is finished

without reading documentation.

---

The uploaded workbook already contains useful Scrum information.

The workbook contains:

* Sprints
* Owners
* Priorities
* Epics
* Notes
* Task IDs

The system should use this information intelligently.

The application should not force users to enter the same information again after importing.

---

The workbook should be treated as a starting point.

After import, the application becomes the source of truth.

Users should then be able to:

* move cards
* edit cards
* assign cards
* update status
* filter tasks

directly from the application.

---

Future growth is important.

Today this may be used by a small internal team.

Tomorrow it may become the primary task management platform for multiple teams.

Please make architectural decisions that allow growth without overengineering the MVP.

Avoid unnecessary complexity.

Build a clean foundation.

---

AI is interesting, but AI is not the primary goal.

The system should work perfectly even if no AI is ever added.

If AI is introduced later, it should be used only where it genuinely improves the workflow.

Examples:

* helping understand unfamiliar spreadsheet formats
* suggesting categories
* suggesting priorities
* suggesting assignments

AI should assist users.

AI should not take control away from users.

---

When making implementation decisions, optimize for:

1. Simplicity
2. Reliability
3. Ease of maintenance
4. Future scalability
5. User experience

in that order.

---

The desired end result is:

A manager uploads the existing Excel workbook.

Within a minute they have a fully interactive **project dashboard** (Overview + sprint boards + capacity) and a **Flow** Kanban.

No manual data entry.

No complicated setup.

No migration pain.

Just upload the workbook, confirm **Importing into: {project name}**, commit, and open **Overview**.

---

PERSONAL NOTE FROM THE PROJECT OWNER

Think of this as:

"Taking a process that already exists and making it feel modern."

The Excel sheet is not the enemy.

The Excel sheet is the bridge.

The product succeeds if people can move from Excel to the application naturally and feel that their work became easier, not more complicated.

Keep the experience practical.

Keep the experience simple.

Keep the experience useful.



