import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { ButtonComponent } from '../../../shared/components/button/button.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../shared/components/searchable-select/searchable-select.component';
import { CustomerListService, TradeChargeRow } from '../../../services/customer-list.service';

/**
 * Rates / Trade charges (RFI-345 Phase 4) — embedded in the Edit Customer page's
 * "Rates" accordion panel. Lists a customer's trade charges and adds / edits /
 * (de)activates them (trade + charge type + amount + description).
 */
@Component({
  selector: 'app-customer-rates',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonComponent, SearchableSelectComponent],
  templateUrl: './customer-rates.component.html',
  styleUrl: './customer-rates.component.scss',
})
export class CustomerRatesComponent implements OnInit {
  @Input({ required: true }) customerKey!: string;

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CustomerListService);

  protected readonly charges = signal<TradeChargeRow[]>([]);
  protected readonly tradeOptions = signal<SearchableSelectOption[]>([]);
  protected readonly chargeTypeOptions = signal<SearchableSelectOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly listError = signal<string | null>(null);

  protected readonly editing = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly rowBusy = signal<string | null>(null);

  protected readonly form = this.fb.group({
    tradeKey: [''],
    salesChargeTypeKey: [''],
    amount: [''],
    description: [''],
    isActive: [true],
  });

  ngOnInit(): void {
    this.load();
    this.service.getTradeChargeOptions().subscribe({
      next: (o) => {
        this.tradeOptions.set(o.trades.map((t) => ({ value: t.id, text: t.name })));
        this.chargeTypeOptions.set(o.chargeTypes.map((c) => ({ value: c.id, text: c.name })));
      },
      error: () => { this.tradeOptions.set([]); this.chargeTypeOptions.set([]); },
    });
  }

  private load(): void {
    if (!this.customerKey) return;
    this.loading.set(true);
    this.listError.set(null);
    this.service.getTradeCharges(this.customerKey).subscribe({
      next: (rows) => { this.charges.set(rows); this.loading.set(false); },
      error: (err) => { this.listError.set(this.messageFrom(err, 'Failed to load rates.')); this.loading.set(false); },
    });
  }

  protected startAdd(): void {
    this.form.reset({ tradeKey: '', salesChargeTypeKey: '', amount: '', description: '', isActive: true });
    this.saveError.set(null);
    this.editing.set('new');
  }

  protected startEdit(c: TradeChargeRow): void {
    this.form.reset({
      tradeKey: c.tradeKey ?? '',
      salesChargeTypeKey: c.salesChargeTypeKey ?? '',
      amount: c.amount != null ? String(c.amount) : '',
      description: c.description ?? '',
      isActive: c.isActive,
    });
    this.saveError.set(null);
    this.editing.set(c.pkey);
  }

  protected cancel(): void {
    this.editing.set(null);
    this.saveError.set(null);
  }

  protected save(): void {
    const v = this.form.getRawValue();
    const amt = (v.amount ?? '').toString().trim();
    const dto = {
      tradeKey: (v.tradeKey ?? '').toString() || null,
      salesChargeTypeKey: (v.salesChargeTypeKey ?? '').toString() || null,
      amount: amt ? Number(amt) : null,
      description: (v.description ?? '').toString().trim() || null,
      isActive: !!v.isActive,
    };
    const key = this.editing();
    this.saving.set(true);
    this.saveError.set(null);
    const call =
      key === 'new'
        ? this.service.createTradeCharge(this.customerKey, dto)
        : this.service.updateTradeCharge(this.customerKey, key!, dto);
    call.subscribe({
      next: () => { this.saving.set(false); this.editing.set(null); this.load(); },
      error: (err) => { this.saving.set(false); this.saveError.set(this.messageFrom(err, 'Failed to save rate.')); },
    });
  }

  protected toggleActive(c: TradeChargeRow): void {
    this.rowBusy.set(c.pkey);
    this.service.setTradeChargeActive(this.customerKey, c.pkey, !c.isActive).subscribe({
      next: () => { this.rowBusy.set(null); this.load(); },
      error: (err) => { this.rowBusy.set(null); this.listError.set(this.messageFrom(err, 'Failed to update rate.')); },
    });
  }

  private messageFrom(err: unknown, fallback: string): string {
    const e = err as { error?: { error?: string; details?: string }; message?: string };
    return e?.error?.details || e?.error?.error || e?.message || fallback;
  }
}
