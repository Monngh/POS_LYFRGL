export const normalizeSearchText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const parseSearchWords = (query: string): string[] =>
  query
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .map(normalizeSearchText);
