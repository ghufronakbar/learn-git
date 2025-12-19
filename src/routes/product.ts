import { validateHandler } from "../middleware/validate-handler";
import { ProductController } from "../controller/product";
import { BaseRouter } from "./base-router";
import { CreateProductSchema, EditProductSchema, ParamsProductSchema } from "../validator/product";
import { asyncHandler } from "../middleware/error-handler";

export class ProductRouter extends BaseRouter {
    constructor(private controller: ProductController) {
        super("/product");
        this.registerRoutes();
    }

    private registerRoutes() {
        this.router.get("/", asyncHandler(async (req, res) => await this.controller.getAllProducts(req, res)));
        this.router.get("/:productId", validateHandler({ params: ParamsProductSchema }), asyncHandler(async (req, res) => await this.controller.getProductById(req, res)));
        this.router.post("/", validateHandler({ body: CreateProductSchema }), asyncHandler(async (req, res) => await this.controller.createProduct(req, res)));
        this.router.put("/:productId", validateHandler({ params: ParamsProductSchema, body: EditProductSchema }), asyncHandler(async (req, res) => await this.controller.editProduct(req, res)));
        this.router.delete("/:productId", validateHandler({ params: ParamsProductSchema }), asyncHandler(async (req, res) => await this.controller.deleteProduct(req, res)));
    }
}