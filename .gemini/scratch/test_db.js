const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { computeLineUnitConversion } = require('../../backend/src/services/adminPurchase.service'); // Need to compile it or just copy the logic.

// Since it's TypeScript, I'll just copy the function from the diff!
const isPositiveInt = (value) => {
  const num = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isInteger(num) && num > 0;
};

const computeLineUnitConversionLogic = (input, lineLabel) => {
  const { unit, quantity } = input;
  const piecesPerBox = isPositiveInt(input.piecesPerBox) ? Number(input.piecesPerBox) : null;
  const boxesPerLot = isPositiveInt(input.boxesPerLot) ? Number(input.boxesPerLot) : null;
  const piecesPerLot = isPositiveInt(input.piecesPerLot) ? Number(input.piecesPerLot) : null;

  if (unit === "CAJA") {
    if (piecesPerBox === null) throw new Error(`${lineLabel}: "Piezas por caja" es obligatorio`);
    return { totalPieces: quantity * piecesPerBox, piecesPerBox, boxesPerLot: null, piecesPerLot: null };
  }

  if (unit === "LOTE") {
    if (piecesPerLot !== null) {
      return { totalPieces: quantity * piecesPerLot, piecesPerBox: null, boxesPerLot: null, piecesPerLot };
    }
    if (boxesPerLot !== null && piecesPerBox !== null) {
      return { totalPieces: quantity * boxesPerLot * piecesPerBox, piecesPerBox, boxesPerLot, piecesPerLot: null };
    }
    throw new Error(`${lineLabel}: la unidad LOTE requiere capturar la conversión`);
  }

  return { totalPieces: quantity, piecesPerBox: null, boxesPerLot: null, piecesPerLot: null };
};

async function main() {
  console.log("PIEZA (1):", computeLineUnitConversionLogic({ unit: 'PIEZA', quantity: 1 }));
  console.log("CAJA (1 caja, 12 pz):", computeLineUnitConversionLogic({ unit: 'CAJA', quantity: 1, piecesPerBox: 12 }));
  console.log("LOTE cajas (2 lotes, 10 cajas, 12 pz):", computeLineUnitConversionLogic({ unit: 'LOTE', quantity: 2, boxesPerLot: 10, piecesPerBox: 12 }));
  console.log("LOTE directo (2 lotes, 500 pz):", computeLineUnitConversionLogic({ unit: 'LOTE', quantity: 2, piecesPerLot: 500 }));
}
main().catch(console.error);
