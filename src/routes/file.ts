import { validateHandler } from "../middleware/validate-handler";
import { FileController } from "../controller/file";
import { BaseRouter } from "./base-router";
import { asyncHandler } from "../middleware/error-handler";
import { multerSingle } from "../middleware/multer";

export class FileRouter extends BaseRouter {
    constructor(private controller: FileController) {
        super("/file");
        this.registerRoutes();
    }

    private registerRoutes() {
        this.router.post("/upload", multerSingle("file"), asyncHandler(async (req, res) => await this.controller.uploadFile(req, res)));
    }
}