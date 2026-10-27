import { z } from "zod";
export const settingsInput = z
  .object({
    deliveryFeeMinor: z.number().int().min(0).max(1000000),
  })
  .strict();
