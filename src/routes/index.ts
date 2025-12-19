import express from "express";
import { ProductController } from "../controller/product";
import { ProductRouter } from "./product";
import { ProductService } from "../service/product";
import { PrismaService } from "../service/prisma-service";
import { CheckoutController } from "../controller/checkout";
import { CheckoutRouter } from "./checkout";
import { CheckoutService } from "../service/checkout";

const api = express.Router();

const prismaService = new PrismaService();
const productService = new ProductService(prismaService);
const productController = new ProductController(productService);
const productRouter = new ProductRouter(productController);

const checkoutService = new CheckoutService(prismaService, productService);
const checkoutController = new CheckoutController(checkoutService);
const checkoutRouter = new CheckoutRouter(checkoutController);

api.use(productRouter.path, productRouter.router);
api.use(checkoutRouter.path, checkoutRouter.router);

export default api;

