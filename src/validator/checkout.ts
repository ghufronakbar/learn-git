import { z } from "zod";

export const CheckoutSchema = z.object({
    productId: z.coerce.number().int(),
});

export type CheckoutDTO = z.infer<typeof CheckoutSchema>;

export const ParamsHistoryCheckoutSchema = z.object({
    historyId: z.coerce.number().int(),
});

export type ParamsHistoryCheckoutDTO = z.infer<typeof ParamsHistoryCheckoutSchema>;