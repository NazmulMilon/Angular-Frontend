import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  DashboardGridSetup,
  DashboardGridSetupService,
  GridAssociation,
  GridOption,
  GridStatusOption,
} from '../../../services/dashboard-grid-setup.service';

@Component({
  selector: 'app-dashboard-grid-setup',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './dashboard-grid-setup.component.html',
  styleUrl: './dashboard-grid-setup.component.scss',
})
export class DashboardGridSetupComponent implements OnInit {
  private readonly service = inject(DashboardGridSetupService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly grids = signal<GridOption[]>([]);
  /** Active statuses not assigned to any grid (from the backend). */
  protected readonly availableStatuses = signal<GridStatusOption[]>([]);
  protected readonly associations = signal<GridAssociation[]>([]);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedGridKey = signal<number | null>(null);
  protected readonly checkedStatusIds = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.load();
  }

  private applyPayload(p: DashboardGridSetup): void {
    this.grids.set(p.grids ?? []);
    this.availableStatuses.set(p.availableStatuses ?? []);
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
        this.error.set('Failed to load grid setup. Please try again.');
        this.loading.set(false);
      },
    });
  }

  onGridChange(value: string): void {
    this.selectedGridKey.set(value ? Number(value) : null);
    this.checkedStatusIds.set(new Set());
  }

  isChecked(statusId: string): boolean {
    return this.checkedStatusIds().has(statusId);
  }

  toggleStatus(statusId: string): void {
    this.checkedStatusIds.update((set) => {
      const next = new Set(set);
      if (next.has(statusId)) next.delete(statusId);
      else next.add(statusId);
      return next;
    });
  }

  get canSave(): boolean {
    return !this.saving() && this.selectedGridKey() !== null && this.checkedStatusIds().size > 0;
  }

  save(): void {
    const gridKey = this.selectedGridKey();
    if (gridKey === null || this.checkedStatusIds().size === 0) return;

    this.saving.set(true);
    this.error.set(null);
    this.service.save(gridKey, [...this.checkedStatusIds()]).subscribe({
      next: (p) => {
        this.applyPayload(p);
        this.checkedStatusIds.set(new Set());
        this.saving.set(false);
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }

  async removeAssociation(row: GridAssociation): Promise<void> {
    const confirmed = await this.confirmDialog().open({
      title: 'Remove status',
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
