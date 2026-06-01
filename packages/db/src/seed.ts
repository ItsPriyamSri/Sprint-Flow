import { PrismaClient, GlobalRole, WorkspaceRole, ProjectRole } from '../generated/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const env = (key: string, fallback?: string): string => {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
};

async function main() {
  const adminEmail = env('SEED_ADMIN_EMAIL', 'admin@sprintflow.local');
  const adminPassword = env('SEED_ADMIN_PASSWORD', 'Admin1234!');
  const adminName = env('SEED_ADMIN_NAME', 'Alex');
  const workspaceName = env('SEED_WORKSPACE_NAME', 'CARR Workspace');

  console.log('🌱 Seeding SprintFlow...');

  const passwordHash = await argon2.hash(adminPassword);

  // ── Admin user ──────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: GlobalRole.ADMIN,
    },
  });
  console.log(`  ✓ Admin user: ${admin.email}`);

  // Demo team members
  const irisUser = await prisma.user.upsert({
    where: { email: 'iris@sprintflow.local' },
    update: {},
    create: { email: 'iris@sprintflow.local', name: 'Iris', passwordHash, role: GlobalRole.MEMBER },
  });
  const nateUser = await prisma.user.upsert({
    where: { email: 'nate@sprintflow.local' },
    update: {},
    create: { email: 'nate@sprintflow.local', name: 'Nate', passwordHash, role: GlobalRole.MEMBER },
  });
  console.log('  ✓ Demo team: Iris, Nate');

  // ── Workspace ───────────────────────────────────────────────────────────────
  const slug = workspaceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const workspace = await prisma.workspace.upsert({
    where: { slug },
    update: {},
    create: { name: workspaceName, slug },
  });
  console.log(`  ✓ Workspace: ${workspace.name}`);

  for (const u of [admin, irisUser, nateUser]) {
    await prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: u.id, workspaceId: workspace.id } },
      update: {},
      create: {
        userId: u.id,
        workspaceId: workspace.id,
        role: u.id === admin.id ? WorkspaceRole.OWNER : WorkspaceRole.MEMBER,
      },
    });
  }

  // ── Board (Kanban flow view) ──────────────────────────────────────────────────
  const board = await prisma.board.upsert({
    where: { id: `board-default-${workspace.id}` },
    update: {},
    create: { id: `board-default-${workspace.id}`, workspaceId: workspace.id, name: 'Main Board' },
  });

  const defaultColumns = [
    { key: 'backlog',     name: 'Backlog',      position: 1000 },
    { key: 'todo',        name: 'Todo',          position: 2000 },
    { key: 'in_progress', name: 'In Progress',   position: 3000 },
    { key: 'review',      name: 'Review',        position: 4000 },
    { key: 'done',        name: 'Done',          position: 5000 },
  ];
  const colMap: Record<string, string> = {};
  for (const col of defaultColumns) {
    const c = await prisma.boardColumn.upsert({
      where: { id: `col-${col.key}-${board.id}` },
      update: { name: col.name, position: col.position },
      create: { id: `col-${col.key}-${board.id}`, boardId: board.id, ...col },
    });
    colMap[col.key] = c.id;
  }
  console.log(`  ✓ Board + columns: ${defaultColumns.map((c) => c.name).join(', ')}`);

  // ── Demo Project ─────────────────────────────────────────────────────────────
  const projectId = `proj-demo-${workspace.id}`;
  const project = await prisma.project.upsert({
    where: { id: projectId },
    update: {},
    create: {
      id: projectId,
      workspaceId: workspace.id,
      name: 'CARR Release',
      description: 'Capacity-planned Scrum project for CARR launch',
      daysPerSprint: 6,
      daysPerWeek: 6,
    },
  });
  console.log(`  ✓ Project: ${project.name}`);

  // Project members (Alex = lead, Iris + Nate = member, 6 hrs/day each)
  const pmAlexId = `pm-alex-${projectId}`;
  const pmIrisId = `pm-iris-${projectId}`;
  const pmNateId = `pm-nate-${projectId}`;

  const pmAlex = await prisma.projectMember.upsert({
    where: { id: pmAlexId },
    update: {},
    create: { id: pmAlexId, projectId: project.id, userId: admin.id, role: ProjectRole.LEAD, hoursPerDay: 6 },
  });
  const pmIris = await prisma.projectMember.upsert({
    where: { id: pmIrisId },
    update: {},
    create: { id: pmIrisId, projectId: project.id, userId: irisUser.id, role: ProjectRole.MEMBER, hoursPerDay: 6 },
  });
  const pmNate = await prisma.projectMember.upsert({
    where: { id: pmNateId },
    update: {},
    create: { id: pmNateId, projectId: project.id, userId: nateUser.id, role: ProjectRole.MEMBER, hoursPerDay: 6 },
  });
  console.log(`  ✓ Project members: Alex (lead), Iris, Nate`);

  // ── Epics ────────────────────────────────────────────────────────────────────
  const epicDefs = [
    { name: 'Infrastructure',     color: '#6366f1' },
    { name: 'Core API',           color: '#0ea5e9' },
    { name: 'UI / Frontend',      color: '#10b981' },
    { name: 'QA & Testing',       color: '#f59e0b' },
    { name: 'Launch & Comms',     color: '#ec4899' },
  ];
  const epicMap: Record<string, string> = {};
  for (const e of epicDefs) {
    const epic = await prisma.epic.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: e.name } },
      update: { color: e.color, projectId: project.id },
      create: { workspaceId: workspace.id, projectId: project.id, name: e.name, color: e.color },
    });
    epicMap[e.name] = epic.id;
  }
  console.log(`  ✓ Epics: ${epicDefs.map((e) => e.name).join(', ')}`);

  // ── Sprints ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const sprintDefs = [
    {
      id: `sprint-1-${project.id}`,
      name: 'Sprint 1',
      goal: 'Infra + core API foundation',
      days: 6,
      position: 1000,
      status: 'ACTIVE' as const,
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3),
      endDate:   new Date(now.getFullYear(), now.getMonth(), now.getDate() + 9),
    },
    {
      id: `sprint-2-${project.id}`,
      name: 'Sprint 2',
      goal: 'UI scaffolding + API wiring',
      days: 6,
      position: 2000,
      status: 'PLANNING' as const,
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 12),
      endDate:   new Date(now.getFullYear(), now.getMonth(), now.getDate() + 24),
      releaseMilestone: false,
    },
    {
      id: `sprint-3-${project.id}`,
      name: 'Sprint 3',
      goal: 'QA, polish, and release',
      days: 6,
      position: 3000,
      status: 'PLANNING' as const,
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 27),
      endDate:   new Date(now.getFullYear(), now.getMonth(), now.getDate() + 39),
      releaseMilestone: true,
      releaseLabel: 'Release 1 (Internal)',
      releaseDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 40),
    },
  ];
  const sprintMap: Record<string, string> = {};
  for (const s of sprintDefs) {
    const sprint = await prisma.sprint.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        workspaceId: workspace.id,
        projectId: project.id,
        name: s.name,
        goal: s.goal,
        days: s.days,
        status: s.status,
        position: s.position,
        startDate: s.startDate,
        endDate:   s.endDate,
        releaseMilestone: (s as { releaseMilestone?: boolean }).releaseMilestone ?? false,
        releaseLabel: (s as { releaseLabel?: string }).releaseLabel ?? null,
        releaseDate: (s as { releaseDate?: Date }).releaseDate ?? null,
      },
    });
    sprintMap[s.name] = sprint.id;
  }
  console.log(`  ✓ Sprints: Sprint 1 (active), Sprint 2, Sprint 3 (release)`);

  // ── Tasks ────────────────────────────────────────────────────────────────────
  // Sprint 1 tasks — already partially planned to demonstrate budget/buffer
  const sprint1Id = sprintMap['Sprint 1']!;
  const sprint2Id = sprintMap['Sprint 2']!;
  const colInProgress = colMap['in_progress']!;
  const colTodo = colMap['todo']!;
  const colBacklog = colMap['backlog']!;

  const taskDefs = [
    // Sprint 1 — Infrastructure
    { id: `t1-${projectId}`,  sprint: sprint1Id, epic: 'Infrastructure', title: 'Provision AWS infra (VPC, RDS, ECS)', priority: 'P0' as const, col: colInProgress, done: false, assignments: [{ pm: pmAlexId, h: 8 }] },
    { id: `t2-${projectId}`,  sprint: sprint1Id, epic: 'Infrastructure', title: 'Set up CI/CD pipeline (GitHub Actions)', priority: 'P1' as const, col: colInProgress, done: false, assignments: [{ pm: pmAlexId, h: 6 }] },
    { id: `t3-${projectId}`,  sprint: sprint1Id, epic: 'Infrastructure', title: 'Configure Secrets Manager + env', priority: 'P1' as const, col: colTodo, done: false, assignments: [{ pm: pmNateId, h: 4 }] },
    // Sprint 1 — Core API
    { id: `t4-${projectId}`,  sprint: sprint1Id, epic: 'Core API', title: 'Auth service — JWT + refresh tokens', priority: 'P0' as const, col: colInProgress, done: false, assignments: [{ pm: pmIrisId, h: 10 }, { pm: pmAlexId, h: 2 }] },
    { id: `t5-${projectId}`,  sprint: sprint1Id, epic: 'Core API', title: 'User + workspace CRUD endpoints', priority: 'P1' as const, col: colTodo, done: false, assignments: [{ pm: pmIrisId, h: 8 }] },
    { id: `t6-${projectId}`,  sprint: sprint1Id, epic: 'Core API', title: 'Database migration scripts', priority: 'P1' as const, col: colTodo, done: false, assignments: [{ pm: pmNateId, h: 6 }] },
    { id: `t7-${projectId}`,  sprint: sprint1Id, epic: 'Core API', title: 'OpenAPI spec + integration tests', priority: 'P2' as const, col: colTodo, done: false, assignments: [{ pm: pmNateId, h: 6 }] },
    // Sprint 2 — UI
    { id: `t8-${projectId}`,  sprint: sprint2Id, epic: 'UI / Frontend', title: 'App shell + routing scaffold', priority: 'P0' as const, col: colBacklog, done: false, assignments: [{ pm: pmIrisId, h: 8 }] },
    { id: `t9-${projectId}`,  sprint: sprint2Id, epic: 'UI / Frontend', title: 'Auth screens (login, register, invite)', priority: 'P1' as const, col: colBacklog, done: false, assignments: [{ pm: pmIrisId, h: 8 }] },
    { id: `t10-${projectId}`, sprint: sprint2Id, epic: 'UI / Frontend', title: 'Onboarding wizard (project creation)', priority: 'P1' as const, col: colBacklog, done: false, assignments: [{ pm: pmAlexId, h: 10 }] },
    { id: `t11-${projectId}`, sprint: sprint2Id, epic: 'UI / Frontend', title: 'Sprint Board view — epic-grouped table', priority: 'P0' as const, col: colBacklog, done: false, assignments: [{ pm: pmAlexId, h: 12 }, { pm: pmIrisId, h: 4 }] },
    { id: `t12-${projectId}`, sprint: sprint2Id, epic: 'Core API',      title: 'Projects REST API + sprint board endpoint', priority: 'P0' as const, col: colBacklog, done: false, assignments: [{ pm: pmNateId, h: 8 }] },
    // Deferred (backlog)
    { id: `t13-${projectId}`, sprint: null, epic: 'QA & Testing', title: 'E2E test suite (Playwright)', priority: 'P2' as const, col: colBacklog, done: false, deferred: true, deferredReason: 'Deprioritised — blocked on stable API surface', assignments: [] },
    { id: `t14-${projectId}`, sprint: null, epic: 'Launch & Comms', title: 'Marketing landing page', priority: 'P2' as const, col: colBacklog, done: false, deferred: true, deferredReason: 'Out of scope until internal release is stable', assignments: [] },
  ];

  let pos = 1000;
  for (const t of taskDefs) {
    const task = await prisma.task.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        workspaceId: workspace.id,
        projectId: project.id,
        boardId: board.id,
        columnId: t.col,
        sprintId: t.sprint,
        epicId: t.epic ? epicMap[t.epic] : undefined,
        title: t.title,
        priority: t.priority,
        done: t.done,
        deferred: (t as { deferred?: boolean }).deferred ?? false,
        deferredReason: (t as { deferredReason?: string }).deferredReason ?? null,
        position: pos,
      },
    });
    pos += 1000;

    // Seed task assignments
    for (const a of t.assignments) {
      await prisma.taskAssignment.upsert({
        where: { taskId_projectMemberId: { taskId: task.id, projectMemberId: a.pm } },
        update: { hours: a.h },
        create: { taskId: task.id, projectMemberId: a.pm, hours: a.h },
      });
    }
  }
  console.log(`  ✓ Tasks: ${taskDefs.length} tasks seeded (${taskDefs.filter((t) => t.sprint === sprint1Id).length} in Sprint 1)`);

  console.log('\n✅ Seed complete.');
  console.log(`\n   Login:        ${adminEmail} / ${adminPassword}`);
  console.log(`   Workspace ID: ${workspace.id}`);
  console.log(`   Project ID:   ${project.id}`);
  console.log(`   Board ID:     ${board.id}`);
  console.log('\n   Team logins:');
  console.log(`   iris@sprintflow.local / Admin1234!`);
  console.log(`   nate@sprintflow.local / Admin1234!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
