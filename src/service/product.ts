import { CreateProductDTO, EditProductDTO } from "src/validator/product";
import { BadRequestError, NotFoundError } from "../utils/error";
import { PrismaService } from "./prisma-service";

export class ProductService {

    constructor(private db: PrismaService) { }
    getAllProducts = async () => {
        return await this.db.product.findMany();
    }

    getProductById = async (productId: number) => {
        const product = await this.db.product.findUnique({ where: { id: productId } });
        if (!product) throw new NotFoundError()
        return product;
    }

    createProduct = async (data: CreateProductDTO) => {
        return await this.db.product.create({ data });
    }

    editProduct = async (data: EditProductDTO, productId: number) => {
        await this.getProductById(productId);
        return await this.db.product.update({ where: { id: productId }, data });
    }

    deleteProduct = async (productId: number) => {
        await this.getProductById(productId);
        return await this.db.product.delete({ where: { id: productId } });
    }


}