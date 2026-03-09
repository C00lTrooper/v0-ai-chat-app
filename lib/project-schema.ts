import { z } from "zod"

export const ProjectSchema = z.object({
  project_name: z.string().min(1, "project_name is required"),
  project_summary: z.object({
    name: z.string().min(1, "summary.name is required"),
    objective: z.string().min(1, "summary.objective is required"),
    duration: z.coerce.number().int().nonnegative("duration must be a non-negative integer"),
    estimated_budget: z.coerce.number().int().nonnegative("estimated_budget must be a non-negative integer"),
    target_date: z.string().min(1, "target_date is required"),
  }),
  project_wbs: z
    .array(
      z.object({
        order: z.number().int().nonnegative(),
        name: z.string().min(1),
        description: z.string().min(1),
        start_date: z.string().min(1),
        end_date: z.string().min(1),
        tasks: z.array(
          z.object({
            order: z.number().int().nonnegative(),
            name: z.string().min(1),
            date: z.string().min(1),
            time: z.string().min(1),
            completed: z.boolean().optional().default(false),
          })
        ),
      })
    )
    .nonempty("project_wbs must contain at least one item"),
  project_milestones: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        target_date: z.string().min(1),
      })
    )
    .optional()
    .default([]),
})

export type Project = z.infer<typeof ProjectSchema>

