-- 1. Add columns as nullable first
ALTER TABLE [dbo].[BankDeposit] ADD [userId] INT NULL;
ALTER TABLE [dbo].[BankDeposit] ADD [confirmedAt] DATETIME2(3) NULL;
ALTER TABLE [dbo].[BankDeposit] ADD [cancelledAt] DATETIME2(3) NULL;
ALTER TABLE [dbo].[BankDeposit] ADD [cancelReason] NVARCHAR(MAX) NULL;

-- 2. Populate userId from CashSession if there are existing deposits
UPDATE bd
SET bd.[userId] = cs.[userId]
FROM [dbo].[BankDeposit] bd
INNER JOIN [dbo].[CashSession] cs ON bd.[cashSessionId] = cs.[id];

-- 3. In case any deposit has no matching CashSession or is still null, set fallback to the first user
UPDATE [dbo].[BankDeposit]
SET [userId] = (SELECT TOP 1 [id] FROM [dbo].[User])
WHERE [userId] IS NULL;

-- 4. Alter column to be NOT NULL
ALTER TABLE [dbo].[BankDeposit] ALTER COLUMN [userId] INT NOT NULL;

-- 5. Add foreign key constraint
ALTER TABLE [dbo].[BankDeposit] ADD CONSTRAINT [BankDeposit_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
