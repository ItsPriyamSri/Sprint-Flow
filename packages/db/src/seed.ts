import { PrismaClient, GlobalRole, WorkspaceRole } from '../generated/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const env = (key: string, fallback?: string): string => {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
};

// Known weak/default passwords that must never reach production
const WEAK_PASSWORDS = ['admin1234', 'password', 'password123', 'changeme', 'sprintflow'];

function isWeakPassword(pw: string): boolean {
  return pw.length < 12 || WEAK_PASSWORDS.some((w) => pw.toLowerCase().includes(w));
}

const isProduction = process.env['NODE_ENV'] === 'production';

async function main() {
  // Hard block: never seed with default credentials in production.
  if (isProduction) {
    const explicitPassword = process.env['SEED_SUPER_ADMIN_PASSWORD'] ?? process.env['SEED_ADMIN_PASSWORD'];
    if (!explicitPassword) {
      console.error('FATAL: Seed refused in production — SEED_SUPER_ADMIN_PASSWORD is not set.');
      console.error('       Set a strong explicit password or provision accounts manually.');
      process.exit(1);
    }
    if (isWeakPassword(explicitPassword)) {
      console.error('FATAL: Seed refused in production — SEED_SUPER_ADMIN_PASSWORD is too weak.');
      console.error('       Use a random password ≥12 characters.');
      process.exit(1);
    }
  }

  const adminEmail = env('SEED_ADMIN_EMAIL', 'admin@sprintflow.local');
  const adminPassword = env('SEED_ADMIN_PASSWORD', 'Admin1234!');
  const adminName = env('SEED_ADMIN_NAME', 'Alex');
  const workspaceName = env('SEED_WORKSPACE_NAME', 'CARR Workspace');

  console.log('🌱 Seeding SprintFlow...');

  // ── Workspace ───────────────────────────────────────────────────────────────
  const slug = workspaceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const workspace = await prisma.workspace.upsert({
    where: { slug },
    update: {},
    create: { name: workspaceName, slug },
  });
  console.log(`  ✓ Workspace: ${workspace.name}`);

  // ── Super Admin user ────────────────────────────────────────────────────────
  const adminPasswordHash = await argon2.hash(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: GlobalRole.SUPER_ADMIN },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash: adminPasswordHash,
      role: GlobalRole.SUPER_ADMIN,
    },
  });
  console.log(`  ✓ Super admin: ${admin.email}`);

  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: admin.id, workspaceId: workspace.id } },
    update: { role: WorkspaceRole.OWNER },
    create: { userId: admin.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER },
  });

  // ── Env-configured super admins (production accounts) ──────────────────────
  const superAdminEmails = (process.env['SUPER_ADMIN_EMAILS'] ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .filter((e) => e !== adminEmail);

  const superAdminPassword = process.env['SEED_SUPER_ADMIN_PASSWORD'] ?? adminPassword;
  const superAdminHash = superAdminPassword !== adminPassword
    ? await argon2.hash(superAdminPassword)
    : adminPasswordHash;

  for (const email of superAdminEmails) {
    const nameParts = email.split('@')[0]!.split(/[._]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
    const name = nameParts.join(' ');

    const sa = await prisma.user.upsert({
      where: { email },
      update: { role: GlobalRole.SUPER_ADMIN },
      create: {
        email,
        name,
        passwordHash: superAdminHash,
        role: GlobalRole.SUPER_ADMIN,
        status: 'ACTIVE',
      },
    });

    await prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: sa.id, workspaceId: workspace.id } },
      update: { role: WorkspaceRole.OWNER },
      create: { userId: sa.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER },
    });

    console.log(`  ✓ Super admin (env): ${sa.email}`);
  }

  if (isProduction) {
    console.log('\n✅ Production seed complete.');
    console.log(`   Workspace ID: ${workspace.id}`);
    return;
  }

  // ── Dev only: board + columns for the Flow view ──────────────────────────────
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
  for (const col of defaultColumns) {
    await prisma.boardColumn.upsert({
      where: { id: `col-${col.key}-${board.id}` },
      update: { name: col.name, position: col.position },
      create: { id: `col-${col.key}-${board.id}`, boardId: board.id, ...col },
    });
  }
  console.log(`  ✓ Board + columns`);

  // ── Dev only: demo project (no members — real users added via Team Dashboard) ─
  const projectId = `proj-demo-${workspace.id}`;
  await prisma.project.upsert({
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
  console.log(`  ✓ Project: CARR Release (no members — add via Team Dashboard)`);

  console.log('\n✅ Dev seed complete.');
  console.log(`   Login:        ${adminEmail} / ${adminPassword}`);
  console.log(`   Workspace ID: ${workspace.id}`);
  console.log(`   Board ID:     ${board.id}`);
  console.log('\n   Add real team members via the Team Dashboard after first login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
