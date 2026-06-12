import dns from "dns";

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

export const verifyEmailDomain = async (email: string): Promise<boolean> => {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return false;

  try {
    const mxRecords = await dns.promises.resolveMx(domain);
    if (mxRecords.length > 0) return true;
  } catch (err) {
    console.warn(`[Email DNS] resolveMx failed for domain "${domain}":`, err);
  }

  try {
    await dns.promises.resolve4(domain);
    return true;
  } catch (err) {
    try {
      await dns.promises.resolve6(domain);
      return true;
    } catch (err6) {
      console.warn(`[Email DNS] resolve4/6 failed for domain "${domain}":`, err, err6);
      // Fallback: Si el DNS del servidor no puede resolver el dominio (bloqueo egress/resolver en VPS),
      // no bloqueamos el envío de correo. Gmail/Nodemailer intentará enviarlo de todos modos.
      return true;
    }
  }
};
