import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AssignPriorityService,
  PriorityOption,
  PriorityUser,
} from '../../../services/assign-priority.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-assign-priority',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './assign-priority.component.html',
  styleUrl: './assign-priority.component.scss',
})
export class AssignPriorityComponent implements OnInit {
  private readonly service = inject(AssignPriorityService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly priorities = signal<PriorityOption[]>([]);
  protected readonly users = signal<PriorityUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Free-text filter over the staff list (mirrors the V1 DataTable search). */
  protected readonly search = signal('');
  protected readonly filteredUsers = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.users();
    if (!q) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.pid ?? '').toLowerCase().includes(q) ||
        (u.designation ?? '').toLowerCase().includes(q) ||
        (u.phone ?? '').toLowerCase().includes(q),
    );
  });

  /** Transient feedback message shown after an assignment. */
  protected readonly flash = signal('');

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.priorities.set(data.priorities ?? []);
        this.users.set(data.users ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load users. Please try again.');
        this.loading.set(false);
      },
    });
  }

  priorityName(key: string | null): string {
    if (!key) return '';
    return this.priorities().find((p) => p.key === key)?.name ?? '';
  }

  /**
   * Mirrors V1 (`Staff/AssignPriorityToUser`): on changing a user's priority dropdown —
   * blank → confirm removal; a priority already held by someone else → block with an alert;
   * a free priority → confirm before saving. `sel` lets us revert the dropdown on cancel.
   */
  async onPriorityChange(user: PriorityUser, sel: HTMLSelectElement): Promise<void> {
    const jobTypeKey = sel.value || null;
    const original = user.priorityKey ?? null;
    if (jobTypeKey === original) return;

    const revert = () => {
      sel.value = original ?? '';
    };

    // ── Remove (blank selection) ──
    if (jobTypeKey === null) {
      const ok = await this.confirmDialog().open({
        title: 'Assign Priority to User',
        message: 'Are you sure you want to remove this value?',
        confirmText: 'Yes',
        cancelText: 'No',
        tone: 'danger',
      });
      if (!ok) {
        revert();
        return;
      }
      this.persist(user, null, revert);
      return;
    }

    // ── Already taken by another user (V1 blocks the reassignment) ──
    const takenByOther = this.users().some((u) => u.id !== user.id && u.priorityKey === jobTypeKey);
    if (takenByOther) {
      await this.confirmDialog().open({
        title: 'Assign Priority to User',
        message: 'Sorry, this priority type is already taken.',
        confirmText: 'OK',
        cancelText: '',
        tone: 'primary',
      });
      revert();
      return;
    }

    // ── Free priority → confirm before saving ──
    const ok = await this.confirmDialog().open({
      title: 'Assign Priority to User',
      message: 'Are you sure you want to save this priority?',
      confirmText: 'Yes',
      cancelText: 'No',
      tone: 'primary',
    });
    if (!ok) {
      revert();
      return;
    }
    this.persist(user, jobTypeKey, revert);
  }

  /** Persists the assignment (or removal), reflects it locally, and reverts the dropdown on failure. */
  private persist(user: PriorityUser, jobTypeKey: string | null, revert: () => void): void {
    this.error.set(null);
    this.service.assign(user.id, jobTypeKey).subscribe({
      next: () => {
        this.users.update((list) => list.map((u) => (u.id === user.id ? { ...u, priorityKey: jobTypeKey } : u)));
        const pName = this.priorityName(jobTypeKey);
        this.flash.set(jobTypeKey ? `${pName} assigned to ${user.name}.` : `Priority removed from ${user.name}.`);
        setTimeout(() => this.flash.set(''), 3500);
      },
      error: () => {
        revert();
        this.error.set('Failed to update priority. Please try again.');
      },
    });
  }
}
