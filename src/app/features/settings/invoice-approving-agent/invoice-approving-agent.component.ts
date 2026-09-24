import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ApprovingAgentStaff,
  InvoiceApprovingAgentService,
} from '../../../services/invoice-approving-agent.service';

@Component({
  selector: 'app-invoice-approving-agent',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './invoice-approving-agent.component.html',
  styleUrl: './invoice-approving-agent.component.scss',
})
export class InvoiceApprovingAgentComponent implements OnInit {
  private readonly service = inject(InvoiceApprovingAgentService);

  protected readonly staff = signal<ApprovingAgentStaff[]>([]);
  protected readonly agentIds = signal<Set<string>>(new Set());
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly searchAvailable = signal('');
  protected readonly searchAgents = signal('');

  protected readonly availableStaff = computed(() => {
    const q = this.searchAvailable().trim().toLowerCase();
    return this.staff()
      .filter((s) => !this.agentIds().has(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  });

  protected readonly agentList = computed(() => {
    const q = this.searchAgents().trim().toLowerCase();
    return this.staff()
      .filter((s) => this.agentIds().has(s.id))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  });

  protected readonly agentCount = computed(() => this.agentIds().size);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.staff.set(data.staff ?? []);
        this.agentIds.set(new Set(data.agentIds ?? []));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load staff. Please try again.');
        this.loading.set(false);
      },
    });
  }

  /** Register a staff member as an approving agent. Optimistic; reverts on failure. */
  addAgent(id: string): void {
    this.error.set(null);
    this.setAgent(id, true);
    this.service.add(id).subscribe({
      error: () => {
        this.setAgent(id, false);
        this.error.set('Failed to add agent. Please try again.');
      },
    });
  }

  /** Un-register a staff member. Optimistic; reverts on failure. Reversible, so no confirm prompt. */
  removeAgent(id: string): void {
    this.error.set(null);
    this.setAgent(id, false);
    this.service.remove(id).subscribe({
      error: () => {
        this.setAgent(id, true);
        this.error.set('Failed to remove agent. Please try again.');
      },
    });
  }

  private setAgent(id: string, isAgent: boolean): void {
    this.agentIds.update((set) => {
      const next = new Set(set);
      if (isAgent) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}
