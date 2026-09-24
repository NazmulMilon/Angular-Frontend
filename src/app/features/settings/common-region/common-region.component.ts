import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CommonRegionRow,
  CommonRegionService,
  CommonRegionState,
} from '../../../services/common-region.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-common-region',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './common-region.component.html',
  styleUrl: './common-region.component.scss',
})
export class CommonRegionComponent implements OnInit {
  private readonly service = inject(CommonRegionService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly states = signal<CommonRegionState[]>([]);
  protected readonly regions = signal<CommonRegionRow[]>([]);
  protected readonly search = signal('');
  /** Regions filtered by the search box (region name). */
  protected readonly filteredRegions = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.regions();
    if (!q) return list;
    return list.filter((r) => r.name.toLowerCase().includes(q));
  });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the id being edited. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly formName = signal('');
  protected readonly checkedStates = signal<Set<string>>(new Set());

  /** States not assigned to any OTHER region (available for this region). */
  protected readonly availableStates = computed(() => {
    const editing = this.editingId();
    const takenByOthers = new Set<string>();
    for (const r of this.regions()) {
      if (r.id === editing) continue;
      for (const k of r.stateKeys) takenByOthers.add(k);
    }
    return this.states().filter((s) => !takenByOthers.has(s.key));
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.states.set(data.states ?? []);
        this.regions.set(data.regions ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load regions. Please try again.');
        this.loading.set(false);
      },
    });
  }

  stateName(key: string): string {
    return this.states().find((s) => s.key === key)?.name ?? key;
  }

  isStateChecked(key: string): boolean {
    return this.checkedStates().has(key);
  }

  toggleState(key: string): void {
    this.checkedStates.update((set) => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  selectRow(row: CommonRegionRow): void {
    this.editingId.set(row.id);
    this.formName.set(row.name);
    this.checkedStates.set(new Set(row.stateKeys));
    this.error.set(null);
  }

  clearForm(): void {
    this.editingId.set(null);
    this.formName.set('');
    this.checkedStates.set(new Set());
  }

  get canSave(): boolean {
    return !this.saving() && this.formName().trim().length > 0 && this.checkedStates().size > 0;
  }

  save(): void {
    if (!this.canSave) return;
    const payload = { name: this.formName().trim(), stateKeys: [...this.checkedStates()] };
    const key = this.editingId();

    this.saving.set(true);
    this.error.set(null);

    const request$ = key === null ? this.service.create(payload) : this.service.update(key, payload);

    request$.subscribe({
      next: (saved) => {
        this.regions.update((list) => {
          const others = key === null ? list : list.filter((r) => r.id !== key);
          return [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
        });
        this.saving.set(false);
        this.clearForm();
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }

  async confirmDelete(row: CommonRegionRow): Promise<void> {
    if (row.id == null) return;
    const confirmed = await this.confirmDialog().open({
      title: 'Remove region',
      message: `Are you sure you want to remove "${row.name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    const id = row.id;
    this.error.set(null);
    this.service.delete(id).subscribe({
      next: () => {
        this.regions.update((list) => list.filter((r) => r.id !== id));
        if (this.editingId() === id) this.clearForm();
      },
      error: () => this.error.set('Failed to delete. Please try again.'),
    });
  }

  /** Remove one state from a region inline (persists via update with the reduced set). */
  removeState(row: CommonRegionRow, stateKey: string): void {
    if (row.id == null) return;
    const remaining = row.stateKeys.filter((k) => k !== stateKey);
    if (remaining.length === 0) {
      // A region must keep at least one state; removing the last one means deleting the region.
      this.confirmDelete(row);
      return;
    }
    const id = row.id;
    this.error.set(null);
    this.service.update(id, { name: row.name, stateKeys: remaining }).subscribe({
      next: (saved) => {
        this.regions.update((list) => list.map((r) => (r.id === id ? saved : r)));
        if (this.editingId() === id) this.checkedStates.set(new Set(remaining));
      },
      error: () => this.error.set('Failed to remove state. Please try again.'),
    });
  }
}
