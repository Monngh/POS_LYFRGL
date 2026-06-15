import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    IF NOT EXISTS (
      SELECT * FROM sys.objects
      WHERE object_id = OBJECT_ID(N'[dbo].[ReportAuditLog]') AND type = N'U'
    )
    BEGIN
      CREATE TABLE [dbo].[ReportAuditLog] (
        [id]         INT IDENTITY(1,1)  NOT NULL,
        [userId]     INT                NOT NULL,
        [branchId]   INT                    NULL,
        [reportName] NVARCHAR(255)      NOT NULL,
        [reportType] NVARCHAR(100)      NOT NULL,
        [filters]    NVARCHAR(MAX)          NULL,
        [ipAddress]  NVARCHAR(45)           NULL,
        [createdAt]  DATETIME2          NOT NULL DEFAULT GETDATE(),
        CONSTRAINT [PK_ReportAuditLog] PRIMARY KEY ([id]),
        CONSTRAINT [FK_ReportAuditLog_userId]   FOREIGN KEY ([userId])   REFERENCES [dbo].[User]([id]),
        CONSTRAINT [FK_ReportAuditLog_branchId] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id])
      );
      PRINT 'Tabla ReportAuditLog creada exitosamente.';
    END
    ELSE
    BEGIN
      PRINT 'La tabla ReportAuditLog ya existe, omitiendo.';
    END
  `);
  console.log("✅ ReportAuditLog: listo.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
