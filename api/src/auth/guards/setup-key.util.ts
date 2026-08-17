import { timingSafeEqual } from 'crypto';
import { headerValue } from '../../http/header-value';

export const SETUP_KEY_HEADER = 'x-previa-setup-key';
export const SETUP_KEY_HEADER_LEGACY = 'x-deployer-setup-key';

/** Comparação de strings resistente a timing attacks. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Extrai o valor do header da setup key (aceita string ou array). */
export function extractSetupKey(
  headers: Record<string, string | string[] | undefined>,
): string {
  return headerValue(headers, SETUP_KEY_HEADER, SETUP_KEY_HEADER_LEGACY);
}

/** Valida a chave fornecida contra a esperada (configurada na máquina root). */
export function isValidSetupKey(provided: string, expected: string): boolean {
  if (!expected || !provided) return false;
  return timingSafeEqualStr(provided, expected);
}
