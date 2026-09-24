import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe, DecimalPipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportService } from '../../../services/report.service';
import {
  MultiSelectComponent,
  SelectOption,
} from '../../../shared/components/multi-select/multi-select.component';
import {
  CustomerGrossProfitFilter,
  CustomerGrossProfitPerJob,
  CustomerGrossProfitExportRequest,
} from '../../../models/report.model';

type DateRangePreset = 'all' | 'day' | 'week' | 'month' | 'quarter' | 'custom';

type ColType =
  | 'text'
  | 'date'
  | 'currency'
  | 'currency-nullable'
  | 'profit'
  | 'percent'
  | 'boolean';

interface ColDef {
  header: string;
  field: string;
  width: string;
  align?: 'left' | 'right';
  type: ColType;
}

interface SortState {
  col: number;
  dir: 'asc' | 'desc';
}

@Component({
  selector: 'app-customer-gross-profit',
  standalone: true,
  imports: [MultiSelectComponent, FormsModule, DatePipe, DecimalPipe, CurrencyPipe],
  templateUrl: './customer-gross-profit.component.html',
  styleUrl: './customer-gross-profit.component.scss',
})
export class CustomerGrossProfitComponent implements OnInit {
  private static readonly initialCalendarMonth = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return {
      year,
      month,
      monthValue: `${year}-${String(month).padStart(2, '0')}`,
    } as const;
  })();

  readonly Math = Math;
  private readonly reportService = inject(ReportService);

  readonly customerOptions = signal<SelectOption[]>([]);
  readonly priorityOptions = signal<SelectOption[]>([]);
  readonly accountManagerOptions = signal<SelectOption[]>([]);
  readonly tradeOptions = signal<SelectOption[]>([]);

  readonly selectedCustomers = signal<string[]>([]);
  readonly selectedPriorities = signal<string[]>([]);
  readonly selectedAccountManagers = signal<string[]>([]);
  readonly selectedTrades = signal<string[]>([]);

  readonly datePreset = signal<DateRangePreset>('month');
  readonly dayDate = signal('');
  readonly weekDate = signal('');
  readonly weekRangeLabel = signal('');
  readonly monthValue = signal<string>(CustomerGrossProfitComponent.initialCalendarMonth.monthValue);
  readonly monthYear = signal(CustomerGrossProfitComponent.initialCalendarMonth.year);
  readonly selectedMonth = signal(CustomerGrossProfitComponent.initialCalendarMonth.month);
  readonly monthList = [
    { value: 1, label: 'Jan' },
    { value: 2, label: 'Feb' },
    { value: 3, label: 'Mar' },
    { value: 4, label: 'Apr' },
    { value: 5, label: 'May' },
    { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' },
    { value: 8, label: 'Aug' },
    { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' },
    { value: 11, label: 'Nov' },
    { value: 12, label: 'Dec' },
  ];
  readonly quarterYear = signal(new Date().getFullYear());
  readonly selectedQuarter = signal(0);
  readonly quarterYears: number[] = Array.from(
    { length: 6 },
    (_, i) => new Date().getFullYear() - i,
  );
  readonly quarterTooltips: Record<number, string> = {
    1: 'Jan, Feb, Mar',
    2: 'Apr, May, Jun',
    3: 'Jul, Aug, Sep',
    4: 'Oct, Nov, Dec',
  };
  readonly customDateFrom = signal('');
  readonly customDateTo = signal('');
  readonly datePickerExpanded = signal(false);

  readonly rows = signal<CustomerGrossProfitPerJob[]>([]);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly totalRecords = signal(0);
  readonly filteredRecords = signal(0);

  readonly draw = signal(1);
  readonly pageStart = signal(0);
  readonly pageLength = signal(100);
  readonly sort = signal<SortState>({ col: 0, dir: 'desc' });

  readonly currentPage = computed(() => Math.floor(this.pageStart() / this.pageLength()) + 1);
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRecords() / this.pageLength())),
  );

  readonly allColumns: ColDef[] = [
    { header: 'Job PO', field: 'jobPO', width: '60px', type: 'text' },
    { header: 'Customer', field: 'customerName', width: '150px', type: 'text' },
    { header: 'Location', field: 'location', width: '140px', type: 'text' },
    { header: 'Address', field: 'locationAddress', width: '240px', type: 'text' },
    { header: 'Trade', field: 'trade', width: '100px', type: 'text' },
    { header: 'Vendor Name', field: 'vendorName', width: '155px', type: 'text' },
    { header: 'Priority', field: 'priority', width: '90px', type: 'text' },
    { header: 'Account Manager', field: 'accountManagerName', width: '140px', type: 'text' },
    {
      header: 'Invoice Creation Date',
      field: 'invoiceCreationDate',
      width: '120px',
      type: 'date',
    },
    { header: 'Invoice Sent Date', field: 'invoiceSentDate', width: '120px', type: 'date' },
    {
      header: 'Are Invoices Sent?',
      field: 'areInvoicesSent',
      width: '120px',
      type: 'boolean',
    },

    {
      header: 'Customer Invoice Amount',
      field: 'customerInvoice',
      width: '120px',
      align: 'right',
      type: 'currency',
    },
    {
      header: 'Vendor Bill',
      field: 'vendorBill',
      width: '110px',
      align: 'right',
      type: 'currency-nullable',
    },
    {
      header: 'Vendor Revised DNE',
      field: 'vendorRevisedDNE',
      width: '110px',
      align: 'right',
      type: 'currency-nullable',
    },
    {
      header: 'Profit Amount',
      field: 'rowProfitAmount',
      width: '110px',
      align: 'right',
      type: 'profit',
    },

    {
      header: 'Gross Margin %',
      field: 'marginPercent',
      width: '80px',
      align: 'right',
      type: 'percent',
    },
    { header: 'Bill/DNE', field: 'usedVendorBillOrDNE', width: '70px', type: 'text' },
  ];

  readonly columnOptions: SelectOption[] = this.allColumns.map((c: ColDef) => ({
    key: c.field,
    label: c.header,
  }));
  readonly selectedColumnKeys = signal<string[]>(this.allColumns.map((c) => c.field));
  readonly visibleFields = signal<Set<string>>(new Set(this.allColumns.map((c) => c.field)));

  readonly displayedColumns = computed(() =>
    this.allColumns.filter((c) => this.visibleFields().has(c.field)),
  );

  private readonly sumFields = new Set([
    'customerInvoice',
    'vendorBill',
    'vendorRevisedDNE',
    'rowProfitAmount',
  ]);

  // readonly sumCustomerInvoice = computed(() =>
  //   this.rows().reduce((acc, r) => acc + (r.customerInvoice ?? 0), 0),
  // );
  // readonly sumVendorBill = computed(() =>
  //   this.rows().reduce((acc, r) => acc + (r.vendorBill ?? 0), 0),
  // );
  // readonly sumVendorRevisedDNE = computed(() =>
  //   this.rows().reduce((acc, r) => acc + (r.vendorRevisedDNE ?? 0), 0),
  // );

  readonly sumCustomerInvoice = computed(() => {
    const data = this.rows();
    return data.length > 0 ? (data[0].totalCustomerInvoice ?? 0) : 0;
  });
  readonly sumVendorBill = computed(() => {
    const data = this.rows();
    return data.length > 0 ? (data[0].totalVendorBill ?? 0) : 0;
  });
  readonly sumVendorRevisedDNE = computed(() => {
    const data = this.rows();
    return data.length > 0 ? (data[0].totalVendorRevisedDNE ?? 0) : 0;
  });

  readonly totalVendorExp = computed(() => this.sumVendorBill() + this.sumVendorRevisedDNE());
  readonly grossProfit = computed(() => this.sumCustomerInvoice() - this.totalVendorExp());
  readonly grossProfitPercent = computed(() => {
    const inv = this.sumCustomerInvoice();
    return inv !== 0 ? (this.grossProfit() / inv) * 100 : 0;
  });

  readonly overheadPercent = signal(0);
  readonly wageComponent = signal(0);

  readonly overheadAmount = computed(
    () => (this.overheadPercent() / 100) * this.sumCustomerInvoice(),
  );

  setOverheadPercent(value: any) {
    let v = Number(value ?? 0);

    if (isNaN(v)) return;

    v = Math.min(99, Math.max(0, v));

    this.overheadPercent.set(v);
  }
  onInput(event: Event) {
    const input = event.target as HTMLInputElement;

    // Remove non-digits
    let value = input.value.replace(/\D/g, '');

    // Limit to 2 digits
    if (value.length > 2) {
      value = value.slice(0, 2);
    }

    // Convert safely
    const numericValue = Number(value || 0);

    this.overheadPercent.set(numericValue);

    // Reflect cleaned value back to UI
    input.value = value;
  }
  readonly netIncome = computed(
    () => this.grossProfit() - this.overheadAmount() - this.wageComponent(),
  );

  isSumColumn(field: string): boolean {
    return this.sumFields.has(field);
  }

  getColumnSum(field: string): number {
    switch (field) {
      case 'customerInvoice':
        return this.sumCustomerInvoice();
      case 'vendorBill':
        return this.sumVendorBill();
      case 'vendorRevisedDNE':
        return this.sumVendorRevisedDNE();
      case 'rowProfitAmount':
        return this.rows().reduce((acc, row) => acc + this.computeRowProfitAmount(row), 0);
      default:
        return 0;
    }
  }

  /**
   * Row profit: customer invoice minus vendor bill when that is the cost basis,
   * otherwise revised DNE. Uses `usedVendorBillOrDNE` when it indicates Bill vs DNE;
   * otherwise prefers bill, then DNE (same idea as “invoice or DNE if no invoice”).
   */
  computeRowProfitAmount(row: CustomerGrossProfitPerJob): number {
    const invoice = row.customerInvoice ?? 0;
    const bill = row.vendorBill;
    const dne = row.vendorRevisedDNE;
    const tag = row.usedVendorBillOrDNE?.toLowerCase().trim() ?? '';

    let cost = 0;
    if (tag.includes('bill')) {
      cost = bill ?? 0;
    } else if (tag.includes('dne')) {
      cost = dne ?? 0;
    } else {
      cost = bill ?? dne ?? 0;
    }
    return invoice - cost;
  }

  ngOnInit(): void {
    this.loadFilterOptions();
    this.loadData();
  }

  onCustomerChange(keys: string[]): void {
    this.selectedCustomers.set(keys);
    this.resetAndLoad();
  }

  onPriorityChange(keys: string[]): void {
    this.selectedPriorities.set(keys);
    this.resetAndLoad();
  }

  onAccountManagerChange(keys: string[]): void {
    this.selectedAccountManagers.set(keys);
    this.resetAndLoad();
  }

  onTradeChange(keys: string[]): void {
    this.selectedTrades.set(keys);
    this.resetAndLoad();
  }

  onDatePresetChange(preset: DateRangePreset): void {
    this.datePreset.set(preset);
    this.dayDate.set('');
    this.weekDate.set('');
    this.weekRangeLabel.set('');
    this.monthValue.set('');
    this.selectedMonth.set(0);
    this.selectedQuarter.set(0);
    this.customDateFrom.set('');
    this.customDateTo.set('');
    this.datePickerExpanded.set(preset !== 'all');
    if (preset === 'all') {
      this.resetAndLoad();
    }
  }

  dateRangeLabel(): string {
    switch (this.datePreset()) {
      case 'day': {
        const d = this.dayDate();
        return d ? `Day: ${this.formatDisplay(d)}` : '';
      }
      case 'week':
        return this.weekRangeLabel() || '';
      case 'month': {
        const m = this.selectedMonth();
        if (m <= 0) return '';
        const label = this.monthList.find((x) => x.value === m)?.label ?? '';
        return `Month: ${label} ${this.monthYear()}`;
      }
      case 'quarter': {
        const q = this.selectedQuarter();
        return q > 0 ? `Quarter: Q${q} ${this.quarterYear()}` : '';
      }
      case 'custom': {
        const from = this.customDateFrom();
        const to = this.customDateTo();
        if (from && to) return `${this.formatDisplay(from)} — ${this.formatDisplay(to)}`;
        return '';
      }
      default:
        return '';
    }
  }

  private formatDisplay(dateStr: string): string {
    const [y, m, d] = dateStr.split('-');
    return `${m}/${d}/${y}`;
  }

  onDayDateChange(date: string): void {
    this.dayDate.set(date);
    if (date) {
      this.datePickerExpanded.set(false);
      this.resetAndLoad();
    }
  }

  onWeekDateChange(date: string): void {
    this.weekDate.set(date);
    if (!date) return;
    const d = new Date(date + 'T00:00:00');
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    this.weekRangeLabel.set(`Week of ${this.displayDate(mon)} - ${this.displayDate(sun)}`);
    this.datePickerExpanded.set(false);
    this.resetAndLoad();
  }

  onMonthChange(value: string): void {
    this.monthValue.set(value);
    if (value) this.resetAndLoad();
  }

  onMonthYearChange(year: number): void {
    this.monthYear.set(year);
    if (this.selectedMonth() > 0) {
      this.monthValue.set(`${year}-${String(this.selectedMonth()).padStart(2, '0')}`);
      this.resetAndLoad();
    }
  }

  onMonthSelect(month: number): void {
    this.selectedMonth.set(month);
    const year = this.monthYear();
    this.monthValue.set(`${year}-${String(month).padStart(2, '0')}`);
    this.datePickerExpanded.set(false);
    this.resetAndLoad();
  }

  onQuarterChange(q: number): void {
    this.selectedQuarter.set(q);
    if (q > 0) {
      this.datePickerExpanded.set(false);
      this.resetAndLoad();
    }
  }

  onQuarterYearChange(year: number): void {
    this.quarterYear.set(year);
    if (this.selectedQuarter() > 0) this.resetAndLoad();
  }

  onCustomDateChange(): void {
    if (this.customDateFrom() && this.customDateTo()) {
      this.datePickerExpanded.set(false);
      this.resetAndLoad();
    }
  }

  sortBy(colIndex: number): void {
    const current = this.sort();
    if (current.col === colIndex) {
      this.sort.set({ col: colIndex, dir: current.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      this.sort.set({ col: colIndex, dir: 'asc' });
    }
    this.pageStart.set(0);
    this.loadData();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.pageStart.set((page - 1) * this.pageLength());
    this.loadData();
  }

  goToPageFromInput(input: HTMLInputElement): void {
    const page = Math.floor(Number(input.value));
    if (!page || page < 1 || page > this.totalPages()) return;
    this.goToPage(page);
    input.value = '';
  }

  onPageLengthChange(event: Event): void {
    this.pageLength.set(+(event.target as HTMLSelectElement).value);
    this.pageStart.set(0);
    this.loadData();
  }

  onPageSizeInput(input: HTMLInputElement): void {
    const size = Math.floor(Number(input.value));
    if (!size || size < 1 || size === this.pageLength()) return;
    this.pageLength.set(size);
    this.pageStart.set(0);
    this.loadData();
  }

  openPicker(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.showPicker?.();
  }

  onColumnSelectionChange(keys: string[]): void {
    this.selectedColumnKeys.set(keys);
  }

  applyColumns(): void {
    this.visibleFields.set(new Set(this.selectedColumnKeys()));
    this.pageStart.set(0);
    this.sort.set({ col: 0, dir: 'desc' });
    this.draw.update((d) => d + 1);
    this.loadData();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cellValue(row: CustomerGrossProfitPerJob, field: string): any {
    if (field === 'rowProfitAmount') {
      return this.computeRowProfitAmount(row);
    }
    return (row as unknown as Record<string, unknown>)[field];
  }

  getProfitClass(value: number): string {
    if (value > 0) return 'text-profit';
    if (value < 0) return 'text-loss';
    return '';
  }

  exportToExcel(): void {
    this.exporting.set(true);
    const s = this.sort();
    const filter = this.buildFilter();
    const request: CustomerGrossProfitExportRequest = {
      filter,
      selectedColumns: filter.selectedColumns,
      sortCol: s.col,
      sortDir: s.dir,
      overheadPercent: this.overheadPercent(),
      wageComponent: this.wageComponent(),
    };

    this.reportService.exportToExcel(request).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CustomerGrossProfit_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: (err) => {
        console.error('Export failed:', err);
        this.exporting.set(false);
      },
    });
  }

  private resetAndLoad(): void {
    this.pageStart.set(0);
    this.draw.update((d) => d + 1);
    this.loadData();
  }

  private buildFilter(): CustomerGrossProfitFilter {
    const customers = this.selectedCustomers();
    const priorities = this.selectedPriorities();
    const managers = this.selectedAccountManagers();
    const trades = this.selectedTrades();
    const { dateFrom, dateTo } = this.getDateRange();

    return {
      customerKeys: customers.length ? customers : null,
      priorityKeys: priorities.length ? priorities : null,
      accountManagerKeys: managers.length ? managers : null,
      tradeKeys: trades.length ? trades : null,
      dateFrom,
      dateTo,
      selectedColumns: this.orderedVisibleColumnFields(),
    };
  }

  /** Column field keys in table order for the report API (sort index matches this list). */
  private orderedVisibleColumnFields(): string[] {
    return this.allColumns
      .filter((c) => this.visibleFields().has(c.field))
      .map((c) => c.field);
  }

  private getDateRange(): { dateFrom: string | null; dateTo: string | null } {
    const preset = this.datePreset();
    if (preset === 'all') return { dateFrom: null, dateTo: null };

    switch (preset) {
      case 'day': {
        const d = this.dayDate();
        return d ? { dateFrom: d, dateTo: d } : { dateFrom: null, dateTo: null };
      }
      case 'week': {
        const w = this.weekDate();
        if (!w) return { dateFrom: null, dateTo: null };
        const d = new Date(w + 'T00:00:00');
        const day = d.getDay();
        const diffToMon = day === 0 ? -6 : 1 - day;
        const mon = new Date(d);
        mon.setDate(d.getDate() + diffToMon);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        return { dateFrom: this.formatDate(mon), dateTo: this.formatDate(sun) };
      }
      case 'month': {
        const mv = this.monthValue();
        if (!mv) return { dateFrom: null, dateTo: null };
        const [y, m] = mv.split('-').map(Number);
        const first = new Date(y, m - 1, 1);
        const last = new Date(y, m, 0);
        return { dateFrom: this.formatDate(first), dateTo: this.formatDate(last) };
      }
      case 'quarter': {
        const q = this.selectedQuarter();
        if (q < 1 || q > 4) return { dateFrom: null, dateTo: null };
        const yr = this.quarterYear();
        const startMonth = (q - 1) * 3;
        const first = new Date(yr, startMonth, 1);
        const last = new Date(yr, startMonth + 3, 0);
        return { dateFrom: this.formatDate(first), dateTo: this.formatDate(last) };
      }
      case 'custom': {
        const from = this.customDateFrom();
        const to = this.customDateTo();
        return { dateFrom: from || null, dateTo: to || null };
      }
      default:
        return { dateFrom: null, dateTo: null };
    }
  }

  private formatDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private displayDate(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${d.getFullYear()}`;
  }

  private loadData(): void {
    this.loading.set(true);
    const s = this.sort();

    this.reportService
      .getCustomerGrossProfit(
        this.buildFilter(),
        this.draw(),
        this.pageStart(),
        this.pageLength(),
        s.col,
        s.dir,
      )
      .subscribe((res) => {
        if (res.data) {
          this.rows.set(res.data.data ?? []);
          this.totalRecords.set(res.data.totalRecords ?? 0);
          this.filteredRecords.set(res.data.filteredRecords ?? 0);
        } else {
          this.rows.set([]);
          this.totalRecords.set(0);
          this.filteredRecords.set(0);
        }
        this.loading.set(false);
      });
  }

  private loadFilterOptions(): void {
    this.reportService.getCustomers().subscribe((res) => {
      if (res.data) {
        this.customerOptions.set(res.data.map((i) => ({ key: i.value, label: i.text })));
      }
    });
    this.reportService.getPriorities().subscribe((res) => {
      if (res.data) {
        this.priorityOptions.set(res.data.map((i) => ({ key: i.value, label: i.text })));
      }
    });
    this.reportService.getAccountManagers().subscribe((res) => {
      if (res.data) {
        this.accountManagerOptions.set(res.data.map((i) => ({ key: i.value, label: i.text })));
      }
    });
    this.reportService.getTrades().subscribe((res) => {
      if (res.data) {
        this.tradeOptions.set(res.data.map((i) => ({ key: i.value, label: i.text })));
      }
    });
  }
}
