import { z } from 'zod';
import { EmbeddedRecipeSchema } from './mealPlan';

/**
 * Public share snapshot — explicitly omits user-supplied prompt, user ids,
 * email, and any client-side traces. The owner creates shares via a Flow
 * that copies only this safe subset into `publicShares/{shareId}`.
 */
export const PublicPlanSnapshotSchema = z.object({
  planName: z.string().max(120),
  generatedAt: z.string().datetime().optional(),
  summary: z.string().max(400),
  recipes: z.array(EmbeddedRecipeSchema),
});
export type PublicPlanSnapshot = z.infer<typeof PublicPlanSnapshotSchema>;
