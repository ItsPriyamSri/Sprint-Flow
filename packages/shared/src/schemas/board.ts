import { z } from 'zod';

export const BoardFiltersSchema = z.object({
  sprint: z.string().optional(),
  owner: z.string().optional(),
  epic: z.string().optional(),
  priority: z.enum(['P0', 'P1', 'P2']).optional(),
  status: z.string().optional(),
});
export type BoardFilters = z.infer<typeof BoardFiltersSchema>;

export const ReorderColumnsSchema = z.object({
  columnIds: z.array(z.string().cuid()).min(1),
});
export type ReorderColumnsInput = z.infer<typeof ReorderColumnsSchema>;

export const AddColumnSchema = z.object({
  name: z.string().min(1).max(100),
  key: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .optional(),
});
export type AddColumnInput = z.infer<typeof AddColumnSchema>;
