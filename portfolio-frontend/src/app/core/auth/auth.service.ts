import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';

import { AuthRBACService, SessionResponse, TokenResponse, UserProfile } from '../api';

interface Session {
  accessToken: string;
  expiresAt: number;
  /** Solo en la sesión de una persona: token opaco y de un solo uso para renovarla. */
  refreshToken?: string;
  refreshExpiresAt?: number;
  /** Quién ha entrado. Una sesión de cliente de máquina no lo lleva: ese cliente es administrador. */
  profile?: UserProfile;
}

const STORAGE_KEY = 'portfolio.session';
const GRANT_TYPE = 'client_credentials';

/**
 * Sesión de la administración. Hay dos formas de entrar: una persona, con correo y contraseña
 * (token de acceso corto más uno de refresco), o el cliente de máquina, con su id y su secreto.
 *
 * Lo que se guarda en `sessionStorage` dura lo que la pestaña. Los permisos que hay aquí solo
 * sirven para decidir qué se enseña: quien decide de verdad es la API en cada petición.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthRBACService);
  private readonly session = signal<Session | null>(readStoredSession());
  private refreshing: Observable<boolean> | null = null;

  readonly isAuthenticated = computed(() => this.session() !== null);
  /** La persona que ha entrado, o `null` (sin sesión, o sesión del cliente de máquina). */
  readonly profile = computed(() => this.session()?.profile ?? null);
  /** Nombre que se muestra y rol, para la cabecera del panel. */
  readonly who = computed(() => {
    const session = this.session();
    if (!session) {
      return null;
    }
    return session.profile
      ? { name: session.profile.displayName ?? session.profile.email ?? session.profile.subject, role: session.profile.role }
      : { name: 'Cliente de máquina', role: 'ADMIN' as const };
  });

  /**
   * Token con el que llamar a la API, o `null` si no hay sesión. Si el de acceso ha caducado pero
   * queda con qué renovarlo, se devuelve igualmente: la API responderá 401 y la sesión se renueva
   * sola. Sin nada que renovar, la sesión se cierra.
   */
  token(): string | null {
    const session = this.session();
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now() && !this.canRefresh()) {
      this.clear();
      return null;
    }
    return session.accessToken;
  }

  /** ¿Puede hacer esto quien ha entrado? El cliente de máquina, todo. */
  can(permission: string): boolean {
    const session = this.session();
    if (!session) {
      return false;
    }
    return session.profile ? session.profile.permissions.includes(permission) : true;
  }

  canRefresh(): boolean {
    const session = this.session();
    return !!session?.refreshToken && (session.refreshExpiresAt ?? 0) > Date.now();
  }

  /** Entra como el cliente de máquina. */
  login(clientId: string, clientSecret: string): Observable<void> {
    return this.api.generateToken({ clientId, clientSecret, grantType: GRANT_TYPE }).pipe(
      tap((response) => this.storeToken(response)),
      map(() => undefined),
    );
  }

  /** Entra como una persona. */
  loginUser(email: string, password: string): Observable<void> {
    return this.api.loginUser({ email, password }).pipe(
      tap((response) => this.storeSession(response)),
      map(() => undefined),
    );
  }

  /**
   * Renueva la sesión con el token de refresco. Varias peticiones que fallen a la vez comparten
   * una sola renovación: el token es de un solo uso y la segunda llamada cerraría la sesión.
   */
  refresh(): Observable<boolean> {
    const refreshToken = this.session()?.refreshToken;
    if (!refreshToken || !this.canRefresh()) {
      return of(false);
    }
    this.refreshing ??= this.api.refreshSession({ refreshToken }).pipe(
      tap((response) => this.storeSession(response)),
      map(() => true),
      catchError(() => {
        this.clear();
        return of(false);
      }),
      finalize(() => (this.refreshing = null)),
      shareReplay(1),
    );
    return this.refreshing;
  }

  /** Cierra la sesión aquí y, si era de una persona, revoca su token de refresco en el servidor. */
  logout(): void {
    const refreshToken = this.session()?.refreshToken;
    if (refreshToken) {
      // Si la llamada falla, la sesión local se cierra igual y el token caduca solo.
      this.api.logoutSession({ refreshToken }).subscribe({ error: () => undefined });
    }
    this.clear();
  }

  private clear(): void {
    this.session.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  private storeToken(response: TokenResponse): void {
    if (!response.accessToken) {
      throw new Error('La API no devolvió un accessToken');
    }
    this.save({ accessToken: response.accessToken, expiresAt: Date.now() + (response.expiresInSeconds ?? 0) * 1000 });
  }

  private storeSession(response: SessionResponse): void {
    if (!response.accessToken || !response.refreshToken) {
      throw new Error('La API no devolvió la sesión completa');
    }
    this.save({
      accessToken: response.accessToken,
      expiresAt: Date.now() + response.expiresInSeconds * 1000,
      refreshToken: response.refreshToken,
      refreshExpiresAt: Date.now() + response.refreshExpiresInSeconds * 1000,
      profile: response.user,
    });
  }

  private save(session: Session): void {
    this.session.set(session);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

function readStoredSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<Session>) : null;
    if (!stored?.accessToken || typeof stored.expiresAt !== 'number') {
      return null;
    }
    const refreshable = typeof stored.refreshToken === 'string' && typeof stored.refreshExpiresAt === 'number' && stored.refreshExpiresAt > Date.now();
    if (stored.expiresAt <= Date.now() && !refreshable) {
      return null;
    }
    const profile = isProfile(stored.profile) ? stored.profile : undefined;
    return {
      accessToken: stored.accessToken,
      expiresAt: stored.expiresAt,
      ...(refreshable ? { refreshToken: stored.refreshToken, refreshExpiresAt: stored.refreshExpiresAt } : {}),
      ...(profile ? { profile } : {}),
    };
  } catch {
    // Valor corrupto o almacenamiento no disponible: se trata como sesión inexistente.
  }
  return null;
}

/** Lo guardado puede haberse manipulado: solo se acepta un perfil con la forma esperada. */
function isProfile(value: unknown): value is UserProfile {
  const profile = value as Partial<UserProfile> | null;
  return !!profile && typeof profile === 'object' && typeof profile.subject === 'string' && typeof profile.role === 'string'
    && Array.isArray(profile.permissions) && profile.permissions.every((permission) => typeof permission === 'string');
}
