import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  DashboardGridUsergroups,
  DashboardGridUsergroupsService,
  GridOption,
  GridUserAssociation,
  UsergroupOption,
} from '../../../services/dashboard-grid-usergroups.service';

@Component({
  selector: 'app-dashboard-grid-usergroups',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './dashboard-grid-usergroups.component.html',
  styleUrl: './dashboard-grid-usergroups.component.scss',
})
export class DashboardGridUsergroupsComponent implements OnInit {
  private readonly service = inject(DashboardGridUsergroupsService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly grids = signal<GridOption[]>([]);
  /** All usergroups (legacy shows every usergroup, unfiltered). */
  protected readonly allUsergroups = signal<UsergroupOption[]>([]);
  protected readonly associations = signal<GridUserAssociation[]>([]);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedGridKey = signal<number | null>(null);
  protected readonly checkedGroupIds = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.load();
  }

  private applyPayload(p: DashboardGridUsergroups): void {
    this.grids.set(p.grids ?? []);
    this.allUsergroups.set(p.allUsergroups ?? []);
    this.associations.set(p.associations ?? []);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (p) => {
        this.applyPayload(p);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load grid usergroups. Please try again.');
        this.loading.set(false);
      },
    });
  }

  onGridChange(value: string): void {
    this.selectedGridKey.set(value ? Number(value) : null);
    this.checkedGroupIds.set(new Set());
  }

  isChecked(groupId: string): boolean {
    return this.checkedGroupIds().has(groupId);
  }

  toggleGroup(groupId: string): void {
    this.checkedGroupIds.update((set) => {
      const next = new Set(set);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  get canSave(): boolean {
    return !this.saving() && this.selectedGridKey() !== null && this.checkedGroupIds().size > 0;
  }

  save(): void {
    const gridKey = this.selectedGridKey();
    if (gridKey === null || this.checkedGroupIds().size === 0) return;

    this.saving.set(true);
    this.error.set(null);
    this.service.save(gridKey, [...this.checkedGroupIds()]).subscribe({
      next: (p) => {
        this.applyPayload(p);
        this.checkedGroupIds.set(new Set());
        this.saving.set(false);
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }

  async removeAssociation(row: GridUserAssociation): Promise<void> {
    const confirmed = await this.confirmDialog().open({
      title: 'Remove usergroup',
      message: 'Are you sure you want to Remove this?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    this.error.set(null);
    this.service.remove(row.detailKey).subscribe({
      next: (p) => this.applyPayload(p),
      error: () => this.error.set('Failed to remove. Please try again.'),
    });
  }
}
