import { z } from 'zod';

export const CreateSprintSchema = z.object({
  projectId: z.string().cuid().optional(),
  name: z.string().min(1).max(200),
  goal: z.string().max(500).optional(),
  days: z.number().int().min(1).max(30).default(6),
  status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED']).default('PLANNING'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  releaseMilestone: z.boolean().optional().default(false),
  releaseLabel: z.string().max(200).optional(),
  releaseDate: z.string().datetime().optional(),
});
export type CreateSprintInput = z.infer<typeof CreateSprintSchema>;

export const UpdateSprintSchema = CreateSprintSchema.partial();
export type UpdateSprintInput = z.infer<typeof UpdateSprintSchema>;
