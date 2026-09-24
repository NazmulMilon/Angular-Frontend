import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SalesChargeTypeOption,
  TradeChargeRow,
  TradeChargeTemplateService,
  TradeOption,
} from '../../../services/trade-charge-template.service';

@Component({
  selector: 'app-trade-charge-template',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './trade-charge-template.component.html',
  styleUrl: './trade-charge-template.component.scss',
})
export class TradeChargeTemplateComponent implements OnInit {
  private readonly service = inject(TradeChargeTemplateService);

  protected readonly trades = signal<TradeOption[]>([]);
  protected readonly chargeTypes = signal<SalesChargeTypeOption[]>([]);
  protected readonly rows = signal<TradeChargeRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly editingKey = signal<string | null>(null);
  protected readonly isNew = signal(false);
  protected readonly formTradeKey = signal('');
  protected readonly formChargeTypeKey = signal('');
  protected readonly formDescription = signal('');
  protected readonly formAmount = signal<number | null>(null);

  /** Strip HTML tags/entities so legacy rich-text markup never leaks into the UI. */
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

  /** Compact single-line grid preview: strip tags, then truncate. */
  preview(text: string, max = 120): string {
    const flat = this.stripHtml(text);
    return flat.length > max ? flat.slice(0, max) + '…' : flat;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.trades.set(data.trades ?? []);
        this.chargeTypes.set(data.chargeTypes ?? []);
        this.rows.set(data.rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load the trade charge template. Please try again.');
        this.loading.set(false);
      },
    });
  }

  get isFormOpen(): boolean {
    return this.isNew() || this.editingKey() !== null;
  }

  startCreate(): void {
    this.isNew.set(true);
    this.editingKey.set(null);
    this.formTradeKey.set('');
    this.formChargeTypeKey.set('');
    this.formDescription.set('');
    this.formAmount.set(null);
    this.error.set(null);
  }

  startEdit(row: TradeChargeRow): void {
    this.isNew.set(false);
    this.editingKey.set(row.pKey);
    this.formTradeKey.set(row.tradeKey);
    this.formChargeTypeKey.set(row.chargeTypeKey);
    this.formDescription.set(this.stripHtml(row.description));
    this.formAmount.set(row.amount);
    this.error.set(null);
  }

  cancelEdit(): void {
    this.isNew.set(false);
    this.editingKey.set(null);
  }

  /** Mirrors V1's auto-fill of Description from the selected charge type. */
  onChargeTypeChange(key: string): void {
    this.formChargeTypeKey.set(key);
    const ct = this.chargeTypes().find((c) => c.key === key);
    if (ct && ct.description && !this.formDescription().trim()) {
      this.formDescription.set(this.stripHtml(ct.description));
    }
  }

  get canSave(): boolean {
    return (
      this.formTradeKey().length > 0 &&
      this.formChargeTypeKey().length > 0 &&
      this.formAmount() !== null
    );
  }

  save(): void {
    if (!this.canSave) return;
    const req = {
      tradeKey: this.formTradeKey(),
      chargeTypeKey: this.formChargeTypeKey(),
      description: this.formDescription(),
      amount: this.formAmount(),
    };
    this.saving.set(true);
    this.error.set(null);

    if (this.isNew()) {
      this.service.create(req).subscribe({
        next: (saved) => {
          this.rows.update((list) => [saved, ...list]);
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

    const key = this.editingKey();
    if (key == null) {
      this.saving.set(false);
      return;
    }
    this.service.update(key, req).subscribe({
      next: (saved) => {
        this.rows.update((list) => list.map((r) => (r.pKey === key ? saved : r)));
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
