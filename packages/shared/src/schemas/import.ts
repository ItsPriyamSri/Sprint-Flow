import { z } from 'zod';

export const UpdateMappingSchema = z.object({
  columnMap: z.record(z.string(), z.string()), // { excelHeader: fieldName }
});
export type UpdateMappingInput = z.infer<typeof UpdateMappingSchema>;

export const CommitImportSchema = z.object({
  createSprints: z.boolean().default(true),
  createEpics: z.boolean().default(true),
});
export type CommitImportInput = z.infer<typeof CommitImportSchema>;

// The normalized row shape produced by the import pipeline
export const NormalizedRowSchema = z.object({
  externalId: z.string().optional(),
  title: z.string(),
  sprintName: z.string().optional(),
  epicName: z.string().optional(),
  ownerName: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.string().optional(), // maps to column key
  notes: z.string().optional(),
  hoursN: z.number().optional(),
  hoursI: z.number().optional(),
  hoursTotal: z.number().optional(),
});
export type NormalizedRow = z.infer<typeof NormalizedRowSchema>;
