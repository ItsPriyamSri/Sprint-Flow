import { z } from 'zod';

export const ProjectMemberInputSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(['LEAD', 'MEMBER', 'VIEWER']).default('MEMBER'),
  hoursPerDay: z.number().min(0.5).max(24).default(6),
});

export const SprintSetupSchema = z.object({
  name: z.string().min(1).max(200),
  goal: z.string().max(500).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  releaseMilestone: z.boolean().default(false),
  releaseLabel: z.string().max(200).optional(),
  releaseDate: z.string().datetime().optional(),
});

export const CreateProjectSchema = z.object({
  workspaceId: z.string().cuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  daysPerSprint: z.number().int().min(1).max(30).default(6),
  daysPerWeek: z.number().int().min(1).max(7).default(6),
  releaseDate: z.string().datetime().optional(),
  members: z.array(ProjectMemberInputSchema).min(1),
  sprints: z.array(SprintSetupSchema).min(1).max(12),
  epicNames: z.array(z.string().min(1).max(200)).optional().default([]),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = CreateProjectSchema.partial().omit({
  workspaceId: true,
  members: true,
  sprints: true,
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const UpdateProjectMemberSchema = z.object({
  role: z.enum(['LEAD', 'MEMBER', 'VIEWER']).optional(),
  hoursPerDay: z.number().min(0.5).max(24).optional(),
});
export type UpdateProjectMemberInput = z.infer<typeof UpdateProjectMemberSchema>;
