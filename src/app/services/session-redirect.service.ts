import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthTokenService } from './auth-token.service';

/**
 * Maps V2 route → legacy `AdminPortalV2` handoff action. Only the job-scoped legacy embed pages
 * are eligible for the "session expired → login → return" flow:
 *   - `assign-vendor`  → `AdminPortalV2/AssignVendor/{jobKey}`
 *   - `notes-activity` → `AdminPortalV2/NotesActivity/{jobKey}`
 *   - `vendor-bills`   → `AdminPortalV2/VendorBills/{jobKey}` (also serves the Estimates tab)
 */
const V2_ROUTE_TO_LEGACY_ACTION: Record<string, string> = {
  'assign-vendor': 'AssignVendor',
  'notes-activity': 'NotesActivity',
  'vendor-bills': 'VendorBills',
};

/**
 * Redirects the user to the legacy ProjectRCS login when the JWT has expired (API returned 401).
 *
 * The JWT that authenticates Job Ops / Email API calls is minted by legacy ProjectRCS and handed to
 * V2 via `?token=` (see {@link AuthTokenService}). When it expires there is nothing V2 can refresh
 * on its own, so the only recovery is to re-authenticate on legacy. We send the browser to the
 * legacy login with a `returnUrl` that points back at the legacy handoff action for the *current*
 * V2 page. After login, legacy mints a fresh JWT and 302s back to the exact same V2 page, so the
 * user lands where they left off.
 *
 * The redirect is performed for the job-scoped legacy embed pages (Assign Vendor, Vendor Bills /
 * Estimates, Notes & Activity) and for the Customer Profile pages (list / new / edit), which return
 * to the V2 customers list after login. A 401 on any other route is left for the caller to handle.
 */
@Injectable({ providedIn: 'root' })
export class SessionRedirectService {
  private readonly router = inject(Router);
  private readonly authToken = inject(AuthTokenService);

  /** Guards against firing multiple navigations when several in-flight requests 401 at once. */
  private redirecting = false;

  /**
   * If the session is gone (JWT missing or expired) **and** the target route is an eligible legacy
   * embed page, navigate the browser to the legacy login carrying a `returnUrl` back to this page.
   * Returns `true` if a redirect was initiated.
   *
   * `currentUrl` defaults to the router's current URL (used by the response interceptor after the
   * router has settled). The route guard passes the *target* URL explicitly, because during
   * `canActivate` the router has not yet committed the navigation.
   *
   * A live (present, non-expired) token is left untouched even when a request returns `401`: that
   * keeps a freshly issued token working for the life of the session and avoids a "login every time"
   * loop when a 401 comes from something other than an absent/expired session.
   */
  redirectToLegacyLogin(currentUrl: string = this.router.url): boolean {
    if (this.redirecting) {
      return true;
    }

    // Redirect only when the session is actually gone (token missing or expired). A 401 while a
    // live, non-expired token is present is some other failure and must not force a re-login,
    // otherwise every open loops back to login.
    if (this.authToken.hasLiveToken()) {
      return false;
    }

    const handoffPath = this.buildLegacyHandoffPath(currentUrl);
    if (!handoffPath) {
      return false;
    }

    this.redirecting = true;

    const base = environment.legacyAdminBaseUrl.replace(/\/+$/, '');
    const loginUrl = `${base}/UserHome/Login?returnUrl=${encodeURIComponent(handoffPath)}`;
    this.navigateToExternal(loginUrl);
    return true;
  }

  /** Full-page navigation to the legacy portal. Isolated for testability. */
  protected navigateToExternal(url: string): void {
    window.location.assign(url);
  }

  /**
   * Builds the legacy handoff path (e.g. `/AdminPortalV2/AssignVendor/{jobKey}`) for the given V2
   * route, or `null` when it is not an eligible legacy embed page.
   */
  private buildLegacyHandoffPath(currentUrl: string): string | null {
    // e.g. "/job/2b1e.../assign-vendor?foo=bar#frag" → strip query + fragment.
    const path = currentUrl.split('?')[0].split('#')[0];

    // Customer Profile pages (list / new / :id/edit) are not job-scoped: a direct hit with no live
    // session logs in via legacy and returns to the V2 customers list (`AdminPortalV2/Customers`
    // mints a fresh JWT and 302s to `/customers?token=`).
    if (/^\/customers(\/|$)/.test(path)) {
      return '/AdminPortalV2/Customers';
    }

    const match = path.match(/^\/job\/([^/]+)\/(assign-vendor|notes-activity|vendor-bills)$/);
    if (!match) {
      return null;
    }

    const jobKey = match[1];
    const legacyAction = V2_ROUTE_TO_LEGACY_ACTION[match[2]];
    return `/AdminPortalV2/${legacyAction}/${jobKey}`;
  }
}
