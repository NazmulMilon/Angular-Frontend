import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CustomerRegionService,
  Region,
  RegionCustomer,
} from '../../../services/customer-region.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-customer-region',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './customer-region.component.html',
  styleUrl: './customer-region.component.scss',
})
export class CustomerRegionComponent implements OnInit {
  private readonly service = inject(CustomerRegionService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly customers = signal<RegionCustomer[]>([]);
  protected readonly regions = signal<Region[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly isNew = signal(false);
  protected readonly formCustomerKey = signal('');
  protected readonly formRegionName = signal('');

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.customers.set(data.customers ?? []);
        this.regions.set(data.regions ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load regions. Please try again.');
        this.loading.set(false);
      },
    });
  }

  get isFormOpen(): boolean {
    return this.isNew() || this.editingId() !== null;
  }

  startCreate(): void {
    this.isNew.set(true);
    this.editingId.set(null);
    this.formCustomerKey.set('');
    this.formRegionName.set('');
    this.error.set(null);
  }

  startEdit(r: Region): void {
    this.isNew.set(false);
    this.editingId.set(r.zoneId);
    this.formCustomerKey.set(r.customerKey);
    this.formRegionName.set(r.zoneName);
    this.error.set(null);
  }

  cancelEdit(): void {
    this.isNew.set(false);
    this.editingId.set(null);
  }

  get canSave(): boolean {
    return this.formCustomerKey().length > 0 && this.formRegionName().trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;
    const req = { customerKey: this.formCustomerKey(), zoneName: this.formRegionName().trim() };
    this.saving.set(true);
    this.error.set(null);

    if (this.isNew()) {
      this.service.create(req).subscribe({
        next: (saved) => {
          this.regions.update((list) => [...list, saved]);
          this.saving.set(false);
          this.cancelEdit();
        },
        error: () => {
          this.error.set('Failed to save. Please try again.');
          this.saving.set(false);
        },
      });
      return;
    }

    const id = this.editingId();
    if (id == null) {
      this.saving.set(false);
      return;
    }
    this.service.update(id, req).subscribe({
      next: (saved) => {
        this.regions.update((list) => list.map((r) => (r.zoneId === id ? saved : r)));
        this.saving.set(false);
        this.cancelEdit();
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }

  async confirmDelete(r: Region): Promise<void> {
    const confirmed = await this.confirmDialog().open({
      title: 'Delete region',
      message: `Delete "${r.zoneName}"? Any locations assigned to this region will be unassigned.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    const id = r.zoneId;
    this.error.set(null);
    this.service.delete(id).subscribe({
      next: () => {
        this.regions.update((list) => list.filter((item) => item.zoneId !== id));
        if (this.editingId() === id) this.cancelEdit();
      },
      error: () => this.error.set('Failed to delete. Please try again.'),
    });
  }
}
