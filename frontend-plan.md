# Frontend Polish Plan: Overview & Dashboard

**Status:** Planned
**Last updated:** 2026-06-08
**Goal:** Make the **Overview** (`ProjectOverview.tsx`) and **Dashboard** (`dashboard/page.tsx`) pages read as one cohesive, professional product surface — polished, calm, and quietly responsive, not "prototype" and not "over-decorated."

---

## Where each page actually stands today

These two pages were built at different times and have **drifted into two different design languages**. That mismatch is the single biggest "this isn't a real product" tell.

| | **Overview** (`ProjectOverview.tsx`) | **Dashboard** (`dashboard/page.tsx`) |
|---|---|---|
| Metric cards | Flat — no icon, no accent, no hover, uniform weight | Semantic colour, gradient wash, hover-lift, `animate-ping` dots |
| Header | Plain `h1` + description | "Executive Hub" banner with blurred colour blobs |
| Numbers | `text-3xl font-bold` | `text-4xl font-black` |
| Progress bars | Solid flat fill (`bg-emerald-500`) | Gradient + 700ms ease fill |
| Icons | None | Emoji (📅 👥 🚀 📭) |
| Motion | None | Lots — pulse/ping/bounce, sometimes decorative |

So the work is **two-directional**, not "polish everything the same way":

- **Overview** is under-designed → bring it *up* to the shared system.
- **Dashboard** is over-decorated → bring it *in* toward restraint.

Per 2026 guidance, motion should **guide rather than flash**, and dashboards win on **strategic minimalism** — data-rich but visually quiet, with non-essential noise removed. We're aligning to that, not adding more sparkle.

---

## Guiding principles (apply to both pages)

1. **One design language.** Same card primitive, same shadow scale, same type ramp, same icon set, same motion timing on both pages.
2. **Motion is feedback, not decoration.** Animate to communicate state change (value arriving, bar filling, hover affordance). Kill ambient pulsing that signals nothing.
3. **Reserve red/pulse for things that need a human.** Blocked / overloaded only. Everything else stays calm.
4. **Respect the system.** Every animation gated behind `motion-safe:` (honours `prefers-reduced-motion`); every interactive element gets a visible `focus-visible` ring.
5. **5–9 elements per zone.** Keep the 6-card summary row; don't add cards.

---

## Step 0 — Shared primitives (do this first)

Create reusable, themeable components so both pages render from the same source of truth. This is what removes the drift permanently.

`apps/web/src/components/ui/`:

| Component | Responsibility |
|---|---|
| `MetricCard.tsx` | label · value · sub · `tone` (`neutral \| emerald \| indigo \| rose \| amber \| slate`) · optional `icon` · optional `trend`. Owns hover-lift, accent, focus ring. |
| `ProgressBar.tsx` | `value` 0–100 · `tone` (or auto-tone by %) · animates width on mount via `motion-safe`. Shared by sprint completion, capacity, epic bars. |
| `StatusBadge.tsx` | `ACTIVE \| PLANNING \| COMPLETED` → consistent pill + (ACTIVE only) live dot. |
| `SectionHeader.tsx` | icon chip + title + optional right-side meta/action. |
| `icons.tsx` | small stroked SVG set (lucide-style) — replaces all emoji. |

**Design tokens (Tailwind classes, used everywhere):**

- **Card shadow:** rest `shadow-[0_1px_2px_rgba(15,23,42,0.04)]` → hover `shadow-[0_8px_24px_rgba(15,23,42,0.06)]`. One scale, both pages.
- **Hover lift:** `motion-safe:hover:-translate-y-0.5` (Overview currently 0, Dashboard `-translate-y-1` → settle both on `-0.5`).
- **Number weight:** `text-3xl font-bold tracking-tight` (pull Dashboard back from `font-black` `text-4xl`).
- **Motion timing:** `transition-all duration-200 ease-out` for hover; `duration-700 ease-out` for bar fills.
- **Tone map** (border / text / accent), single object:
  - emerald → completed / on-track
  - indigo → in-progress / active / brand
  - rose → blocked / over-capacity (the *only* tone allowed to pulse)
  - amber → backlog / deferred / planning / near-limit
  - slate → neutral / total

---

## Overview page (`ProjectOverview.tsx`) — bring it *up*

| Area | Change |
|---|---|
| **Metric cards** | Swap `MetricCard` for the shared primitive. Each card gets: a stroked SVG icon top-right in a tinted chip, a 2px coloured left-accent matching its tone, hover-lift + shadow, and a count-up on the number (see Step 6). Tone per card: Planned/Budget = indigo (rose if over), Buffer = emerald (rose if <0), Done-this-week = emerald, Backlog = amber, Sprint Efficiency = by threshold, Days-to-release = slate. |
| **Page header** | Add a quiet kicker row above the title (small uppercase project context + a live dot if a sprint is ACTIVE) — a restrained echo of Dashboard's banner, *not* the blurred blobs. Keep it minimal. |
| **Sprint cards** | ACTIVE → `ring-1 ring-indigo-200` + soft indigo wash + slightly stronger shadow; COMPLETED → muted (slate, no wash); PLANNING → amber left-accent. Status pill via shared `StatusBadge` (ACTIVE gets the live dot). |
| **Sprint completion bar** | Replace flat `bg-emerald-500` with shared `ProgressBar` (auto-tone + mount fill animation), so it matches Dashboard. |
| **Estimation Performance** | Keep the rows, but render Variance + Efficiency as a small tone-tinted pill (left-accent) instead of bare coloured text, so the signal reads at a glance. |
| **Action buttons** | "View Sprint / View Board" get `motion-safe:hover:-translate-y-0.5 hover:shadow-md`, active `:active:translate-y-0` press, and `focus-visible` ring. |
| **Blocked banner** | Keep the rose alert, but drop `animate-pulse` → `motion-safe:animate-pulse` only (reduced-motion users see a static, still-obvious banner). |

---

## Dashboard page (`dashboard/page.tsx`) — bring it *in*

| Area | Change |
|---|---|
| **Summary cards** | Re-render through the shared `MetricCard` so they match Overview exactly. Keep the semantic colours; **dial back** the per-card bespoke gradient washes and `shadow-[…0.06]` glows to the single token scale. Pull numbers from `font-black/text-4xl` → `font-bold/text-3xl`. Add the same stroked SVG icon per card (replacing the implicit "colour = meaning" with colour **+** icon). |
| **Emoji → SVG** | Replace 📅 👥 🚀 📭 ⚠️ 📁 with the shared stroked icon set in tinted chips. Emoji render inconsistently across OS/browser and are the loudest "not-enterprise" signal here. |
| **Banner** | Keep "Executive Hub" + title, but tone the two blurred colour-blobs down (lower opacity / one blob, not two) so it's a calm gradient, not a marketing hero. |
| **Sprint progress cards** | Already good. Move bar → shared `ProgressBar`; ACTIVE ring/wash → shared sprint-card treatment so Overview and Dashboard sprint cards look like siblings. |
| **Owner capacity bar** | Keep the gradient capacity bar; gate its `shadow-[0_0_8px…]` glow behind the overloaded state only (it already mostly does). Overloaded `animate-pulse` → `motion-safe:`. |
| **Ambient motion audit** | Convert every `animate-pulse` / `animate-ping` / `animate-bounce` to `motion-safe:` and confirm each one marks a *real* state (blocked, overloaded, active-live, loading). Remove any that don't. The empty-state `animate-bounce` 📁 → static icon. |
| **Section headers** | Route through shared `SectionHeader` (icon chip + title + right meta) so the three section headers are pixel-consistent. |

---

## Step 6 — Microinteractions (subtle, shared, opt-out-aware)

All gated behind `motion-safe:` and tuned to *guide attention*, not flash:

| Interaction | Where | Detail |
|---|---|---|
| **Count-up numbers** | Both — every metric value | Small hook `useCountUp(target, ~600ms)`; animates 0→value once on mount/data-arrival. Static immediately under reduced-motion. |
| **Progress bar fill** | Both — every bar | Width transitions from 0 → value on mount (`duration-700 ease-out`). One implementation in `ProgressBar`. |
| **Card hover** | Both — all cards | `-translate-y-0.5` + shadow bump + (where relevant) value/title shifts to tone colour. 200ms. |
| **Button press** | Both — all buttons/links | hover lift, `:active:translate-y-0` tactile press, `focus-visible:ring-2`. |
| **Live dot** | ACTIVE sprint + header | One soft `motion-safe:animate-pulse` indigo/emerald dot — the *only* sanctioned ambient motion, and it means "this is the live sprint." |
| **Staggered card entrance** *(optional, low priority)* | Summary rows | Tiny fade/slide-in with per-index delay on first paint. Skip entirely if it complicates the loading→loaded transition. |

---

## Accessibility & quality bar (non-negotiable)

- Every animation: `motion-safe:` prefix (honours `prefers-reduced-motion`).
- Every interactive element: visible `focus-visible:ring-2 ring-offset-1` in its tone.
- Colour never the *sole* signal — pair every semantic colour with an icon or label (this is why emoji → labelled SVG matters).
- Contrast: verify toned text (e.g. `text-emerald-500/80` sub-labels) still meets AA on white.

---

## What is intentionally NOT changing

- **Layout / grid structure** — column proportions on both pages are solid.
- **Data, queries, API shapes** — purely visual; no semantic changes.
- **Functionality** — no new features, no new metrics, no new cards.
- **The 6-card summary count** — stays at 6 (within the 5–9 best-practice band).

---

## Files in scope

| File | Changes |
|---|---|
| `apps/web/src/components/ui/MetricCard.tsx` *(new)* | Shared metric card primitive |
| `apps/web/src/components/ui/ProgressBar.tsx` *(new)* | Shared animated bar |
| `apps/web/src/components/ui/StatusBadge.tsx` *(new)* | Shared sprint status pill |
| `apps/web/src/components/ui/SectionHeader.tsx` *(new)* | Shared section header |
| `apps/web/src/components/ui/icons.tsx` *(new)* | Stroked SVG icon set (replaces emoji) |
| `apps/web/src/hooks/useCountUp.ts` *(new)* | Reduced-motion-aware count-up |
| `apps/web/src/components/overview/ProjectOverview.tsx` | Adopt primitives; metric icons/accents/hover; sprint-card theming; bar; button states |
| `apps/web/src/app/(app)/dashboard/page.tsx` | Adopt primitives; dial back gradients/weight; emoji→SVG; motion audit; calmer banner |

---

## Implementation order

| Step | Area | Effort |
|---|---|---|
| 0 | Shared primitives + tokens + icon set + `useCountUp` | ~45 min |
| 1 | Overview — adopt `MetricCard` (icons, accents, hover, count-up) | ~20 min |
| 2 | Overview — sprint-card status theming + shared `ProgressBar` + `StatusBadge` | ~20 min |
| 3 | Overview — header kicker, estimation pills, button/focus states | ~15 min |
| 4 | Dashboard — adopt `MetricCard`; dial back gradients/weight; emoji→SVG | ~25 min |
| 5 | Dashboard — sprint/owner/epic bars → `ProgressBar`; calmer banner; `SectionHeader` | ~20 min |
| 6 | Both — motion audit (`motion-safe:` everywhere) + accessibility/focus pass | ~20 min |

**Total estimated effort:** ~2.5 h

---

## References (dashboard best practices, 2026)

- [Dashboard UI Design Principles & Best Practices Guide 2026 — DesignStudio](https://www.designstudiouiux.com/blog/dashboard-ui-design-guide/) — visual hierarchy, F/Z scanning, 5–9 elements.
- [What's Next: 7 UI Design Trends of 2026 — Tubik](https://blog.tubikstudio.com/ui-design-trends-2026/) — motion that guides rather than flashes; monospaced type for data rhythm.
- [SaaS Design Trends 2026 — DesignStudio](https://www.designstudiouiux.com/blog/top-saas-design-trends/) — strategic minimalism, removing non-essential visual noise.
- [Effective Dashboard UX: Design Principles — Excited](https://excited.agency/blog/dashboard-ux-design) — progressive disclosure, cognitive load, summary-first.
- [Data Visualization Design Best Practices — Eleken](https://www.eleken.co/blog-posts/data-visualization-design-for-data-intensive-saas-applications) — consistent chart/element styling for clarity.
