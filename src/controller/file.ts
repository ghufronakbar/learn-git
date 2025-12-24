import { BaseController } from "./base-controller";
import { Request, Response } from "express";
import { FileService } from "../service/file";
import { ValidationError } from "../utils/error";

export class FileController extends BaseController {
    constructor(private service: FileService) {
        super();
    }

    uploadFile = async (req: Request, res: Response) => {
        const file = req.file;
        if (!file) throw new ValidationError({ file: "FILE_IS_REQUIRED" });
        const result = await this.service.uploadFile(file);
        return this.sendOk(req, res, result);
    }
}