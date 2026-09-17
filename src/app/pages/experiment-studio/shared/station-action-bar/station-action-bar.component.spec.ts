import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StationActionBarComponent } from './station-action-bar.component';

@Component({
  standalone: true,
  imports: [StationActionBarComponent],
  template: `
    <app-station-action-bar
      [pendingCount]="count()"
      [statusText]="text()"
      [tone]="tone()"
      [resetLabel]="resetLabel()"
      applyLabel="Apply Preprocessing"
      applyIcon="fa fa-magic"
      [applyVariant]="variant()"
      [applyDisabled]="count() === 0"
      (reset)="resetClicks = resetClicks + 1"
      (apply)="applyClicks = applyClicks + 1"></app-station-action-bar>
  `,
})
class HostComponent {
  readonly count = signal(2);
  readonly text = signal('pending steps');
  readonly tone = signal<'default' | 'pending' | 'applied'>('pending');
  readonly resetLabel = signal('Reset Changes');
  readonly variant = signal<'primary' | 'quiet'>('primary');
  resetClicks = 0;
  applyClicks = 0;
}

describe('StationActionBarComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  /** Zoneless: signal writes are what mark the fixture dirty, so state is driven through signals. */
  function render(
    state: {
      count?: number;
      text?: string;
      tone?: 'default' | 'pending' | 'applied';
      resetLabel?: string;
      variant?: 'primary' | 'quiet';
    } = {}
  ): HTMLElement {
    const host = fixture.componentInstance;
    if (state.count !== undefined) host.count.set(state.count);
    if (state.text !== undefined) host.text.set(state.text);
    if (state.tone !== undefined) host.tone.set(state.tone);
    if (state.resetLabel !== undefined) host.resetLabel.set(state.resetLabel);
    if (state.variant !== undefined) host.variant.set(state.variant);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
  });

  it('shows the count chip, status text and both actions', () => {
    const html = render();

    expect(html.querySelector('.station-action-status')?.textContent).toContain('pending steps');
    expect(html.querySelector('.station-action-count')?.textContent?.trim()).toBe('2');
    expect(html.textContent).toContain('2 pending steps');
    expect(html.querySelector('.station-action-reset')?.textContent?.trim()).toBe('Reset Changes');
    expect(html.querySelector('.station-action-apply')?.textContent?.trim()).toContain('Apply Preprocessing');
    expect(html.querySelector('.station-action-apply i')?.className).toContain('fa-magic');
    expect(html.querySelector('.station-action-bar')?.classList.contains('tone-pending')).toBeTrue();
  });

  it('emits reset and apply', () => {
    const html = render();

    html.querySelector<HTMLButtonElement>('.station-action-reset')!.click();
    html.querySelector<HTMLButtonElement>('.station-action-apply')!.click();

    expect(fixture.componentInstance.resetClicks).toBe(1);
    expect(fixture.componentInstance.applyClicks).toBe(1);
  });

  it('hides the chip, text and reset action when there is nothing to report', () => {
    const html = render({ count: 0, text: '', resetLabel: '', tone: 'applied' });

    expect(html.querySelector('.station-action-status')).toBeFalsy();
    expect(html.querySelector('.station-action-reset')).toBeFalsy();
    expect(html.querySelector<HTMLButtonElement>('.station-action-apply')!.disabled).toBeTrue();
    expect(html.querySelector('.station-action-bar')?.classList.contains('tone-applied')).toBeTrue();
  });

  it('draws the primary slot as a solid button by default and as an outline when quiet', () => {
    const primary = render();
    expect(primary.querySelector('.station-action-apply')?.classList.contains('is-quiet')).toBeFalse();

    const quiet = render({ variant: 'quiet' });
    expect(quiet.querySelector('.station-action-apply')?.classList.contains('is-quiet')).toBeTrue();
  });
});
