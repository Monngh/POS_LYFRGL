/**
 * Script de migración: fusiona sucursales FMB en sus equivalentes LYFRGL
 *
 * Mapeo:
 *   ID 5 (Sucursal Centro FMB)    → ID 1 (Sucursal Centro LYFRGL)
 *   ID 6 (Sucursal Norte FMB)     → ID 2 (Sucursal Norte LYFRGL)
 *   ID 7 (Sucursal Poniente FMB)  → ID 3 (Sucursal Poniente LYFRGL)
 *
 * Acciones:
 *   1. Reasignar usuarios de FMB a LYFRGL
 *   2. Eliminar sucursales FMB vacías
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BRANCH_MAP: { from: number; to: number; label: string }[] = [
  { from: 5, to: 1, label: "Centro" },
  { from: 6, to: 2, label: "Norte" },
  { from: 7, to: 3, label: "Poniente" },
];

async function main() {
  console.log("🔄 Iniciando fusión de sucursales FMB → LYFRGL...\n");

  for (const mapping of BRANCH_MAP) {
    console.log(`\n📌 Sucursal ${mapping.label}: ID ${mapping.from} (FMB) → ID ${mapping.to} (LYFRGL)`);

    // 1. Reasignar usuarios
    const usersUpdated = await prisma.user.updateMany({
      where: { branchId: mapping.from },
      data:  { branchId: mapping.to },
    });
    console.log(`   ✅ Usuarios reasignados: ${usersUpdated.count}`);

    // 2. Reasignar ventas (por si hubiera alguna)
    const salesUpdated = await prisma.sale.updateMany({
      where: { branchId: mapping.from },
      data:  { branchId: mapping.to },
    });
    console.log(`   ✅ Ventas reasignadas: ${salesUpdated.count}`);

    // 3. Reasignar sesiones de caja
    const sessionsUpdated = await prisma.cashSession.updateMany({
      where: { branchId: mapping.from },
      data:  { branchId: mapping.to },
    });
    console.log(`   ✅ Sesiones reasignadas: ${sessionsUpdated.count}`);

    // 4. Reasignar kardex
    const kardexUpdated = await prisma.kardex.updateMany({
      where: { branchId: mapping.from },
      data:  { branchId: mapping.to },
    });
    console.log(`   ✅ Kardex reasignado: ${kardexUpdated.count}`);

    // 5. Reasignar/fusionar inventario (unique constraint: productId + branchId)
    const fmbInventory = await prisma.inventory.findMany({ where: { branchId: mapping.from } });
    let invMoved = 0;
    let invMerged = 0;
    for (const item of fmbInventory) {
      const existing = await prisma.inventory.findUnique({
        where: { productId_branchId: { productId: item.productId, branchId: mapping.to } },
      });
      if (existing) {
        // Sumar las cantidades al registro existente de la sucursal destino
        await prisma.inventory.update({
          where: { productId_branchId: { productId: item.productId, branchId: mapping.to } },
          data: { quantity: existing.quantity + item.quantity },
        });
        // Eliminar el registro del origen (ya fusionado)
        await prisma.inventory.delete({
          where: { productId_branchId: { productId: item.productId, branchId: mapping.from } },
        });
        invMerged++;
      } else {
        // No hay conflicto: solo reasignar
        await prisma.inventory.update({
          where: { productId_branchId: { productId: item.productId, branchId: mapping.from } },
          data: { branchId: mapping.to },
        });
        invMoved++;
      }
    }
    console.log(`   ✅ Inventario reasignado: ${invMoved} movidos, ${invMerged} fusionados`);

    // 6. Reasignar depósitos bancarios
    const depositsUpdated = await prisma.bankDeposit.updateMany({
      where: { branchId: mapping.from },
      data:  { branchId: mapping.to },
    });
    console.log(`   ✅ Depósitos bancarios reasignados: ${depositsUpdated.count}`);

    // 7. Eliminar la sucursal FMB (ahora vacía)
    await prisma.branch.delete({ where: { id: mapping.from } });
    console.log(`   🗑️  Sucursal ID ${mapping.from} eliminada`);
  }

  // Verificación final
  console.log("\n📊 Estado final de sucursales:");
  const branches = await prisma.branch.findMany({ orderBy: { id: "asc" } });
  for (const b of branches) {
    const users    = await prisma.user.count({ where: { branchId: b.id } });
    const sales    = await prisma.sale.count({ where: { branchId: b.id } });
    const sessions = await prisma.cashSession.count({ where: { branchId: b.id } });
    console.log(`  ID:${b.id} | ${b.name} | users:${users} | sales:${sales} | sessions:${sessions}`);
  }

  await prisma.$disconnect();
  console.log("\n✅ Migración completada.");
}

main().catch((e) => {
  console.error("❌ Error durante la migración:", e);
  prisma.$disconnect();
  process.exit(1);
});
