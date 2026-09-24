import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Team, TeamSetupService, TeamStaff } from '../../../services/team-setup.service';

@Component({
  selector: 'app-team-setup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './team-setup.component.html',
  styleUrl: './team-setup.component.scss',
})
export class TeamSetupComponent implements OnInit {
  private readonly service = inject(TeamSetupService);

  protected readonly staff = signal<TeamStaff[]>([]);
  protected readonly teams = signal<Team[]>([]);
  /** PersonnelKey → name for every member (incl. deleted staff), so names never fall back to a raw GUID. */
  protected readonly memberNames = signal<Record<string, string>>({});
  protected readonly search = signal('');
  /** Teams filtered by the search box (team name). */
  protected readonly filteredTeams = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.teams();
    if (!q) return list;
    return list.filter((t) => t.name.toLowerCase().includes(q));
  });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  // ── Master-detail ──
  protected readonly view = signal<'list' | 'editor'>('list');
  protected readonly editingTeamId = signal<string | null>(null);
  protected readonly isNew = signal(false);

  // ── Editor form ──
  protected readonly formName = signal('');
  protected readonly formActive = signal(true);
  protected readonly formMemberIds = signal<Set<string>>(new Set());
  protected readonly formAmId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.staff.set(data.staff ?? []);
        this.teams.set(data.teams ?? []);
        this.memberNames.set(data.memberNames ?? {});
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load teams. Please try again.');
        this.loading.set(false);
      },
    });
  }

  staffName(id: string): string {
    // Active roster first, then any member name resolved server-side (incl. deleted staff),
    // and only a friendly placeholder if the staff row is truly gone — never a raw GUID.
    return this.staff().find((s) => s.id === id)?.name ?? this.memberNames()[id] ?? '(inactive user)';
  }

  memberSummary(team: Team): string {
    return team.memberIds.map((id) => this.staffName(id)).join(', ');
  }

  startCreate(): void {
    this.isNew.set(true);
    this.editingTeamId.set(null);
    this.formName.set('');
    this.formActive.set(true);
    this.formMemberIds.set(new Set());
    this.formAmId.set(null);
    this.error.set(null);
    this.view.set('editor');
  }

  startEdit(team: Team): void {
    this.isNew.set(false);
    this.editingTeamId.set(team.id);
    this.formName.set(team.name);
    this.formActive.set(team.isActive);
    this.formMemberIds.set(new Set(team.memberIds));
    this.formAmId.set(team.accountManagerId);
    this.error.set(null);
    this.view.set('editor');
  }

  backToList(): void {
    this.view.set('list');
  }

  isMember(id: string): boolean {
    return this.formMemberIds().has(id);
  }

  toggleMember(id: string): void {
    this.formMemberIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
        if (this.formAmId() === id) this.formAmId.set(null); // AM must be a member
      } else {
        next.add(id);
      }
      return next;
    });
  }

  setAccountManager(id: string): void {
    this.formMemberIds.update((set) => new Set(set).add(id));
    this.formAmId.set(id);
  }

  get canSave(): boolean {
    return !this.saving() && this.formName().trim().length > 0 && this.formMemberIds().size > 0;
  }

  save(): void {
    if (!this.canSave) return;
    const payload = {
      name: this.formName().trim(),
      isActive: this.formActive(),
      memberIds: [...this.formMemberIds()],
      accountManagerId: this.formAmId(),
    };

    this.saving.set(true);
    this.error.set(null);

    const id = this.editingTeamId();
    const request$ = this.isNew() || id === null ? this.service.create(payload) : this.service.update(id, payload);

    request$.subscribe({
      next: (saved) => {
        this.teams.update((list) => {
          const others = this.isNew() || id === null ? list : list.filter((t) => t.id !== id);
          return [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
        });
        this.saving.set(false);
        this.view.set('list');
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
