-- Fase 2 (addendum §5 y §6.4)

-- Tema oscuro por defecto
ALTER TABLE "User" ALTER COLUMN "theme" SET DEFAULT 'DARK';
UPDATE "User" SET "theme" = 'DARK' WHERE "theme" = 'SYSTEM';

-- Desde cuándo genera ocurrencias la versión actual de cada regla
ALTER TABLE "RecurringRule" ADD COLUMN "activeFrom" DATE;
UPDATE "RecurringRule" SET "activeFrom" = "startDate";
ALTER TABLE "RecurringRule" ALTER COLUMN "activeFrom" SET NOT NULL;

-- Fecha que generó la regla (inmutable); dueDate pasa a ser editable
ALTER TABLE "ScheduledItem" ADD COLUMN "ruleDate" DATE;
UPDATE "ScheduledItem" SET "ruleDate" = "dueDate" WHERE "recurringRuleId" IS NOT NULL;
DROP INDEX "ScheduledItem_recurringRuleId_dueDate_key";
CREATE UNIQUE INDEX "ScheduledItem_recurringRuleId_ruleDate_key" ON "ScheduledItem"("recurringRuleId", "ruleDate");
ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_rule_date_check"
  CHECK (("recurringRuleId" IS NULL) = ("ruleDate" IS NULL));
