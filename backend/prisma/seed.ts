import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando la siembra enriquecida de base de datos multisucursal...");

  // =========================================================================
  // 1. SUCURSALES (Multi-branch)
  // =========================================================================
  const branchesData = [
    { name: "Sucursal Centro FMB", address: "Av. Principal #100, Col. Centro, FMB City", phone: "555-0199" },
    { name: "Sucursal Norte FMB", address: "Blvd. Colosio #405, Plaza Norte, FMB City", phone: "555-0211" },
    { name: "Sucursal Poniente FMB", address: "Av. Ruiz Cortines #89, Plaza Poniente, FMB City", phone: "555-0233" }
  ];

  const branchesMap: { [key: string]: number } = {};

  for (const b of branchesData) {
    let branch = await prisma.branch.findFirst({
      where: { name: b.name },
    });

    if (!branch) {
      branch = await prisma.branch.create({
        data: {
          name: b.name,
          address: b.address,
          phone: b.phone,
          active: true,
        },
      });
      console.log(`✅ Sucursal creada: ${branch.name}`);
    } else {
      console.log(`ℹ️ Sucursal "${branch.name}" ya existe.`);
    }
    branchesMap[b.name] = branch.id;
  }

  // =========================================================================
  // 2. USUARIOS (Administradores, Gerentes y Múltiples Cajeros)
  // =========================================================================
  const defaultPasswordHash = await bcrypt.hash("FmbPassword#2026", 10);
  const adminPasswordHash = await bcrypt.hash("AdminPassword#2026", 10);

  // Definición de usuarios con roles y sucursales
  const usersData = [
    // Centro
    { email: "admin@fmb.com", name: "Administrador FMB", role: "ADMIN", password: adminPasswordHash, pin: null, branchName: "Sucursal Centro FMB" },
    { email: "juan.centro@fmb.com", name: "Juan Cajero", role: "CAJERO", password: defaultPasswordHash, pin: "1234", branchName: "Sucursal Centro FMB" },
    { email: "maria.centro@fmb.com", name: "María Cajera", role: "CAJERO", password: defaultPasswordHash, pin: "5678", branchName: "Sucursal Centro FMB" },
    
    // Norte
    { email: "gerente.norte@fmb.com", name: "Gerente Sucursal Norte", role: "GERENTE", password: defaultPasswordHash, pin: null, branchName: "Sucursal Norte FMB" },
    { email: "carlos.norte@fmb.com", name: "Carlos Cajero", role: "CAJERO", password: defaultPasswordHash, pin: "9012", branchName: "Sucursal Norte FMB" },
    { email: "sofia.norte@fmb.com", name: "Sofía Cajera", role: "CAJERO", password: defaultPasswordHash, pin: "3456", branchName: "Sucursal Norte FMB" },

    // Poniente
    { email: "gerente.poniente@fmb.com", name: "Gerente Sucursal Poniente", role: "GERENTE", password: defaultPasswordHash, pin: null, branchName: "Sucursal Poniente FMB" },
    { email: "ana.poniente@fmb.com", name: "Ana Cajera", role: "CAJERO", password: defaultPasswordHash, pin: "7890", branchName: "Sucursal Poniente FMB" },
    { email: "pedro.poniente@fmb.com", name: "Pedro Cajero", role: "CAJERO", password: defaultPasswordHash, pin: "2345", branchName: "Sucursal Poniente FMB" }
  ];

  // Mantener compatibilidad con el correo genérico "cajero@fmb.com" para que siga sirviendo el login por defecto
  const existingCajero = await prisma.user.findUnique({ where: { email: "cajero@fmb.com" } });
  if (existingCajero) {
    await prisma.user.delete({ where: { email: "cajero@fmb.com" } });
  }

  for (const u of usersData) {
    let user = await prisma.user.findUnique({
      where: { email: u.email },
    });

    const pinHash = u.pin ? await bcrypt.hash(u.pin, 10) : null;
    const branchId = branchesMap[u.branchName];

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: u.email,
          passwordHash: u.password,
          pinCode: pinHash,
          name: u.name,
          role: u.role,
          active: true,
          branchId: branchId,
        },
      });
      console.log(`✅ Usuario creado: ${user.email} (${user.role}) - ${u.branchName} ${u.pin ? `[PIN: ${u.pin}]` : ""}`);
    } else {
      // Si ya existe, actualizamos su sucursal y PIN por consistencia
      user = await prisma.user.update({
        where: { email: u.email },
        data: {
          branchId: branchId,
          pinCode: pinHash,
        }
      });
      console.log(`ℹ️ Usuario "${user.email}" actualizado.`);
    }
  }

  // Re-crear cajero@fmb.com apuntando a Juan Centro para retrocompatibilidad total del login original
  await prisma.user.create({
    data: {
      email: "cajero@fmb.com",
      passwordHash: defaultPasswordHash,
      pinCode: await bcrypt.hash("1234", 10),
      name: "Juan Cajero (Acceso Rápido)",
      role: "CAJERO",
      active: true,
      branchId: branchesMap["Sucursal Centro FMB"],
    }
  });
  console.log(`✅ Cajero de retrocompatibilidad creado: cajero@fmb.com (PIN: 1234)`);

  // =========================================================================
  // 3. CLIENTE GENÉRICO
  // =========================================================================
  let generalCustomer = await prisma.customer.findFirst({
    where: { name: "Público General" },
  });

  if (!generalCustomer) {
    generalCustomer = await prisma.customer.create({
      data: {
        name: "Público General",
        taxId: "XAXX010101000",
        email: "general@fmb.com",
        phone: "000-0000",
        address: "Público en General",
        creditLimit: 0,
        balance: 0,
      },
    });
    console.log(`✅ Cliente Público General creado.`);
  }

  // =========================================================================
  // 4. PRODUCTOS AMPLIADOS E INVENTARIOS POR SUCURSAL
  // =========================================================================
  const productsData = [
    { sku: "PROD-001", barcode: "7501001100223", name: "Coca Cola Original 600ml", description: "Bebida refrescante sabor original", cost: 12.50, sell: 18.00, cat: "Bebidas" },
    { sku: "PROD-002", barcode: "7501031302833", name: "Papas Sabritas Sal 50g", description: "Papas fritas con sal de mesa", cost: 11.00, sell: 17.00, cat: "Botanas" },
    { sku: "PROD-003", barcode: "7501000122238", name: "Pan Blanco Bimbo Grande", description: "Pan de caja clásico esponjoso", cost: 32.00, sell: 45.00, cat: "Panadería" },
    { sku: "PROD-004", barcode: "7501055303496", name: "Galletas Chokis 90g", description: "Galletas con chispas sabor chocolate", cost: 14.00, sell: 21.00, cat: "Galletas" },
    { sku: "PROD-005", barcode: "7501008023648", name: "Leche Entera Lala 1L", description: "Leche pasteurizada adicionada con vitaminas", cost: 18.50, sell: 26.00, cat: "Lácteos" },
    { sku: "PROD-006", barcode: "7501055310869", name: "Agua Purificada Ciel 1L", description: "Agua de mesa purificada sin gas", cost: 7.00, sell: 12.00, cat: "Bebidas" }
  ];

  for (const p of productsData) {
    let product = await prisma.product.findUnique({
      where: { sku: p.sku },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          description: p.description,
          costPrice: p.cost,
          sellPrice: p.sell,
          active: true,
        },
      });
      console.log(`✅ Producto creado: ${product.name}`);
    } else {
      console.log(`ℹ️ Producto ${product.sku} ya existe.`);
    }

    // Inicializar inventarios en las 3 sucursales para cada producto
    for (const bName of Object.keys(branchesMap)) {
      const bId = branchesMap[bName];

      const existingInv = await prisma.inventory.findUnique({
        where: {
          productId_branchId: {
            productId: product.id,
            branchId: bId
          }
        }
      });

      if (!existingInv) {
        // Cargar stock aleatorio diferente por sucursal para demostrar diferencias reales
        const randomStock = Math.floor(Math.random() * 80) + 20; // Entre 20 y 100
        await prisma.inventory.create({
          data: {
            productId: product.id,
            branchId: bId,
            quantity: randomStock,
            minStock: 10,
            maxStock: 150,
          },
        });
        console.log(`   📦 Stock de ${randomStock} piezas asignado en ${bName}`);
      }
    }
  }

  console.log("🌱 Siembra enriquecida finalizada exitosamente.");
}

main()
  .catch((e) => {
    console.error("❌ Error en la siembra enriquecida:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
