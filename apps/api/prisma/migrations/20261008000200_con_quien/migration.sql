-- Con quién (spec 2026-10-08-con-quien-design.md §2 y §6): aditiva, no modifica datos existentes.

-- CreateTable
CREATE TABLE "Companion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Companion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Companion_userId_name_key" ON "Companion"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Companion_id_userId_key" ON "Companion"("id", "userId");

-- AddForeignKey
ALTER TABLE "Companion" ADD CONSTRAINT "Companion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "companionId" UUID;

-- CreateIndex
CREATE INDEX "Transaction_userId_companionId_idx" ON "Transaction"("userId", "companionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companionId_userId_fkey" FOREIGN KEY ("companionId", "userId") REFERENCES "Companion"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Solo gastos y compras con tarjeta, nunca los intereses (hijos de un pago de préstamo)
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companion_check" CHECK (
  "companionId" IS NULL OR ("type" IN ('EXPENSE', 'CARD_PURCHASE') AND "parentId" IS NULL)
);

-- Opciones iniciales para las cuentas que ya existen (las nuevas las crea el registro)
INSERT INTO "Companion" ("userId", "name", "icon", "color", "sortOrder", "updatedAt")
SELECT users."id", d."name", d."icon", d."color", d."sortOrder", CURRENT_TIMESTAMP
FROM (SELECT u."id" FROM "User" u) AS users
CROSS JOIN (
  VALUES
    ('Solo', 'user', '#475569', 0),
    ('Pareja', 'heart', '#be185d', 1),
    ('Familia', 'home', '#2563eb', 2),
    ('Amigos', 'users', '#c2410c', 3)
) AS d("name", "icon", "color", "sortOrder")
ON CONFLICT ("userId", "name") DO NOTHING;
