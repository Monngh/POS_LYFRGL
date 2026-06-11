import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creando tabla CashCut si no existe...");
  try {
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CashCut' and xtype='U')
      BEGIN
          CREATE TABLE CashCut (
              id INT IDENTITY(1,1) PRIMARY KEY,
              cashSessionId INT NOT NULL,
              createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
              totalSales DECIMAL(18,2) NOT NULL,
              totalCash DECIMAL(18,2) NOT NULL,
              totalCreditCard DECIMAL(18,2) NOT NULL,
              totalDebitCard DECIMAL(18,2) NOT NULL,
              totalRefunds DECIMAL(18,2) NOT NULL,
              netTotal DECIMAL(18,2) NOT NULL,
              cutNumber INT NOT NULL,
              CONSTRAINT FK_CashCut_CashSession FOREIGN KEY (cashSessionId) REFERENCES CashSession(id) ON DELETE NO ACTION ON UPDATE NO ACTION
          );
      END
    `);
    console.log("Script ejecutado exitosamente.");
  } catch (error) {
    console.error("Error al ejecutar el script de creación de tabla:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
