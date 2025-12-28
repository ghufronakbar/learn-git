-- CreateTable
CREATE TABLE "OrderIssued" (
    "id" SERIAL NOT NULL,
    "issue" TEXT NOT NULL,
    "warehouseName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderIssued_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderContract" (
    "id" SERIAL NOT NULL,
    "orderIssuedId" INTEGER NOT NULL,

    CONSTRAINT "OrderContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderContractVersion" (
    "id" SERIAL NOT NULL,
    "orderContractId" INTEGER NOT NULL,
    "hashFile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderContractVersionSignatureField" (
    "id" SERIAL NOT NULL,
    "orderContractVersionId" INTEGER NOT NULL,
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

    CONSTRAINT "OrderContractVersionSignatureField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderContract_orderIssuedId_key" ON "OrderContract"("orderIssuedId");

-- AddForeignKey
ALTER TABLE "OrderContract" ADD CONSTRAINT "OrderContract_orderIssuedId_fkey" FOREIGN KEY ("orderIssuedId") REFERENCES "OrderIssued"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderContractVersion" ADD CONSTRAINT "OrderContractVersion_orderContractId_fkey" FOREIGN KEY ("orderContractId") REFERENCES "OrderContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderContractVersionSignatureField" ADD CONSTRAINT "OrderContractVersionSignatureField_orderContractVersionId_fkey" FOREIGN KEY ("orderContractVersionId") REFERENCES "OrderContractVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
