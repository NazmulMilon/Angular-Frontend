import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthTokenService } from '../services/auth-token.service';
import { environment } from '../../environments/environment';

/**
 * `SystemSetupData` endpoints authenticate via a shared `RFIApiKey` header instead of a user
 * JWT (see context/HANDOFF-SystemSetupData-Auth-Change.md). On these routes we send `RFIApiKey`
 * and must NOT send a Bearer token.
 */
const SYSTEM_SETUP_DATA_PATH = 'RFISystemData/SystemSetupData';

/**
 * Attaches `Authorization: Bearer <jwt>` when {@link AuthTokenService#getToken} is non-empty.
 * For `SystemSetupData` routes, attaches the shared `RFIApiKey` header instead.
 * When the token is missing, the request is forwarded unchanged (Job Ops returns 401; {@link AssignVendorService} surfaces client-side diagnostics).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes(SYSTEM_SETUP_DATA_PATH)) {
    if (environment.rfiApiKey) {
      return next(req.clone({ setHeaders: { RFIApiKey: environment.rfiApiKey } }));
    }
    return next(req);
  }

  const tokenService = inject(AuthTokenService);
  const token = tokenService.getToken();

  if (token) {
    const cloned = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
    return next(cloned);
  }

  return next(req);
};
