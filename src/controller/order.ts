import { BaseController } from "./base-controller";
import { OrderService } from "../service/order";
import { Request, Response } from "express";
import { CreateOrderIssuedDTO, ParamsOrderIssuedDTO } from "src/validator/order";

export class OrderController extends BaseController {
    constructor(private service: OrderService) {
        super();
    }

    getAllOrderIssued = async (req: Request, res: Response) => {
        const orderIssueds = await this.service.getAllOrderIssued();
        return this.sendOk(req, res, orderIssueds);
    }

    getOrderIssuedById = async (req: Request, res: Response) => {
        const params = req.params as unknown as ParamsOrderIssuedDTO;
        const orderIssued = await this.service.getOrderIssuedById(params.orderIssuedId);
        return this.sendOk(req, res, orderIssued);
    }

    createOrderIssued = async (req: Request, res: Response) => {
        const data = req.body as CreateOrderIssuedDTO;
        const orderIssued = await this.service.createOrderContract(data);
        return this.sendOk(req, res, orderIssued);
    }

    signOrderContract = async (req: Request, res: Response) => {
        const params = req.params as unknown as ParamsOrderIssuedDTO;
        const orderIssued = await this.service.signOrderContract(params.orderIssuedId);
        return this.sendOk(req, res, orderIssued);
    }

    checkSign = async (req: Request, res: Response) => {
        const params = req.params as unknown as ParamsOrderIssuedDTO;
        const orderIssued = await this.service.checkSign(params.orderIssuedId);
        return this.sendOk(req, res, orderIssued);
    }
}