import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.User') AND name = N'otpCode'
    )
    BEGIN
      ALTER TABLE [dbo].[User] ADD
        otpCode      NVARCHAR(6)  NULL,
        otpExpiresAt DATETIME2    NULL;
      PRINT 'Columnas OTP agregadas exitosamente.';
    END
    ELSE
    BEGIN
      PRINT 'Las columnas OTP ya existen, omitiendo.';
    END
  `);
  console.log("✅ Columnas OTP en User: listo.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
