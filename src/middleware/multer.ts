import multer, { FileFilterCallback, MulterError } from "multer";
import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../utils/error";

const storage = multer.memoryStorage();

const allowedMime = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    if (!allowedMime.has(file.mimetype)) {
        return cb(new Error("Invalid file type. Only JPG/PNG/WEBP/PDF allowed."));
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});

/**
 * Middleware: ambil single file dari field tertentu dan taruh ke req.file
 * Contoh: multerSingle("image")
 */
export const multerSingle =
    (fieldName: string) => (req: Request, res: Response, next: NextFunction) => {
        upload.single(fieldName)(req, res, (err: any) => {
            if (!err) return next();

            // MulterError untuk kasus limit dsb
            const message =
                err instanceof MulterError
                    ? err.message
                    : err?.message || "Upload error";

            throw new ValidationError({ file: message });
        });
    };

export const requireFile = (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
        throw new ValidationError({ file: "File is required" })
    }
    next();
};

export { upload };
