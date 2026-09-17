import { AuthGuard } from './guards/auth.guard';
import { TermsGuard } from './guards/terms.guard';
import { appRoutes } from './app.routes';

describe('appRoutes', () => {
  it('lets authenticated users open the dashboard without a studio-guide gate', () => {
    const dashboard = appRoutes.find((route) => route.path === 'experiments-dashboard');

    expect(dashboard?.canActivate).toEqual([AuthGuard, TermsGuard]);
  });
});
