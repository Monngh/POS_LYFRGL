import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateSaleCart } from '../services/sale.service';
import { prisma } from '../app';
import { PromotionService } from '../services/promotion.service';
import { AppError } from '../utils/AppError';

// Mock dependencias
vi.mock('../app', () => ({
  prisma: {
    cashSession: { findFirst: vi.fn() },
    product: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn() },
  }
}));

vi.mock('../services/promotion.service', () => ({
  PromotionService: {
    calculatePromotions: vi.fn()
  }
}));

describe('Calculadora de Precios, IVA y Descuentos', () => {
  const defaultParams = {
    normalizedItems: [],
    branchId: 1,
    userId: 1,
    customerId: null,
    ptsRedeemed: 0,
    salePaymentMethod: 'EFECTIVO',
    numericCashReceived: 1000,
    numericCardAmount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Simular sesión de caja abierta siempre
    (prisma.cashSession.findFirst as any).mockResolvedValue({ id: 1, status: 'ABIERTA' });
  });

  it('Caso 1: Venta Estándar con IVA 16% (Calculo sin desfase de centavos)', async () => {
    const productMock = {
      id: 1,
      name: 'Producto 1',
      sellPrice: 100, // Precio con impuestos
      active: true,
      inventories: [{ id: 1, quantity: 10 }],
      productTaxes: [{ taxType: { id: 1, name: 'IVA 16%', rate: 0.16, active: true } }]
    };
    (prisma.product.findUnique as any).mockResolvedValue(productMock);
    (PromotionService.calculatePromotions as any).mockResolvedValue({
      lines: [{ discountAmount: 0 }],
      totalDiscount: 0,
      totalFinal: 100
    });

    const result = await calculateSaleCart({
      ...defaultParams,
      normalizedItems: [{ productId: 1, quantity: 1 }],
      numericCashReceived: 100,
    });

    // 100 / 1.16 = 86.2068...
    // Tax = 86.2068 * 0.16 = 13.793...
    // ToFixed(2) -> 13.79
    // Subtotal = 100 - 13.79 = 86.21
    expect(result.finalTotal).toBe(100);
    expect(result.finalTax).toBe(13.79);
    expect(result.finalSubtotal).toBe(86.21);
    expect(result.finalPaidAmount).toBe(100);
  });

  it('Caso 2: Venta con Producto Exento de IVA (Tasa 0%)', async () => {
    const productMock = {
      id: 2,
      name: 'Tomate',
      sellPrice: 50.50,
      active: true,
      inventories: [{ id: 2, quantity: 20 }],
      productTaxes: [{ taxType: { id: 2, name: 'IVA 0% (EXENTO)', rate: 0, active: true } }]
    };
    (prisma.product.findUnique as any).mockResolvedValue(productMock);
    (PromotionService.calculatePromotions as any).mockResolvedValue({
      lines: [{ discountAmount: 0 }],
      totalDiscount: 0,
      totalFinal: 50.50
    });

    const result = await calculateSaleCart({
      ...defaultParams,
      normalizedItems: [{ productId: 2, quantity: 1 }],
      numericCashReceived: 50.50,
    });

    expect(result.finalTax).toBe(0);
    expect(result.finalSubtotal).toBe(50.50);
    expect(result.finalTotal).toBe(50.50);
  });

  it('Caso 3: Venta con Descuento Directo (Impuestos sobre el neto)', async () => {
    // 1 producto de 100, con 10% de descuento -> 90. IVA 16% sobre 90.
    const productMock = {
      id: 3,
      name: 'Camisa',
      sellPrice: 100,
      active: true,
      inventories: [{ id: 3, quantity: 5 }],
      productTaxes: [{ taxType: { id: 1, name: 'IVA 16%', rate: 0.16, active: true } }]
    };
    (prisma.product.findUnique as any).mockResolvedValue(productMock);
    
    // Promoción simulada
    (PromotionService.calculatePromotions as any).mockResolvedValue({
      lines: [{ discountAmount: 10 }], // $10 de descuento
      totalDiscount: 10,
      totalFinal: 90 // 100 - 10
    });

    const result = await calculateSaleCart({
      ...defaultParams,
      normalizedItems: [{ productId: 3, quantity: 1 }],
      numericCashReceived: 90,
    });

    // 90 / 1.16 = 77.586...
    // Tax = 77.586 * 0.16 = 12.413...
    // finalTax = 12.41
    expect(result.discount).toBe(10);
    expect(result.finalTax).toBe(12.41);
    expect(result.finalSubtotal).toBe(77.59); // 90 - 12.41 = 77.59
    expect(result.finalTotal).toBe(90);
  });

  it('Caso 4: Totales exactos sin redondeo a 50 centavos', async () => {
    // Math.round ya no se aplica, 99.30 se queda en 99.30
    const productMock = {
      id: 4,
      name: 'Cable',
      sellPrice: 99.30,
      active: true,
      inventories: [{ id: 4, quantity: 10 }],
      productTaxes: []
    };
    (prisma.product.findUnique as any).mockResolvedValue(productMock);
    (PromotionService.calculatePromotions as any).mockResolvedValue({
      lines: [{ discountAmount: 0 }],
      totalDiscount: 0,
      totalFinal: 99.30
    });

    const result = await calculateSaleCart({
      ...defaultParams,
      normalizedItems: [{ productId: 4, quantity: 1 }],
      numericCashReceived: 100,
    });

    expect(result.finalTotal).toBe(99.30); // El sistema ya no redondea a múltiplos de 0.50
    expect(result.finalPaidAmount).toBe(99.30);
  });

  it('Caso 5: Venta Mixta con Pago en Puntos de Lealtad (Tope de pago)', async () => {
    const productMock = {
      id: 5,
      name: 'Audifonos',
      sellPrice: 200,
      active: true,
      inventories: [{ id: 5, quantity: 2 }],
      productTaxes: []
    };
    (prisma.product.findUnique as any).mockResolvedValue(productMock);
    (PromotionService.calculatePromotions as any).mockResolvedValue({
      lines: [{ discountAmount: 0 }],
      totalDiscount: 0,
      totalFinal: 200
    });

    // Simulamos cliente con 50 puntos
    (prisma.customer.findUnique as any).mockResolvedValue({ id: 1, points: 50 });

    const result = await calculateSaleCart({
      ...defaultParams,
      customerId: 1,
      ptsRedeemed: 50,
      normalizedItems: [{ productId: 5, quantity: 1 }],
      numericCashReceived: 150, // 200 - 50 = 150
    });

    expect(result.finalTotal).toBe(200);
    expect(result.pointsDiscount).toBe(50);
    expect(result.finalPaidAmount).toBe(150); // Total final tras puntos
  });

  it('Caso 6: Error si el pago en efectivo es menor al monto cobrado', async () => {
    const productMock = {
      id: 6,
      name: 'Teclado',
      sellPrice: 300,
      active: true,
      inventories: [{ id: 6, quantity: 5 }],
      productTaxes: []
    };
    (prisma.product.findUnique as any).mockResolvedValue(productMock);
    (PromotionService.calculatePromotions as any).mockResolvedValue({
      lines: [{ discountAmount: 0 }],
      totalDiscount: 0,
      totalFinal: 300
    });

    await expect(calculateSaleCart({
      ...defaultParams,
      normalizedItems: [{ productId: 6, quantity: 1 }],
      numericCashReceived: 100, // Insuficiente
    })).rejects.toThrow(AppError);
  });

  it('Caso 7: Ignorar promoción si genera un descuento negativo (aumento de precio)', async () => {
    const productMock = {
      id: 7,
      name: 'Producto Especial',
      sellPrice: 16,
      active: true,
      inventories: [{ id: 7, quantity: 10 }],
      productTaxes: []
    };
    (prisma.product.findUnique as any).mockResolvedValue(productMock);
    
    // Simulamos que PromotionService ya no devuelve descuento negativo
    (PromotionService.calculatePromotions as any).mockResolvedValue({
      lines: [{ discountAmount: 0 }],
      totalDiscount: 0,
      totalFinal: 32 // 16 * 2
    });

    const result = await calculateSaleCart({
      ...defaultParams,
      normalizedItems: [{ productId: 7, quantity: 2 }],
      numericCashReceived: 32,
    });

    expect(result.finalTotal).toBe(32);
    expect(result.finalSubtotal).toBe(32);
    expect(result.discount).toBe(0);
  });
});
