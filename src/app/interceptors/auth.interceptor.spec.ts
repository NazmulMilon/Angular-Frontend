import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthTokenService } from '../services/auth-token.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let token: string;

  beforeEach(() => {
    token = 'admin-jwt';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthTokenService,
          useValue: { getToken: () => token },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('adds the admin bearer token to SystemSetupData requests', () => {
    const url = 'https://jobops.test/RFISystemData/SystemSetupData/get-trades';

    http.get(url).subscribe();

    const request = httpMock.expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe('Bearer admin-jwt');
    request.flush({ data: [] });
  });

  it('leaves requests unchanged when no token is available', () => {
    token = '';
    const url = 'https://jobops.test/api/v1/admin/job-vendor/assign-page/job-key';

    http.get(url).subscribe();

    const request = httpMock.expectOne(url);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ data: null });
  });
});
