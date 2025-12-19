import { BadRequestError, NotFoundError } from "../utils/error";
import { PrismaService } from "./prisma-service";
import { ProductService } from "./product";
import { CheckoutDTO } from "src/validator/checkout";

export class CheckoutService {

    constructor(private db: PrismaService, private product: ProductService) { }
    getAllHistoriesCheckout = async () => {
        return await this.db.history.findMany({
            include: {
                product: true
            }
        });
    }

    getHistoryById = async (historyId: number) => {
        const history = await this.db.history.findUnique({ where: { id: historyId }, include: { product: true } });
        if (!history) throw new NotFoundError()
        return history;
    }

    createCheckout = async (data: CheckoutDTO) => {
        const product = await this.product.getProductById(data.productId);
        return await this.db.history.create({ data: { productId: data.productId, name: product.name, price: product.price } });
    }
}