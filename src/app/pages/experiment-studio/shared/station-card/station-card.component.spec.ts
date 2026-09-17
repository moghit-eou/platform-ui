import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StationCardComponent } from './station-card.component';

@Component({
  standalone: true,
  imports: [StationCardComponent],
  template: `
    <app-station-card
      icon="fas fa-eraser"
      title="Missing Values"
      description="Default: NA removal."
      [statusLabel]="label()"
      [status]="status()"
      [collapsible]="true"
      [open]="open()"
      (openChange)="open.set($event)">
      <p class="body">station body</p>
      <button stationAction type="button" class="host-action">Remove Step</button>
      <button stationFooter type="button">Apply</button>
    </app-station-card>
  `,
})
class HostComponent {
  readonly open = signal(false);
  readonly label = signal('Pending');
  readonly status = signal<'default' | 'pending' | 'applied'>('pending');
}

@Component({
  standalone: true,
  imports: [StationCardComponent],
  template: `<app-station-card><p class="body">only body</p></app-station-card>`,
})
class HeaderlessHost {}

describe('StationCardComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  function html(): HTMLElement {
    return fixture.nativeElement;
  }

  /** Zoneless: signal writes are what mark the fixture dirty, so state is driven through signals. */
  function render(state: { open?: boolean; label?: string; status?: 'default' | 'pending' | 'applied' } = {}): HTMLElement {
    const host = fixture.componentInstance;
    if (state.open !== undefined) host.open.set(state.open);
    if (state.label !== undefined) host.label.set(state.label);
    if (state.status !== undefined) host.status.set(state.status);
    fixture.detectChanges();
    return html();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent, HeaderlessHost] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
  });

  it('renders the icon tile, title, description, body and footer action', () => {
    render();

    expect(html().querySelector('.station-card-icon i')?.className).toContain('fa-eraser');
    expect(html().querySelector('.station-card-title')?.textContent?.trim()).toBe('Missing Values');
    expect(html().querySelector('.station-card-description')?.textContent?.trim()).toBe('Default: NA removal.');
    expect(html().querySelector('.station-card-body .body')).toBeTruthy();
    expect(html().querySelector('.station-card-footer button')?.textContent?.trim()).toBe('Apply');
  });

  it('projects the station action into the header row and never inside the collapse toggle', () => {
    render();

    expect(html().querySelector('.station-card-header-row > [stationAction]')?.textContent?.trim()).toBe('Remove Step');
    // A button nested in the toggle is invalid HTML and its click would also collapse the card.
    expect(html().querySelector('.station-card-header [stationAction]')).toBeNull();
  });

  it('marks the chip with the matching state class', () => {
    expect(render().querySelector('.preprocessing-state-chip.state-pending')?.textContent?.trim()).toBe('Pending');
    expect(render({ label: 'Applied', status: 'applied' }).querySelector('.preprocessing-state-chip.state-applied')?.textContent?.trim()).toBe('Applied');
  });

  it('drops the chip without a status label and keeps the chevron when collapsible', () => {
    const rendered = render({ label: '' });

    expect(rendered.querySelector('.preprocessing-state-chip')).toBeFalsy();
    expect(rendered.querySelector('.station-card-chevron')).toBeTruthy();
  });

  it('toggles the station through the header and reports aria-expanded', () => {
    render();
    const header = html().querySelector<HTMLButtonElement>('.station-card-header');
    expect(header?.getAttribute('aria-expanded')).toBe('false');
    expect(html().querySelector<HTMLDivElement>('.station-card')!.classList.contains('is-open')).toBeFalse();

    header!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.open()).toBeTrue();
    expect(html().querySelector<HTMLDivElement>('.station-card')!.classList.contains('is-open')).toBeTrue();
    expect(html().querySelector('.station-card-header')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('omits the header when the station has no title, icon, description or status', () => {
    const headerless = TestBed.createComponent(HeaderlessHost);
    headerless.detectChanges();
    expect(headerless.nativeElement.querySelector('.station-card-header')).toBeNull();
    expect(headerless.nativeElement.querySelector('.station-card-body .body')).toBeTruthy();
  });
});
