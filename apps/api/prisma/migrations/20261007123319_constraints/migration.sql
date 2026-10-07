ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_check"
  CHECK ("amount" > 0 AND "amount" <= 1000000000000);

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_shape_check" CHECK (
  CASE "type"
    WHEN 'INCOME' THEN "accountId" IS NOT NULL AND "categoryId" IS NOT NULL
      AND "toAccountId" IS NULL AND "creditCardId" IS NULL AND "debtId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'EXPENSE' THEN "accountId" IS NOT NULL AND "categoryId" IS NOT NULL
      AND "toAccountId" IS NULL AND "creditCardId" IS NULL AND "debtId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL
    WHEN 'TRANSFER' THEN "accountId" IS NOT NULL AND "toAccountId" IS NOT NULL
      AND "accountId" <> "toAccountId"
      AND "categoryId" IS NULL AND "creditCardId" IS NULL AND "debtId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'CARD_PURCHASE' THEN "creditCardId" IS NOT NULL AND "categoryId" IS NOT NULL
      AND "installments" BETWEEN 1 AND 48
      AND "accountId" IS NULL AND "toAccountId" IS NULL AND "debtId" IS NULL AND "goalId" IS NULL
      AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'CARD_PAYMENT' THEN "creditCardId" IS NOT NULL AND "accountId" IS NOT NULL
      AND "toAccountId" IS NULL AND "debtId" IS NULL AND "categoryId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'DEBT_PAYMENT' THEN "debtId" IS NOT NULL AND "accountId" IS NOT NULL
      AND "toAccountId" IS NULL AND "creditCardId" IS NULL AND "categoryId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    WHEN 'DEBT_DISBURSEMENT' THEN "debtId" IS NOT NULL AND "accountId" IS NOT NULL
      AND "toAccountId" IS NULL AND "creditCardId" IS NULL AND "categoryId" IS NULL AND "goalId" IS NULL
      AND "installments" IS NULL AND "paymentMethod" IS NULL AND "parentId" IS NULL
    ELSE false
  END
);

ALTER TABLE "FinancialConfiguration" ADD CONSTRAINT "FinancialConfiguration_values_check" CHECK (
  "obligationsPct" BETWEEN 0 AND 100 AND "savingsPct" BETWEEN 0 AND 100
  AND "investmentPct" BETWEEN 0 AND 100 AND "leisurePct" BETWEEN 0 AND 100
  AND "otherPct" BETWEEN 0 AND 100
  AND "obligationsPct" + "savingsPct" + "investmentPct" + "leisurePct" + "otherPct" = 100
  AND ("monthlyIncomeEstimate" IS NULL OR "monthlyIncomeEstimate" > 0)
  AND "lowBalanceThreshold" >= 0
);

ALTER TABLE "Account" ADD CONSTRAINT "Account_values_check" CHECK (
  "initialBalance" BETWEEN -1000000000000 AND 1000000000000
  AND "color" ~ '^#[0-9a-fA-F]{6}$'
);

ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_values_check" CHECK (
  "creditLimit" > 0 AND "initialDebt" >= 0
  AND "initialDebtInstallments" BETWEEN 1 AND 48
  AND "statementDay" BETWEEN 1 AND 31 AND "paymentDueDay" BETWEEN 1 AND 31
);

ALTER TABLE "Debt" ADD CONSTRAINT "Debt_values_check" CHECK (
  "initialBalance" >= 0
  AND ("monthlyPayment" IS NULL OR "monthlyPayment" > 0)
  AND ("paymentDay" IS NULL OR "paymentDay" BETWEEN 1 AND 31)
);

ALTER TABLE "Category" ADD CONSTRAINT "Category_bucket_check" CHECK (
  ("kind" = 'EXPENSE' AND "bucket" IS NOT NULL) OR ("kind" = 'INCOME' AND "bucket" IS NULL)
);
ALTER TABLE "Category" ADD CONSTRAINT "Category_not_self_parent" CHECK (
  "parentId" IS NULL OR "parentId" <> "id"
);

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_values_check" CHECK (
  ("totalAmount" IS NULL OR "totalAmount" > 0) AND EXTRACT(DAY FROM "month") = 1
);
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_amount_check" CHECK ("amount" > 0);

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_values_check" CHECK (
  "targetAmount" > 0 AND "initialAmount" >= 0
);

ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_values_check" CHECK (
  "amount" > 0
  AND (("kind" = 'INCOME' AND "accountId" IS NOT NULL AND "creditCardId" IS NULL)
    OR ("kind" = 'EXPENSE' AND (("accountId" IS NULL) <> ("creditCardId" IS NULL))))
  AND (("frequency" = 'CUSTOM_DAYS') = ("intervalDays" IS NOT NULL))
  AND ("intervalDays" IS NULL OR "intervalDays" >= 1)
  AND ("day1" IS NULL OR "day1" BETWEEN 1 AND 31)
  AND ("day2" IS NULL OR "day2" BETWEEN 1 AND 31)
  AND ("endDate" IS NULL OR "endDate" >= "startDate")
);

ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_values_check" CHECK (
  "amount" > 0
  AND (("kind" = 'INCOME' AND "accountId" IS NOT NULL AND "creditCardId" IS NULL)
    OR ("kind" = 'EXPENSE' AND (("accountId" IS NULL) <> ("creditCardId" IS NULL))))
);
