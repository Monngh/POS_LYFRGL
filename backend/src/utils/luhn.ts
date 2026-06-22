/**
 * Valida un número de tarjeta usando el algoritmo Luhn.
 * Admite longitudes de 15 o 16 dígitos (compatibilidad con AMEX y otras tarjetas).
 */
export const validateLuhn = (cardNumber: string): boolean => {
  const cleanNumber = cardNumber.replace(/\D/g, "");
  if (cleanNumber.length !== 15 && cleanNumber.length !== 16) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let i = cleanNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cleanNumber.charAt(i), 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
};
