import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StationListRowComponent } from './station-list-row.component';

@Component({
  standalone: true,
  imports: [StationListRowComponent],
  template: `
    <app-station-list-row [removeLabel]="label()" (remove)="removed = removed + 1">
      <span class="content">age >= 65</span>
    </app-station-list-row>
  `,
})
class HostComponent {
  readonly label = signal('Remove condition');
  removed = 0;
}

describe('StationListRowComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  /** Zoneless: signal writes are what mark the fixture dirty, so state is driven through signals. */
  function render(label: string): HTMLElement {
    fixture.componentInstance.label.set(label);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
  });

  it('projects the row content and removes on action', () => {
    const html = render('Remove condition');

    expect(html.querySelector('.station-list-row-content .content')?.textContent?.trim()).toBe('age >= 65');

    const remove = html.querySelector<HTMLButtonElement>('.station-list-row-remove');
    expect(remove?.getAttribute('aria-label')).toBe('Remove condition');
    remove!.click();
    expect(fixture.componentInstance.removed).toBe(1);
  });

  it('keeps the accessible label in sync', () => {
    const html = render('Remove category good outcome');

    expect(html.querySelector('.station-list-row-remove')?.getAttribute('aria-label')).toBe('Remove category good outcome');
  });
});
