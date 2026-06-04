import { PrismaClient } from '../../generated/client';

const prisma = new PrismaClient();

async function main() {
  const adminUsers = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, email: true },
  });

  if (adminUsers.length === 0) {
    console.log('No admin users found — nothing to clean up.');
    return;
  }

  console.log(`Found ${adminUsers.length} admin user(s): ${adminUsers.map((u) => u.email ?? u.id).join(', ')}`);
  const adminIds = adminUsers.map((u) => u.id);

  const { count: assignmentsDeleted } = await prisma.taskAssignment.deleteMany({
    where: { projectMember: { userId: { in: adminIds } } },
  });

  const { count: membersDeleted } = await prisma.projectMember.deleteMany({
    where: { userId: { in: adminIds } },
  });

  console.log(`✓ Removed ${assignmentsDeleted} TaskAssignment row(s) and ${membersDeleted} ProjectMember row(s) for admin user(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
