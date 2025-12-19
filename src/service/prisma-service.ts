import { PrismaClient } from "@prisma/client";

export class PrismaService extends PrismaClient {
    constructor() {
        super();
    }

    async connect() {
        console.log("Connecting to database...");
        await this.$connect();
    }
}