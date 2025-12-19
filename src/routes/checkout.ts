import { validateHandler } from "../middleware/validate-handler";
import { CheckoutController } from "../controller/checkout";
import { BaseRouter } from "./base-router";
import { CheckoutSchema, ParamsHistoryCheckoutSchema } from "../validator/checkout";
import { asyncHandler } from "../middleware/error-handler";

export class CheckoutRouter extends BaseRouter {
    constructor(private controller: CheckoutController) {
        super("/checkout");
        this.registerRoutes();
    }

    private registerRoutes() {
        this.router.get("/", asyncHandler(async (req, res) => await this.controller.getAllHistoriesCheckout(req, res)));
        this.router.get("/:historyId", validateHandler({ params: ParamsHistoryCheckoutSchema }), asyncHandler(async (req, res) => await this.controller.getHistoryById(req, res)));
        this.router.post("/", validateHandler({ body: CheckoutSchema }), asyncHandler(async (req, res) => await this.controller.createCheckout(req, res)));
    }
}