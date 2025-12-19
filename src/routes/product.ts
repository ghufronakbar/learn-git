import { ProductController } from "../controller/product";
import { BaseRouter } from "./base-router";

export class ProductRouter extends BaseRouter {
    constructor(private controller: ProductController) {
        super("/product");
        this.registerRoutes();
    }

    private registerRoutes() {
        this.router.get("/", this.controller.getAllProducts);
    }
}