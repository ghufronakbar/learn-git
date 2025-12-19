import "dotenv/config"
import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import http from "http";
import cookieParser from "cookie-parser";
import fs from "fs";
import { IndexRouter } from "./routes/index";
import { Config } from "./config";
const app = express();
const server = http.createServer(app);


// ------- Middleware -------
app.disable("x-powered-by");

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
);

app.use(morgan("dev"));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

app.set("trust proxy", true);

// ------- View & Static -------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// ------- Routes -------
app.get("/", (req, res) =>
    res.send("Hello World CI/CD Works!, Newest Change, おめでとうございます")
);

app.get("/__version", (_req, res) => {
    try {
        const p = path.join(__dirname, "version.json");
        const raw = fs.readFileSync(p, "utf8");
        res.type("application/json").send(raw);
    } catch {
        res.json({ sha: process.env.GIT_SHA || "unknown" });
    }
});

const cfg = new Config();
const indexRouter = new IndexRouter();
indexRouter.init();

app.use("/api", indexRouter.getRouter());

// ------- Start server / Bootstrap -------
server.listen(cfg.common.PORT, async () => {
    console.log(`HTTP listening on ${cfg.common.PORT}`);
    console.log(`BASE_URL: ${cfg.common.BASE_URL}`);
});
