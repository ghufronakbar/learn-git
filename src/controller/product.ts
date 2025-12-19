import { BaseController } from "./base-controller";
import { ProductService } from "../service/product";
import { Request, Response } from "express";
import { CreateProductDTO, EditProductDTO, ParamsProductDTO } from "src/validator/product";

export class ProductController extends BaseController {
    constructor(private service: ProductService) {
        super();
    }

    getAllProducts = async (req: Request, res: Response) => {
        const products = await this.service.getAllProducts();
        return this.sendOk(req, res, products);
    }

    getProductById = async (req: Request, res: Response) => {
        const params = req.params as unknown as ParamsProductDTO;
        const product = await this.service.getProductById(params.productId);
        return this.sendOk(req, res, product);
    }

    createProduct = async (req: Request, res: Response) => {
        const data = req.body as CreateProductDTO;
        const product = await this.service.createProduct(data);
        return this.sendOk(req, res, product);
    }

    editProduct = async (req: Request, res: Response) => {
        const data = req.body as EditProductDTO;
        const params = req.params as unknown as ParamsProductDTO;
        const product = await this.service.editProduct(data, params.productId);
        return this.sendOk(req, res, product);
    }

    deleteProduct = async (req: Request, res: Response) => {
        const params = req.params as unknown as ParamsProductDTO;
        const product = await this.service.deleteProduct(params.productId);
        return this.sendOk(req, res, product);
    }
}