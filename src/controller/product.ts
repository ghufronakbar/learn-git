import { BaseController } from "./base-controller";
import { ProductService } from "../service/product";
import { Request, Response } from "express";

export class ProductController extends BaseController {
    constructor(private service: ProductService) {
        super();
    }

    getAllProducts(req: Request, res: Response) {
        const products = this.service.getAllProducts();
        return this.sendOk(req, res, products);
    }
}