import { z } from "zod";

// CREATE
export const CreateContractSchema = z.object({
    hash: z.string().min(1).max(255),
});

export type CreateContractDTO = z.infer<typeof CreateContractSchema>;

// SIGN

export const SignContractSchema = z.object({
    contractId: z.coerce.number().int(),
    hash: z.string().min(1).max(255),
})

export type SignContractDTO = z.infer<typeof SignContractSchema>;

// PARAMS
export const ParamsContractSchema = z.object({
    contractId: z.coerce.number().int(),
});

export type ParamsContractDTO = z.infer<typeof ParamsContractSchema>;
