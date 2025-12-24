-- CreateTable
CREATE TABLE "AppStorage" (
    "id" SERIAL NOT NULL,
    "pathFile" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppStorage_pkey" PRIMARY KEY ("id")
);
