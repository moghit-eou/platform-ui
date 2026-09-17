import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { SafeResourceUrl } from '@angular/platform-browser';
import { BrowserTestingModule } from '@angular/platform-browser/testing';

import { NotebookComponent } from './notebook.component';
import { NotebookNavService } from '../../services/notebook-nav.service';

function unwrapSafeUrl(value: SafeResourceUrl | null): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return (value as unknown as { changingThisBreaksApplicationSecurity: string })
    .changingThisBreaksApplicationSecurity;
}

async function settleComponent(
  fixture: ComponentFixture<NotebookComponent>,
  rounds = 8,
): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function hubUserResponse(name: string, ready: boolean, pending: string | null = null): Response {
  return new Response(JSON.stringify({
    name,
    servers: {
      '': {
        ready,
        pending,
      },
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isHubHomeRequest(url: string): boolean {
  return url.includes('/hub/home');
}

function isHubUserRequest(url: string): boolean {
  return url.includes('/hub/api/user') && !url.includes('/hub/api/users/');
}

function isSpawnRequest(url: string, init?: RequestInit): boolean {
  return url.includes('/hub/api/users/alice/server') && init?.method === 'POST';
}

describe('NotebookComponent', () => {
  let component: NotebookComponent;
  let fixture: ComponentFixture<NotebookComponent>;
  let fetchSpy: jasmine.Spy<typeof fetch>;

  beforeEach(async () => {
    localStorage.clear();
    (window as Window & { __env?: Record<string, string> }).__env = {
      JUPYTER_CONTEXT_PATH: '/notebook',
    };
    document.cookie = '_xsrf=test-token';

    fetchSpy = spyOn(window, 'fetch').and.callFake(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (isHubHomeRequest(url)) {
        return hubHomeResponse();
      }
      if (isHubUserRequest(url)) {
        return hubUserResponse('alice', true);
      }
      if (isSpawnRequest(url, init)) {
        return new Response(null, { status: 202 });
      }
      return new Response(null, { status: 404 });
    });

    await TestBed.configureTestingModule({
      imports: [NotebookComponent, BrowserTestingModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotebookComponent);
    component = fixture.componentInstance;
  });

    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie = '_xsrf=; Max-Age=0';
        window.history.replaceState({}, '', '/');
    });

    function hubHomeResponse(): Response {
        return new Response('<script>xsrf_token: "test-token",</script>', { status: 200 });
    }

  it('marks the notebook nav as visited on init', async () => {
    const notebookNav = TestBed.inject(NotebookNavService);
    expect(notebookNav.hasVisited()).toBeFalse();

    await settleComponent(fixture);

    expect(notebookNav.hasVisited()).toBeTrue();
  });

  it('embeds JupyterLab when the Hub session is available', async () => {
    await settleComponent(fixture);

    const userCall = fetchSpy.calls.allArgs().find(([url]) => isHubUserRequest(String(url)));
    expect(userCall).toBeDefined();
    expect((userCall![1] as RequestInit).credentials).toBe('include');
    expect(unwrapSafeUrl(component.jupyterUrl())).toBe('/notebook/user/alice/lab');
    expect(component.spawnError()).toBeNull();
    expect(component.loadingMessage()).toBe('Opening JupyterLab…');
  });

  it('retries opening JupyterLab after Hub session recovery succeeds', async () => {
    let hubUserCalls = 0;
    fetchSpy.and.callFake(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (isHubHomeRequest(url)) {
        return hubHomeResponse();
      }
      if (isSpawnRequest(url, init)) {
        return new Response(null, { status: 202 });
      }
      if (isHubUserRequest(url)) {
        hubUserCalls += 1;
        if (hubUserCalls === 2) {
          return new Response(null, { status: 401 });
        }
        return hubUserResponse('alice', true);
      }
      return new Response(null, { status: 404 });
    });

    await settleComponent(fixture);

    expect(hubUserCalls).toBeGreaterThanOrEqual(4);
    expect(unwrapSafeUrl(component.jupyterUrl())).toBe('/notebook/user/alice/lab');
    expect(component.spawnError()).toBeNull();
  });

  it('starts the server when it is not running yet', async () => {
    let userPolls = 0;
    fetchSpy.and.callFake(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (isHubHomeRequest(url)) {
        return hubHomeResponse();
      }
      if (isSpawnRequest(url, init)) {
        return new Response(null, { status: 202 });
      }
      if (isHubUserRequest(url)) {
        userPolls += 1;
        if (userPolls <= 3) {
          return hubUserResponse('alice', false, null);
        }
        if (userPolls === 4) {
          return hubUserResponse('alice', false, 'spawn');
        }
        return hubUserResponse('alice', true, null);
      }
      return new Response(null, { status: 404 });
    });

    await settleComponent(fixture);
    await new Promise((resolve) => setTimeout(resolve, 4500));
    fixture.detectChanges();

    const spawnCall = fetchSpy.calls.allArgs().find(([url, init]) => isSpawnRequest(String(url), init as RequestInit));
    expect(spawnCall).toBeDefined();
    expect(unwrapSafeUrl(component.jupyterUrl())).toBe('/notebook/user/alice/lab');
  });

  it('surfaces timeout errors inside the loading overlay', async () => {
    fetchSpy.and.callFake(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (isHubHomeRequest(url)) {
        return hubHomeResponse();
      }
      if (isHubUserRequest(url)) {
        return hubUserResponse('alice', false, 'spawn');
      }
      if (isSpawnRequest(url, init)) {
        return new Response(null, { status: 202 });
      }
      return new Response(null, { status: 404 });
    });

    await settleComponent(fixture, 2);

    component.spawnError.set('Timed out waiting for notebook server to start. Please try again.');
    component.loadingMessage.set('Notebook server unavailable');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.loading-overlay')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.loading-error')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Try again');
  });

  it('keeps the loading overlay visible while spawn is in progress', async () => {
    fetchSpy.and.callFake(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (isHubHomeRequest(url)) {
        return hubHomeResponse();
      }
      if (isSpawnRequest(url, init)) {
        return new Response(null, { status: 202 });
      }
      if (isHubUserRequest(url)) {
        return hubUserResponse('alice', false, 'spawn');
      }
      return new Response(null, { status: 404 });
    });

    await settleComponent(fixture, 3);

    expect(component.isLoading()).toBeTrue();
    expect(component.loadingMessage().toLowerCase()).toContain('notebook server');
  });

  it('retrySpawn clears the previous error and re-enters loading', async () => {
    component.spawnError.set('Timed out waiting for notebook server to start. Please try again.');
    component.isLoading.set(true);

    void component.retrySpawn();
    await settleComponent(fixture, 4);

    expect(component.spawnError()).toBeNull();
    expect(unwrapSafeUrl(component.jupyterUrl())).toBe('/notebook/user/alice/lab');
  });

  it('shows an error when the Hub session never becomes available', async () => {
    sessionStorage.setItem('mip_notebook_hub_login_redirect_ts', String(Date.now()));
    fetchSpy.and.callFake(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/hub/api/user') || url.includes('/hub/home')) {
        return new Response(null, { status: 401 });
      }
      return new Response(null, { status: 404 });
    });

    await settleComponent(fixture, 2);
    await new Promise((resolve) => setTimeout(resolve, 5500));
    fixture.detectChanges();

    expect(component.spawnError()).toContain('Notebook sign-in did not complete');
    expect(component.jupyterUrl()).toBeNull();
  }, 12000);

  it('waits longer when returning from a pending Hub login', async () => {
    sessionStorage.setItem('mip_notebook_hub_login_pending', '1');
    let apiCalls = 0;
    fetchSpy.and.callFake(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/hub/home')) {
        return hubHomeResponse();
      }
      if (url.includes('/hub/api/user')) {
        apiCalls += 1;
        if (apiCalls < 4) {
          return new Response(null, { status: 401 });
        }
        return hubUserResponse('alice', true);
      }
      if (isSpawnRequest(url, init)) {
        return new Response(null, { status: 202 });
      }
      return new Response(null, { status: 404 });
    });

    await settleComponent(fixture, 2);

    const deadline = Date.now() + 8000;
    while (!unwrapSafeUrl(component.jupyterUrl()) && Date.now() < deadline) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(apiCalls).toBeGreaterThanOrEqual(4);
    expect(unwrapSafeUrl(component.jupyterUrl())).toBe('/notebook/user/alice/lab');
  }, 12000);
});
