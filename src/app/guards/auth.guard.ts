import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthTokenService } from '../services/auth-token.service';
import { SessionRedirectService } from '../services/session-redirect.service';

/**
 * Runs before the legacy job embed routes (`job/:jobKey/assign-vendor`, `.../notes-activity`,
 * `.../vendor-bills`). Injecting {@link AuthTokenService} first lets it capture the JWT from
 * `?token=` (legacy handoff) or `localStorage` before we inspect it.
 *
 * If there is a **live** token (present and not expired) the route activates normally. Otherwise
 * the session is gone — we send the browser to the legacy login with a `returnUrl` back to this
 * exact page (see {@link SessionRedirectService}) and block activation, so the user never sees the
 * embed render a wall of `401` errors. After login, legacy mints a fresh JWT and returns here.
 *
 * A token that expires *after* the guard has passed is caught later by `sessionExpiryInterceptor`
 * on the first `401`.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const authToken = inject(AuthTokenService);
  const sessionRedirect = inject(SessionRedirectService);

  if (authToken.hasLiveToken()) {
    return true;
  }

  // No usable session: bounce to legacy login (returnUrl → this page) and cancel this navigation.
  sessionRedirect.redirectToLegacyLogin(state.url);
  return false;
};
