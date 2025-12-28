// src/config/file.ts
import path from "path";
import fs from "fs";

const SECRET_PATH = path.join(__dirname, "../secret/signing");
const FONT_PATH = path.join(__dirname, "../assets/fonts");

const loadFile = (basepath: string, filename: string): Buffer | null => {
    const filePath = path.join(basepath, filename);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
};

const PRIVATE_KEY = loadFile(SECRET_PATH, "dev.key");
const PUBLIC_KEY = loadFile(SECRET_PATH, "dev.crt");
const P12_KEY = loadFile(SECRET_PATH, "dev.p12");
const SCRIPT_FONT = loadFile(FONT_PATH, "script.ttf")

export const FILE = {
    SIGNING: {
        PRIVATE_KEY,
        PUBLIC_KEY,
        P12_KEY,
        SCRIPT_FONT
    }
};

if (!PRIVATE_KEY || !PUBLIC_KEY || !P12_KEY || !SCRIPT_FONT) {
    throw new Error(`PANIC: signing files not found in ${SECRET_PATH}`);
} else {
    console.log(`Signing files found in ${SECRET_PATH}`);
}
console.table({
    PRIVATE_KEY: PRIVATE_KEY ? "exists" : "not exists",
    PUBLIC_KEY: PUBLIC_KEY ? "exists" : "not exists",
    P12_KEY: P12_KEY ? "exists" : "not exists",
    SCRIPT_FONT: SCRIPT_FONT ? "exists" : "not exists",
});