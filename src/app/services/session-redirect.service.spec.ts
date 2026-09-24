import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { environment } from '../../environments/environment';
import { AuthTokenService } from './auth-token.service';
import { SessionRedirectService } from './session-redirect.service';

describe('SessionRedirectService', () => {
  let router: { url: string };
  let authToken: { hasLiveToken: jasmine.Spy };
  let navigated: string[];

  // `live` = a present, non-expired token (should NOT redirect). Default false = session gone.
  function makeService(routerUrl: string, live = false): SessionRedirectService {
    router = { url: routerUrl };
    authToken = { hasLiveToken: jasmine.createSpy('hasLiveToken').and.returnValue(live) };
    navigated = [];

    TestBed.configureTestingModule({
      providers: [
        SessionRedirectService,
        { provide: Router, useValue: router },
        { provide: AuthTokenService, useValue: authToken },
      ],
    });

    const service = TestBed.inject(SessionRedirectService);
    // Capture the destination instead of performing a real full-page navigation.
    spyOn(service as unknown as { navigateToExternal: (u: string) => void }, 'navigateToExternal')
      .and.callFake((url: string) => navigated.push(url));
    return service;
  }

  const base = environment.legacyAdminBaseUrl.replace(/\/+$/, '');

  it('redirects to legacy login with a returnUrl to the AssignVendor handoff', () => {
    const service = makeService('/job/JOB-123/assign-vendor');

    expect(service.redirectToLegacyLogin()).toBeTrue();
    expect(navigated).toEqual([
      `${base}/UserHome/Login?returnUrl=${encodeURIComponent('/AdminPortalV2/AssignVendor/JOB-123')}`,
    ]);
  });

  it('maps the vendor-bills route (Estimates tab lives here) to the VendorBills handoff', () => {
    const service = makeService('/job/JOB-9/vendor-bills?tab=estimates#top');

    expect(service.redirectToLegacyLogin()).toBeTrue();
    expect(navigated).toEqual([
      `${base}/UserHome/Login?returnUrl=${encodeURIComponent('/AdminPortalV2/VendorBills/JOB-9')}`,
    ]);
  });

  it('maps the notes-activity route to the NotesActivity handoff', () => {
    const service = makeService('/job/JOB-7/notes-activity');

    expect(service.redirectToLegacyLogin()).toBeTrue();
    expect(navigated).toEqual([
      `${base}/UserHome/Login?returnUrl=${encodeURIComponent('/AdminPortalV2/NotesActivity/JOB-7')}`,
    ]);
  });

  it('does NOT redirect when a live (non-expired) token is present (401 from another cause)', () => {
    const service = makeService('/job/JOB-123/assign-vendor', /* live */ true);

    expect(service.redirectToLegacyLogin()).toBeFalse();
    expect(navigated).toEqual([]);
  });

  it('uses an explicitly supplied target URL (guard path) over the router URL', () => {
    const service = makeService('/'); // router still on home during canActivate
    router.url = '/';

    expect(service.redirectToLegacyLogin('/job/JOB-42/notes-activity')).toBeTrue();
    expect(navigated).toEqual([
      `${base}/UserHome/Login?returnUrl=${encodeURIComponent('/AdminPortalV2/NotesActivity/JOB-42')}`,
    ]);
  });

  it('does nothing on routes that are not job-scoped legacy embeds', () => {
    const service = makeService('/reports/customer-gross-profit');

    expect(service.redirectToLegacyLogin()).toBeFalse();
    expect(navigated).toEqual([]);
  });

  it('redirects only once when multiple requests fail concurrently', () => {
    const service = makeService('/job/JOB-123/assign-vendor');

    expect(service.redirectToLegacyLogin()).toBeTrue();
    expect(service.redirectToLegacyLogin()).toBeTrue();
    expect(navigated.length).toBe(1);
  });
});
