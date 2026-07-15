import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.SupplierProduct') AND name = N'isPrimary'
    )
    BEGIN
      ALTER TABLE [dbo].[SupplierProduct] ADD
        isPrimary BIT NOT NULL
        CONSTRAINT DF_SupplierProduct_isPrimary DEFAULT 0;
      PRINT 'Columna isPrimary agregada a SupplierProduct.';
    END
    ELSE
    BEGIN
      PRINT 'La columna isPrimary ya existe, omitiendo.';
    END

    ;WITH RankedSupplierProducts AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY productId
          ORDER BY CASE WHEN isPrimary = 1 THEN 0 ELSE 1 END, id ASC
        ) AS rn
      FROM [dbo].[SupplierProduct]
    )
    UPDATE sp
    SET isPrimary = CASE WHEN ranked.rn = 1 THEN 1 ELSE 0 END
    FROM [dbo].[SupplierProduct] sp
    INNER JOIN RankedSupplierProducts ranked ON ranked.id = sp.id;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.SupplierProduct')
        AND name = N'IX_SupplierProduct_productId_isPrimary'
    )
    BEGIN
      CREATE INDEX IX_SupplierProduct_productId_isPrimary
      ON [dbo].[SupplierProduct] (productId, isPrimary);
      PRINT 'Indice IX_SupplierProduct_productId_isPrimary creado.';
    END

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.SupplierProduct')
        AND name = N'UX_SupplierProduct_productId_primary'
    )
    BEGIN
      CREATE UNIQUE INDEX UX_SupplierProduct_productId_primary
      ON [dbo].[SupplierProduct] (productId)
      WHERE isPrimary = 1;
      PRINT 'Indice unico filtrado UX_SupplierProduct_productId_primary creado.';
    END
  `);

  console.log("SupplierProduct.isPrimary listo.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
