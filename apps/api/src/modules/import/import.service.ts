import { Prisma } from '@sprintflow/db';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { assertWorkspaceMember } from '../../lib/rbac';
import { parseWorkbook, reparse, type ParseResult } from './parser';
import { NotFoundError, ForbiddenError, AppError } from '../../lib/errors';

// ─── Upload + Parse ──────────────────────────────────────────────────────────

export async function uploadAndParse(
  workspaceId: string,
  uploadedById: string,
  filename: string,
  buffer: Buffer,
) {
  await assertWorkspaceMember(uploadedById, workspaceId, 'MEMBER');
  // Parse workbook (throws AppError on bad file)
  const result = parseWorkbook(buffer, filename);

  // Persist file
  const storageKey = await storage.store(filename, buffer);

  const statsJson = serializeStats(result);

  // Create Import record + all ImportRows in one transaction
  const importRecord = await prisma.$transaction(async (tx) => {
    const imp = await tx.import.create({
      data: {
        workspaceId,
        uploadedById,
        filename,
        storageKey,
        status: 'PARSED',
        detectedSheet: result.detectedSheet,
        headerRowIndex: result.headerRowIndex,
        columnMap: result.columnMap,
        stats: statsJson,
      },
    });

    if (result.rows.length > 0) {
      await tx.importRow.createMany({
        data: result.rows.map((row, i) => ({
          importId: imp.id,
          rowIndex: result.headerRowIndex + 1 + i,
          raw: row.raw as Prisma.InputJsonValue,
          normalized: row.normalized as unknown as Prisma.InputJsonValue,
          status: row.status,
          messages: row.messages as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    return imp;
  });

  return {
    importId: importRecord.id,
    detectedSheet: result.detectedSheet,
    headerRowIndex: result.headerRowIndex,
    columnMap: result.columnMap,
    stats: statsJson,
  };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export async function getPreview(importId: string, workspaceId: string, userId: string, statusFilter?: string) {
  const imp = await getImportOrThrow(importId, workspaceId, userId);

  const where = statusFilter ? { importId, status: statusFilter as 'VALID' | 'WARNING' | 'ERROR' | 'SKIPPED' | 'COMMITTED' } : { importId };

  const rows = await prisma.importRow.findMany({
    where,
    orderBy: { rowIndex: 'asc' },
  });

  return { import: imp, rows };
}

// ─── Update mapping (re-parse + re-validate) ─────────────────────────────────

export async function updateMapping(
  importId: string,
  workspaceId: string,
  userId: string,
  columnMap: Record<string, string>,
) {
  const imp = await getImportOrThrow(importId, workspaceId, userId);
  if (imp.status === 'COMMITTED' || imp.status === 'ROLLED_BACK') {
    throw new ForbiddenError('Cannot modify a committed or rolled-back import');
  }

  let buffer: Buffer;
  try {
    buffer = await storage.read(imp.storageKey);
  } catch {
    throw new AppError(
      'NOT_FOUND',
      'Import file is no longer on the server — upload the workbook again',
      404,
    );
  }
  const result = reparse(buffer, imp.filename, columnMap);

  const statsJson = serializeStats(result);

  await prisma.$transaction(async (tx) => {
    await tx.importRow.deleteMany({ where: { importId } });

    if (result.rows.length > 0) {
      await tx.importRow.createMany({
        data: result.rows.map((row, i) => ({
          importId,
          rowIndex: result.headerRowIndex + 1 + i,
          raw: row.raw as Prisma.InputJsonValue,
          normalized: row.normalized as unknown as Prisma.InputJsonValue,
          status: row.status,
          messages: row.messages as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    await tx.import.update({
      where: { id: importId },
      data: { columnMap, stats: statsJson, status: 'PREVIEWED' },
    });
  });

  return { columnMap, stats: statsJson };
}

// ─── Commit ──────────────────────────────────────────────────────────────────

async function resolveImportProjectId(
  workspaceId: string,
  optsProjectId?: string,
): Promise<string> {
  if (optsProjectId) {
    const project = await prisma.project.findFirst({
      where: { id: optsProjectId, workspaceId },
    });
    if (!project) {
      throw new AppError('BAD_REQUEST', 'Project not found in this workspace', 400);
    }
    return project.id;
  }

  const defaultProject = await prisma.project.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
  });
  if (!defaultProject) {
    throw new AppError('BAD_REQUEST', 'Create a project before importing', 400);
  }
  return defaultProject.id;
}

type ImportTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function resolveOrCreateSprintForImport(
  tx: ImportTx,
  workspaceId: string,
  projectId: string,
  sprintName: string,
  sprintCache: Map<string, string>,
): Promise<string> {
  // Normalize key so "Sprint 1" and "sprint 1" map to the same entry
  const cacheKey = sprintName.toLowerCase().trim();
  const cached = sprintCache.get(cacheKey);
  if (cached) return cached;

  const existing = await tx.sprint.findFirst({
    where: {
      workspaceId,
      name: { equals: sprintName.trim(), mode: 'insensitive' },
      OR: [{ projectId: null }, { projectId }],
    },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    if (!existing.projectId) {
      await tx.sprint.update({
        where: { id: existing.id },
        data: { projectId },
      });
    }
    sprintCache.set(cacheKey, existing.id);
    return existing.id;
  }

  // Deterministic id prevents duplicate creation on concurrent re-imports
  const sprintKey = `sprint-${projectId}-${cacheKey}`;
  const sprint = await tx.sprint.upsert({
    where: { id: sprintKey },
    update: { projectId },
    create: {
      id: sprintKey,
      workspaceId,
      projectId,
      name: sprintName.trim(),
      status: 'PLANNING',
      days: 6,
      position: sprintCache.size * 1000,
    },
  });
  sprintCache.set(cacheKey, sprint.id);
  return sprint.id;
}

export async function commitImport(
  importId: string,
  workspaceId: string,
  actorId: string,
  opts: { createSprints: boolean; createEpics: boolean; projectId?: string },
) {
  const imp = await getImportOrThrow(importId, workspaceId, actorId);
  if (imp.status === 'COMMITTED') {
    return { message: 'Already committed', committed: 0, skipped: 0, errors: 0 };
  }
  if (imp.status === 'ROLLED_BACK') {
    throw new ForbiddenError('Import has been rolled back — upload again to re-import');
  }

  await assertWorkspaceMember(actorId, workspaceId, 'MEMBER');
  const projectId = await resolveImportProjectId(workspaceId, opts.projectId);

  const rows = await prisma.importRow.findMany({
    where: { importId, status: { in: ['VALID', 'WARNING'] } },
    orderBy: { rowIndex: 'asc' },
  });

  // Get the default board + columns for this workspace
  const board = await prisma.board.findFirst({
    where: { workspaceId },
    include: { columns: { orderBy: { position: 'asc' } } },
  });
  if (!board) throw new AppError('NOT_FOUND', 'No board found for this workspace', 404);

  const colByKey = new Map(board.columns.map((c) => [c.key, c.id]));
  const fallbackColId = board.columns[0]?.id ?? '';

  // Caches to avoid repeated lookups within a single commit
  const sprintCache = new Map<string, string>(); // name → id
  const epicCache = new Map<string, string>();
  const stubUserCache = new Map<string, string>(); // owner name → user id (stubs only)
  const projectMemberCache = new Map<string, string>(); // owner name → projectMember id
  const colPositions = new Map<string, number>(); // columnId → next position

  let committed = 0;
  let skipped = 0;
  const createdTaskIds: string[] = [];

  // Use a serialised loop (not Promise.all) to keep ordering stable and avoid race conditions
  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const norm = row.normalized as unknown as {
          externalId: string | null;
          title: string | null;
          sprintName: string | null;
          epicName: string | null;
          ownerName: string | null;
          priority: string | null;
          columnKey: string | null;
          rawStatus: string | null;
          notes: string | null;
          hoursN: number | null;
          hoursI: number | null;
          hoursTotal: number | null;
        };

        if (!norm.title) { skipped++; continue; }

        // Sprint — adopt workspace-scoped sprints by name, then attach to project
        let sprintId: string | null = null;
        if (opts.createSprints && norm.sprintName) {
          sprintId = await resolveOrCreateSprintForImport(
            tx,
            workspaceId,
            projectId,
            norm.sprintName,
            sprintCache,
          );
        }

        // Epic
        let epicId: string | null = null;
        if (opts.createEpics && norm.epicName) {
          if (!epicCache.has(norm.epicName)) {
            const epic = await tx.epic.upsert({
              where: { workspaceId_name: { workspaceId, name: norm.epicName } },
              update: { projectId },
              create: { workspaceId, projectId, name: norm.epicName },
            });
            epicCache.set(norm.epicName, epic.id);
          }
          epicId = epicCache.get(norm.epicName) ?? null;
        }

        // Owner: find-or-create an UNCLAIMED user stub, ensure a WorkspaceMember and
        // a ProjectMember exist so that TaskAssignment (and thus the name on cards) works.
        if (norm.ownerName) {
          const cacheKey = norm.ownerName.toLowerCase().trim();
          if (!stubUserCache.has(cacheKey)) {
            const existingUser = await tx.user.findFirst({
              where: { name: { equals: norm.ownerName, mode: 'insensitive' }, status: { in: ['UNCLAIMED', 'ACTIVE', 'INVITED'] } },
            });
            let userId: string;
            if (existingUser) {
              userId = existingUser.id;
            } else {
              const stub = await tx.user.create({
                data: { name: norm.ownerName, status: 'UNCLAIMED' },
              });
              await tx.workspaceMember.upsert({
                where: { userId_workspaceId: { userId: stub.id, workspaceId } },
                update: {},
                create: { userId: stub.id, workspaceId, role: 'VIEWER' },
              });
              userId = stub.id;
            }
            stubUserCache.set(cacheKey, userId);

            // Upsert ProjectMember so TaskAssignment FK is satisfiable — skip admin users
            if (!projectMemberCache.has(cacheKey)) {
              const resolvedUser = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
              if (resolvedUser?.role !== 'ADMIN') {
                const pm = await tx.projectMember.upsert({
                  where: { projectId_userId: { projectId, userId } },
                  update: {},
                  create: { projectId, userId, role: 'MEMBER', hoursPerDay: 6 },
                });
                projectMemberCache.set(cacheKey, pm.id);
              }
            }
          }
        }

        // Determine target column
        const colKey = norm.columnKey ?? 'backlog';
        const columnId = colByKey.get(colKey) ?? colByKey.get('backlog') ?? fallbackColId;

        // Fractional position within column
        const pos = (colPositions.get(columnId) ?? 0) + 1000;
        colPositions.set(columnId, pos);

        // Check for deferred status from norm (STATUS_MAP maps "deferred" to "backlog")
        const isDeferred = norm.rawStatus?.toLowerCase().trim() === 'deferred';
        const deferredReason = isDeferred
          ? (norm.notes?.trim() || norm.rawStatus?.trim() || 'Deferred')
          : undefined;

        const taskFields = {
          boardId: board.id,
          columnId,
          title: norm.title,
          notes: norm.notes ?? undefined,
          priority: (norm.priority as 'P0' | 'P1' | 'P2' | null) ?? undefined,
          sprintId: sprintId ?? undefined,
          epicId: epicId ?? undefined,
          projectId,
          deferred: isDeferred,
          deferredReason,
          position: pos,
        };

        // Upsert when externalId is set — re-importing the same workbook updates existing tasks
        const task = norm.externalId
          ? await tx.task.upsert({
              where: {
                workspaceId_externalId: { workspaceId, externalId: norm.externalId },
              },
              update: taskFields,
              create: { workspaceId, externalId: norm.externalId, ...taskFields },
            })
          : await tx.task.create({
              data: { workspaceId, ...taskFields },
            });

        // ── TaskAssignment creation ─────────────────────────────────────────────
        // Create assignment for every task that has an owner — even with 0 hours —
        // so the assignee name is visible on cards. ProjectMember records were
        // already upserted above in the owner-stub block.
        if (projectId && norm.ownerName) {
          const isShared = norm.ownerName.toLowerCase().trim() === 'shared';

          if (isShared) {
            // "Shared" → split hoursN and hoursI among the first two project members
            const projectMembers = await tx.projectMember.findMany({
              where: { projectId },
              include: { user: { select: { name: true } } },
              orderBy: { id: 'asc' },
              take: 2,
            });
            const hoursValues = [norm.hoursN ?? 0, norm.hoursI ?? 0];
            for (let mi = 0; mi < Math.min(projectMembers.length, 2); mi++) {
              const member = projectMembers[mi];
              const hrs = hoursValues[mi] ?? 0;
              if (member) {
                await tx.taskAssignment.upsert({
                  where: { taskId_projectMemberId: { taskId: task.id, projectMemberId: member.id } },
                  update: { hours: hrs },
                  create: { taskId: task.id, projectMemberId: member.id, hours: hrs },
                });
              }
            }
          } else {
            // Single owner — projectMemberId already in cache from the stub-creation block above
            const ownerKey = norm.ownerName.toLowerCase().trim();
            const projectMemberId = projectMemberCache.get(ownerKey);
            if (projectMemberId) {
              const totalHours = norm.hoursTotal ?? ((norm.hoursN ?? 0) + (norm.hoursI ?? 0));
              await tx.taskAssignment.upsert({
                where: { taskId_projectMemberId: { taskId: task.id, projectMemberId } },
                update: { hours: totalHours },
                create: { taskId: task.id, projectMemberId, hours: totalHours },
              });
            }
          }
        }

        createdTaskIds.push(task.id);

        // Link ImportRow → Task
        await tx.importRow.update({
          where: { id: row.id },
          data: { status: 'COMMITTED', createdTaskId: task.id },
        });

        committed++;
      }

      // Reconcile project linkage for this import batch
      if (createdTaskIds.length > 0) {
        await tx.task.updateMany({
          where: { id: { in: createdTaskIds }, projectId: null },
          data: { projectId },
        });

        const sprintLinks = await tx.task.findMany({
          where: { id: { in: createdTaskIds }, sprintId: { not: null } },
          select: { sprintId: true },
          distinct: ['sprintId'],
        });
        const sprintIds = sprintLinks
          .map((t) => t.sprintId)
          .filter((id): id is string => id !== null);
        if (sprintIds.length > 0) {
          await tx.sprint.updateMany({
            where: { id: { in: sprintIds }, projectId: null },
            data: { projectId },
          });
        }
      }

      // Update Import status
      await tx.import.update({
        where: { id: importId },
        data: { status: 'COMMITTED' },
      });

      // Audit log
      await tx.activityLog.create({
        data: {
          workspaceId,
          actorId,
          action: 'IMPORT_COMMITTED',
          entityType: 'import',
          entityId: importId,
          diff: { committed, skipped } as Prisma.InputJsonValue,
        },
      });
    },
    { timeout: 30000 },
  );

  return {
    committed,
    skipped,
    errors: rows.length - committed - skipped,
    boardId: board.id,
    projectId,
  };
}

// ─── Rollback ────────────────────────────────────────────────────────────────

export async function rollbackImport(importId: string, workspaceId: string, actorId: string) {
  const imp = await getImportOrThrow(importId, workspaceId, actorId);
  if (imp.status !== 'COMMITTED') {
    throw new ForbiddenError('Only committed imports can be rolled back');
  }

  const linkedRows = await prisma.importRow.findMany({
    where: { importId, createdTaskId: { not: null } },
    select: { createdTaskId: true },
  });
  const taskIds = linkedRows.map((r) => r.createdTaskId!);

  await prisma.$transaction(async (tx) => {
    if (taskIds.length) {
      // Unlink first to avoid FK issues
      await tx.importRow.updateMany({
        where: { importId },
        data: { createdTaskId: null, status: 'VALID' },
      });
      await tx.task.deleteMany({ where: { id: { in: taskIds } } });
    }

    await tx.import.update({ where: { id: importId }, data: { status: 'ROLLED_BACK' } });

    await tx.activityLog.create({
      data: {
        workspaceId,
        actorId,
        action: 'IMPORT_ROLLED_BACK',
        entityType: 'import',
        entityId: importId,
        diff: { deletedTasks: taskIds.length } as Prisma.InputJsonValue,
      },
    });
  });

  return { deletedTasks: taskIds.length };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getImportOrThrow(importId: string, workspaceId: string, userId: string) {
  await assertWorkspaceMember(userId, workspaceId, 'VIEWER');
  const imp = await prisma.import.findUnique({ where: { id: importId } });
  if (!imp) throw new NotFoundError('Import');
  if (imp.workspaceId !== workspaceId) throw new ForbiddenError('Import not in this workspace');
  return imp;
}

function serializeStats(result: ParseResult) {
  return {
    total: result.stats.total,
    valid: result.stats.valid,
    warnings: result.stats.warnings,
    errors: result.stats.errors,
    skipped: result.stats.skipped,
    sprints: result.stats.sprints.size,
    epics: result.stats.epics.size,
    owners: result.stats.owners.size,
  };
}
