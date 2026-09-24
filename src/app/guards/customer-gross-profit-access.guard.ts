import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthTokenService } from '../services/auth-token.service';

/**
 * Restricts the Customer Gross Profit report to sessions that have a JWT:
 * either from ?token= on first entry (legacy Admin Portal redirect) or from
 * localStorage after a prior authorized load.
 */
export const customerGrossProfitAccessGuard: CanActivateFn = () => {
  const auth = inject(AuthTokenService);
  const router = inject(Router);

  if (auth.getToken().trim().length > 0) {
    return true;
  }

  return router.parseUrl('/');
};
