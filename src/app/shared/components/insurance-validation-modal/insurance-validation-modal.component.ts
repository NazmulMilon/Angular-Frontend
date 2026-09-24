import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorPayableService } from '../../../features/accounting/move-to-accounting/vendor-payable.service';
import { VendorInsuranceValidationState } from '../../../features/accounting/move-to-accounting/vendor-payable.model';

interface EditableInsuranceType {
  carry: boolean;
  expiry: string; // yyyy-MM-dd for <input type="date">
  file: File | null;
}

/** "🛡 Vendor Insurance Validation — {Vendor}" -- ports complete-screen-v2.html's
 *  showInsurance()/renderInsModal()/insSave()/insToggleCarry()/insResendEmail() (confirmed against
 *  PO 26689's Statesboro Painting Co. [current] / Rico's Remodeling [GL missing, WC not required],
 *  2026-09-11). Saving is a DIRECT write onto Vendor.GeneralInsurence/WorkersCom/
 *  GLinsurenceExpiry/WCinsurenceExpiry -- the same mechanism ProjectRCS's EditVendor
 *  btnSaveInsurance/btnFinalSubmit both converge on, confirmed via investigation of the real
 *  legacy code, not the separate (dead/never-approved) VendorInsurenceDateApproval mechanism. */
@Component({
  selector: 'app-insurance-validation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './insurance-validation-modal.component.html',
  styleUrl: './insurance-validation-modal.component.scss',
})
export class InsuranceValidationModalComponent {
  private readonly vendorPayableSvc = inject(VendorPayableService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  vendorKey = input<string | null>(null);
  vendorName = input<string | null>(null);

  readonly closed = output<void>();
  readonly changed = output<void>();

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly isSaving = signal(false);
  readonly isResending = signal(false);
  readonly isApproving = signal<'gl' | 'wc' | null>(null);
  readonly isRejecting = signal<'gl' | 'wc' | null>(null);
  readonly state = signal<VendorInsuranceValidationState | null>(null);

  readonly gl = signal<EditableInsuranceType>({ carry: true, expiry: '', file: null });
  readonly wc = signal<EditableInsuranceType>({ carry: true, expiry: '', file: null });

  /** What was actually loaded from the server, so save() can tell "the user changed this type"
   *  apart from "this type's pre-filled value (possibly an already-expired date) was just carried
   *  through untouched." Only a genuinely-changed type is included in the save request and
   *  validated for a past date -- an untouched, already-expired date on the OTHER type must not
   *  block saving the one the user actually edited. */
  private glOriginal: { carry: boolean; expiry: string } = { carry: true, expiry: '' };
  private wcOriginal: { carry: boolean; expiry: string } = { carry: true, expiry: '' };

  /** Reduce-only against the calendar, not the data: today's date in yyyy-MM-dd, used as the
   *  <input type="date"> min so the picker itself can't offer a past date -- mirrors ProjectRCS's
   *  EditVendor datepicker (minDate: today, "Past dates are not allowed"). */
  readonly todayInputValue = new Date().toISOString().slice(0, 10);

  private lastLoadedKey: string | null = null;

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const jobKey = this.jobKey();
      const vendorKey = this.vendorKey();
      const key = jobKey && vendorKey ? `${jobKey}|${vendorKey}` : null;

      if (!open) {
        this.lastLoadedKey = null;
        return;
      }
      if (!key || key === this.lastLoadedKey) return;

      this.lastLoadedKey = key;
      this.load();
    });
  }

  private load(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.loading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.getInsuranceValidation(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status) {
          this.applyState(res.data);
        } else {
          this.errorMessage.set(res.message || 'Unable to load insurance validation.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load insurance validation.');
      },
    });
  }

  private applyState(data: VendorInsuranceValidationState): void {
    this.state.set(data);
    const glExpiry = this.toDateInputValue(data.gl.expiry ?? data.gl.pending?.proposedExpiry ?? null);
    const wcExpiry = this.toDateInputValue(data.wc.expiry ?? data.wc.pending?.proposedExpiry ?? null);
    this.gl.set({ carry: data.gl.carry, expiry: glExpiry, file: null });
    this.wc.set({ carry: data.wc.carry, expiry: wcExpiry, file: null });
    this.glOriginal = { carry: data.gl.carry, expiry: glExpiry };
    this.wcOriginal = { carry: data.wc.carry, expiry: wcExpiry };
  }

  /** True once the user has actually changed GL's carry/date/file away from what was loaded --
   *  used to decide whether GL is included in the save request at all. */
  get glDirty(): boolean {
    const g = this.gl();
    return g.carry !== this.glOriginal.carry || g.expiry !== this.glOriginal.expiry || g.file !== null;
  }

  get wcDirty(): boolean {
    const w = this.wc();
    return w.carry !== this.wcOriginal.carry || w.expiry !== this.wcOriginal.expiry || w.file !== null;
  }

  /** Confirmed with Nahid 2026-09-14: a date can NEVER be saved without a certificate file
   *  accompanying it -- a fresh upload, or a pending vendor-submitted one already on file to
   *  promote. The date input is locked until one of those is available, so the constraint is
   *  enforced in the popup itself, not just as a save-time error. */
  get glDateEditable(): boolean {
    return this.gl().file !== null || !!this.state()?.gl.pending;
  }

  get wcDateEditable(): boolean {
    return this.wc().file !== null || !!this.state()?.wc.pending;
  }

  /** Expiry/proposedExpiry are calendar dates, not instants -- pull the yyyy-MM-dd straight out of
   *  the ISO string instead of round-tripping through a JS Date, which reinterprets it in the
   *  browser's local timezone and can shift the date backward a day (any US timezone is behind UTC). */
  private toDateInputValue(iso: string | null): string {
    if (!iso) return '';
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
    return match ? match[1] : '';
  }

  onGlCarryChange(carry: boolean): void {
    this.gl.set({ ...this.gl(), carry });
  }

  onWcCarryChange(carry: boolean): void {
    this.wc.set({ ...this.wc(), carry });
  }

  onGlExpiryChange(value: string): void {
    this.gl.set({ ...this.gl(), expiry: value });
  }

  onWcExpiryChange(value: string): void {
    this.wc.set({ ...this.wc(), expiry: value });
  }

  onGlFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.gl.set({ ...this.gl(), file: input.files?.[0] ?? null });
  }

  onWcFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.wc.set({ ...this.wc(), file: input.files?.[0] ?? null });
  }

  save(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    const gl = this.gl();
    const wc = this.wc();
    const glDirty = this.glDirty;
    const wcDirty = this.wcDirty;

    if (!glDirty && !wcDirty) {
      this.errorMessage.set('No changes to save.');
      return;
    }
    // Validation only applies to a type the user actually changed -- an untouched, already-expired
    // date on the OTHER type must not block saving the one being edited.
    if (glDirty && gl.carry && !gl.expiry) {
      this.errorMessage.set('General Liability expiry date is required (or switch to NO).');
      return;
    }
    if (wcDirty && wc.carry && !wc.expiry) {
      this.errorMessage.set('Workers Comp expiry date is required (or switch to NO).');
      return;
    }
    if (glDirty && gl.carry && gl.expiry < this.todayInputValue) {
      this.errorMessage.set('General Liability expiry date cannot be in the past.');
      return;
    }
    if (wcDirty && wc.carry && wc.expiry < this.todayInputValue) {
      this.errorMessage.set('Workers Comp expiry date cannot be in the past.');
      return;
    }
    // A date can never be saved without an accompanying certificate -- a fresh upload, or a
    // pending vendor-submitted one already on file to promote (confirmed with Nahid 2026-09-14).
    if (glDirty && gl.carry && !this.glDateEditable) {
      this.errorMessage.set('Upload a new General Liability certificate to update its expiry date.');
      return;
    }
    if (wcDirty && wc.carry && !this.wcDateEditable) {
      this.errorMessage.set('Upload a new Workers Comp certificate to update its expiry date.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc
      .saveInsurance(jobKey, vendorKey, {
        saveGl: glDirty,
        glCarry: gl.carry,
        glExpiry: gl.carry ? gl.expiry : null,
        glFile: gl.file,
        saveWc: wcDirty,
        wcCarry: wc.carry,
        wcExpiry: wc.carry ? wc.expiry : null,
        wcFile: wc.file,
      })
      .subscribe({
        next: (res) => {
          this.isSaving.set(false);
          if (res.status) {
            this.applyState(res.data);
            this.successMessage.set(res.message || 'Insurance info saved.');
            this.changed.emit();
          } else {
            this.errorMessage.set(res.message || 'Unable to save.');
          }
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(err?.error?.message || 'Unable to save.');
        },
      });
  }

  resendEmail(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.isResending.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.resendInsuranceEmail(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.isResending.set(false);
        if (res.status) {
          this.successMessage.set(res.message || 'Insurance request email re-sent.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to send the email.');
        }
      },
      error: (err) => {
        this.isResending.set(false);
        this.errorMessage.set(err?.error?.message || 'Unable to send the email.');
      },
    });
  }

  /** "✓ Accept" a pending GL/WC submission -- ports RCS_app's SaveApproveInsuranceForVendor/
   *  SaveApproveWorkersCOMForVendor. */
  approvePending(type: 'gl' | 'wc'): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.isApproving.set(type);
    this.errorMessage.set('');
    this.successMessage.set('');
    const call = type === 'gl' ? this.vendorPayableSvc.approveGlInsurance(jobKey, vendorKey) : this.vendorPayableSvc.approveWcInsurance(jobKey, vendorKey);
    call.subscribe({
      next: (res) => {
        this.isApproving.set(null);
        if (res.status) {
          this.applyState(res.data);
          this.successMessage.set(res.message || 'Approved.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to approve.');
        }
      },
      error: (err) => {
        this.isApproving.set(null);
        this.errorMessage.set(err?.error?.message || 'Unable to approve.');
      },
    });
  }

  /** "✕ Reject — request resubmit" a pending GL/WC submission -- ports RCS_app's
   *  SaveInsuranceSendForResubmittal/SaveWorkersCOMSendForResubmittal. Reason is required
   *  (mirrors the mockup-established pattern for this feature's other reason-gated actions). */
  rejectPending(type: 'gl' | 'wc'): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    const label = type === 'gl' ? 'General Liability' : 'Workers Comp';
    const notes = window.prompt(`Reason the vendor needs to resubmit their ${label} certificate (sent to the vendor):`, '');
    if (notes === null) return;
    if (!notes.trim()) {
      this.errorMessage.set('A reason is required to request resubmission.');
      return;
    }

    this.isRejecting.set(type);
    this.errorMessage.set('');
    this.successMessage.set('');
    const call = type === 'gl'
      ? this.vendorPayableSvc.rejectGlInsurance(jobKey, vendorKey, notes.trim())
      : this.vendorPayableSvc.rejectWcInsurance(jobKey, vendorKey, notes.trim());
    call.subscribe({
      next: (res) => {
        this.isRejecting.set(null);
        if (res.status) {
          this.applyState(res.data);
          this.successMessage.set(res.message || 'Rejected -- vendor notified to resubmit.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to reject.');
        }
      },
      error: (err) => {
        this.isRejecting.set(null);
        this.errorMessage.set(err?.error?.message || 'Unable to reject.');
      },
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  stateBadgeLabel(state: string, expiry: string | null): string {
    if (state === 'current') return '✓ CURRENT';
    if (state === 'expired') return `EXPIRED (${this.formatDate(expiry)})`;
    if (state === 'missing') return 'NOT UPLOADED';
    return 'MARKED AS NOT REQUIRED FOR THIS VENDOR';
  }

  formatDate(iso: string | null): string {
    if (!iso) return '--';
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return match ? `${Number(match[2])}/${Number(match[3])}/${match[1]}` : iso;
  }

  formatDateTime(iso: string | null): string {
    if (!iso) return '--';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  }
}
