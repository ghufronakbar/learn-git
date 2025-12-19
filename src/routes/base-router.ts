import { Router, type Express } from "express";

export abstract class BaseRouter {
    public readonly path: string;
    public readonly router: Router;

    constructor(path: string) {
        this.path = path;
        this.router = Router();
    }

    public mount(app: Express) {
        app.use(`${this.path}`, this.router);
    }
}
