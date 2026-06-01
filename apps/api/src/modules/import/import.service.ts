import { Prisma } from '@sprintflow/db';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { parseWorkbook, reparse, type ParseResult } from './parser';
import { NotFoundError, ForbiddenError, AppError } from '../../lib/errors';

// ─── Upload + Parse ──────────────────────────────────────────────────────────

export async function uploadAndParse(
  workspaceId: string,
  uploadedById: string,
  filename: string,
  buffer: Buffer,
) {
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

export async function getPreview(importId: string, workspaceId: string, statusFilter?: string) {
  const imp = await getImportOrThrow(importId, workspaceId);

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
  columnMap: Record<string, string>,
) {
  const imp = await getImportOrThrow(importId, workspaceId);
  if (imp.status === 'COMMITTED' || imp.status === 'ROLLED_BACK') {
    throw new ForbiddenError('Cannot modify a committed or rolled-back import');
  }

  const buffer = await storage.read(imp.storageKey);
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

export async function commitImport(
  importId: string,
  workspaceId: string,
  actorId: string,
  opts: { createSprints: boolean; createEpics: boolean; projectId?: string },
) {
  const imp = await getImportOrThrow(importId, workspaceId);
  if (imp.status === 'COMMITTED') {
    return { message: 'Already committed', committed: 0, skipped: 0, errors: 0 };
  }
  if (imp.status === 'ROLLED_BACK') {
    throw new ForbiddenError('Import has been rolled back — upload again to re-import');
  }

        const rows = await prisma.importRow.findMany({
    where: { importId, status: { in: ['VALID', 'WARNING'] } },
    orderBy: { rowIndex: 'asc' },
  });

  // Optional projectId from opts
  const projectId = (opts as { createSprints: boolean; createEpics: boolean; projectId?: string }).projectId ?? null;

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
  const ownerCache = new Map<string, string>();
  const colPositions = new Map<string, number>(); // columnId → next position

  let committed = 0;
  let skipped = 0;

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
          notes: string | null;
          hoursN: number | null;
          hoursI: number | null;
          hoursTotal: number | null;
        };

        if (!norm.title) { skipped++; continue; }

        // Sprint
        let sprintId: string | null = null;
        if (opts.createSprints && norm.sprintName) {
          if (!sprintCache.has(norm.sprintName)) {
            const sprint = await tx.sprint.upsert({
              where: { id: `sprint-${workspaceId}-${norm.sprintName}` },
              update: {},
              create: {
                id: `sprint-${workspaceId}-${norm.sprintName}`,
                workspaceId,
                name: norm.sprintName,
                status: 'PLANNING',
                position: sprintCache.size * 1000,
              },
            });
            sprintCache.set(norm.sprintName, sprint.id);
          }
          sprintId = sprintCache.get(norm.sprintName) ?? null;
        }

        // Epic
        let epicId: string | null = null;
        if (opts.createEpics && norm.epicName) {
          if (!epicCache.has(norm.epicName)) {
            const epic = await tx.epic.upsert({
              where: { workspaceId_name: { workspaceId, name: norm.epicName } },
              update: {},
              create: { workspaceId, name: norm.epicName },
            });
            epicCache.set(norm.epicName, epic.id);
          }
          epicId = epicCache.get(norm.epicName) ?? null;
        }

        // Owner: create UNCLAIMED user stub for future claiming (not linked to task directly)
        if (norm.ownerName) {
          const cacheKey = norm.ownerName.toLowerCase();
          if (!ownerCache.has(cacheKey)) {
            const existing = await tx.user.findFirst({
              where: { name: { equals: norm.ownerName, mode: 'insensitive' }, status: { in: ['UNCLAIMED', 'ACTIVE', 'INVITED'] } },
            });
            if (existing) {
              ownerCache.set(cacheKey, existing.id);
            } else {
              const stub = await tx.user.create({
                data: { name: norm.ownerName, status: 'UNCLAIMED' },
              });
              await tx.workspaceMember.upsert({
                where: { userId_workspaceId: { userId: stub.id, workspaceId } },
                update: {},
                create: { userId: stub.id, workspaceId, role: 'VIEWER' },
              });
              ownerCache.set(cacheKey, stub.id);
            }
          }
        }

        // Determine target column
        const colKey = norm.columnKey ?? 'backlog';
        const columnId = colByKey.get(colKey) ?? colByKey.get('backlog') ?? fallbackColId;

        // Fractional position within column
        const pos = (colPositions.get(columnId) ?? 0) + 1000;
        colPositions.set(columnId, pos);

        const taskFields = {
          boardId: board.id,
          columnId,
          title: norm.title,
          notes: norm.notes ?? undefined,
          priority: (norm.priority as 'P0' | 'P1' | 'P2' | null) ?? undefined,
          sprintId: sprintId ?? undefined,
          epicId: epicId ?? undefined,
          projectId: projectId ?? undefined,
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

        // Link ImportRow → Task
        await tx.importRow.update({
          where: { id: row.id },
          data: { status: 'COMMITTED', createdTaskId: task.id },
        });

        committed++;
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

  return { committed, skipped, errors: rows.length - committed - skipped, boardId: board.id };
}

// ─── Rollback ────────────────────────────────────────────────────────────────

export async function rollbackImport(importId: string, workspaceId: string, actorId: string) {
  const imp = await getImportOrThrow(importId, workspaceId);
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

async function getImportOrThrow(importId: string, workspaceId: string) {
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
