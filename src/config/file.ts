// src/config/file.ts
import path from "path";
import fs from "fs";

const FONT_PATH = path.join(__dirname, "../assets/fonts");

const loadFile = (basepath: string, filename: string): Buffer | null => {
    const filePath = path.join(basepath, filename);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
};

const SCRIPT_FONT = loadFile(FONT_PATH, "script.ttf")

export const FILE = {
    SCRIPT_FONT
};

console.table({
    SCRIPT_FONT: SCRIPT_FONT ? "exists" : "not exists",
});