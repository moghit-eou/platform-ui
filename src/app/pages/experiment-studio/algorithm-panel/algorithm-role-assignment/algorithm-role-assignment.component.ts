import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ExperimentStudioService } from '../../../../services/experiment-studio.service';

type AlgorithmRole = 'y' | 'x';
type PoolRole = AlgorithmRole | '';

@Component({
  selector: 'app-algorithm-role-assignment',
  imports: [DragDropModule],
  templateUrl: './algorithm-role-assignment.component.html',
  styleUrl: './algorithm-role-assignment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlgorithmRoleAssignmentComponent {
  private readonly expStudioService = inject(ExperimentStudioService);

  readonly assignable = this.expStudioService.algorithmAssignableVariables;
  readonly y = this.expStudioService.algorithmY;
  readonly x = this.expStudioService.algorithmX;
  readonly poolFilter = signal('');

  /** Assignable pool members not yet assigned to either role. */
  readonly source = computed(() => {
    const inY = new Set(this.y().map((v) => v.code));
    const inX = new Set(this.x().map((v) => v.code));
    return this.assignable().filter((v) => !inY.has(v.code) && !inX.has(v.code));
  });

  /** Unassigned variables only — assigned ones live as chips in the role slots. */
  readonly filteredPool = computed(() => {
    const q = this.poolFilter().trim().toLowerCase();
    const list = this.source();
    if (!q) return list;
    return list.filter((node) => {
      const name = this.label(node).toLowerCase();
      const type = String(node?.type ?? '').toLowerCase();
      return name.includes(q) || type.includes(q);
    });
  });

  /** A chip released over the other slot moves there; drops inside its own slot are ignored. */
  onChipDrop(event: CdkDragDrop<unknown>, role: AlgorithmRole): void {
    if (event.previousContainer === event.container) return;
    this.assignTo(role, event.item.data);
  }

  onFilter(event: Event): void {
    this.poolFilter.set((event.target as HTMLInputElement).value);
  }

  roleOf(node: any): PoolRole {
    if (this.isAssigned(node, 'y')) return 'y';
    if (this.isAssigned(node, 'x')) return 'x';
    return '';
  }

  setRole(node: any, role: PoolRole): void {
    if (role) this.assignTo(role, node);
    else {
      const current = this.roleOf(node);
      if (current) this.removeFrom(current, node);
    }
  }

  isAssigned(node: any, role: AlgorithmRole): boolean {
    const list = role === 'y' ? this.y() : this.x();
    return list.some((v) => v.code === node.code);
  }

  assignTo(role: AlgorithmRole, node: any): void {
    const target = role === 'y' ? this.y() : this.x();
    // Guard: a node can never appear in both roles. If it is already in the
    // target role, assigning again is a no-op; if it is in the opposite role,
    // remove it there so the roles stay disjoint.
    if (target.some((v) => v.code === node.code)) return;
    const opposite = role === 'y' ? this.x() : this.y();
    const otherNext = opposite.filter((v) => v.code !== node.code);
    const next = [...target, node];
    if (role === 'y') {
      this.expStudioService.setAlgorithmX(otherNext);
      this.expStudioService.setAlgorithmY(next);
    } else {
      this.expStudioService.setAlgorithmY(otherNext);
      this.expStudioService.setAlgorithmX(next);
    }
  }

  removeFrom(role: AlgorithmRole, node: any): void {
    const list = role === 'y' ? this.y() : this.x();
    const next = list.filter((v) => v.code !== node.code);
    if (role === 'y') {
      this.expStudioService.setAlgorithmY(next);
    } else {
      this.expStudioService.setAlgorithmX(next);
    }
  }

  label(node: any): string {
    return node?.label ?? node?.name ?? node?.code ?? '';
  }

  isCreated(node: any): boolean {
    return !!node?.isCreatedColumn;
  }
}
