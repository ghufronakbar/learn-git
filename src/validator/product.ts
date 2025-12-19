import { z } from "zod";

export const CreateProductSchema = z.object({
    name: z.string(),
    price: z.number(),
});

export type CreateProductDTO = z.infer<typeof CreateProductSchema>;

export const EditProductSchema = z.object({
    name: z.string(),
    price: z.number(),
});

export type EditProductDTO = z.infer<typeof EditProductSchema>;

export const ParamsProductSchema = z.object({
    productId: z.coerce.number().int(),
});

export type ParamsProductDTO = z.infer<typeof ParamsProductSchema>;