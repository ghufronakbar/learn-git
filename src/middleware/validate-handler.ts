import { ZodError, ZodSchema } from "zod";
import { Request, Response, NextFunction } from "express";
import { InternalServerError, ValidationError } from "../utils/error";

export const validateHandler =
    (schemas: {
        body?: ZodSchema;
        query?: ZodSchema;
        params?: ZodSchema;
        awaitedBody?: () => Promise<ZodSchema>;
    }) =>
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                if (schemas.body) req.body = schemas.body.parse(req.body);
                if (schemas.query) req.query = schemas.query.parse(req.query);
                if (schemas.params) req.params = schemas.params.parse(req.params);
                if (schemas.awaitedBody) {
                    const awaitedSchema = await schemas.awaitedBody();
                    req.body = awaitedSchema.parse(req.body);
                }
                next();
            } catch (err: any) {
                if (err instanceof ZodError) {
                    return next(new ValidationError(err.errors));
                }
                return next(new InternalServerError(err));
            }
        };
