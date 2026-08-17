export const DEMO_STORAGE_KEY = 'previa_demo';
export const DEMO_TOKEN_PREFIX = 'demo.';

/** Demo ligado via build (GitHub Pages) ou via localStorage (/demo). */
export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO === '1') return true;
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DEMO_STORAGE_KEY) === '1';
}

export function enableDemoMode() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_STORAGE_KEY, '1');
}

export function disableDemoMode() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DEMO_STORAGE_KEY);
}

export function isDemoToken(token: string | null | undefined): boolean {
  return !!token && token.startsWith(DEMO_TOKEN_PREFIX);
}
