import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HeaderComponent } from './header.component';
import { AuthService } from '../../../services/auth.service';
import { GuideLauncherService } from '../../../services/guide-launcher.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { NotebookNavService } from '../../../services/notebook-nav.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { User } from '../../../models/user.interface';

@Component({ template: '' })
class StubStudioComponent {}

describe('HeaderComponent', () => {
  let fixture: ComponentFixture<HeaderComponent>;
  let component: HeaderComponent;
  let authService: jasmine.SpyObj<AuthService>;
  let runtimeEnv: { notebookEnabled: boolean };
  let notebookNav: jasmine.SpyObj<NotebookNavService>;
  let router: Router;

  beforeEach(async () => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn', 'login', 'logout']);
    authService.isLoggedIn.and.returnValue(true);
    // currentUser is a getter on the real service; the spy needs the property itself.
    Object.defineProperty(authService, 'currentUser', {
      value: {
        username: 'mcurie',
        fullname: 'Marie Curie',
        email: 'marie.curie@ebi.ac.uk',
        subjectId: 'orcid-0000-0002',
      } satisfies User,
    });

    notebookNav = jasmine.createSpyObj<NotebookNavService>('NotebookNavService', ['hasVisited']);
    notebookNav.hasVisited.and.returnValue(true);

    runtimeEnv = { notebookEnabled: true };

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([
          { path: 'experiments-dashboard', component: StubStudioComponent },
          { path: 'terms', component: StubStudioComponent },
          { path: 'account', component: StubStudioComponent },
          { path: 'experiment-studio', component: StubStudioComponent },
          { path: 'notebook', component: StubStudioComponent },
        ]),
        { provide: AuthService, useValue: authService },
        { provide: NotebookNavService, useValue: notebookNav },
        { provide: RuntimeEnvService, useValue: runtimeEnv },
        ExperimentStudioNavigationService,
      ],
    })
      .compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('creates header component', () => {
    expect(component).toBeTruthy();
  });

  it('renders branding and user actions in standard non-studio mode', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.branding')).toBeTruthy();
    expect(compiled.querySelector('.header-actions')).toBeTruthy();
    expect(compiled.querySelector('app-studio-stepper')).toBeNull();
  });

  it('keeps one three-slot bar on every route: branding, nav, account', async () => {
    for (const path of ['/notebook', '/experiment-studio']) {
      await router.navigateByUrl(path);
      fixture.detectChanges();

      const bar = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.header');
      const kids = Array.from(bar?.children ?? []).map((el) => el.className);
      // The nav belongs to slot 2. Nesting it back into the account slot is what made
      // the pill right-pinned, so it moved when the "Sign in" label appeared.
      expect(kids).toEqual(['branding', 'header-nav-slot', 'header-actions']);
      expect(getComputedStyle(bar as HTMLElement).display).toBe('grid');
    }
  });

  /**
   * The header charter, as one assertion: one component, one box, one surface, one logo
   * AND one set of navigation items on every route. Height, indent, surface and the nav
   * labels all ride in the signature, so a bar that re-indents or swaps its items for a
   * route — the old studio behaviour — fails here instead of in review comments.
   */
  it('keeps one box, one surface, one logo and one nav across every route', async () => {
    const signatureOf = () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const bar = compiled.querySelector<HTMLElement>('.header');
      const s = bar ? getComputedStyle(bar) : null;
      const logo = compiled.querySelector<HTMLImageElement>('.branding .logo');
      return [
        s?.height,
        s?.paddingLeft,
        s?.backgroundColor,
        s?.borderBottomWidth,
        s?.boxShadow,
        logo?.getAttribute('src'),
        logo ? getComputedStyle(logo).height : null,
        Array.from(compiled.querySelectorAll('.header-nav-slot .header-nav-link__title'))
          .map((el) => el.textContent?.trim())
          .join(','),
      ].join('|');
    };

    let baseline: string | undefined;
    for (const path of ['/experiments-dashboard', '/terms', '/account', '/notebook', '/experiment-studio']) {
      await router.navigateByUrl(path);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.header')).toBeTruthy();

      const signature = signatureOf();
      // A bar that fell back to `auto` would match itself everywhere and prove nothing.
      expect(signature.split('|')[0]).not.toBe('auto');
      baseline ??= signature;
      expect({ path, signature }).toEqual({ path, signature: baseline });
    }

    // Same items is not the same as same page: exactly one of them is current.
    await router.navigateByUrl('/experiment-studio');
    fixture.detectChanges();
    const current = (fixture.nativeElement as HTMLElement).querySelectorAll('[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('Studio');
  });

  it('keeps the account slot one control wide in both auth states', () => {
    const slotOf = (el: HTMLElement) => el.querySelector('.header-actions');
    expect(slotOf(fixture.nativeElement)?.querySelector('.sign-in-btn')).toBeTruthy();

    // A fresh fixture, not a re-render: the slot is OnPush behind a plain method call,
    // so flipping the spy after the first check is not something the app can do either.
    authService.isLoggedIn.and.returnValue(false);
    const signedOut = TestBed.createComponent(HeaderComponent);
    signedOut.detectChanges();

    const actions = slotOf(signedOut.nativeElement as HTMLElement);
    expect(actions?.querySelector('.sign-in-btn__label')?.textContent).toContain('Sign in');
    expect(actions?.querySelector('.account-picture')).toBeTruthy();
    expect(actions?.querySelector('[data-guide="header-account"]')).toBeTruthy();
    expect(actions?.querySelector('.sign-in-btn')?.getAttribute('data-guide')).toBe('header-account');
  });

  /**
   * The avatar used to be a link whose destination held the only Sign Out button in the
   * product. As a trigger it must stay a real menu: aria state on the toggle, CdkMenu's
   * roles, and focus that comes back when the menu goes away.
   */
  it('opens the account menu and hands focus back on Escape', async () => {
    await router.navigateByUrl('/account');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const toggle = compiled.querySelector<HTMLButtonElement>('button.sign-in-btn');
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('aria-haspopup')).toBe('menu');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    toggle?.click();
    fixture.detectChanges();

    const menu = compiled.querySelector<HTMLElement>('.account-menu');
    expect(menu).toBeTruthy();
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(compiled.querySelectorAll('[role="menuitem"]').length).toBe(2);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-controls')).toBe(menu?.id);

    menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(compiled.querySelector('.account-menu')).toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('closes on an outside pointer and on navigation, and signs out from the menu', async () => {
    await router.navigateByUrl('/account');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const toggle = compiled.querySelector<HTMLButtonElement>('button.sign-in-btn');
    expect(toggle).toBeTruthy();

    toggle?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('.account-menu')).toBeTruthy();

    // A click elsewhere is the user choosing something else: close, do not steal focus.
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(compiled.querySelector('.account-menu')).toBeNull();

    toggle?.click();
    fixture.detectChanges();
    await router.navigateByUrl('/notebook');
    fixture.detectChanges();
    expect(compiled.querySelector('.account-menu')).toBeNull();

    toggle?.click();
    fixture.detectChanges();
    compiled.querySelectorAll<HTMLElement>('[role="menuitem"]')[1].click();
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('wears the shadow only once the page has moved under the bar', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const bar = compiled.querySelector<HTMLElement>('.header');
    expect(bar).toBeTruthy();
    const original = Object.getOwnPropertyDescriptor(window, 'scrollY');

    try {
      Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 420 });
      window.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      expect(bar?.classList.contains('header--scrolled')).toBe(true);

      Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 0 });
      window.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      expect(bar?.classList.contains('header--scrolled')).toBe(false);
    } finally {
      // The last definition is 0, which is what the runner's window actually reports.
      if (original) {
        Object.defineProperty(window, 'scrollY', original);
      }
    }
  });

  it('marks Studio as current and keeps My experiments on the studio route', async () => {
    await router.navigateByUrl('/experiment-studio');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(component.isStudioRoute()).toBe(true);
    expect(compiled.querySelector('app-studio-stepper')).toBeNull();
    const myExpBtn = compiled.querySelector<HTMLAnchorElement>('.header-nav-link--dashboard');
    expect(myExpBtn?.textContent).toContain('My experiments');
    expect(compiled.querySelector('.header-nav-link--studio')?.getAttribute('aria-current')).toBe('page');
    expect(compiled.querySelector('.sign-in-btn__label')?.textContent?.trim()).toBe('Marie Curie');
  });

  /**
   * The nav draws two things and no third: hover, and the notebook's first-visit edge.
   * The current page used to get a tinted, bordered pill — one nav item wearing three
   * layers of chrome — and is now marked only by aria-current, which nothing here styles.
   */
  it('draws nav chrome on hover and first visit, never on the current page', async () => {
    await router.navigateByUrl('/experiment-studio');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const flatOf = (sel: string) => {
      const s = getComputedStyle(compiled.querySelector<HTMLElement>(sel) as HTMLElement);
      return [s.backgroundColor, s.borderTopColor];
    };
    expect(flatOf('.header-nav-link')).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
    expect(getComputedStyle(compiled.querySelector('.header-nav-link') as HTMLElement).borderRadius).toBe('999px');

    // The route's own item is the current one and still draws nothing.
    const current = compiled.querySelector<HTMLElement>('.header-nav-link--studio');
    expect(current?.getAttribute('aria-current')).toBe('page');
    expect(flatOf('.header-nav-link--studio')).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);

    // The hairline that ends the brand is drawn because the nav is there — and the nav
    // is there on every route now, so the bar never shows an un-divided middle.
    const slot = compiled.querySelector<HTMLElement>('.header-nav-slot');
    expect(getComputedStyle(slot as HTMLElement, '::before').content).not.toBe('none');
  });

  /**
   * The Guide control moved out of the pages that owned it: it used to float over the
   * bar at z 10001 with a hardcoded right offset, which the wider account slot would
   * have landed on. Pages hand the bar a label and a start function instead.
   */
  it('shows the Guide control only for a page that registered one', async () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.header-guide')).toBeNull();

    const start = jasmine.createSpy('startGuide');
    const launchers = TestBed.inject(GuideLauncherService);
    const handle = { label: 'Guide', start };
    launchers.register(handle);
    fixture.detectChanges();

    const guide = compiled.querySelector<HTMLButtonElement>('.header-guide');
    expect(guide?.textContent).toContain('Guide');
    // The studio tour spotlights this selector; moving the control kept the hook.
    expect(guide?.getAttribute('data-guide')).toBe('launcher');
    guide?.click();
    expect(start).toHaveBeenCalled();

    launchers.unregister(handle);
    fixture.detectChanges();
    expect(compiled.querySelector('.header-guide')).toBeNull();
  });

  it('delegates to studio navigation when clicking My experiments', async () => {
    const studioNav = TestBed.inject(ExperimentStudioNavigationService);
    spyOn(studioNav, 'backToDashboard');

    await router.navigateByUrl('/experiment-studio');
    fixture.detectChanges();

    const myExpBtn = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.header-nav-link--dashboard');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    myExpBtn?.dispatchEvent(click);

    expect(studioNav.backToDashboard).toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
    await fixture.whenStable();
    // The host is the one that owns the exit path; the header must not race it with a
    // second navigation or bypass the studio's running guard.
    expect(router.url).toBe('/experiment-studio');
  });

  it('leaves modifier and middle clicks to the browser', async () => {
    const studioNav = TestBed.inject(ExperimentStudioNavigationService);
    const back = spyOn(studioNav, 'backToDashboard');

    await router.navigateByUrl('/experiment-studio');
    fixture.detectChanges();

    const pill = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.header-nav-link--dashboard');
    if (!pill) throw new Error('studio pill missing');

    // Registered after Angular's (click) listener, so it observes what the component
    // decided and then cancels the navigation the browser would otherwise perform.
    let preventedByComponent = true;
    pill.addEventListener('click', (event) => {
      preventedByComponent = event.defaultPrevented;
      event.preventDefault();
    });

    for (const init of [
      { button: 1 },
      { button: 0, metaKey: true },
      { button: 0, ctrlKey: true },
      { button: 0, shiftKey: true },
    ]) {
      pill.dispatchEvent(new MouseEvent('click', { ...init, bubbles: true, cancelable: true }));
      expect(preventedByComponent).toBe(false);
    }
    expect(back).not.toHaveBeenCalled();

    // A plain left click is the component's to handle.
    pill.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(preventedByComponent).toBe(true);
  });

  it('marks the notebook link as the current page', async () => {
    await router.navigate(['/notebook']);
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.header-nav-link--notebook');
    expect(link?.getAttribute('aria-current')).toBe('page');
  });
});
