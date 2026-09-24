import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  JobRequestEmailStaff,
  JobRequestEmailService,
} from '../../../services/job-request-email.service';

@Component({
  selector: 'app-job-request-email',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './job-request-email.component.html',
  styleUrl: './job-request-email.component.scss',
})
export class JobRequestEmailComponent implements OnInit {
  private readonly service = inject(JobRequestEmailService);

  protected readonly staff = signal<JobRequestEmailStaff[]>([]);
  protected readonly recipientIds = signal<Set<string>>(new Set());
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly searchAvailable = signal('');
  protected readonly searchRecipients = signal('');

  protected readonly availableStaff = computed(() => {
    const q = this.searchAvailable().trim().toLowerCase();
    return this.staff()
      .filter((s) => !this.recipientIds().has(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  });

  protected readonly recipientList = computed(() => {
    const q = this.searchRecipients().trim().toLowerCase();
    return this.staff()
      .filter((s) => this.recipientIds().has(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  });

  protected readonly recipientCount = computed(() => this.recipientIds().size);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.staff.set(data.staff ?? []);
        this.recipientIds.set(new Set(data.recipientIds ?? []));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load staff. Please try again.');
        this.loading.set(false);
      },
    });
  }

  /** Register a staff member as a job-request recipient. Optimistic; reverts on failure. */
  addRecipient(id: string): void {
    this.error.set(null);
    this.setRecipient(id, true);
    this.service.add(id).subscribe({
      error: () => {
        this.setRecipient(id, false);
        this.error.set('Failed to add recipient. Please try again.');
      },
    });
  }

  /** Un-register a recipient. Optimistic; reverts on failure. Reversible, so no confirm prompt. */
  removeRecipient(id: string): void {
    this.error.set(null);
    this.setRecipient(id, false);
    this.service.remove(id).subscribe({
      error: () => {
        this.setRecipient(id, true);
        this.error.set('Failed to remove recipient. Please try again.');
      },
    });
  }

  private setRecipient(id: string, isRecipient: boolean): void {
    this.recipientIds.update((set) => {
      const next = new Set(set);
      if (isRecipient) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}
