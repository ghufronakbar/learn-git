import { validateHandler } from "../middleware/validate-handler";
import { OrderController } from "../controller/order";
import { BaseRouter } from "./base-router";
import { CreateOrderIssuedSchema, ParamsOrderIssuedSchema } from "../validator/order";
import { asyncHandler } from "../middleware/error-handler";

export class OrderRouter extends BaseRouter {
    constructor(private controller: OrderController) {
        super("/order");
        this.registerRoutes();
    }

    private registerRoutes() {
        this.router.get("/", asyncHandler(async (req, res) => await this.controller.getAllOrderIssued(req, res)));
        this.router.get("/:orderIssuedId", validateHandler({ params: ParamsOrderIssuedSchema }), asyncHandler(async (req, res) => await this.controller.getOrderIssuedById(req, res)));
        this.router.post("/", validateHandler({ body: CreateOrderIssuedSchema }), asyncHandler(async (req, res) => await this.controller.createOrderIssued(req, res)));
        this.router.post("/:orderIssuedId/sign", validateHandler({ params: ParamsOrderIssuedSchema, }), asyncHandler(async (req, res) => await this.controller.signOrderContract(req, res)));
        this.router.get("/:orderIssuedId/check-sign", validateHandler({ params: ParamsOrderIssuedSchema, }), asyncHandler(async (req, res) => await this.controller.checkSign(req, res)));
    }
}