import { prisma } from "./src/app";
import * as sc from "./src/controllers/sale.controller";

console.log("Prisma is defined:", !!prisma);
console.log("Exported functions:");
for (const key of Object.keys(sc)) {
  console.log(`- ${key}: ${typeof (sc as any)[key]}`);
}
