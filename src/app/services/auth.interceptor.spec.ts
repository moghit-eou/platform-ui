import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { withCredentialsInterceptor } from './auth.interceptor';

describe('withCredentialsInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let login: jasmine.Spy;

  beforeEach(() => {
    login = jasmine.createSpy('login');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([withCredentialsInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { login } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Sends a request and answers it the way a dead session answers: no usable status. */
  const failWith = (status: number, url = '/services/experiment-folders') => {
    let failed = false;
    http.get(url).subscribe({ error: () => (failed = true) });
    httpMock.expectOne(url).error(new ErrorEvent('network error'), { status, statusText: 'Session expired' });
    return () => failed;
  };

  it('sends cookies on same-origin API calls', () => {
    http.get('/services/experiment-folders').subscribe();
    const request = httpMock.expectOne('/services/experiment-folders');
    expect(request.request.withCredentials).toBeTrue();
    request.flush({});
  });

  it('sends the browser session back to Keycloak when the session died (status 0)', () => {
    expect(failWith(0)()).toBeTrue();
    expect(login).toHaveBeenCalled();
  });

  it('sends the browser session back to Keycloak on 401', () => {
    expect(failWith(401)()).toBeTrue();
    expect(login).toHaveBeenCalled();
  });

  it('leaves real backend failures to the caller', () => {
    expect(failWith(500)()).toBeTrue();
    expect(login).not.toHaveBeenCalled();
  });

  it('leaves the first-load auth check to AuthGuard', () => {
    expect(failWith(401, '/services/activeUser')()).toBeTrue();
    expect(login).not.toHaveBeenCalled();
  });

  it('leaves the first-load auth check to AuthGuard when it carries query params', () => {
    expect(failWith(401, '/services/activeUser?cache=1')()).toBeTrue();
    expect(login).not.toHaveBeenCalled();
  });

  it('does not treat an offline zero-status failure as an expired session', () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);

    expect(failWith(0)()).toBeTrue();
    expect(login).not.toHaveBeenCalled();
  });
});
