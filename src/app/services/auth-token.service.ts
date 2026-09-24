import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, take } from 'rxjs';
import { environment } from '../../environments/environment';

const TOKEN_STORAGE_KEY = 'rfi_admin_access_token';

/**
 * Manages the JWT access token for API authentication.
 * On first load, captures the token from the URL query parameter (`?token=...`). Legacy
 * **ProjectRCS** should link via `AdminPortalV2Controller` (server redirect) so the JWT is not
 * embedded in static HTML; the browser still receives it in the redirect `Location` query string
 * (custom HTTP request headers cannot be set on a top-level navigation or 302 follow-up). The
 * `authInterceptor` then sends `Authorization: Bearer <token>` on every
 * API request — that path is unchanged.
 * If `environment.authToken` is set (optional), uses it when no URL or stored token exists.
 * In local dev (`production: false`), `environment.authToken` takes priority over `localStorage`
 * so updating `environment.ts` is not blocked by a stale stored token.
 *
 * **Security (production / UAT, `environment.production === true`):** A JWT in `?token=` is stored
 * only if {@link document.referrer}’s hostname matches {@link environment.legacyAdminBaseUrl}
 * (after normalizing `www.`). That blocks “copy URL → paste in another browser” because a fresh
 * paste has no trusted referrer. **Legacy Admin** must not use `rel="noreferrer"` on links to V2,
 * and should set `referrerpolicy="origin"` on those anchors (or relax site `Referrer-Policy`) so
 * cross-origin navigation still sends at least `https://admin-uat.retailfixitapp.com/` as Referer.
 *
 * **Local `ng serve` with `production: false`:** URL tokens are accepted without a referrer so
 * developers can paste `?token=` while debugging.
 *
 * **`ng serve --configuration=uat` (or any `production: true` build on loopback):** Legacy MVC on
 * `http://localhost:…` redirects to V2 on `http://localhost:4200`; the Referer hostname is
 * `localhost`, not `legacyAdminBaseUrl`. `isTrustedLoopbackLegacyHandoff` accepts that pairing so
 * Assign Vendor works locally. Deployed V2 on a real host does not use this path.
 *
 * The Customer Gross Profit report route requires a token (guard + this service);
 * the legacy portal appends ?token= when redirecting to that report.
 *
 * **URL bar:** `cleanTokenFromUrl` runs during bootstrap, but the router can re-write the browser
 * URL when the first navigation finishes, putting `?token=` back. A follow-up cleanup on the first
 * {@link NavigationEnd} removes the param after the router has settled.
 *
 * **Reloads:** After `?token=` is stripped, revisits have no query param. We must not write an empty
 * token into storage on those loads — otherwise `window.location.reload()` on Assign Vendor wipes
 * the JWT and the auth guard sends the user to `/`.
 */
@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private cachedToken: string | null = null;

  private readonly router = inject(Router);

  constructor() {
    this.initializeToken();
    this.stripTokenFromUrlAfterRouterSettles();
  }

  /**
   * Ensures `?token=` does not remain visible after the initial navigation: the Router may sync
   * the address bar from its UrlTree after {@link cleanTokenFromUrl} has already run in
   * {@link initializeToken} (see class JSDoc).
   */
  private stripTokenFromUrlAfterRouterSettles(): void {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        take(1),
      )
      .subscribe(() => this.cleanTokenFromUrl());
  }

  private initializeToken(): void {
    const envToken = environment.authToken?.trim() ?? '';

    // Local dev: environment.authToken is an explicit override (avoids stale localStorage).
    if (!environment.production && envToken) {
      this.cachedToken = envToken;
      return;
    }

    let urlToken = new URLSearchParams(window.location.search).get('token');
    urlToken = urlToken ? urlToken.trim() : '';

    if (urlToken.length > 0) {
      const allow =
        this.isFromTrustedReferrer() ||
        !environment.production ||
        this.isTrustedLoopbackLegacyHandoff();

      if (allow) {
        this.cachedToken = urlToken;
        localStorage.setItem(TOKEN_STORAGE_KEY, urlToken);
        this.cleanTokenFromUrl();
        return;
      }

      // Untrusted ?token= (e.g. pasted URL): never persist; strip from address bar only.
      this.cleanTokenFromUrl();
    } else {
      this.cleanTokenFromUrl();
    }

    const storedToken = (localStorage.getItem(TOKEN_STORAGE_KEY) ?? '').trim();
    if (storedToken.length > 0) {
      this.cachedToken = storedToken;
      return;
    }

    if (envToken) {
      this.cachedToken = envToken;
      return;
    }

    this.cachedToken = '';
  }

  /**
   * Checks if the current page was navigated from a trusted referrer.
   * Returns true if referrer matches the legacy Admin Portal domain.
   */
  private isFromTrustedReferrer(): boolean {
    const referrer = document.referrer;
    if (!referrer) return false;

    try {
      const referrerHost = AuthTokenService.normalizeHost(new URL(referrer).hostname);
      const trustedHost = AuthTokenService.normalizeHost(
        new URL(environment.legacyAdminBaseUrl).hostname,
      );
      return referrerHost === trustedHost;
    } catch {
      return false;
    }
  }

  /**
   * Production/UAT build on `localhost`/`127.0.0.1`, with a Referer from the same loopback
   * (e.g. ProjectRCS on `http://localhost:2063` → V2 on `http://localhost:4200`). Pasted URLs still
   * have no Referer and are rejected.
   */
  private isTrustedLoopbackLegacyHandoff(): boolean {
    if (!environment.production) {
      return false;
    }
    if (!AuthTokenService.isLoopbackHost(window.location.hostname)) {
      return false;
    }
    const referrer = document.referrer;
    if (!referrer) {
      return false;
    }
    try {
      const refHost = AuthTokenService.normalizeHost(new URL(referrer).hostname);
      return AuthTokenService.isLoopbackHost(refHost);
    } catch {
      return false;
    }
  }

  private static isLoopbackHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1';
  }

  /** Compare hosts in a stable way (e.g. strip leading `www.`). */
  private static normalizeHost(hostname: string): string {
    const h = hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
  }

  getToken(): string {
    return this.cachedToken ?? '';
  }

  /**
   * True only when a token is present **and** its `exp` claim (seconds since epoch, set by legacy
   * `CreateJwtTokenForAdmin`) is still in the future — i.e. a session that should be honored.
   *
   * Used to decide whether a `401` warrants bouncing through legacy login. A `401` while a token is
   * *live* is NOT a session problem (e.g. a valid token rejected by a mismatched API in a dev setup),
   * so it must not force a re-login — that was the cause of the earlier "login every time" loop.
   * A missing token, an expired token, or a token whose `exp` cannot be decoded all return `false`:
   * each of those is a genuine "not authenticated" state that should send the user to login.
   */
  hasLiveToken(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }
    const payload = this.decodeTokenPayload();
    const exp = payload ? Number(payload['exp']) : NaN;
    if (!Number.isFinite(exp)) {
      return false;
    }
    return exp > Math.floor(Date.now() / 1000);
  }

  /**
   * Decodes the JWT payload and returns the admin/personnel key (GUID string).
   * Tries common claims: AdminKey, adminKey, personnelKey, sub.
   * Returns empty string if token is missing or claim not found.
   */
  getAdminKeyFromToken(): string {
    const payload = this.decodeTokenPayload();
    if (!payload) return '';
    return (
      payload['AdminKey'] ??
      payload['adminKey'] ??
      payload['personnelKey'] ??
      payload['PersonnelKey'] ??
      payload['sub'] ??
      ''
    );
  }

  /**
   * Returns the admin's display name from the JWT token.
   * Claim: PersonName (set by CreateJwtTokenForAdmin in legacy portal).
   */
  getPersonNameFromToken(): string {
    const payload = this.decodeTokenPayload();
    if (!payload) return '';
    return payload['PersonName'] ?? payload['personName'] ?? payload['PName'] ?? '';
  }

  /**
   * Returns the admin's email from the JWT token.
   * Claim: AdminEmail (set by CreateJwtTokenForAdmin in legacy portal).
   */
  getAdminEmailFromToken(): string {
    const payload = this.decodeTokenPayload();
    if (!payload) return '';
    return payload['AdminEmail'] ?? payload['adminEmail'] ?? '';
  }

  /**
   * Returns the admin's designation/title from the JWT token.
   * Claim: Designation (set by CreateJwtTokenForAdmin in legacy portal).
   */
  getDesignationFromToken(): string {
    const payload = this.decodeTokenPayload();
    if (!payload) return '';
    return payload['Designation'] ?? payload['designation'] ?? '';
  }

  /**
   * Returns all admin data extracted from the JWT token.
   */
  getAdminDataFromToken(): {
    adminKey: string;
    personName: string;
    adminEmail: string;
    designation: string;
  } {
    return {
      adminKey: this.getAdminKeyFromToken(),
      personName: this.getPersonNameFromToken(),
      adminEmail: this.getAdminEmailFromToken(),
      designation: this.getDesignationFromToken(),
    };
  }

  /**
   * Decodes the JWT payload and returns the parsed object.
   * Returns null if token is invalid or missing.
   */
  private decodeTokenPayload(): Record<string, string> | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      return null;
    }
  }

  private extractTokenFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  /** Remove the token query param from the URL without triggering navigation */
  private cleanTokenFromUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.toString());
  }
}
