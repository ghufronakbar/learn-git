import express from "express";
import { ProductController } from "../controller/product";
import { ProductRouter } from "./product";
import { ProductService } from "../service/product";
import { PrismaService } from "../service/prisma-service";

const api = express.Router();

const prismaService = new PrismaService();
const productService = new ProductService(prismaService);
const productController = new ProductController(productService);
const productRouter = new ProductRouter(productController);

api.use(productRouter.path, productRouter.router);

export default api;

