import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const query = "c"; // search term
  console.log(`=== Testing search query speed for "${query}" ===`);
  
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    
    const products = await prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { sku: { contains: query } },
          { barcode: { contains: query } },
          { name: { contains: query } },
        ],
      },
      take: 15,
      include: {
        inventories: {
          where: { branchId: 1 }, // mock branch ID
        },
        productTaxes: {
          include: {
            taxType: true,
          },
        },
        promotionProducts: {
          include: {
            promotion: {
              include: {
                promotionType: true
              }
            }
          }
        }
      },
    });
    
    const end = Date.now();
    console.log(`Run ${i+1}: found ${products.length} products in ${end - start}ms`);
  }
  
  await prisma.$disconnect();
}

main();
