import { z } from 'zod';

export const CreateTaskSchema = z.object({
  boardId: z.string().cuid(),
  columnId: z.string().cuid(),
  projectId: z.string().cuid().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  notes: z.string().max(10000).optional(),
  priority: z.enum(['P0', 'P1', 'P2']).optional(),
  sprintId: z.string().cuid().optional(),
  epicId: z.string().cuid().optional(),
  externalId: z.string().max(50).optional(),
  position: z.number().optional(),
  done: z.boolean().optional(),
  deferred: z.boolean().optional(),
  deferredReason: z.string().max(500).optional().nullable(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = CreateTaskSchema.partial().omit({ boardId: true });
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export const MoveTaskSchema = z.object({
  columnId: z.string().cuid(),
  position: z.number(),
  sprintId: z.string().cuid().optional().nullable(),
});
export type MoveTaskInput = z.infer<typeof MoveTaskSchema>;

export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(5000),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const UpsertAssignmentSchema = z.object({
  projectMemberId: z.string().cuid(),
  hours: z.number().min(0).max(1000),
});
export type UpsertAssignmentInput = z.infer<typeof UpsertAssignmentSchema>;
