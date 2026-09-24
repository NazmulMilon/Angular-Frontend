import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  VendorChargeType,
  VendorChargeTypeService,
} from '../../../services/vendor-charge-type.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-vendor-charge-type',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './vendor-charge-type.component.html',
  styleUrl: './vendor-charge-type.component.scss',
})
export class VendorChargeTypeComponent implements OnInit {
  private readonly service = inject(VendorChargeTypeService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly items = signal<VendorChargeType[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Free-text filter over the charge-type name (and display level), mirroring the V1 list search. */
  protected readonly search = signal('');
  protected readonly filteredItems = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.items();
    return this.items().filter(
      (i) => i.itemName.toLowerCase().includes(q) || String(i.displayLevel ?? '').includes(q),
    );
  });

  /** null = form closed, 0 = creating, > 0 = editing that itemKey. */
  protected readonly editingKey = signal<number | null>(null);
  protected readonly formName = signal('');
  protected readonly formLevel = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getAll().subscribe({
      next: (rows) => {
        this.items.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load charge types. Please try again.');
        this.loading.set(false);
      },
    });
  }

  startCreate(): void {
    this.editingKey.set(0);
    this.formName.set('');
    this.formLevel.set(null);
    this.error.set(null);
  }

  startEdit(item: VendorChargeType): void {
    this.editingKey.set(item.itemKey);
    this.formName.set(item.itemName);
    this.formLevel.set(item.displayLevel);
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editingKey.set(null);
  }

  get canSave(): boolean {
    return this.formName().trim().length > 0;
  }

  save(): void {
    const key = this.editingKey();
    if (key === null || !this.canSave) return;

    const payload = { itemName: this.formName().trim(), displayLevel: this.formLevel() };
    this.saving.set(true);
    this.error.set(null);

    const request$ = key > 0 ? this.service.update(key, payload) : this.service.create(payload);

    request$.subscribe({
      next: (saved) => {
        this.items.update((list) => {
          const others = key > 0 ? list.filter((i) => i.itemKey !== key) : list;
          return [...others, saved].sort((a, b) => (a.displayLevel ?? 0) - (b.displayLevel ?? 0));
        });
        this.saving.set(false);
        this.editingKey.set(null);
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }

  async confirmDelete(item: VendorChargeType): Promise<void> {
    if (item.itemKey == null) return;
    const confirmed = await this.confirmDialog().open({
      title: 'Remove charge type',
      message: `Are you sure you want to remove "${item.itemName}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    const key = item.itemKey;
    this.error.set(null);
    this.service.delete(key).subscribe({
      next: () => {
        this.items.update((list) => list.filter((i) => i.itemKey !== key));
        if (this.editingKey() === key) this.editingKey.set(null);
      },
      error: () => this.error.set('Failed to delete. Please try again.'),
    });
  }
}
