/**
 * One-off cleanup: removes all demo/dummy user accounts that were created with
 * non-@geti.education addresses (sprintflow.local) used during early development.
 *
 * Safe to run multiple times (idempotent). Cascading deletes via Prisma handle
 * TaskAssignment, Comment, ActivityLog etc. rows automatically.
 */
import { PrismaClient } from '../../generated/client';

const prisma = new PrismaClient();

async function main() {
  const dummyUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: '@sprintflow.local' } },
        { email: { endsWith: '.local' } },
      ],
    },
    select: { id: true, email: true, name: true },
  });

  if (dummyUsers.length === 0) {
    console.log('No dummy users found — nothing to clean up.');
    return;
  }

  console.log(`Found ${dummyUsers.length} dummy user(s):`);
  dummyUsers.forEach((u) => console.log(`  - ${u.email ?? u.name} (${u.id})`));

  const ids = dummyUsers.map((u) => u.id);

  // Unlink any name-stubs pointing at these users
  const { count: unlinked } = await prisma.user.updateMany({
    where: { linkedToId: { in: ids } },
    data: { linkedToId: null },
  });

  // Delete assignments
  const { count: assignmentsDeleted } = await prisma.taskAssignment.deleteMany({
    where: { projectMember: { userId: { in: ids } } },
  });

  // Delete project memberships (assignments already deleted above)
  const { count: projectMembersDeleted } = await prisma.projectMember.deleteMany({
    where: { userId: { in: ids } },
  });

  // Delete workspace memberships
  const { count: wsMembersDeleted } = await prisma.workspaceMember.deleteMany({
    where: { userId: { in: ids } },
  });

  // Delete the user records (comments/activityLogs cascade or null-out via schema)
  const { count: usersDeleted } = await prisma.user.deleteMany({
    where: { id: { in: ids } },
  });

  console.log('\n✅ Cleanup complete:');
  console.log(`   Unlinked name-stubs: ${unlinked}`);
  console.log(`   TaskAssignments deleted: ${assignmentsDeleted}`);
  console.log(`   ProjectMembers deleted: ${projectMembersDeleted}`);
  console.log(`   WorkspaceMembers deleted: ${wsMembersDeleted}`);
  console.log(`   Users deleted: ${usersDeleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
