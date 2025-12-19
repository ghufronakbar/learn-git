import express from "express";
import { ProductController } from "../controller/product";
import { ProductRouter } from "./product";
import { ProductService } from "../service/product";

const api = express.Router();

const productService = new ProductService();
const productController = new ProductController(productService);
const productRouter = new ProductRouter(productController);

api.use(productRouter.path, productRouter.router);

export default api;

