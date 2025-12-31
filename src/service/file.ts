import { BadRequestError, InternalServerError, NotFoundError } from "../utils/error";
import { PrismaService } from "./prisma-service";
import { CloudinaryService } from "./cloudinary";
import crypto from "crypto";
import { AppStorage } from ".prisma/client";

export class FileService {

    constructor(private db: PrismaService, private cloudinary: CloudinaryService) { }

    uploadFile = async (file: Express.Multer.File): Promise<UploadFileRes> => {
        const hash = await this.createHash(file);
        const check = await this.getByHash(hash)
        if (check) {
            return { ...check, isDuplicate: true };
        }
        const res = await this.cloudinary.uploadFile(file);

        const result = await this.db.appStorage.create({ data: { hash, pathFile: res.secure_url, publicId: res.public_id, resourceType: res.resource_type, size: res.bytes, format: res.format } });
        return { ...result, isDuplicate: false };
    }

    uploadByBuffer = async (buffer: Buffer): Promise<UploadFileRes> => {
        const hash = await this.createHashByBuffer(buffer);
        const check = await this.getByHash(hash)
        if (check) {
            return { ...check, isDuplicate: true };
        }
        const res = await this.cloudinary.uploadByBuffer(buffer);

        const result = await this.db.appStorage.create({ data: { hash, pathFile: res.secure_url, publicId: res.public_id, resourceType: res.resource_type, size: res.bytes, format: res.format } });
        return { ...result, isDuplicate: false };
    }

    private createHashByBuffer = async (buffer: Buffer) => {
        const hash = crypto.createHash("sha256").update(buffer).digest("hex");
        return hash;
    }

    private createHash = async (file: Express.Multer.File) => {
        const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
        return hash;
    }


    getByHash = async (hash: string) => {
        return await this.db.appStorage.findUnique({ where: { hash } });
    }

    getMultipleByHash = async (hashes: string[]) => {
        return await this.db.appStorage.findMany({ where: { hash: { in: hashes } } });
    }
}

interface UploadFileRes extends AppStorage {
    isDuplicate: boolean;
}