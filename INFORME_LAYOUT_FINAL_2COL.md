# Informe: Layout Final — 2 Columnas Área de Venta

**Rama:** `feature/fix-qr-pending-modal`  
**Commit:** `3a39215`

## Qué se hizo

El área inferior de la terminal de ventas quedó dividida en **2 columnas simples**:

```
┌─────────────────────────────┬──────────────────────────┐
│   📱 PAGOS QR PENDIENTES    │   Subtotal Original: $0  │
│                             │   Subtotal Neto:     $0  │
│  ...553648  $33.41  Pend.   │   IVA (16%):         $0  │
│  [QR] [Verificar] [Impr] 🗑 │                          │
│  ...702401  $19.72  Pend.   │   Total:          $0.00  │
│  [QR] [Verificar] [Impr] 🗑 │                          │
│                             │  [CANCELAR] [COBRAR]     │
└─────────────────────────────┴──────────────────────────┘
```

- **Izquierda** (`flex: 1`): tabla de pagos QR, máximo 3 entradas, **sin scroll**
- **Derecha** (`minWidth: 260px`): totales + botones CANCELAR/COBRAR debajo del total
- Sin `maxHeight`, sin `overflowY` — la tabla simplemente crece con hasta 3 filas

## Cómo probar

1. Ir a Nueva Venta como cajero  
2. Procesar un pago con QR MercadoPago y dejarlo pendiente  
3. Verificar que la tabla aparece a la izquierda sin tocar los botones  
4. Los botones CANCELAR / COBRAR deben estar siempre bajo los totales, a la derecha
