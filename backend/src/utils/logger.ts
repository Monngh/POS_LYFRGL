const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (isDev) console.log(`[INFO] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) console.log(`[DEBUG] ${message}`, ...args);
  },
  http: (message: string) => {
    if (isDev) console.log(`[HTTP] ${message}`);
  }
};
