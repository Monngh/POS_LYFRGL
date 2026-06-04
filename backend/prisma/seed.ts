/**
 * Seed idempotente — puede ejecutarse múltiples veces sin crear duplicados.
 *
 * Estrategia:
 *  - Branch      → upsert by name     (@unique)
 *  - User        → upsert by email    (@unique)
 *  - Customer    → upsert by phone    (findFirst + update)
 *  - Product     → upsert by sku      (@unique)
 *  - Inventory   → upsert by [productId, branchId] (@@unique)
 *  - PromotionType → upsert by name   (@unique)
 *  - Promotion   → findFirst + skip if exists (name no es unique)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed idempotente multisucursal LYFRGL...");

  // =========================================================================
  // 1. SUCURSALES — upsert by name
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
    console.log(`  ✅ Sucursal: ${branch.name} (ID: ${branch.id})`);
  }

  // =========================================================================
  // 2. USUARIOS — upsert by email
  // =========================================================================
  const defaultPasswordHash = await bcrypt.hash("FmbPassword#2026", 10);
  const adminPasswordHash   = await bcrypt.hash("AdminPassword#2026", 10);

  // Usuario de retrocompatibilidad (login rápido de demos)
  await prisma.user.upsert({
    where:  { email: "cajero@fmb.com" },
    update: {
      passwordHash: defaultPasswordHash,
      pinCode: await bcrypt.hash("1234", 10),
      name: "Juan Cajero (Acceso Rápido)",
      role: "CAJERO",
      active: true,
      branchId: branchesMap["Sucursal Centro LYFRGL"],
    },
    create: {
      email:        "cajero@fmb.com",
      passwordHash: defaultPasswordHash,
      pinCode:      await bcrypt.hash("1234", 10),
      name:         "Juan Cajero (Acceso Rápido)",
      role:         "CAJERO",
      active:       true,
      branchId:     branchesMap["Sucursal Centro LYFRGL"],
    },
  });
  console.log("  ✅ Usuario retrocompatibilidad: cajero@fmb.com");

  type UserSeed = {
    email:      string;
    name:       string;
    role:       string;
    password:   string;
    pin:        string | null;
    branchName: string;
  };

  const usersData: UserSeed[] = [
    // Centro
    { email: "admin@fmb.com",            name: "Administrador LYFRGL",    role: "ADMIN",   password: adminPasswordHash,   pin: "4321",   branchName: "Sucursal Centro LYFRGL" },
    { email: "juan.centro@fmb.com",      name: "Juan Cajero",             role: "CAJERO",  password: defaultPasswordHash, pin: "1234", branchName: "Sucursal Centro LYFRGL" },
    { email: "maria.centro@fmb.com",     name: "María Cajera",            role: "CAJERO",  password: defaultPasswordHash, pin: "5678", branchName: "Sucursal Centro LYFRGL" },
    // Norte
    { email: "gerente.norte@fmb.com",    name: "Gerente Sucursal Norte",  role: "GERENTE", password: defaultPasswordHash, pin: "4321",   branchName: "Sucursal Norte LYFRGL" },
    { email: "carlos.norte@fmb.com",     name: "Carlos Cajero",           role: "CAJERO",  password: defaultPasswordHash, pin: "9012", branchName: "Sucursal Norte LYFRGL" },
    { email: "sofia.norte@fmb.com",      name: "Sofía Cajera",            role: "CAJERO",  password: defaultPasswordHash, pin: "3456", branchName: "Sucursal Norte LYFRGL" },
    // Poniente
    { email: "gerente.poniente@fmb.com", name: "Gerente Sucursal Poniente", role: "GERENTE", password: defaultPasswordHash, pin: "4321",   branchName: "Sucursal Poniente LYFRGL" },
    { email: "ana.poniente@fmb.com",     name: "Ana Cajera",              role: "CAJERO",  password: defaultPasswordHash, pin: "7890", branchName: "Sucursal Poniente LYFRGL" },
    { email: "pedro.poniente@fmb.com",   name: "Pedro Cajero",            role: "CAJERO",  password: defaultPasswordHash, pin: "2345", branchName: "Sucursal Poniente LYFRGL" },
  ];

  for (const u of usersData) {
    const pinHash  = u.pin ? await bcrypt.hash(u.pin, 10) : null;
    const branchId = branchesMap[u.branchName];

    await prisma.user.upsert({
      where:  { email: u.email },
      update: { name: u.name, role: u.role, branchId, pinCode: pinHash, active: true },
      create: {
        email:        u.email,
        passwordHash: u.password,
        pinCode:      pinHash,
        name:         u.name,
        role:         u.role,
        active:       true,
        branchId,
      },
    });
    console.log(`  ✅ Usuario: ${u.email} (${u.role}) — ${u.branchName}`);
  }

  // =========================================================================
  // 2.1. IMPUESTOS (TaxType)
  // =========================================================================
  const taxTypesData = [
    { name: "IVA 16%", description: "Impuesto al Valor Agregado tasa general", rate: 0.1600 },
    { name: "IVA 0%", description: "Impuesto al Valor Agregado tasa cero", rate: 0.0000 },
    { name: "Exento", description: "Operaciones exentas de IVA", rate: 0.0000 },
    { name: "IEPS 8%", description: "Impuesto Especial sobre Producción y Servicios alimentos no básicos", rate: 0.0800 },
    { name: "IEPS 26.5%", description: "Impuesto Especial sobre Producción y Servicios bebidas alcohólicas de baja graduación", rate: 0.2650 },
    { name: "IEPS 53%", description: "Impuesto Especial sobre Producción y Servicios bebidas alcohólicas de alta graduación", rate: 0.5300 },
  ];

  const taxTypesMap: { [name: string]: number } = {};

  for (const t of taxTypesData) {
    const taxType = await prisma.taxType.upsert({
      where: { name: t.name },
      update: { rate: t.rate, description: t.description, active: true },
      create: { name: t.name, rate: t.rate, description: t.description, active: true },
    });
    taxTypesMap[t.name] = taxType.id;
    console.log(`  ✅ Tipo de Impuesto: ${taxType.name} (ID: ${taxType.id})`);
  }

  // =========================================================================
  // 3. CLIENTES — upsert por teléfono (no tiene @unique, usamos findFirst)
  // =========================================================================
  await prisma.customer.upsert({
    where:  { id: 1 },          // El Público General siempre es ID 1 en un sistema limpio
    update: {},
    create: {
      name:        "Público General",
      taxId:       "XAXX010101000",
      email:       "general@fmb.com",
      phone:       "0000000000",
      address:     "Público en General",
      creditLimit: 0,
      balance:     0,
      points:      0,
    },
  }).catch(async () => {
    // Fallback si el ID 1 ya tiene otro registro: buscar por nombre
    const existing = await prisma.customer.findFirst({ where: { name: "Público General" } });
    if (!existing) {
      await prisma.customer.create({
        data: { name: "Público General", taxId: "XAXX010101000", email: "general@fmb.com", phone: "0000000000", address: "Público en General", creditLimit: 0, balance: 0, points: 0 },
      });
    }
  });
  console.log("  ✅ Cliente: Público General");

  const testCustomers = [
    { name: "Juan Pérez",     phone: "5551234567", email: "juan.perez@email.com",   points: 150 },
    { name: "María Gómez",    phone: "7721003000", email: "maria.gomez@email.com",  points: 50  },
    { name: "Ana Martínez",   phone: "5559876543", email: "ana.martinez@email.com", points: 0   },
  ];

  for (const c of testCustomers) {
    const existing = await prisma.customer.findFirst({ where: { phone: c.phone } });
    if (!existing) {
      await prisma.customer.create({
        data: { name: c.name, phone: c.phone, email: c.email, taxId: "XAXX010101000", address: "Dirección de Prueba", creditLimit: 0, balance: 0, points: c.points },
      });
      console.log(`  ✅ Cliente nuevo: ${c.name}`);
    } else {
      await prisma.customer.update({ where: { id: existing.id }, data: { points: c.points } });
      console.log(`  ℹ️  Cliente actualizado: ${c.name} (puntos: ${c.points})`);
    }
  }

  // =========================================================================
  // 4. PRODUCTOS — upsert by sku + inventario upsert by [productId, branchId]
  // =========================================================================
  const productsData = [
    { sku: "PROD-001", barcode: "7501001100223", name: "Coca Cola Original 600ml",   description: "Bebida refrescante sabor original",              cost: 12.50, sell: 18.00 },
    { sku: "PROD-002", barcode: "7501031302833", name: "Papas Sabritas Sal 50g",      description: "Papas fritas con sal de mesa",                   cost: 11.00, sell: 17.00 },
    { sku: "PROD-003", barcode: "7501000122238", name: "Pan Blanco Bimbo Grande",     description: "Pan de caja clásico esponjoso",                  cost: 32.00, sell: 45.00 },
    { sku: "PROD-004", barcode: "7501055303496", name: "Galletas Chokis 90g",         description: "Galletas con chispas sabor chocolate",            cost: 14.00, sell: 21.00 },
    { sku: "PROD-005", barcode: "7501008023648", name: "Leche Entera Lala 1L",        description: "Leche pasteurizada adicionada con vitaminas",    cost: 18.50, sell: 26.00 },
    { sku: "PROD-006", barcode: "7501055310869", name: "Agua Purificada Ciel 1L",     description: "Agua de mesa purificada sin gas",                cost:  7.00, sell: 12.00 },
    { sku: "PROD-007", barcode: "7501008023655", name: "Té Helado Peach 500ml",        description: "Té helado sabor durazno",                        cost: 10.00, sell: 15.00 },
    { sku: "PROD-008", barcode: "7501008023662", name: "Agua Mineral Natural 500ml",   description: "Agua mineralizada de manantial",                 cost:  8.00, sell: 12.00 },
    { sku: "PROD-009", barcode: "7501008023679", name: "Néctar de Mango 1L",          description: "Jugo de néctar de mango natural",                cost: 15.00, sell: 22.00 },
    { sku: "PROD-010", barcode: "7501008023686", name: "Chocolate con Leche 100g",     description: "Barra de chocolate cremoso con leche",          cost: 20.00, sell: 30.00 },
  ];

  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where:  { sku: p.sku },
      update: { name: p.name, description: p.description, costPrice: p.cost, sellPrice: p.sell, active: true },
      create: { sku: p.sku, barcode: p.barcode, name: p.name, description: p.description, costPrice: p.cost, sellPrice: p.sell, active: true },
    });
    console.log(`  ✅ Producto: ${product.name}`);

    // Asociar impuestos a los productos de prueba del seed
    let productTaxesToLink: string[] = [];
    if (product.sku === "PROD-001" || product.sku === "PROD-002" || product.sku === "PROD-004" || product.sku === "PROD-010") {
      productTaxesToLink = ["IVA 16%", "IEPS 8%"];
    } else if (product.sku === "PROD-003" || product.sku === "PROD-005" || product.sku === "PROD-006") {
      productTaxesToLink = ["IVA 0%"];
    } else if (product.sku === "PROD-007") {
      productTaxesToLink = ["IVA 16%"];
    } else if (product.sku === "PROD-008") {
      productTaxesToLink = ["Exento"];
    } else if (product.sku === "PROD-009") {
      productTaxesToLink = ["IEPS 8%"];
    }

    for (const taxName of productTaxesToLink) {
      const taxTypeId = taxTypesMap[taxName];
      if (taxTypeId) {
        await prisma.productTax.upsert({
          where: { productId_taxTypeId: { productId: product.id, taxTypeId } },
          update: {},
          create: { productId: product.id, taxTypeId },
        });
      }
    }

    // Inventario: solo crea si no existe — no sobreescribe stock real
    for (const bName of Object.keys(branchesMap)) {
      const bId = branchesMap[bName];
      const existingInv = await prisma.inventory.findUnique({
        where: { productId_branchId: { productId: product.id, branchId: bId } },
      });

      if (!existingInv) {
        const stock = Math.floor(Math.random() * 80) + 20; // 20–100 piezas iniciales
        await prisma.inventory.create({
          data: { productId: product.id, branchId: bId, quantity: stock, minStock: 10, maxStock: 150 },
        });
        console.log(`     📦 Stock inicial ${stock} uds en ${bName}`);
      }
    }
  }

  // =========================================================================
  // 5. TIPOS DE PROMOCIÓN — upsert by name (@unique)
  // =========================================================================
  const promotionTypes = [
    { name: "Percentage",   description: "Descuento porcentual sobre el precio" },
    { name: "FixedAmount",  description: "Descuento de monto fijo sobre el precio" },
    { name: "BuyXPayY",     description: "Paga Y cantidad al llevar X cantidad (ej. 2x1)" },
    { name: "SpecialPrice", description: "Precio especial por volumen" },
  ];

  const promoTypesMap: { [name: string]: number } = {};

  for (const pt of promotionTypes) {
    const type = await prisma.promotionType.upsert({
      where:  { name: pt.name },
      update: { description: pt.description },
      create: { name: pt.name, description: pt.description },
    });
    promoTypesMap[pt.name] = type.id;
    console.log(`  ✅ Tipo Promoción: ${type.name}`);
  }

  // =========================================================================
  // 6. PROMOCIONES — findFirst by name, crear solo si no existe
  // =========================================================================
  const now       = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const endDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);

  const coke     = await prisma.product.findUnique({ where: { sku: "PROD-001" } });
  const sabritas = await prisma.product.findUnique({ where: { sku: "PROD-002" } });
  const bimbo    = await prisma.product.findUnique({ where: { sku: "PROD-003" } });

  type PromoSeed = {
    name: string;
    description: string;
    typeKey: string;
    product: { id: number } | null;
    extra: Record<string, unknown>;
  };

  const promoSeeds: PromoSeed[] = [
    { name: "Coca Cola 20% OFF",     description: "20% de descuento en Coca Cola 600ml",              typeKey: "Percentage",   product: coke,     extra: { value: 20.00 } },
    { name: "Sabritas 3x2",          description: "Lleva 3 bolsas de Sabritas y paga solo 2",          typeKey: "BuyXPayY",     product: sabritas, extra: { minQuantity: 3, payQuantity: 2 } },
    { name: "Bimbo Precio Especial", description: "Pan Blanco Bimbo a $38 c/u comprando 2 o más",      typeKey: "SpecialPrice", product: bimbo,    extra: { minQuantity: 2, specialPrice: 38.00 } },
  ];

  for (const ps of promoSeeds) {
    if (!ps.product) continue;
    const existing = await prisma.promotion.findFirst({ where: { name: ps.name } });
    if (!existing) {
      const promo = await prisma.promotion.create({
        data: {
          name:            ps.name,
          description:     ps.description,
          promotionTypeId: promoTypesMap[ps.typeKey],
          startDate,
          endDate,
          isActive:        true,
          ...ps.extra,
        },
      });
      await prisma.promotionProduct.create({
        data: { promotionId: promo.id, productId: ps.product.id },
      });
      console.log(`  ✅ Promoción creada: ${promo.name}`);
    } else {
      console.log(`  ℹ️  Promoción ya existe: ${ps.name}`);
    }
  }

  // Mapear IVA 16% a todos los productos existentes que no tengan impuestos asignados
  const allProducts = await prisma.product.findMany({
    include: { productTaxes: true }
  });
  const defaultTaxId = taxTypesMap["IVA 16%"];
  if (defaultTaxId) {
    for (const p of allProducts) {
      if (p.productTaxes.length === 0) {
        await prisma.productTax.create({
          data: { productId: p.id, taxTypeId: defaultTaxId }
        });
        console.log(`  ✅ IVA 16% asignado por defecto al producto existente: ${p.name}`);
      }
    }
  }

  console.log("\n🌱 Seed completado exitosamente. ¡La base de datos está lista!");
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
