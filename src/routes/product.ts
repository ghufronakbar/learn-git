import { validateHandler } from "../middleware/validate-handler";
import { ProductController } from "../controller/product";
import { BaseRouter } from "./base-router";
import { CreateProductSchema } from "../validator/product";
import { asyncHandler } from "../middleware/error-handler";

export class ProductRouter extends BaseRouter {
    constructor(private controller: ProductController) {
        super("/product");
        this.registerRoutes();
    }

    private registerRoutes() {
        this.router.get("/", asyncHandler(async (req, res) => await this.controller.getAllProducts(req, res)));
        this.router.post("/", validateHandler({ body: CreateProductSchema }), asyncHandler(async (req, res) => await this.controller.createProduct(req, res)));
    }
}