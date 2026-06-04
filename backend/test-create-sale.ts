import { prisma } from "./src/app";
import { Request, Response } from "express";
import { createSale } from "./src/controllers/sale.controller";

console.log("Prisma initialized:", !!prisma);

// Mock Express Response
const mockResponse = () => {
  const res = {} as Response;
  res.status = (code: number) => {
    console.log("Response Status:", code);
    return res;
  };
  res.json = (data: any) => {
    console.log("Response JSON:", JSON.stringify(data, null, 2));
    return res;
  };
  return res;
};

async function testTARJETA() {
  console.log("\n=== Testing TARJETA ===");
  const req = {
    user: {
      userId: 3,
      branchId: 1,
      email: "juan.centro@fmb.com",
      role: "CAJERO"
    },
    body: {
      items: [
        { id: 2, quantity: 1 } // Papas Sabritas
      ],
      paymentMethod: "TARJETA",
      cardType: "DEBITO"
    }
  } as unknown as Request;

  const res = mockResponse();
  await createSale(req, res);
}

async function run() {
  try {
    await testTARJETA();
  } catch (e) {
    console.error("Test execution failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
