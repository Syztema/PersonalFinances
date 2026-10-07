-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'DIGITAL_WALLET', 'SAVINGS', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'CARD_PURCHASE', 'CARD_PAYMENT', 'DEBT_PAYMENT', 'DEBT_DISBURSEMENT');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "Bucket" AS ENUM ('OBLIGATIONS', 'LEISURE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'DEBIT_CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('WEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'YEARLY', 'CUSTOM_DAYS');

-- CreateEnum
CREATE TYPE "ScheduledKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ScheduledStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Bogota',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialConfiguration" (
    "userId" UUID NOT NULL,
    "obligationsPct" SMALLINT NOT NULL DEFAULT 50,
    "savingsPct" SMALLINT NOT NULL DEFAULT 20,
    "investmentPct" SMALLINT NOT NULL DEFAULT 10,
    "leisurePct" SMALLINT NOT NULL DEFAULT 10,
    "otherPct" SMALLINT NOT NULL DEFAULT 10,
    "monthlyIncomeEstimate" BIGINT,
    "lowBalanceThreshold" BIGINT NOT NULL DEFAULT 100000,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinancialConfiguration_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "type" "AccountType" NOT NULL,
    "institution" VARCHAR(60),
    "initialBalance" BIGINT NOT NULL DEFAULT 0,
    "openingDate" DATE NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "issuer" VARCHAR(60),
    "creditLimit" BIGINT NOT NULL,
    "initialDebt" BIGINT NOT NULL DEFAULT 0,
    "initialDebtInstallments" SMALLINT NOT NULL DEFAULT 1,
    "openingDate" DATE NOT NULL,
    "statementDay" SMALLINT NOT NULL,
    "paymentDueDay" SMALLINT NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "lender" VARCHAR(60),
    "initialBalance" BIGINT NOT NULL DEFAULT 0,
    "openingDate" DATE NOT NULL,
    "monthlyPayment" BIGINT,
    "paymentDay" SMALLINT,
    "icon" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "parentId" UUID,
    "bucket" "Bucket",
    "icon" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemKey" VARCHAR(30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTag" (
    "userId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("transactionId","tagId")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "description" VARCHAR(140),
    "payee" VARCHAR(80),
    "notes" VARCHAR(500),
    "accountId" UUID,
    "toAccountId" UUID,
    "creditCardId" UUID,
    "debtId" UUID,
    "categoryId" UUID,
    "goalId" UUID,
    "installments" SMALLINT,
    "paymentMethod" "PaymentMethod",
    "parentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "totalAmount" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "targetAmount" BIGINT NOT NULL,
    "targetDate" DATE,
    "accountId" UUID NOT NULL,
    "initialAmount" BIGINT NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "icon" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringRule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "kind" "ScheduledKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "categoryId" UUID NOT NULL,
    "accountId" UUID,
    "creditCardId" UUID,
    "frequency" "Frequency" NOT NULL,
    "intervalDays" SMALLINT,
    "day1" SMALLINT,
    "day2" SMALLINT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RecurringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "recurringRuleId" UUID,
    "kind" "ScheduledKind" NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "amount" BIGINT NOT NULL,
    "dueDate" DATE NOT NULL,
    "categoryId" UUID NOT NULL,
    "accountId" UUID,
    "creditCardId" UUID,
    "status" "ScheduledStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduledItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DismissedAlert" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "dismissedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_name_key" ON "Account"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_userId_key" ON "Account"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCard_userId_name_key" ON "CreditCard"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCard_id_userId_key" ON "CreditCard"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_userId_name_key" ON "Debt"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_id_userId_key" ON "Debt"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_kind_parentId_name_key" ON "Category"("userId", "kind", "parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_systemKey_key" ON "Category"("userId", "systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_userId_key" ON "Category"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_id_userId_key" ON "Tag"("id", "userId");

-- CreateIndex
CREATE INDEX "TransactionTag_userId_tagId_idx" ON "TransactionTag"("userId", "tagId");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_createdAt_idx" ON "Transaction"("userId", "date" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Transaction_userId_accountId_idx" ON "Transaction"("userId", "accountId");

-- CreateIndex
CREATE INDEX "Transaction_userId_toAccountId_idx" ON "Transaction"("userId", "toAccountId");

-- CreateIndex
CREATE INDEX "Transaction_userId_creditCardId_date_idx" ON "Transaction"("userId", "creditCardId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_debtId_idx" ON "Transaction"("userId", "debtId");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_date_idx" ON "Transaction"("userId", "categoryId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_type_date_idx" ON "Transaction"("userId", "type", "date");

-- CreateIndex
CREATE INDEX "Transaction_parentId_idx" ON "Transaction"("parentId");

-- CreateIndex
CREATE INDEX "Transaction_goalId_idx" ON "Transaction"("goalId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_id_userId_key" ON "Transaction"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_month_key" ON "Budget"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_id_userId_key" ON "Budget"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetCategory_budgetId_categoryId_key" ON "BudgetCategory"("budgetId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_id_userId_key" ON "Goal"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringRule_id_userId_key" ON "RecurringRule"("id", "userId");

-- CreateIndex
CREATE INDEX "ScheduledItem_userId_status_dueDate_idx" ON "ScheduledItem"("userId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledItem_recurringRuleId_dueDate_key" ON "ScheduledItem"("recurringRuleId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledItem_transactionId_userId_key" ON "ScheduledItem"("transactionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DismissedAlert_userId_key_key" ON "DismissedAlert"("userId", "key");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialConfiguration" ADD CONSTRAINT "FinancialConfiguration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_userId_fkey" FOREIGN KEY ("parentId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_transactionId_userId_fkey" FOREIGN KEY ("transactionId", "userId") REFERENCES "Transaction"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_tagId_userId_fkey" FOREIGN KEY ("tagId", "userId") REFERENCES "Tag"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toAccountId_userId_fkey" FOREIGN KEY ("toAccountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_creditCardId_userId_fkey" FOREIGN KEY ("creditCardId", "userId") REFERENCES "CreditCard"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_debtId_userId_fkey" FOREIGN KEY ("debtId", "userId") REFERENCES "Debt"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_goalId_userId_fkey" FOREIGN KEY ("goalId", "userId") REFERENCES "Goal"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_parentId_userId_fkey" FOREIGN KEY ("parentId", "userId") REFERENCES "Transaction"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_budgetId_userId_fkey" FOREIGN KEY ("budgetId", "userId") REFERENCES "Budget"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_creditCardId_userId_fkey" FOREIGN KEY ("creditCardId", "userId") REFERENCES "CreditCard"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_recurringRuleId_userId_fkey" FOREIGN KEY ("recurringRuleId", "userId") REFERENCES "RecurringRule"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_creditCardId_userId_fkey" FOREIGN KEY ("creditCardId", "userId") REFERENCES "CreditCard"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_transactionId_userId_fkey" FOREIGN KEY ("transactionId", "userId") REFERENCES "Transaction"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DismissedAlert" ADD CONSTRAINT "DismissedAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
