import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { AuthRBACService, TokenResponse } from '../api';

interface Session {
  accessToken: string;
  expiresAt: number;
}

const STORAGE_KEY = 'portfolio.session';
const GRANT_TYPE = 'client_credentials';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthRBACService);
  private readonly session = signal<Session | null>(readStoredSession());

  readonly isAuthenticated = computed(() => this.session() !== null);

  /** Token vigente, o `null` si no hay sesión o ya expiró (en cuyo caso la cierra). */
  token(): string | null {
    const session = this.session();
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      this.logout();
      return null;
    }
    return session.accessToken;
  }

  login(clientId: string, clientSecret: string): Observable<void> {
    return this.api.generateToken({ clientId, clientSecret, grantType: GRANT_TYPE }).pipe(
      tap((response) => this.store(response)),
      map(() => undefined),
    );
  }

  logout(): void {
    this.session.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  private store(response: TokenResponse): void {
    if (!response.accessToken) {
      throw new Error('La API no devolvió un accessToken');
    }
    const session: Session = {
      accessToken: response.accessToken,
      expiresAt: Date.now() + (response.expiresInSeconds ?? 0) * 1000,
    };
    this.session.set(session);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

function readStoredSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as Partial<Session>) : null;
    if (session?.accessToken && typeof session.expiresAt === 'number' && session.expiresAt > Date.now()) {
      return { accessToken: session.accessToken, expiresAt: session.expiresAt };
    }
  } catch {
    // Valor corrupto o almacenamiento no disponible: se trata como sesión inexistente.
  }
  return null;
}
