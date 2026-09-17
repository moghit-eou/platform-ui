import { FooterComponent } from './pages/shared/footer/footer.component';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HeaderComponent } from './pages/shared/header/header.component';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from './services/auth.service';
import { isRoutePath } from './core/route-path.utils';
import { filter, map, startWith } from 'rxjs';

@Component({
    selector: 'app-root',
    imports: [HeaderComponent, FooterComponent, RouterModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  authService = inject(AuthService);
  private router = inject(Router);

  readonly notebookRouteActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.isNotebookRoute()),
      startWith(this.isNotebookRoute()),
    ),
    { initialValue: this.isNotebookRoute() },
  );

  ngOnInit() {
    this.authService.initialize();
  }

  private isNotebookRoute(): boolean {
    return isRoutePath(this.router.url, '/notebook');
  }

}
