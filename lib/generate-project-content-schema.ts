import { z } from "zod";

/** Task fields from AI (order assigned on save). */
export const generatedWbsTaskSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  date: z.string().min(1),
  time: z.string().min(1),
  endTime: z.string().optional(),
});

export type GeneratedWbsTask = z.infer<typeof generatedWbsTaskSchema>;

export const generatedPhaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  tasks: z.array(generatedWbsTaskSchema).default([]),
});

export type GeneratedPhase = z.infer<typeof generatedPhaseSchema>;

export const generatedFeatureSchema = z.object({
  phaseOrder: z.number().int(),
  name: z.string().min(1),
  description: z.string().min(1),
  tasks: z.array(generatedWbsTaskSchema).default([]),
});

export type GeneratedFeature = z.infer<typeof generatedFeatureSchema>;

export const incrementalGenerationResponseSchema = z.object({
  newPhases: z.array(generatedPhaseSchema).default([]),
  newFeatures: z.array(generatedFeatureSchema).default([]),
  tasksForExistingPhases: z
    .array(
      z.object({
        phaseOrder: z.number().int(),
        tasks: z.array(generatedWbsTaskSchema),
      }),
    )
    .default([]),
  tasksForExistingFeatures: z
    .array(
      z.object({
        phaseOrder: z.number().int(),
        featureName: z.string().min(1),
        tasks: z.array(generatedWbsTaskSchema),
      }),
    )
    .default([]),
});

export type IncrementalGenerationResponse = z.infer<
  typeof incrementalGenerationResponseSchema
>;

export const regenerateResponseSchema = z.object({
  replacementPhase: generatedPhaseSchema.optional(),
  replacementFeature: generatedFeatureSchema.optional(),
});

export type RegenerateResponse = z.infer<typeof regenerateResponseSchema>;
