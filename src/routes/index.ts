import express from "express";

export class IndexRouter {
    public router: express.Router;

    constructor() {
        this.router = express.Router();
    }

    public getRouter(): express.Router {
        return this.router;
    }

    public init(): void {
        this.router.get("/", (_req, res) => res.send("Hello World!"));
    }
}