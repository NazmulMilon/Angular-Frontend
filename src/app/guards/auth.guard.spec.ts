import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

import { AuthTokenService } from '../services/auth-token.service';
import { SessionRedirectService } from '../services/session-redirect.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let authToken: { hasLiveToken: jasmine.Spy };
  let sessionRedirect: { redirectToLegacyLogin: jasmine.Spy };

  function run(live: boolean, url = '/job/JOB-1/assign-vendor'): boolean {
    authToken = { hasLiveToken: jasmine.createSpy('hasLiveToken').and.returnValue(live) };
    sessionRedirect = {
      redirectToLegacyLogin: jasmine.createSpy('redirectToLegacyLogin').and.returnValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthTokenService, useValue: authToken },
        { provide: SessionRedirectService, useValue: sessionRedirect },
      ],
    });

    return TestBed.runInInjectionContext(
      () =>
        authGuard(
          {} as ActivatedRouteSnapshot,
          { url } as RouterStateSnapshot,
        ) as boolean,
    );
  }

  it('activates the route when a live token is present', () => {
    expect(run(true)).toBeTrue();
    expect(sessionRedirect.redirectToLegacyLogin).not.toHaveBeenCalled();
  });

  it('blocks activation and redirects to legacy login (with the target URL) when no live token', () => {
    const result = run(false, '/job/JOB-1/vendor-bills');

    expect(result).toBeFalse();
    expect(sessionRedirect.redirectToLegacyLogin).toHaveBeenCalledWith('/job/JOB-1/vendor-bills');
  });
});
