import { BaseController } from "./base-controller";
import { ContractService } from "../service/contract";
import { Request, Response } from "express";
import { CreateContractDTO, CreateContractTemplateDTO, ParamsContractDTO, ParamsVersionDTO, SignContractDTO } from "../validator/contract";

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

    showContractFile = async (req: Request, res: Response) => {
        const params = req.params as unknown as ParamsVersionDTO;
        const buffer = await this.service.getBufferFile(params.contractId, params.versionId);
        return this.sendPdfFile(req, res, buffer, `contract-${params.contractId}-vid${params.versionId}.pdf`);
    }

    previewHtmlString = async (req: Request, res: Response) => {

        const data = req.body as CreateContractTemplateDTO;
        const template = await this.service.createContractTemplate(data);

        const resData = {
            type: "html",
            filename: "contract.html",
            content: template,
        }

        return this.sendOk(req, res, resData);
    }

    previewHtmlFile = async (req: Request, res: Response) => {

        const data = req.body as CreateContractTemplateDTO;
        const template = this.service.createContractTemplate(data);

        const resData = {
            type: "html",
            filename: "contract.html",
            content: template,
        }

        return this.sendHtmlFile(req, res, resData.content, resData.filename);
    }

    previewPdfFile = async (req: Request, res: Response) => {

        const data = req.body as CreateContractTemplateDTO;
        const template = await this.service.createContractTemplatePdf(data);

        return this.sendPdfFile(req, res, template, `contract-${data.title}-${Date.now()}.pdf`);
    }
}