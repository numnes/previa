/** Primeiro header não vazio (Express normaliza para lowercase). */
export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  ...names: string[]
): string {
  for (const name of names) {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    if (typeof raw === 'string' && raw) return raw;
    if (Array.isArray(raw) && raw[0]) return raw[0];
  }
  return '';
}
