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
import { ContractService } from "../service/contract";
import { ContractRouter } from "./contract";
import { ContractController } from "../controller/contract";
import { OrderService } from "../service/order";
import { OrderController } from "../controller/order";
import { OrderRouter } from "./order";

const api = express.Router();

// init service
const cfg = new Config();
const cloudinaryService = new CloudinaryService(cfg);
const prismaService = new PrismaService();
const productService = new ProductService(prismaService);
const fileService = new FileService(prismaService, cloudinaryService);
const contractService = new ContractService(prismaService, fileService);
const orderService = new OrderService(prismaService, fileService);

// init controller
const productController = new ProductController(productService);
const productRouter = new ProductRouter(productController);
const fileController = new FileController(fileService);
const contractController = new ContractController(contractService);
const orderController = new OrderController(orderService);

// init router
const checkoutService = new CheckoutService(prismaService, productService);
const checkoutController = new CheckoutController(checkoutService);
const checkoutRouter = new CheckoutRouter(checkoutController);
const fileRouter = new FileRouter(fileController);
const contractRouter = new ContractRouter(contractController);
const orderRouter = new OrderRouter(orderController);

api.use(productRouter.path, productRouter.router);
api.use(checkoutRouter.path, checkoutRouter.router);
api.use(fileRouter.path, fileRouter.router);
api.use(contractRouter.path, contractRouter.router);
api.use(orderRouter.path, orderRouter.router);

export default api;

