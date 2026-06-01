// Shared response / payload types used by both API and web client.

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  total?: number;
}

// Slim user shape returned in API responses (no passwordHash)
export interface UserDto {
  id: string;
  email: string | null;
  name: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
}

export interface MembershipDto {
  workspaceId: string;
  workspaceName: string;
  role: string;
}

// ─── Project DTOs ─────────────────────────────────────────────────────────────

export interface ProjectMemberDto {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  role: string;
  hoursPerDay: number;
  status: string;
}

export interface ProjectDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  daysPerSprint: number;
  daysPerWeek: number;
  releaseDate: string | null;
  createdAt: string;
  members: ProjectMemberDto[];
  sprints: SprintDto[];
  epics: EpicDto[];
}

/** Aggregated per-sprint data for the Overview page */
export interface SprintHealthDto {
  sprint: SprintDto;
  budgetHours: number; // Σ(member.hoursPerDay) × sprint.days
  plannedHours: number; // Σ(TaskAssignment.hours) for tasks in this sprint
  bufferHours: number; // budget - planned
  completedTasks: number;
  totalTasks: number;
  memberWorkload: MemberWorkloadDto[];
}

export interface MemberWorkloadDto {
  member: ProjectMemberDto;
  committedHours: number;
  weeklyCapacity: number; // hoursPerDay × daysPerWeek
  p0Count: number;
  overloaded: boolean;
}

export interface ProjectOverviewDto {
  project: ProjectDto;
  currentSprint: SprintHealthDto | null;
  allSprints: SprintHealthDto[];
  daysToNextRelease: number | null;
  tasksCompletedThisWeek: number;
}

// ─── Board DTOs ───────────────────────────────────────────────────────────────

export interface BoardColumnDto {
  id: string;
  name: string;
  key: string;
  position: number;
  wipLimit: number | null;
  tasks: TaskDto[];
}

// ─── Task DTOs ────────────────────────────────────────────────────────────────

export interface TaskAssignmentDto {
  id: string;
  projectMemberId: string;
  memberName: string;
  hours: number;
}

export interface TaskDto {
  id: string;
  externalId: string | null;
  title: string;
  description: string | null;
  notes: string | null;
  priority: string | null;
  columnId: string;
  projectId: string | null;
  sprintId: string | null;
  sprintName: string | null;
  epicId: string | null;
  epicName: string | null;
  epicColor: string | null;
  done: boolean;
  deferred: boolean;
  deferredReason: string | null;
  assignments: TaskAssignmentDto[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** Extended task with comments — returned from GET /tasks/:id */
export interface TaskDetailDto extends TaskDto {
  column: { id: string; name: string; key: string };
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string };
  }>;
}

/** Sprint board task — same as TaskDto but with totalHours derived */
export interface SprintTaskDto extends TaskDto {
  totalHours: number; // Σ assignment.hours
}

/** Sprint board response */
export interface SprintBoardDto {
  sprint: SprintDto;
  epics: EpicDto[];
  tasks: SprintTaskDto[];
  budgetHours: number;
  plannedHours: number;
  bufferHours: number;
  memberWorkload: MemberWorkloadDto[];
}

// ─── Sprint DTOs ──────────────────────────────────────────────────────────────

export interface SprintDto {
  id: string;
  name: string;
  goal: string | null;
  days: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  releaseMilestone: boolean;
  releaseLabel: string | null;
  releaseDate: string | null;
  position: number;
  projectId: string | null;
}

export interface EpicDto {
  id: string;
  name: string;
  color: string | null;
  projectId: string | null;
}

// ─── My Work DTOs ─────────────────────────────────────────────────────────────

export interface MyWorkTaskDto extends SprintTaskDto {
  myHours: number; // this member's hours for this task
  dailyTarget: number; // myHours / daysRemaining
}

export interface MyWorkDto {
  member: ProjectMemberDto;
  currentSprint: SprintDto | null;
  todayFocus: MyWorkTaskDto[]; // top 2-3 tasks for today
  currentSprintTasks: MyWorkTaskDto[];
  upcomingTasks: MyWorkTaskDto[];
  daysRemaining: number;
}

// ─── Team View DTOs ───────────────────────────────────────────────────────────

export interface TeamMemberSprintDto {
  sprintId: string;
  sprintName: string;
  committedHours: number;
  budgetHours: number;
  overloaded: boolean;
}

export interface TeamMemberDto {
  member: ProjectMemberDto;
  totalCommittedHours: number;
  totalCapacityHours: number;
  weeklyCapacity: number;
  perSprint: TeamMemberSprintDto[];
  overloaded: boolean;
}

export interface TeamViewDto {
  project: { id: string; name: string };
  team: TeamMemberDto[];
}

// ─── Import DTOs ──────────────────────────────────────────────────────────────

export interface ImportDto {
  id: string;
  filename: string;
  status: string;
  detectedSheet: string | null;
  headerRowIndex: number | null;
  columnMap: Record<string, string> | null;
  stats: ImportStats | null;
  createdAt: string;
}

export interface ImportStats {
  total: number;
  valid: number;
  warnings: number;
  errors: number;
  sprints: number;
  epics: number;
  owners: number;
}

export interface ImportRowDto {
  id: string;
  rowIndex: number;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  status: string;
  messages: ImportMessage[];
  createdTaskId: string | null;
}

export interface ImportMessage {
  level: 'info' | 'warning' | 'error';
  field?: string;
  message: string;
}
