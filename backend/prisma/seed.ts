/**
 * Seed Masivo e Idempotente para Panel de Administrador
 * 
 * Genera: 5 Proveedores, 50 Productos, Compras históricas, 
 * y un ciclo de 14 días de operación con ventas, sesiones y cortes.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed masivo multisucursal LYFRGL...");

  // =========================================================================
  // 1. SUCURSALES
  // =========================================================================
  const branchesData = [
    { name: "Sucursal Centro LYFRGL",   address: "Av. Principal #100, Col. Centro, LYFRGL City",         phone: "555-0199" },
    { name: "Sucursal Norte LYFRGL",    address: "Blvd. Colosio #405, Plaza Norte, LYFRGL City",          phone: "555-0211" },
    { name: "Sucursal Poniente LYFRGL", address: "Av. Ruiz Cortines #89, Plaza Poniente, LYFRGL City",    phone: "555-0233" },
  ];
  const branchesMap: { [name: string]: number } = {};
  for (const b of branchesData) {
    const branch = await prisma.branch.upsert({
      where:  { name: b.name },
      update: { address: b.address, phone: b.phone, active: true },
      create: { name: b.name, address: b.address, phone: b.phone, active: true },
    });
    branchesMap[b.name] = branch.id;
  }
  console.log("  ✅ Sucursales verificadas.");

  // =========================================================================
  // 2. USUARIOS
  // =========================================================================
  const defaultPasswordHash = await bcrypt.hash("FmbPassword#2026", 10);
  const adminPasswordHash   = await bcrypt.hash("AdminPassword#2026", 10);
  const defaultPin = await bcrypt.hash("1234", 10);

  const usersData = [
    { email: "cajero@fmb.com",           name: "Juan Cajero (Acceso Rápido)", role: "CAJERO",  password: defaultPasswordHash, pin: defaultPin, branchName: "Sucursal Centro LYFRGL" },
    { email: "admin@fmb.com",            name: "Administrador LYFRGL",        role: "ADMIN",   password: adminPasswordHash,   pin: await bcrypt.hash("4321",10),   branchName: "Sucursal Centro LYFRGL" },
    { email: "juan.centro@fmb.com",      name: "Juan Cajero",                 role: "CAJERO",  password: defaultPasswordHash, pin: defaultPin, branchName: "Sucursal Centro LYFRGL" },
    { email: "gerente.norte@fmb.com",    name: "Gerente Sucursal Norte",      role: "GERENTE", password: defaultPasswordHash, pin: await bcrypt.hash("4321",10),   branchName: "Sucursal Norte LYFRGL" },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where:  { email: u.email },
      update: { name: u.name, role: u.role, branchId: branchesMap[u.branchName], pinCode: u.pin, active: true },
      create: { email: u.email, passwordHash: u.password, pinCode: u.pin, name: u.name, role: u.role, active: true, branchId: branchesMap[u.branchName] },
    });
  }
  console.log("  ✅ Usuarios verificados.");

  // =========================================================================
  // 3. IMPUESTOS
  // =========================================================================
  const taxTypesData = [
    { name: "IVA 16%", description: "IVA general", rate: 0.1600 },
    { name: "IVA 0%", description: "IVA cero", rate: 0.0000 },
    { name: "Exento", description: "Operaciones exentas", rate: 0.0000 },
    { name: "IEPS 8%", description: "IEPS alimentos", rate: 0.0800 },
  ];
  const taxTypesMap: { [name: string]: number } = {};
  for (const t of taxTypesData) {
    const taxType = await prisma.taxType.upsert({
      where: { name: t.name },
      update: { rate: t.rate, description: t.description },
      create: { name: t.name, rate: t.rate, description: t.description },
    });
    taxTypesMap[t.name] = taxType.id;
  }

  // =========================================================================
  // 4. CLIENTES
  // =========================================================================
  const testCustomers = [
    { id: 1, name: "Público General", phone: "0000000000", email: "general@fmb.com", taxId: "XAXX010101000", points: 0 },
    { id: 2, name: "Empresa Facturable SA de CV", phone: "5551234567", email: "facturas@empresa.com", taxId: "EMP900101XYZ", points: 2500, taxRegime: "601", cfdiUse: "G03", zipCode: "06000" },
    { id: 3, name: "María Gómez", phone: "7721003000", email: "maria.gomez@email.com", taxId: "XAXX010101000", points: 450 },
    { id: 4, name: "Juan Pérez Frecuente", phone: "5559876543", email: "juan.frecuente@email.com", taxId: "XAXX010101000", points: 1200 },
  ];
  for (const c of testCustomers) {
    await prisma.customer.upsert({
      where: { id: c.id },
      update: { name: c.name, points: c.points },
      create: { id: c.id, name: c.name, phone: c.phone, email: c.email, taxId: c.taxId, points: c.points, taxRegime: c.taxRegime || null, cfdiUse: c.cfdiUse || null, zipCode: c.zipCode || null },
    });
  }
  console.log("  ✅ Clientes verificados.");

  // =========================================================================
  // 5. PROVEEDORES
  // =========================================================================
  const suppliersData = [
    { name: "Coca-Cola FEMSA", rfc: "KOF9304084F2", contactName: "Rep. Bebidas" },
    { name: "Grupo Bimbo", rfc: "BIM0111082RA", contactName: "Rep. Panificados" },
    { name: "Pepsico de México", rfc: "PEP92051283M", contactName: "Rep. Botanas" },
    { name: "Distribuidora de Abarrotes SA", rfc: "DAS090909999", contactName: "Rep. General" },
    { name: "Farmacéutica Local", rfc: "FAR111111AAA", contactName: "Rep. Cuidado" },
  ];
  const suppliersMap: { [name: string]: number } = {};
  for (const s of suppliersData) {
    const supplier = await prisma.supplier.upsert({
      where: { name: s.name },
      update: { rfc: s.rfc, contactName: s.contactName },
      create: { name: s.name, rfc: s.rfc, contactName: s.contactName, active: true },
    });
    suppliersMap[s.name] = supplier.id;
  }
  console.log("  ✅ Proveedores reales creados.");

  // =========================================================================
  // 6. PRODUCTOS (50 MASIVOS) Y ASIGNACIÓN
  // =========================================================================
  // Para no saturar el archivo de código manual, generamos un array de 50 productos realistas
  const categories = [
    { prefix: "BEB", supplier: "Coca-Cola FEMSA", tax: "IVA 16%", ieps: "IEPS 8%", items: ["Refresco Cola 600ml", "Agua Purificada 1L", "Jugo Manzana 500ml", "Té Helado Peach 500ml", "Bebida Energética 250ml", "Agua Mineral 600ml", "Refresco Lima-Limón 2L", "Jugo Naranja 1L", "Bebida Isotónica 500ml", "Limonada Natural 600ml"] },
    { prefix: "PAN", supplier: "Grupo Bimbo", tax: "IVA 0%", ieps: null, items: ["Pan Blanco Grande", "Pan Integral", "Medias Noches (8 pzas)", "Pan Molido 250g", "Pan Dulce Conchas (4 pzas)", "Mantecadas (6 pzas)", "Donas Azucaradas (4 pzas)", "Pan Tostado Clásico", "Roles de Canela (2 pzas)", "Bimbuñuelos"] },
    { prefix: "BOT", supplier: "Pepsico de México", tax: "IVA 16%", ieps: "IEPS 8%", items: ["Papas Sal 50g", "Papas Queso 50g", "Nachos Queso 60g", "Cacahuates Japoneses 100g", "Churritos Maíz 60g", "Frituras Chile y Limón 65g", "Mix Botanas 150g", "Papas Fuego 50g", "Galletas Saladas 100g", "Semillas de Girasol 70g"] },
    { prefix: "ABA", supplier: "Distribuidora de Abarrotes SA", tax: "IVA 0%", ieps: null, items: ["Frijol Negro 1kg", "Arroz Super Extra 1kg", "Aceite Vegetal 900ml", "Azúcar Estándar 1kg", "Sal de Mesa 1kg", "Atún en Agua 140g", "Mayonesa Clásica 390g", "Cereal Maíz 500g", "Salsa Catsup 320g", "Leche Entera 1L"] },
    { prefix: "LIM", supplier: "Farmacéutica Local", tax: "IVA 16%", ieps: null, items: ["Detergente Polvo 1kg", "Jabón Lavandería 400g", "Cloro 1L", "Limpiador Multiusos 1L", "Papel Higiénico 4 Rollos", "Servilletas 100 pzas", "Pasta Dental 100ml", "Jabón Corporal 150g", "Shampoo Clásico 400ml", "Desodorante Roll-on 50ml"] }
  ];

  const allProducts = [];
  let skuCounter = 1;

  for (const cat of categories) {
    for (let i = 0; i < cat.items.length; i++) {
      const pName = cat.items[i];
      const cost = Math.floor(Math.random() * 30) + 5; // Costo entre 5 y 35
      const sell = Math.ceil(cost * 1.4); // 40% de margen
      
      const product = await prisma.product.upsert({
        where: { sku: `${cat.prefix}-${i+1}` },
        update: { costPrice: cost, sellPrice: sell },
        create: {
          sku: `${cat.prefix}-${i+1}`,
          barcode: `7500${skuCounter.toString().padStart(5, '0')}`,
          name: pName,
          costPrice: cost,
          sellPrice: sell,
          active: true
        }
      });
      allProducts.push(product);
      skuCounter++;

      // Impuestos
      await prisma.productTax.upsert({
        where: { productId_taxTypeId: { productId: product.id, taxTypeId: taxTypesMap[cat.tax] } },
        update: {}, create: { productId: product.id, taxTypeId: taxTypesMap[cat.tax] }
      });
      if (cat.ieps) {
        await prisma.productTax.upsert({
          where: { productId_taxTypeId: { productId: product.id, taxTypeId: taxTypesMap[cat.ieps] } },
          update: {}, create: { productId: product.id, taxTypeId: taxTypesMap[cat.ieps] }
        });
      }

      // Proveedor
      await prisma.supplierProduct.upsert({
        where: { supplierId_productId: { supplierId: suppliersMap[cat.supplier], productId: product.id } },
        update: {}, create: { supplierId: suppliersMap[cat.supplier], productId: product.id }
      });

      // Inventario
      for (const bName of Object.keys(branchesMap)) {
        const bId = branchesMap[bName];
        const stock = Math.floor(Math.random() * 150) + 20; // Stock inicial robusto
        await prisma.inventory.upsert({
          where: { productId_branchId: { productId: product.id, branchId: bId } },
          update: { quantity: stock },
          create: { productId: product.id, branchId: bId, quantity: stock, minStock: 15, maxStock: 200 }
        });
      }
    }
  }
  console.log("  ✅ 50 Productos creados y vinculados a proveedores e impuestos.");

  // =========================================================================
  // 7. SIMULACIÓN HISTÓRICA DE COMPRAS Y VENTAS (14 DÍAS)
  // =========================================================================
  console.log("  Generando 14 días de historial operativo masivo...");
  const adminId = (await prisma.user.findFirst({ where: { role: "ADMIN" } }))!.id;
  const cashierId = (await prisma.user.findFirst({ where: { role: "CAJERO" } }))!.id;
  const mainBranchId = branchesMap["Sucursal Centro LYFRGL"];

  // Generar 3 Órdenes de compra históricas aleatorias
  for(let i = 0; i < 3; i++) {
    const poDate = new Date();
    poDate.setDate(poDate.getDate() - (10 - i*3));
    const suppName = Object.keys(suppliersMap)[i % 5];
    
    await prisma.purchaseOrder.create({
      data: {
        supplierId: suppliersMap[suppName],
        branchId: mainBranchId,
        reference: `PO-HIST-${1000+i}`,
        purchaseDate: poDate,
        subtotal: 1500, tax: 240, total: 1740,
        status: "RECIBIDA",
        createdBy: adminId,
        receivedBy: adminId,
        receivedDate: poDate,
        createdAt: poDate,
        details: {
          create: [
            { productId: allProducts[0].id, quantity: 50, unitCost: allProducts[0].costPrice, subtotal: 50 * Number(allProducts[0].costPrice) }
          ]
        }
      }
    });
  }

  // Bucle de 14 días para ventas y sesiones de caja
  let globalInvoiceCounter = 1;
  let returnCounter = 1;

  for (let d = 14; d >= 1; d--) {
    const simDate = new Date();
    simDate.setDate(simDate.getDate() - d);
    
    // Abre sesión a las 8 AM
    const openedAt = new Date(simDate);
    openedAt.setHours(8, 0, 0, 0);
    // Cierra sesión a las 6 PM
    const closedAt = new Date(simDate);
    closedAt.setHours(18, 0, 0, 0);

    const numSales = Math.floor(Math.random() * 15) + 5; // Entre 5 y 20 ventas por día
    let totalCashInSession = 0;
    let totalSalesSession = 0;
    let totalCardsSession = 0;

    // Crear la sesión
    const session = await prisma.cashSession.create({
      data: {
        branchId: mainBranchId,
        userId: cashierId,
        openedAt,
        initialAmount: 500, // Fondo fijo
        expectedAmount: 500, // Se actualizará al final
        status: "ABIERTA"
      }
    });

    for(let s = 0; s < numSales; s++) {
      const saleDate = new Date(openedAt);
      saleDate.setMinutes(saleDate.getMinutes() + (s * 30)); // Espaciadas por media hora

      // Escoger cliente (80% público general, 20% factura)
      const isFacturable = Math.random() > 0.8;
      const custId = isFacturable ? 2 : 1;
      
      // Productos comprados (1 a 5 items)
      const numItems = Math.floor(Math.random() * 5) + 1;
      let saleSubtotal = 0;
      let saleTax = 0;
      const details = [];

      for(let i = 0; i < numItems; i++) {
        const randProd = allProducts[Math.floor(Math.random() * allProducts.length)];
        const qty = Math.floor(Math.random() * 3) + 1;
        const lineTotal = Number(randProd.sellPrice) * qty;
        saleSubtotal += lineTotal;
        // Asumiendo un tax plano por simplificar el seed masivo:
        const tAmnt = lineTotal * 0.16;
        saleTax += tAmnt;

        details.push({
          productId: randProd.id,
          quantity: qty,
          unitPrice: randProd.sellPrice,
          costPrice: randProd.costPrice,
          taxAmount: tAmnt
        });
      }

      const isCard = Math.random() > 0.7;
      const paymentMethod = isCard ? "TARJETA" : "EFECTIVO";
      if (!isCard) totalCashInSession += (saleSubtotal + saleTax);
      else totalCardsSession += (saleSubtotal + saleTax);
      
      totalSalesSession += (saleSubtotal + saleTax);

      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: `V-${simDate.getFullYear()}${(simDate.getMonth()+1).toString().padStart(2,'0')}${simDate.getDate().toString().padStart(2,'0')}-${s+1}`,
          branchId: mainBranchId,
          userId: cashierId,
          customerId: custId,
          cashSessionId: session.id,
          totalAmount: saleSubtotal + saleTax,
          taxAmount: saleTax,
          paymentMethod,
          cashReceived: !isCard ? (saleSubtotal + saleTax + 20) : null,
          changeGiven: !isCard ? 20 : null,
          status: "COMPLETADA",
          cfdiUuid: isFacturable ? `HISTORIAL-CFDI-UUID-${globalInvoiceCounter++}` : null,
          createdAt: saleDate,
          updatedAt: saleDate,
          saleDetails: { create: details }
        }
      });

      // Aleatoriamente crear una devolución (5% de las ventas)
      if (Math.random() > 0.95 && !isCard) {
        await prisma.return.create({
          data: {
            returnNumber: `DEV-HIST-${returnCounter++}`,
            saleId: sale.id,
            userId: cashierId, authorizedById: adminId,
            reason: "Garantía/Defecto histórico",
            type: "TOTAL",
            totalRefunded: saleSubtotal + saleTax,
            paymentMethod: "EFECTIVO",
            cashSessionId: session.id,
            createdAt: saleDate, updatedAt: saleDate
          }
        });
        totalCashInSession -= (saleSubtotal + saleTax);
      }
    }

    // Cerrar sesión
    await prisma.cashSession.update({
      where: { id: session.id },
      data: {
        status: "CERRADA",
        closedAt,
        expectedAmount: 500 + totalCashInSession,
        declaredAmount: 500 + totalCashInSession,
        difference: 0
      }
    });

    // Corte de caja y depósito bancario
    await prisma.cashCut.create({
      data: {
        cashSessionId: session.id,
        cutNumber: 1,
        totalSales: totalSalesSession,
        totalCash: totalCashInSession,
        totalCreditCard: totalCardsSession,
        totalDebitCard: 0,
        totalRefunds: 0,
        netTotal: totalSalesSession,
        createdAt: closedAt
      }
    });

    if (totalCashInSession > 0) {
      await prisma.bankDeposit.create({
        data: {
          cashSessionId: session.id,
          userId: adminId, branchId: mainBranchId,
          accountNumber: "1234567890",
          targetName: "Banamex Concentradora",
          amount: totalCashInSession,
          paymentType: "EFECTIVO",
          status: "CONFIRMED",
          confirmedAt: closedAt,
          createdAt: closedAt
        }
      });
    }
    console.log(`  📅 Día -${d} simulado: ${numSales} ventas generadas.`);
  }

  console.log("\n🌱 Seed MASIVO completado exitosamente. ¡La base de datos está lista para asombrar!");
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
