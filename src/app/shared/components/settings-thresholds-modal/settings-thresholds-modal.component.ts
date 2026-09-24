import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RuleThresholdService } from '../../../features/accounting/move-to-accounting/rule-threshold.service';
import { RuleThresholdForCustomerInvoice } from '../../../features/accounting/move-to-accounting/rule-threshold.model';

/** "⚙ Settings & thresholds" popup -- read-only view of the single live row in
 *  dbo.RuleThresholdForCustomerInvoice (RFIJobOps' SystemSetupDataController), the same table
 *  Admin Portal V1's Setup > Rule Threshold For Customer Invoice screen edits. Mirrors
 *  complete-screen-v2.html's showAutonomySettings() table, minus the "Workbook" column and the
 *  dev build note (confirmed with Nahid 2026-09-06) -- editing stays in Admin Portal V1. */
@Component({
  selector: 'app-settings-thresholds-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings-thresholds-modal.component.html',
  styleUrl: './settings-thresholds-modal.component.scss',
})
export class SettingsThresholdsModalComponent {
  private readonly ruleThresholdSvc = inject(RuleThresholdService);

  isOpen = input(false);

  readonly closed = output<void>();

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly data = signal<RuleThresholdForCustomerInvoice | null>(null);

  constructor() {
    effect(() => {
      if (this.isOpen()) this.load();
    });
  }

  private load(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.ruleThresholdSvc.get().subscribe({
      next: (res) => {
        this.loading.set(false);
        this.data.set(res);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load the current settings & thresholds. Please try again.');
      },
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  /** "09:00" -> "9:00 AM" (store-local, no timezone conversion -- these are wall-clock strings). */
  formatTime(hhmm: string | null): string {
    if (!hhmm) return '--';
    const [hStr, mStr] = hhmm.split(':');
    const h = Number(hStr);
    if (Number.isNaN(h)) return hhmm;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mStr} ${period}`;
  }

  botCallUnitLabel(dayHour: number): string {
    return dayHour === 2 ? 'hr' : 'day';
  }
}
