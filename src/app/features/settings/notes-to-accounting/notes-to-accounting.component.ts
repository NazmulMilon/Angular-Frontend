import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AccountingStaff,
  NotesToAccountingService,
} from '../../../services/notes-to-accounting.service';

@Component({
  selector: 'app-notes-to-accounting',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './notes-to-accounting.component.html',
  styleUrl: './notes-to-accounting.component.scss',
})
export class NotesToAccountingComponent implements OnInit {
  private readonly service = inject(NotesToAccountingService);

  protected readonly staff = signal<AccountingStaff[]>([]);
  protected readonly accountingIds = signal<Set<string>>(new Set());
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly searchAvailable = signal('');
  protected readonly searchAssigned = signal('');

  protected readonly availableStaff = computed(() => {
    const q = this.searchAvailable().trim().toLowerCase();
    return this.staff()
      .filter((s) => !this.accountingIds().has(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  });

  protected readonly assignedStaff = computed(() => {
    const q = this.searchAssigned().trim().toLowerCase();
    return this.staff()
      .filter((s) => this.accountingIds().has(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  });

  protected readonly assignedCount = computed(() => this.accountingIds().size);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.staff.set(data.staff ?? []);
        this.accountingIds.set(new Set(data.accountingIds ?? []));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load staff. Please try again.');
        this.loading.set(false);
      },
    });
  }

  /** Flag a staff member as an accounting person. Optimistic; reverts on failure. */
  addPerson(id: string): void {
    this.error.set(null);
    this.setAccounting(id, true);
    this.service.add(id).subscribe({
      error: () => {
        this.setAccounting(id, false);
        this.error.set('Failed to add accounting person. Please try again.');
      },
    });
  }

  /** Un-flag a staff member. Optimistic; reverts on failure. Reversible, so no confirm prompt. */
  removePerson(id: string): void {
    this.error.set(null);
    this.setAccounting(id, false);
    this.service.remove(id).subscribe({
      error: () => {
        this.setAccounting(id, true);
        this.error.set('Failed to remove accounting person. Please try again.');
      },
    });
  }

  private setAccounting(id: string, isAccounting: boolean): void {
    this.accountingIds.update((set) => {
      const next = new Set(set);
      if (isAccounting) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}
