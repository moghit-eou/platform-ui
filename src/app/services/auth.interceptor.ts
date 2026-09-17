import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

const absoluteUrlPattern = /^https?:\/\//i;
const authProbePath = '/services/activeUser';

export const withCredentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.withCredentials || absoluteUrlPattern.test(req.url)) {
    return next(req);
  }

  // inject() only works while the interceptor itself runs, not inside async operators.
  const auth = inject(AuthService);

  return next(req.clone({ withCredentials: true })).pipe(
    catchError((error: unknown) => {
      // A stale session is answered with a 302 to the IdP, which the XHR follows cross-origin,
      // so Angular reports status 0; a request that carried no cookie sees 401. Both mean "sign
      // in again", and only a top-level navigation can do that — HttpClient will not.
      // /services/activeUser is excluded: AuthGuard owns that first-load decision.
      // A zero status while the browser is offline is a network failure, not an expired session.
      const status = error instanceof HttpErrorResponse ? error.status : -1;
      const offlineNetworkFailure = status === 0 && typeof navigator !== 'undefined' && !navigator.onLine;
      const sessionLost = (status === 401 || status === 0) && !offlineNetworkFailure;
      const requestPath = req.url.split('?')[0];
      if (sessionLost && requestPath.startsWith('/services/') && requestPath !== authProbePath) {
        auth.login(`${window.location.pathname}${window.location.search}${window.location.hash}`);
      }
      return throwError(() => error);
    }),
  );
};
