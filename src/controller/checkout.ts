import { BaseController } from "./base-controller";
import { CheckoutService } from "../service/checkout";
import { Request, Response } from "express";
import { CheckoutDTO, ParamsHistoryCheckoutDTO } from "src/validator/checkout";

export class CheckoutController extends BaseController {
    constructor(private service: CheckoutService) {
        super();
    }

    getAllHistoriesCheckout = async (req: Request, res: Response) => {
        const histories = await this.service.getAllHistoriesCheckout();
        return this.sendOk(req, res, histories);
    }

    getHistoryById = async (req: Request, res: Response) => {
        const params = req.params as unknown as ParamsHistoryCheckoutDTO;
        const history = await this.service.getHistoryById(params.historyId);
        return this.sendOk(req, res, history);
    }

    createCheckout = async (req: Request, res: Response) => {
        const data = req.body as CheckoutDTO;
        const history = await this.service.createCheckout(data);
        return this.sendOk(req, res, history);
    }
}