-- Agregar nuevas columnas a la tabla Sale
ALTER TABLE dbo.Sale
ADD mercadoPagoPaymentId NVARCHAR(255) NULL,
    mercadoPagoReference NVARCHAR(255) NULL,
    mercadoPagoStatus NVARCHAR(255) NULL,
    mercadoPagoQrData NVARCHAR(MAX) NULL;

-- Agregar nuevas columnas a la tabla BankDeposit
ALTER TABLE dbo.BankDeposit
ADD reference NVARCHAR(255) NULL,
    status NVARCHAR(255) DEFAULT 'PENDING' NOT NULL,
    mercadoPagoPaymentId NVARCHAR(255) NULL,
    mercadoPagoStatus NVARCHAR(255) NULL,
    ticketUrl NVARCHAR(MAX) NULL;

-- Actualizar registros existentes en BankDeposit con estado PENDING para cumplir con constraint de NOT NULL y Default
UPDATE dbo.BankDeposit
SET status = 'COMPLETED'
WHERE status IS NULL OR status = 'PENDING';
