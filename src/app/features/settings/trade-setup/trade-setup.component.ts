import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TradeCategory, TradeItem, TradeSetupService } from '../../../services/trade-setup.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-trade-setup',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './trade-setup.component.html',
  styleUrl: './trade-setup.component.scss',
})
export class TradeSetupComponent implements OnInit {
  private readonly service = inject(TradeSetupService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly categories = signal<TradeCategory[]>([]);
  protected readonly trades = signal<TradeItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly search = signal('');

  protected readonly filteredTrades = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.trades();
    return this.trades().filter(
      (t) => t.name.toLowerCase().includes(q) || this.categoryName(t.categoryKey).toLowerCase().includes(q),
    );
  });

  categoryName(key: string): string {
    return this.categories().find((c) => c.key === key)?.name ?? key;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.categories.set(data.categories ?? []);
        this.trades.set(data.trades ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load trades. Please try again.');
        this.loading.set(false);
      },
    });
  }

  // ── Trade form ──
  protected readonly editingTradeId = signal<string | null>(null);
  protected readonly tName = signal('');
  protected readonly tLevel = signal<number | null>(null);
  protected readonly tCategoryKey = signal('');

  selectTrade(row: TradeItem): void {
    this.editingTradeId.set(row.id);
    this.tName.set(row.name);
    this.tLevel.set(row.level);
    this.tCategoryKey.set(row.categoryKey);
    this.error.set(null);
  }

  clearTrade(): void {
    this.editingTradeId.set(null);
    this.tName.set('');
    this.tLevel.set(null);
    this.tCategoryKey.set('');
  }

  get canSaveTrade(): boolean {
    return !this.saving() && this.tName().trim().length > 0 && this.tLevel() !== null && this.tCategoryKey().length > 0;
  }

  saveTrade(): void {
    if (!this.canSaveTrade) return;
    const payload = { name: this.tName().trim(), level: this.tLevel(), categoryKey: this.tCategoryKey() };
    const key = this.editingTradeId();
    this.saving.set(true);
    this.error.set(null);
    const req$ = key === null ? this.service.createTrade(payload) : this.service.updateTrade(key, payload);
    req$.subscribe({
      next: (saved) => {
        this.trades.update((list) => {
          const others = key === null ? list : list.filter((t) => t.id !== key);
          return [...others, saved].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
        });
        this.saving.set(false);
        this.clearTrade();
      },
      error: () => { this.error.set('Failed to save trade. Please try again.'); this.saving.set(false); },
    });
  }

  async deleteTrade(row: TradeItem): Promise<void> {
    if (row.id == null) return;
    const confirmed = await this.confirmDialog().open({
      title: 'Remove trade', message: `Are you sure you want to remove "${row.name}"?`,
      confirmText: 'Delete', cancelText: 'Cancel', tone: 'danger',
    });
    if (!confirmed) return;
    const id = row.id;
    this.error.set(null);
    this.service.deleteTrade(id).subscribe({
      next: () => {
        this.trades.update((list) => list.filter((t) => t.id !== id));
        if (this.editingTradeId() === id) this.clearTrade();
      },
      error: () => this.error.set('Failed to delete trade. Please try again.'),
    });
  }

  // ── Category management panel ──
  protected readonly showCategories = signal(false);
  protected readonly editingCatKey = signal<string | null>(null);
  protected readonly cName = signal('');
  protected readonly cLevel = signal<number | null>(null);

  toggleCategories(): void {
    this.showCategories.update((v) => !v);
  }

  selectCat(cat: TradeCategory): void {
    this.editingCatKey.set(cat.key);
    this.cName.set(cat.name);
    this.cLevel.set(cat.level);
    this.error.set(null);
  }

  clearCat(): void {
    this.editingCatKey.set(null);
    this.cName.set('');
    this.cLevel.set(null);
  }

  get canSaveCat(): boolean {
    return !this.saving() && this.cName().trim().length > 0 && this.cLevel() !== null;
  }

  saveCat(): void {
    if (!this.canSaveCat) return;
    const payload = { name: this.cName().trim(), level: this.cLevel() };
    const key = this.editingCatKey();
    this.saving.set(true);
    this.error.set(null);
    const req$ = key === null ? this.service.createCategory(payload) : this.service.updateCategory(key, payload);
    req$.subscribe({
      next: (saved) => {
        this.categories.update((list) => {
          const others = key === null ? list : list.filter((c) => c.key !== key);
          return [...others, saved].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
        });
        // A rename resyncs the denormalized category name on trades — reflect it locally.
        if (key !== null) {
          this.trades.update((list) => list.map((t) => t));
        }
        this.saving.set(false);
        this.clearCat();
      },
      error: () => { this.error.set('Failed to save category. Please try again.'); this.saving.set(false); },
    });
  }

  async deleteCat(cat: TradeCategory): Promise<void> {
    if (this.catInUse(cat)) return; // client-side hint; server also enforces
    const confirmed = await this.confirmDialog().open({
      title: 'Remove category', message: `Are you sure you want to remove "${cat.name}"?`,
      confirmText: 'Delete', cancelText: 'Cancel', tone: 'danger',
    });
    if (!confirmed) return;
    this.error.set(null);
    this.service.deleteCategory(cat.key).subscribe({
      next: () => {
        this.categories.update((list) => list.filter((c) => c.key !== cat.key));
        if (this.editingCatKey() === cat.key) this.clearCat();
      },
      error: (e) => {
        this.error.set(e?.status === 409
          ? `"${cat.name}" is in use and cannot be removed.`
          : 'Failed to delete category. Please try again.');
      },
    });
  }

  catInUse(cat: TradeCategory): boolean {
    return this.trades().some((t) => t.categoryKey === cat.key);
  }
}
