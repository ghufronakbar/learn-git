import { Request, Response, NextFunction, RequestHandler } from "express";
import { AppError } from "../utils/error";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    console.error("ERROR:", err);

    if (res.headersSent) return next(err);

    const isAppError = err instanceof AppError;

    const statusCode = isAppError ? err.statusCode : 500;
    const statusText = isAppError ? err.code : "INTERNAL_SERVER_ERROR";

    res.status(statusCode).json({
        metaData: {
            code: statusCode,
            timestamp: new Date().toISOString(),
            status: statusText,
        },
        data: null,
        errors: isAppError
            ? { message: err.message, details: err.details }
            : { message: "Internal server error" },
    });
}

export const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
        (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
