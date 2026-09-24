import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CustomerJobStatus,
  CustomerJobStatusService,
} from '../../../services/customer-job-status.service';

@Component({
  selector: 'app-customer-job-status',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './customer-job-status.component.html',
  styleUrl: './customer-job-status.component.scss',
})
export class CustomerJobStatusComponent implements OnInit {
  private readonly service = inject(CustomerJobStatusService);

  protected readonly items = signal<CustomerJobStatus[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

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
        this.error.set('Failed to load job statuses. Please try again.');
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

  startEdit(item: CustomerJobStatus): void {
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

  save(): void {
    const name = this.formName().trim();
    if (!name) return;

    const payload = { name, level: this.formLevel(), isActive: this.formActive() };
    this.saving.set(true);
    this.error.set(null);

    if (this.isNew()) {
      this.service.create(payload).subscribe({
        next: (saved) => {
          this.items.update((list) => [...list, saved]);
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
    this.service.update(id, payload).subscribe({
      next: (saved) => {
        this.items.update((list) => list.map((i) => (i.id === id ? saved : i)));
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
