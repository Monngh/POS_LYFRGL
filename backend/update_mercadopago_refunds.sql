-- Script para agregar soporte de Reembolsos de Mercado Pago en SQL Server
-- Ejecutar en SQL Server Management Studio (SSMS) o Azure Data Studio

ALTER TABLE [dbo].[Sale]
ADD 
    [refundStatus] NVARCHAR(1000) NULL,
    [refundId] NVARCHAR(1000) NULL,
    [refundDate] DATETIME2 NULL,
    [refundAmount] DECIMAL(18, 2) NULL;
GO

PRINT 'Campos de reembolsos agregados exitosamente a la tabla Sale.';
