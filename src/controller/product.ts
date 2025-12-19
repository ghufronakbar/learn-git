import { BaseController } from "./base-controller";
import { ProductService } from "../service/product";
import { Request, Response } from "express";

export class ProductController extends BaseController {
    constructor(private service: ProductService) {
        super();
    }

    getAllProducts = async (req: Request, res: Response) => {
        const products = await this.service.getAllProducts();
        return this.sendOk(req, res, products);
    }

    createProduct = async (req: Request, res: Response) => {
        const data = req.body;
        const product = await this.service.createProduct(data);
        return this.sendOk(req, res, product);
    }
}