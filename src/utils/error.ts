export type ErrorCode =
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "UNPROCESSABLE_ENTITY"
    | "TOO_MANY_REQUESTS"
    | "INTERNAL_SERVER_ERROR"
    | "VALIDATION_ERROR";

export const StatusText: Record<number, ErrorCode | "OK"> = {
    200: "OK",
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_SERVER_ERROR",
};

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: ErrorCode;
    public readonly details?: unknown;
    public readonly isOperational: boolean;

    constructor(opts: {
        message: string;
        statusCode: number;
        code: ErrorCode;
        details?: unknown;
        isOperational?: boolean;
    }) {
        super(opts.message);
        this.name = this.constructor.name;
        this.statusCode = opts.statusCode;
        this.code = opts.code;
        this.details = opts.details;
        this.isOperational = opts.isOperational ?? true;
        Error.captureStackTrace?.(this, this.constructor);
    }
}

export class BadRequestError extends AppError {
    constructor(message = "Bad request", details?: unknown) {
        super({ message, statusCode: 400, code: "BAD_REQUEST", details });
    }
}
export class UnauthorizedError extends AppError {
    constructor(details?: unknown) {
        super({ message: "Unauthorized", statusCode: 401, code: "UNAUTHORIZED", details });
    }
}
export class ForbiddenError extends AppError {
    constructor(details?: unknown) {
        super({ message: "Forbidden", statusCode: 403, code: "FORBIDDEN", details });
    }
}
export class NotFoundError extends AppError {
    constructor(details?: unknown) {
        super({ message: "Not found", statusCode: 404, code: "NOT_FOUND", details });
    }
}
export class ConflictError extends AppError {
    constructor(details?: unknown) {
        super({ message: "Conflict", statusCode: 409, code: "CONFLICT", details });
    }
}
export class UnprocessableEntityError extends AppError {
    constructor(details?: unknown) {
        super({ message: "Unprocessable entity", statusCode: 422, code: "UNPROCESSABLE_ENTITY", details });
    }
}
export class TooManyRequestsError extends AppError {
    constructor(details?: unknown) {
        super({ message: "Too many requests", statusCode: 429, code: "TOO_MANY_REQUESTS", details });
    }
}
export class InternalServerError extends AppError {
    constructor(details?: unknown) {
        super({
            message: "Internal server error",
            statusCode: 500,
            code: "INTERNAL_SERVER_ERROR",
            details,
            isOperational: false,
        });
    }
}

export class ValidationError extends AppError {
    constructor(details?: unknown) {
        super({ message: "Validation error", statusCode: 422, code: "VALIDATION_ERROR", details });
    }
}