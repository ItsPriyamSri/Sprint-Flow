import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as importService from './import.service';
import { AppError } from '../../lib/errors';
import { env } from '../../lib/env';

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls']);
const ALLOWED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // some browsers send this for .xlsx
]);

function getWorkspaceId(req: Request): string {
  // For MVP (single workspace): read from query param, header, or body.
  const id =
    (req.query['workspaceId'] as string) ??
    req.headers['x-workspace-id'] ??
    req.body?.workspaceId;
  if (!id) throw new AppError('BAD_REQUEST', 'workspaceId is required', 400);
  return id as string;
}

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) throw new AppError('BAD_REQUEST', 'No file uploaded', 400);

    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new AppError('INVALID_FILE', 'Only .xlsx and .xls files are accepted', 422);
    }

    const maxBytes = env.STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new AppError('FILE_TOO_LARGE', `File must be under ${env.STORAGE_MAX_FILE_SIZE_MB}MB`, 422);
    }

    const workspaceId = getWorkspaceId(req);

    const result = await importService.uploadAndParse(
      workspaceId,
      req.user!.id,
      file.originalname,
      file.buffer,
    );

    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function preview(req: Request, res: Response, next: NextFunction) {
  try {
    const { importId } = req.params as { importId: string };
    const workspaceId = getWorkspaceId(req);
    const statusFilter = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;

    const result = await importService.getPreview(importId, workspaceId, req.user!.id, statusFilter);

    res.json({
      import: {
        id: result.import.id,
        filename: result.import.filename,
        status: result.import.status,
        detectedSheet: result.import.detectedSheet,
        headerRowIndex: result.import.headerRowIndex,
        columnMap: result.import.columnMap,
        stats: result.import.stats,
        createdAt: result.import.createdAt.toISOString(),
      },
      rows: result.rows.map((r) => ({
        id: r.id,
        rowIndex: r.rowIndex,
        raw: r.raw,
        normalized: r.normalized,
        status: r.status,
        messages: Array.isArray(r.messages) ? r.messages : [],
        createdTaskId: r.createdTaskId,
      })),
    });
  } catch (e) {
    next(e);
  }
}

export async function updateMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const { importId } = req.params as { importId: string };
    const workspaceId = getWorkspaceId(req);
    const { columnMap } = z
      .object({ columnMap: z.record(z.string(), z.string()) })
      .parse(req.body);

    const result = await importService.updateMapping(importId, workspaceId, req.user!.id, columnMap);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function commit(req: Request, res: Response, next: NextFunction) {
  try {
    const { importId } = req.params as { importId: string };
    const workspaceId = getWorkspaceId(req);
    const { createSprints = true, createEpics = true, projectId, newProjectName } = z
      .object({
        createSprints: z.boolean().default(true),
        createEpics: z.boolean().default(true),
        projectId: z.string().optional(),
        newProjectName: z.string().min(1).max(200).optional(),
      })
      .parse(req.body ?? {});

    const result = await importService.commitImport(importId, workspaceId, req.user!.id, {
      createSprints,
      createEpics,
      projectId,
      newProjectName,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function rollback(req: Request, res: Response, next: NextFunction) {
  try {
    const { importId } = req.params as { importId: string };
    const workspaceId = getWorkspaceId(req);

    const result = await importService.rollbackImport(importId, workspaceId, req.user!.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
}
