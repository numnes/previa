/** Versão do previa exibida na UI (injetada no build do web). */
export function previaVersionLabel(): string {
  const raw = process.env.NEXT_PUBLIC_PREVIA_VERSION?.trim();
  if (!raw) return 'dev';
  return raw.startsWith('v') ? raw : raw.match(/^\d/) ? `v${raw}` : raw;
}
