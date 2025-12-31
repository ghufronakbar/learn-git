import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { Readable } from "stream";
import { Config } from "../config";
import { BadRequestError, InternalServerError } from "../utils/error";

type UploadFileOptions = {
    folder?: string;
    publicId?: string;
    resourceType?: "image" | "video" | "raw" | "auto";
};

export class CloudinaryService {
    constructor(private cfg: Config) {
        cloudinary.config({
            cloud_name: this.cfg.cloudinary.CLOUDINARY_CLOUD_NAME,
            api_key: this.cfg.cloudinary.CLOUDINARY_API_KEY,
            api_secret: this.cfg.cloudinary.CLOUDINARY_API_SECRET,
            secure: true,
        });
    }

    uploadFile = async (
        file: Express.Multer.File,
        opts: UploadFileOptions = {}
    ): Promise<UploadApiResponse> => {
        if (!file) throw new BadRequestError("File is required.");
        if (!file.buffer) throw new BadRequestError("File buffer is missing.");

        const { folder = "test", publicId, resourceType = "auto" } = opts;

        return new Promise<UploadApiResponse>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    public_id: publicId,
                    resource_type: resourceType,
                    overwrite: true,
                },
                (err, result) => {
                    if (err) return reject(new InternalServerError(err.message));
                    if (!result) return reject(new InternalServerError("CLOUDINARY_UPLOAD_FAILED"));
                    resolve(result);
                }
            );

            Readable.from(file.buffer).pipe(stream);
        });
    };

    uploadByBuffer = async (
        buffer: Buffer,
        opts: UploadFileOptions = {}
    ): Promise<UploadApiResponse> => {
        if (!buffer) throw new BadRequestError("Buffer is required.");

        const { folder = "test", publicId, resourceType = "auto" } = opts;

        return new Promise<UploadApiResponse>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    public_id: publicId,
                    resource_type: resourceType,
                    overwrite: true,
                },
                (err, result) => {
                    if (err) return reject(new InternalServerError(err.message));
                    if (!result) return reject(new InternalServerError("CLOUDINARY_UPLOAD_FAILED"));
                    resolve(result);
                }
            );

            Readable.from(buffer).pipe(stream);
        });
    };

    deleteFile = async (publicId: string) => {
        if (!publicId) throw new BadRequestError("publicId is required.");

        try {
            const res = await cloudinary.uploader.destroy(publicId);
            return res;
        } catch (e: any) {
            throw new InternalServerError(e?.message || "CLOUDINARY_DELETE_FAILED");
        }
    };
}
