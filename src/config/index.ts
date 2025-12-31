import { z } from "zod";

const CommonEnvSchema = z.object({
    PORT: z.coerce.number().int().min(1).max(65535),
    BASE_URL: z.string().url(),
})


type CommonEnv = z.infer<typeof CommonEnvSchema>;

const CloudinaryEnvSchema = z.object({
    CLOUDINARY_CLOUD_NAME: z.string(),
    CLOUDINARY_API_KEY: z.string(),
    CLOUDINARY_API_SECRET: z.string(),
})
type CloudinaryEnv = z.infer<typeof CloudinaryEnvSchema>;

const SignPdfEnvSchema = z.object({
    SIGN_P12_PASSPHRASE: z.string(),
})
type SignPdfEnv = z.infer<typeof SignPdfEnvSchema>;

export class Config {
    public readonly common: CommonEnv;
    public readonly cloudinary: CloudinaryEnv;
    public readonly signPdf: SignPdfEnv;

    constructor() {
        this.common = this.loadEnv();
        this.cloudinary = this.loadCloudinaryEnv();
        this.signPdf = this.loadSignPdfEnv();
    }

    private loadEnv(): CommonEnv {
        const parsed = CommonEnvSchema.safeParse(process.env);
        if (!parsed.success) {
            console.error("Invalid environment variables:", parsed.error.format());
            throw new Error("Invalid environment variables");
        }
        return parsed.data;
    }

    private loadCloudinaryEnv(): CloudinaryEnv {
        const parsed = CloudinaryEnvSchema.safeParse(process.env);
        if (!parsed.success) {
            console.error("Invalid environment variables:", parsed.error.format());
            throw new Error("Invalid environment variables");
        }
        return parsed.data;
    }
    private loadSignPdfEnv(): SignPdfEnv {
        const parsed = SignPdfEnvSchema.safeParse(process.env);
        if (!parsed.success) {
            console.error("Invalid environment variables:", parsed.error.format());
            throw new Error("Invalid environment variables");
        }
        return parsed.data;
    }
}
