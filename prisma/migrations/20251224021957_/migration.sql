-- CreateTable
CREATE TABLE "Contract" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "pathFile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureField" (
    "id" SERIAL NOT NULL,
    "contractVersionId" INTEGER NOT NULL,
    "signatureField" TEXT NOT NULL,
    "pdfName" TEXT NOT NULL,
    "pdfM" TEXT NOT NULL,
    "subject" TEXT,
    "issuer" TEXT,
    "cryptoOk" BOOLEAN NOT NULL,
    "byteRangeOk" BOOLEAN NOT NULL,
    "integrityOk" BOOLEAN NOT NULL,
    "trustedCa" BOOLEAN NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureField_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureField" ADD CONSTRAINT "SignatureField_contractVersionId_fkey" FOREIGN KEY ("contractVersionId") REFERENCES "ContractVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
