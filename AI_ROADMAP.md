# SprintFlow — AI Integration Roadmap

> **Status:** Not started. The MVP is fully functional without AI. This document describes where AI can be added later — purely assistive, never controlling.

---

## Guiding Principles

From the original project spec:

1. The application must function completely without AI.
2. AI assists users — it does not take control away from them.
3. AI is introduced only where it genuinely improves the workflow.
4. Every AI suggestion must be reviewable and overridable.

The architecture is already designed for this. An `AiMappingProvider` interface stub exists in `apps/api/src/lib/` — it's a no-op today and can be implemented without changing any call sites.

---

## Isolation Architecture

All AI functionality lives behind a service layer:

```
ImportController
  → ImportService
      → AiMappingProvider (interface)
            ↕  no-op today
            ↕  Claude API tomorrow
      → normalizeRow()   ← pure function, no AI dependency
      → validateRow()    ← pure function, no AI dependency
```

When you implement an AI provider, you inject it into the service at startup. No other files change.

```ts
// apps/api/src/lib/ai.ts (future)
export interface AiMappingProvider {
  suggestColumnMap(headers: string[]): Promise<Record<string, string>>;
  suggestPriority(title: string, notes: string): Promise<'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'|null>;
  suggestEpic(title: string, existingEpics: string[]): Promise<string | null>;
  suggestAssignee(title: string, teamMembers: string[]): Promise<string | null>;
}

export const noOpAiProvider: AiMappingProvider = {
  suggestColumnMap:  async () => ({}),
  suggestPriority:   async () => null,
  suggestEpic:       async () => null,
  suggestAssignee:   async () => null,
};
```

---

## Planned AI Features (in priority order)

### 1. AI-Assisted Column Mapping (Highest value, lowest risk)

**Problem:** When someone uploads an unfamiliar spreadsheet (not the standard company format), the auto-detected column mapping may be wrong. Today they fix it manually in Step 2 of the wizard.

**AI solution:** Before Step 2, call `AiMappingProvider.suggestColumnMap(headers)` with the detected Excel headers. The AI returns a suggested `{ header → field }` mapping. This is pre-filled in the UI — the user still reviews and confirms it.

**Implementation:**
- Add `POST /imports/:id/suggest-mapping` endpoint
- The wizard's Step 2 shows a "✨ AI suggestions available" banner
- User clicks to see suggestions, then accepts/modifies/rejects per column
- If the AI call fails, Step 2 works exactly as today

**Model:** Claude Haiku 4.5 (fast, cheap, sufficient for column name matching)

**Prompt pattern:**
```
Given these Excel column headers: [Sprint, ID, Task / Story, Epic, Owner, Hrs (N), Hrs (I), Total, Priority, Notes, Status]
Map each header to one of these field names: [sprintName, externalId, title, epicName, ownerName, hoursN, hoursI, hoursTotal, priority, notes, status]
Return JSON: { "header": "fieldName" }. If a header doesn't match any field, omit it.
```

---

### 2. Priority Prediction

**Problem:** Imported tasks often have missing or inconsistent priorities.

**AI solution:** For rows with WARNING or null priority after import, offer a "Suggest priorities" button. The AI reads the task title + notes and suggests `LOW/MEDIUM/HIGH/CRITICAL`. The user can accept or override each suggestion.

**Implementation:**
- Add `POST /imports/:id/suggest-priorities` (batch endpoint — one API call for all tasks)
- UI shows suggestions as badges next to each ImportRow in Step 3
- User checkboxes which suggestions to accept before committing
- Accepted suggestions are applied during commit

**Model:** Claude Sonnet 4.6

**Context to include:** task title, notes, epic name, sprint name. Do NOT include PII (owner names).

---

### 3. Epic Detection / Suggestion

**Problem:** Many imported tasks have no epic assigned. Grouping them into epics is manual work.

**AI solution:** After import, offer "Suggest epics" for ungrouped tasks. The AI clusters tasks by theme and suggests epic names. The user reviews the clusters and accepts/renames/rejects each one.

**This is more complex:**
- Requires sending multiple task titles at once (batch)
- Use prompt caching — the epic list and task batch are good candidates
- The AI should never create epics automatically; it proposes, user approves

**Implementation:**
- Add `POST /workspaces/:id/suggest-epics` endpoint
- Takes a list of task IDs + their titles/notes
- Returns: `[{ epicName: "Authentication", taskIds: [...] }]`
- UI shows proposed groupings in a review modal before applying

---

### 4. Sprint Recommendation

**Problem:** New tasks added manually don't have a sprint. Users have to manually assign them.

**AI solution:** When creating a task (or batch-editing tasks), offer a "Suggest sprint" button. The AI looks at the task description + existing tasks in each sprint + sprint dates and recommends the best fit.

**Implementation:**
- Add optional `suggestSprint` flag to `POST /tasks`
- The service calls `AiMappingProvider.suggestSprint()` if flag is set
- The response includes `suggestedSprintId` and `reason`
- The UI pre-selects the suggested sprint in the drawer with a ✨ indicator

---

### 5. Assignment Recommendation

**Problem:** Task assignment is often tribal knowledge (who knows authentication? who owns the reporting module?).

**AI solution:** When a task has no assignee, suggest one based on historical patterns — who has worked on similar epics/tasks before?

**This requires historical data:** The system needs enough activity history to be useful. Not viable at initial import (no history yet) but useful after ~2+ sprints of data.

**Implementation:**
- Analyse `ActivityLog` entries for task moves/updates per user per epic
- Build a lightweight embedding of user expertise areas
- On task creation, suggest the top-2 candidates with confidence score

**Privacy note:** Only users in the same workspace are considered. No cross-workspace data leaks.

---

## What AI Should NEVER Do

| Scenario | Why not |
|---|---|
| Automatically commit an import | Loss of human review step — defeats the purpose of the preview |
| Auto-assign tasks | Removes agency; internal politics matter |
| Auto-create or delete sprints | Sprint planning is a team decision |
| Override user-set priorities | User's explicit choice takes precedence always |
| Send task data to AI without user knowledge | Must be opt-in; data minimisation matters |

---

## Technical Integration Notes

### Using Claude API with Prompt Caching

For batch operations (suggest epics, suggest priorities for 46 tasks), use Anthropic's prompt caching to reduce cost:

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Cache the system prompt + task context across multiple calls
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' }, // cache for 5 minutes
    },
  ],
  messages: [{ role: 'user', content: taskBatch }],
});
```

### Structured Output via Tool Use

For reliable JSON output (column maps, epic clusters), use tool calling instead of parsing free text:

```ts
const response = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  tools: [{
    name: 'submit_column_mapping',
    description: 'Submit the detected column mapping',
    input_schema: {
      type: 'object',
      properties: {
        mapping: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['mapping'],
    },
  }],
  tool_choice: { type: 'tool', name: 'submit_column_mapping' },
  messages: [{ role: 'user', content: prompt }],
});
```

### Rate Limiting + Fallback

All AI endpoints must:
1. Have a generous timeout (10s+) and graceful fallback to no-AI behaviour
2. Be rate-limited (AI calls are expensive — 5 req/min per user)
3. Never block the import pipeline if the AI service is down

---

## Recommended Model Choices

| Use case | Model | Reason |
|---|---|---|
| Column mapping | claude-haiku-4-5-20251001 | Fast, cheap, deterministic enough |
| Priority prediction | claude-sonnet-4-6 | Better reasoning about urgency/impact |
| Epic clustering | claude-sonnet-4-6 | Needs semantic understanding |
| Sprint recommendation | claude-sonnet-4-6 | Context-window dependent |
| Assignment recommendation | claude-opus-4-8 | Complex multi-factor reasoning |

---

## Environment Variables (when AI is enabled)

```env
# Add to .env.example when implementing:
ANTHROPIC_API_KEY=sk-ant-...
AI_PROVIDER=claude          # "claude" | "none" (default: none)
AI_MAX_REQUESTS_PER_MINUTE=5
AI_TIMEOUT_MS=10000
```

The `AI_PROVIDER=none` default means the system behaves identically to today's MVP with zero code changes.

---

## Rollout Plan

1. **Phase A** — Implement `AiMappingProvider` with Claude Haiku for column mapping only. Ship as an opt-in toggle (admin can enable in settings). Measure user adoption + accuracy.
2. **Phase B** — Add priority prediction + epic suggestions based on Phase A learnings.
3. **Phase C** — Sprint/assignment recommendations after sufficient activity history.

Each phase ships independently behind the same service interface — existing code doesn't change.
