// src/config/secret.ts
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Config } from ".";

const execFileAsync = promisify(execFile);

const SECRET_PATH = path.join(__dirname, "../secret/signing");

type GenerateCertOptions = {
    /** default 730 (2 tahun). Untuk dev test, set 1 (1 hari). */
    days?: number;
    /** default: "/C=ID/O=MyCompany/OU=Warehouse/CN=Warehouse Manager Dev" */
    subject?: string;
    /** overwrite existing files */
    force?: boolean;
};

const ensureDir = () => {
    fs.mkdirSync(SECRET_PATH, { recursive: true });
};

const fileExists = (filename: string) => fs.existsSync(path.join(SECRET_PATH, filename));

const rmIfExists = (filename: string) => {
    const p = path.join(SECRET_PATH, filename);
    if (fs.existsSync(p)) fs.rmSync(p);
};

export const generateNewCert = async (version: number, opts: GenerateCertOptions = {}) => {
    ensureDir();

    const cfg = new Config();
    const passphrase = cfg.signPdf.SIGN_P12_PASSPHRASE;

    const days = opts.days ?? 730;
    const subj = opts.subject ?? "/C=ID/O=MyCompany/OU=Warehouse/CN=Warehouse Manager Dev";

    const keyFile = `${version}.key`;
    const crtFile = `${version}.crt`;
    const p12File = `${version}.p12`;

    const allExist = fileExists(keyFile) && fileExists(crtFile) && fileExists(p12File);
    if (allExist && !opts.force) {
        return {
            ok: true,
            skipped: true,
            version,
            paths: {
                key: path.join(SECRET_PATH, keyFile),
                crt: path.join(SECRET_PATH, crtFile),
                p12: path.join(SECRET_PATH, p12File),
            },
        };
    }

    if (opts.force) {
        rmIfExists(keyFile);
        rmIfExists(crtFile);
        rmIfExists(p12File);
    }

    // 1) private key (RSA 2048)
    await execFileAsync(
        "openssl",
        ["genrsa", "-out", keyFile, "2048"],
        { cwd: SECRET_PATH }
    );

    // 2) self-signed certificate (X.509)
    await execFileAsync(
        "openssl",
        ["req", "-new", "-x509", "-key", keyFile, "-out", crtFile, "-days", String(days), "-subj", subj],
        { cwd: SECRET_PATH }
    );

    // 3) bundle to PKCS#12 (.p12) with passphrase
    // -passout pass:<passphrase> (openssl expects this exact format)
    await execFileAsync(
        "openssl",
        ["pkcs12", "-export", "-out", p12File, "-inkey", keyFile, "-in", crtFile, "-passout", `pass:${passphrase}`],
        { cwd: SECRET_PATH }
    );

    return {
        ok: true,
        skipped: false,
        version,
        days,
        subject: subj,
        paths: {
            key: path.join(SECRET_PATH, keyFile),
            crt: path.join(SECRET_PATH, crtFile),
            p12: path.join(SECRET_PATH, p12File),
        },
    };
};

const loadFile = (basepath: string, filename: string): Buffer | null => {
    const filePath = path.join(basepath, filename);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
};

export const SECRET = (version: number) => {
    const PRIVATE_KEY = loadFile(SECRET_PATH, `${version}.key`);
    const PUBLIC_KEY = loadFile(SECRET_PATH, `${version}.crt`);
    const P12_KEY = loadFile(SECRET_PATH, `${version}.p12`);

    return {
        SIGNING: {
            PRIVATE_KEY,
            PUBLIC_KEY,
            P12_KEY,
        },
    };
};

// Optional helper: assert material exists (biar errornya jelas)
export const assertSigningMaterial = (version: number) => {
    const { SIGNING } = SECRET(version);
    if (!SIGNING.PRIVATE_KEY || !SIGNING.PUBLIC_KEY || !SIGNING.P12_KEY) {
        throw new Error(`PANIC: signing files for version=${version} not found in ${SECRET_PATH}`);
    }
    return SIGNING;
};
