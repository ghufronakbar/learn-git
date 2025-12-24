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

// CREATE CONTRACT TEMPLATE
export const CreateContractTemplateSchema = z.object({
    title: z.string().min(1).max(255),
    content: z.string().min(1),
    applicant: z.string().min(1).max(40),
})

export type CreateContractTemplateDTO = z.infer<typeof CreateContractTemplateSchema>;

// PARAMS
export const ParamsContractSchema = z.object({
    contractId: z.coerce.number().int(),
});

export type ParamsContractDTO = z.infer<typeof ParamsContractSchema>;

// PARAMS VERSION
export const ParamsVersionSchema = z.object({
    contractId: z.coerce.number().int(),
    versionId: z.coerce.number().int(),
});

export type ParamsVersionDTO = z.infer<typeof ParamsVersionSchema>;

