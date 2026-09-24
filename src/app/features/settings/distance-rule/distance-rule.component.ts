import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DistanceRule, DistanceRuleService } from '../../../services/distance-rule.service';

@Component({
  selector: 'app-distance-rule',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './distance-rule.component.html',
  styleUrl: './distance-rule.component.scss',
})
export class DistanceRuleComponent implements OnInit {
  private readonly service = inject(DistanceRuleService);

  protected readonly rules = signal<DistanceRule[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** pKeys currently saving. */
  protected readonly savingKeys = signal<Set<number>>(new Set());
  /** pKeys currently showing a "saved" flash. */
  protected readonly savedKeys = signal<Set<number>>(new Set());

  ngOnInit(): void {
    this.load();
  }

  /** Strip HTML tags/entities so legacy rich-text markup never leaks into the inline editors. */
  private stripHtml(text: string): string {
    return (text ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getAll().subscribe({
      next: (rules) => {
        this.rules.set((rules ?? []).map((r) => ({ ...r, description: this.stripHtml(r.description) })));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load distance rules. Please try again.');
        this.loading.set(false);
      },
    });
  }

  updateDescription(pKey: number, value: string): void {
    this.rules.update((list) => list.map((r) => (r.pKey === pKey ? { ...r, description: value } : r)));
  }

  updateValue(pKey: number, value: number | null): void {
    this.rules.update((list) => list.map((r) => (r.pKey === pKey ? { ...r, value } : r)));
  }

  isSaved(pKey: number): boolean {
    return this.savedKeys().has(pKey);
  }

  isSaving(pKey: number): boolean {
    return this.savingKeys().has(pKey);
  }

  saveRule(pKey: number): void {
    const row = this.rules().find((r) => r.pKey === pKey);
    if (!row || !row.description.trim()) return;

    this.error.set(null);
    this.savingKeys.update((s) => new Set(s).add(pKey));
    this.service.update(pKey, { description: row.description, value: row.value }).subscribe({
      next: (saved) => {
        this.rules.update((list) => list.map((r) => (r.pKey === pKey ? saved : r)));
        this.savingKeys.update((s) => { const n = new Set(s); n.delete(pKey); return n; });
        this.savedKeys.update((s) => new Set(s).add(pKey));
        setTimeout(() => {
          this.savedKeys.update((s) => { const n = new Set(s); n.delete(pKey); return n; });
        }, 2500);
      },
      error: () => {
        this.savingKeys.update((s) => { const n = new Set(s); n.delete(pKey); return n; });
        this.error.set('Failed to save. Please try again.');
      },
    });
  }
}
