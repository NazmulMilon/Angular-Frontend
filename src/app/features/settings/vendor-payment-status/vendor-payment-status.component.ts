import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  VendorPaymentStatus,
  VendorPaymentStatusService,
} from '../../../services/vendor-payment-status.service';

@Component({
  selector: 'app-vendor-payment-status',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './vendor-payment-status.component.html',
  styleUrl: './vendor-payment-status.component.scss',
})
export class VendorPaymentStatusComponent implements OnInit {
  private readonly service = inject(VendorPaymentStatusService);

  protected readonly items = signal<VendorPaymentStatus[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Free-text filter over the payment status name (mirrors the V1 list search). */
  protected readonly search = signal('');
  protected readonly filteredItems = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.items();
    if (!q) return list;
    return list.filter((i) => i.name.toLowerCase().includes(q) || String(i.level ?? '').includes(q));
  });

  protected readonly editingId = signal<string | null>(null);
  protected readonly isNew = signal(false);
  protected readonly formName = signal('');
  protected readonly formLevel = signal<number | null>(null);
  protected readonly formActive = signal(true);

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
        this.error.set('Failed to load payment statuses. Please try again.');
        this.loading.set(false);
      },
    });
  }

  startCreate(): void {
    this.editingId.set(null);
    this.isNew.set(true);
    this.formName.set('');
    this.formLevel.set(null);
    this.formActive.set(true);
    this.error.set(null);
  }

  startEdit(item: VendorPaymentStatus): void {
    this.editingId.set(item.id);
    this.isNew.set(false);
    this.formName.set(item.name);
    this.formLevel.set(item.level);
    this.formActive.set(item.isActive);
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.isNew.set(false);
  }

  get isFormOpen(): boolean {
    return this.isNew() || this.editingId() !== null;
  }

  get canSave(): boolean {
    return this.formName().trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;

    const payload = { name: this.formName().trim(), level: this.formLevel(), isActive: this.formActive() };
    const id = this.editingId();

    this.saving.set(true);
    this.error.set(null);

    const request$ = this.isNew() || id === null ? this.service.create(payload) : this.service.update(id, payload);

    request$.subscribe({
      next: (saved) => {
        this.items.update((list) => {
          const others = !this.isNew() && id !== null ? list.filter((i) => i.id !== id) : list;
          return [...others, saved].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
        });
        this.saving.set(false);
        this.cancelEdit();
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
