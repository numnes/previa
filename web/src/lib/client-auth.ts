export type UserRole = 'admin' | 'operator';

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
};

export const TOKEN_KEY = 'previa_token';
export const USER_KEY = 'previa_user';

export function getTokenClient(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setTokenClient(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getUserClient(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setUserClient(user: AuthUser) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearTokenClient() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin';
}
