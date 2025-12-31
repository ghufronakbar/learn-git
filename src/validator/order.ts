import { z } from "zod";

// ORDER ISSUED
export const CreateOrderIssuedSchema = z.object({
    issue: z.string().min(1).max(255),
    warehouseName: z.string().min(1).max(255),
});

export type CreateOrderIssuedDTO = z.infer<typeof CreateOrderIssuedSchema>;

export const ParamsOrderIssuedSchema = z.object({
    orderIssuedId: z.coerce.number().int().positive(),
});

export type ParamsOrderIssuedDTO = z.infer<typeof ParamsOrderIssuedSchema>;
