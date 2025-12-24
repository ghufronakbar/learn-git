import { BaseController } from "./base-controller";
import { ContractService } from "../service/contract";
import { Request, Response } from "express";
import { CreateContractDTO, ParamsContractDTO, SignContractDTO } from "../validator/contract";

export class ContractController extends BaseController {
    constructor(private service: ContractService) {
        super();
    }

    getAllContracts = async (req: Request, res: Response) => {
        const contracts = await this.service.getAllContracts();
        return this.sendOk(req, res, contracts);
    }

    getContractById = async (req: Request, res: Response) => {
        const params = req.params as unknown as ParamsContractDTO;
        const contract = await this.service.getContractById(params.contractId);
        return this.sendOk(req, res, contract);
    }

    createContract = async (req: Request, res: Response) => {
        const data = req.body as CreateContractDTO;
        const contract = await this.service.createContract(data);
        return this.sendOk(req, res, contract);
    }

    signContract = async (req: Request, res: Response) => {
        const data = req.body as SignContractDTO;
        const contract = await this.service.signContract(data);
        return this.sendOk(req, res, contract);
    }
}