import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { sessionExpiryInterceptor } from './interceptors/session-expiry.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // authInterceptor attaches the Bearer token on the way out; sessionExpiryInterceptor catches a
    // 401 on the way back and redirects to the legacy login with a returnUrl to this page.
    provideHttpClient(withInterceptors([authInterceptor, sessionExpiryInterceptor])),
  ],
};
