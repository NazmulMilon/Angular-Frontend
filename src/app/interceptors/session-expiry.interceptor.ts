import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { SessionRedirectService } from '../services/session-redirect.service';

/**
 * True when the request targets one of the APIs that authenticate with the legacy-issued JWT
 * (Job Ops API or Email API). A 401 from either means the token is missing/expired.
 */
function isJwtProtectedApi(url: string): boolean {
  const apiBase = environment.apiBaseUrl?.trim() ?? '';
  const emailBase = environment.emailServiceApiUrl?.trim() ?? '';
  return (
    (apiBase.length > 0 && url.startsWith(apiBase)) ||
    (emailBase.length > 0 && url.startsWith(emailBase))
  );
}

/**
 * Detects an expired/invalid JWT on the job-scoped legacy embed pages and hands off to
 * {@link SessionRedirectService} to bounce through the legacy login and back (with `returnUrl`).
 *
 * Only reacts to `401 Unauthorized` from the JWT-protected APIs. Other statuses (403, 5xx, network
 * errors) and 401s from unrelated hosts are passed through unchanged so components keep their
 * existing error handling. The redirect itself is gated by {@link SessionRedirectService}, which
 * fires **only** when the JWT has actually expired and the current route is an eligible embed page;
 * a valid-but-rejected token or any other route is a no-op and the error propagates as before.
 */
export const sessionExpiryInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionRedirect = inject(SessionRedirectService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        isJwtProtectedApi(req.url)
      ) {
        sessionRedirect.redirectToLegacyLogin();
      }
      return throwError(() => error);
    }),
  );
};
