import express from "express";
import { ProductController } from "../controller/product";
import { ProductRouter } from "./product";
import { ProductService } from "../service/product";
import { PrismaService } from "../service/prisma-service";
import { CheckoutController } from "../controller/checkout";
import { CheckoutRouter } from "./checkout";
import { CheckoutService } from "../service/checkout";
import { FileController } from "../controller/file";
import { FileRouter } from "./file";
import { FileService } from "../service/file";
import { CloudinaryService } from "../service/cloudinary";
import { Config } from "../config";

const api = express.Router();

// init service
const cfg = new Config();
const cloudinaryService = new CloudinaryService(cfg);
const prismaService = new PrismaService();
const productService = new ProductService(prismaService);
const fileService = new FileService(prismaService, cloudinaryService);

// init controller
const productController = new ProductController(productService);
const productRouter = new ProductRouter(productController);
const fileController = new FileController(fileService);

// init router
const checkoutService = new CheckoutService(prismaService, productService);
const checkoutController = new CheckoutController(checkoutService);
const checkoutRouter = new CheckoutRouter(checkoutController);
const fileRouter = new FileRouter(fileController);

api.use(productRouter.path, productRouter.router);
api.use(checkoutRouter.path, checkoutRouter.router);
api.use(fileRouter.path, fileRouter.router);

export default api;

