import { inject, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, tap, filter } from 'rxjs/operators';
import { User } from '../models/user.interface';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user?: User | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly redirectUrlKey = 'redirect_url';

  private readonly authStateSignal = signal<AuthState>({ status: 'checking' });
  readonly authState = this.authStateSignal.asReadonly();
  readonly authState$ = toObservable(this.authState);

  private initialized = false;
  private hasRedirectedAfterLogin = false;

  constructor() { }

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.refreshAuthState().subscribe();
  }

  private refreshAuthState(): Observable<User | null> {
    this.authStateSignal.set({ status: 'checking' });
    return this.refreshUser();
  }

  private refreshUser(): Observable<User | null> {
    const wasAuthenticated = this.isLoggedIn();

    return this.http.get<User>('/services/activeUser').pipe(
      tap((user) => {
        this.authStateSignal.set({ status: 'authenticated', user });
        if (!wasAuthenticated && !this.hasRedirectedAfterLogin) {
          this.hasRedirectedAfterLogin = true;
          this.consumeRedirect();
        }
      }),
      catchError((error) => {
        if (error.status !== 401 && error.status !== 403) {
          console.error('Error fetching active user:', error);
        }
        // Changed from this.authStateSubject.next to this.authStateSignal.set
        this.authStateSignal.set({ status: 'unauthenticated' });
        return of(null);
      })
    );
  }

  login(redirectUrl: string = '/experiments-dashboard'): void {
    const normalizedPath = this.normalizeRedirectPath(redirectUrl);
    const target = `${window.location.origin}${normalizedPath}`;
    localStorage.setItem(this.redirectUrlKey, target);
    const encodedTarget = encodeURIComponent(target);
    window.location.href = `/services/oauth2/authorization/keycloak?frontend_redirect=${encodedTarget}`;
  }

  logout(): void {
    localStorage.removeItem(this.redirectUrlKey);
    this.authStateSignal.set({ status: 'unauthenticated' });

    // Use a full-page redirect so the backend/IdP can clear SSO cookies.
    window.location.href = '/services/logout';
  }

  isLoggedIn(): boolean {
    return this.authState().status === 'authenticated';
  }

  get currentUser(): User | null {
    return this.authState().user ?? null;
  }

  markTermsAccepted(): void {
    const state = this.authState();
    if (state.status === 'authenticated' && state.user) {
      this.authStateSignal.set({
        ...state,
        user: { ...state.user, agreeNDA: true }
      });
    }
  }

  onAuthResolved(): Observable<AuthState> {
    return this.authState$.pipe(filter((state) => state.status !== 'checking'));
  }

  private consumeRedirect(): void {
    const rawStored = localStorage.getItem(this.redirectUrlKey);
    if (!rawStored) {
      return;
    }

    localStorage.removeItem(this.redirectUrlKey);

    let stored = rawStored;
    if (/^https?:\/\//i.test(stored)) {
      try {
        const parsed = new URL(stored);
        if (parsed.origin !== window.location.origin) {
          this.router.navigateByUrl('/experiments-dashboard').catch(() => {
            window.location.href = '/experiments-dashboard';
          });
          return;
        }
        stored = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        stored = '/experiments-dashboard';
      }
    }

    this.router.navigateByUrl(stored).catch((error) => {
      console.error('Navigation to stored redirect failed:', error);
      // hard fallback: force location change
      window.location.href = stored;
    });
  }

  private normalizeRedirectPath(redirectUrl: string | null | undefined): string {
    if (!redirectUrl) return '/experiments-dashboard';

    const trimmed = redirectUrl.trim();
    if (!trimmed) return '/experiments-dashboard';

    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        if (parsed.origin !== window.location.origin) {
          return '/experiments-dashboard';
        }
        return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/experiments-dashboard';
      } catch {
        return '/experiments-dashboard';
      }
    }

    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

}
