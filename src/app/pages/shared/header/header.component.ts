import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { AuthService } from '../../../services/auth.service';
import { RuntimeEnvService } from '../../../services/runtime-env.service';
import { NotebookNavService } from '../../../services/notebook-nav.service';
import { ExperimentStudioNavigationService } from '../../../services/experiment-studio-navigation.service';
import { GuideLauncherService } from '../../../services/guide-launcher.service';
import { isRoutePath } from '../../../core/route-path.utils';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Renderer2,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, filter, fromEvent, map, startWith } from 'rxjs';

/**
 * Modifier and non-primary clicks belong to the browser: ⌘/Ctrl/middle-click on the logo
 * or the studio pill must still be able to open a tab. Swallowing every click made the
 * advertised routerLink/href a lie.
 */
function isPlainLeftClick(event?: Event): boolean {
  if (!event) return true;
  const { button, metaKey, ctrlKey, shiftKey, altKey } = event as MouseEvent;
  return button === 0 && !metaKey && !ctrlKey && !shiftKey && !altKey;
}

@Component({
  selector: 'app-header',
  imports: [RouterModule, CdkMenu, CdkMenuItem],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private router = inject(Router);
  authService = inject(AuthService);
  readonly runtimeEnv = inject(RuntimeEnvService);
  readonly notebookNav = inject(NotebookNavService);
  readonly studioNav = inject(ExperimentStudioNavigationService);

  readonly notebookRouteActive = this.trackRouteActive(() => this.isNotebookRoute());
  readonly isStudioRoute = this.trackRouteActive(() => this.isExperimentStudioRoute());
  readonly isDashboardRoute = this.trackRouteActive(() => this.isDashboardPath());

  /** Which guide (if any) owns the current page. The guide registers itself and the bar
   *  only draws what it is given, so the slot's shape never changes between routes. */
  private readonly guideLaunchers = inject(GuideLauncherService);
  readonly guideLauncher = computed(() => this.guideLaunchers.launcher());

  /** The signed-in label. `fullname` is what the account page shows, so the bar cannot
   *  disagree with it; username is the fallback, never the raw email. */
  readonly displayName = computed(() => {
    const user = this.authService.currentUser;
    return user?.fullname?.trim() || user?.username?.trim() || 'Account';
  });

  /**
   * Flat hairline at rest, elevation only once content has moved under the bar. The
   * shadow exists to separate the chrome from what scrolled beneath it; at scrollTop 0
   * there is nothing there, so the bar was wearing depth it had no use for. One boolean
   * off a passive listener — nothing reads scroll position per frame.
   */
  readonly isScrolled = toSignal(
    fromEvent(window, 'scroll', { passive: true }).pipe(
      map(() => window.scrollY > 0),
      startWith(window.scrollY > 0),
      distinctUntilChanged(),
    ),
    { initialValue: window.scrollY > 0 },
  );

  /** The account control is a menu trigger, not a link to a page whose real job was to
   *  hold a "Sign Out" button. One instance, so one static id wires aria-controls. */
  readonly accountMenuId = 'mip-account-menu';
  readonly accountMenuOpen = signal(false);

  private readonly renderer = inject(Renderer2);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accountMenu = viewChild(CdkMenu);
  /* ElementRef is the read type for a string locator: typing these as the node itself
     compiles and then hands back an ElementRef, so `.focus()`/`.contains()` blow up at
     runtime with no type error anywhere to predict it. */
  private readonly accountToggle = viewChild<ElementRef<HTMLButtonElement>>('accountToggle');
  private readonly accountControl = viewChild<ElementRef<HTMLElement>>('accountControl');
  private unlistenOutsideClick: (() => void) | null = null;

  constructor() {
    // Back/forward and any other route change close the menu too, so the outside-pointer
    // listener never outlives the page the menu was opened on.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeAccountMenu({ restoreFocus: false }));
    this.destroyRef.onDestroy(() => this.unlistenOutsideClick?.());
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  login(): void {
    // Always route back to dashboard after login for a clean start
    this.authService.login();
  }

  signOut(): void {
    // The menu goes first: logout is a hard redirect, so the surface should not sit open
    // through the unload — and it stays closed if logout ever stops being one.
    this.closeAccountMenu({ restoreFocus: false });
    this.authService.logout();
  }

  toggleAccountMenu(): void {
    if (this.accountMenuOpen()) {
      this.closeAccountMenu();
    } else {
      this.openAccountMenu();
    }
  }

  private openAccountMenu(): void {
    this.accountMenuOpen.set(true);
    // The menu is an @if, so its node — and CdkMenu's roving tabindex — exists only after
    // this render. CdkMenu owns arrows/Home/End/typeahead; focus still has to arrive, or
    // a keyboard user opens a menu made of tabindex="-1" rows they cannot reach.
    this.cdr.detectChanges();
    this.accountMenu()?.focusFirstItem();

    // The opening click is already past pointerdown, so the next one is either outside
    // (close, and leave focus where the user put it) or the toggle itself, whose click
    // handler closes. Registered imperatively so it exists exactly while the menu does.
    this.unlistenOutsideClick = this.renderer.listen(document, 'pointerdown', (event: PointerEvent) => {
      const control = this.accountControl()?.nativeElement;
      if (control && !control.contains(event.target as Node)) {
        this.closeAccountMenu({ restoreFocus: false });
      }
    });
  }

  /** Escape returns focus to the trigger; a click elsewhere must not steal it. */
  closeAccountMenu(options: { restoreFocus?: boolean } = {}): void {
    if (!this.accountMenuOpen()) return;
    this.accountMenuOpen.set(false);
    this.unlistenOutsideClick?.();
    this.unlistenOutsideClick = null;
    if (options.restoreFocus !== false) {
      this.accountToggle()?.nativeElement.focus();
    }
  }

  /** One NavigationEnd subscription for each route flag the bar toggles. */
  private trackRouteActive(isActive: () => boolean) {
    return toSignal(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        map(() => isActive()),
        startWith(isActive()),
      ),
      { initialValue: isActive() },
    );
  }

  goHome(event?: Event): void {
    if (!isPlainLeftClick(event)) return;
    event?.preventDefault();
    if (this.isStudioRoute()) {
      // The studio host owns its own exit path: it may need to block navigation while an
      // experiment is running and it already resets studio state before routing away.
      this.studioNav.backToDashboard();
      return;
    }
    void this.router.navigate(['/experiments-dashboard']);
  }

  private isNotebookRoute(): boolean {
    return this.onPath('/notebook');
  }

  private isExperimentStudioRoute(): boolean {
    // Same shape as the notebook check: a nested studio path must keep the nav's current
    // state and the state-preserving back action, not silently drop out of them.
    return this.onPath('/experiment-studio');
  }

  private isDashboardPath(): boolean {
    return this.onPath('/experiments-dashboard');
  }

  private onPath(prefix: string): boolean {
    return isRoutePath(this.router.url, prefix);
  }
}
