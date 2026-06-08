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
  } catch {
    // Continuar con resolución A/AAAA como respaldo
  }

  try {
    await dns.promises.resolve4(domain);
    return true;
  } catch {
    try {
      await dns.promises.resolve6(domain);
      return true;
    } catch {
      return false;
    }
  }
};
