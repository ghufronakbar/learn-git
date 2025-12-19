import { CreateProductDTO } from "src/validator/product";
import { BadRequestError } from "../utils/error";
import { PrismaService } from "./prisma-service";

export class ProductService {

    constructor(private db: PrismaService) { }
    getAllProducts = async () => {
        throw new BadRequestError("Method not implemented");
        return [];
    }

    createProduct = async (data: CreateProductDTO) => {
        return await this.db.product.create({ data });
    }


}