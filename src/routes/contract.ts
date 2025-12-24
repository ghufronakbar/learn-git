import { validateHandler } from "../middleware/validate-handler";
import { ContractController } from "../controller/contract";
import { BaseRouter } from "./base-router";
import { CreateContractSchema, ParamsContractSchema, ParamsVersionSchema, SignContractSchema } from "../validator/contract";
import { asyncHandler } from "../middleware/error-handler";

export class ContractRouter extends BaseRouter {
    constructor(private controller: ContractController) {
        super("/contract");
        this.registerRoutes();
    }

    private registerRoutes() {
        this.router.get("/", asyncHandler(async (req, res) => await this.controller.getAllContracts(req, res)));
        this.router.get("/:contractId", validateHandler({ params: ParamsContractSchema }), asyncHandler(async (req, res) => await this.controller.getContractById(req, res)));
        this.router.post("/", validateHandler({ body: CreateContractSchema }), asyncHandler(async (req, res) => await this.controller.createContract(req, res)));
        this.router.post("/:contractId/sign", validateHandler({ body: SignContractSchema }), asyncHandler(async (req, res) => await this.controller.signContract(req, res)));
        this.router.get("/:contractId/:versionId", validateHandler({ params: ParamsVersionSchema }), asyncHandler(async (req, res) => await this.controller.showContractFile(req, res)));
    }
}