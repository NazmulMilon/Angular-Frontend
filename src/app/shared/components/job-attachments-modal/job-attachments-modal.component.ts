import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { AssignVendorService } from '../../../services/assign-vendor.service';
import { AuthTokenService } from '../../../services/auth-token.service';
import { environment } from '../../../../environments/environment';
import {
  BroadcastJobFileDto,
  CustomerEstimateForApproval,
  SendVendorActionMailRequest,
  VendorDropdownOption,
  VendorForEstimate,
  VendorPaperFile,
} from '../../../models/assign-vendor.model';

/**
 * JOB-LEVEL "📎 View All Job Attachments" popup for the Move to Accounting screen.
 *
 * Spec: complete-screen-v2.html — showAllAttachments() (the "📎 Job File & Attachments — PO
 * {po}" modal). Visually this mirrors that function's layout exactly: a two-column
 * "Add a File" form (Document Type select **, Comments, drag/drop upload zone + Save this
 * File), a tan "VENDOR PAPERS UNDER THIS JOB" section bar + table (view-only), and a tan
 * "FILES UNDER THIS JOB" section bar + table (view + delete). Deliberately NOT a wrapper
 * around the giant JobDetailsAccordionComponent's own Files & Attachments modal — same
 * "small, focused popup" pattern as NotesToAccountingModalComponent, its sibling.
 *
 * Functional reuse — every data call here is an EXISTING AssignVendorService method, the same
 * ones job-details-accordion.component.ts already uses for its own Files & Attachments modal.
 * No new backend endpoints were added for this feature:
 *   - getJobFilesForBroadcast(jobKey)  → "FILES UNDER THIS JOB" (GET job-files-for-broadcast)
 *   - getVendorPapersForJob(jobKey)    → "VENDOR PAPERS UNDER THIS JOB" (GET vendor-papers)
 *   - getDocumentTypes(1)              → the Document Type** dropdown
 *   - adminSaveJobFile(...)            → "Save this File"
 *   - adminDeleteJobFile(fileKey)      → the Files table's 🗑 delete
 *
 * Scope decisions (see spec):
 *   - Vendor Papers is READ-ONLY here (View File only) — the prototype shows no delete/edit
 *     control on that table, so none is added, even though the underlying data could
 *     theoretically support it.
 *   - No "Location Files" section — the prototype's showAllAttachments() has no third section
 *     for that, only Vendor Papers + Files, so job-details-accordion's separate
 *     getLocationFiles/locationFilesList concept is intentionally NOT reused here.
 *   - The prototype's attControls/sortTh/attFilterSort (client-side search/sort/paginate over
 *     an in-memory fake array) are cosmetic prototype-only interactivity and are NOT
 *     reproduced — both tables here render their full (already small) list with no
 *     search/sort/paginate controls. This is a deliberate scope decision, not a miss.
 *
 * Security: neither adminSaveJobFile nor adminDeleteJobFile accepts (or trusts) a client-supplied
 * "added by"/owner field — AddedBy is resolved server-side from the admin's auth token, and
 * delete is by FileKey only. This component does not attempt to add any ownership check that
 * does not already exist server-side.
 */
@Component({
  selector: 'app-job-attachments-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './job-attachments-modal.component.html',
  styleUrl: './job-attachments-modal.component.scss',
})
export class JobAttachmentsModalComponent {
  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly authTokenSvc = inject(AuthTokenService);

  /** DocumentType GUID for "Customer Approval" — always prompts the status-change modal. */
  private static readonly CUSTOMER_APPROVAL_DOCTYPE = '76e48b89-87d4-464a-9d89-94f62e0a9658';
  /** DocumentType GUID for "Customer Additional Approval" (legacy MgtJobFile flow). */
  private static readonly CUSTOMER_ADDITIONAL_APPROVAL_DOCTYPE = 'f5c85357-f3cc-48c6-b399-141377c32edb';
  /** DocumentType GUIDs for "Vendor Estimate" variants — prompts Vendor Estimate Received status modal. */
  private static readonly VENDOR_ESTIMATE_DOCTYPES = [
    'd5b2aefd-acac-462a-bc41-1b7d26529581',
    '8c25ed7d-3e44-49ac-b23b-1c4b6874b7d5',
    '6c4b5aec-9e97-49fa-be98-135d1ee03e95',
  ];
  /** TriggerBit for the "Customer Approval" job status (legacy MgtJobFile statusModal). */
  private static readonly CUSTOMER_APPROVAL_TRIGGER_BIT = 14;
  /** TriggerBit for the "Vendor Estimate Received" job status (legacy MgtJobFile statusModalV). */
  private static readonly VENDOR_ESTIMATE_RECEIVED_TRIGGER_BIT = 9;
  /** TriggerBit for "Need Vendor Estimate" — set on the clicked vendor when either Send Estimate
   *  to Vendor button executes (RBR-486). */
  private static readonly NEED_VENDOR_ESTIMATE_TRIGGER_BIT = 8;

  /** Whether the popup is visible. Host owns this state. */
  isOpen = input(false);
  /** The job this popup is scoped to. Required whenever `isOpen` is true. */
  jobKey = input<string | null>(null);
  /** PO shown in the popup title — "📎 Job File & Attachments — PO {po}", matching the prototype heading. */
  po = input<string | null>(null);

  /** Emitted when the user closes the popup ((x) button, footer Close button, or overlay click). */
  readonly closed = output<void>();

  // ── Files under this job ──
  readonly filesList = signal<BroadcastJobFileDto[]>([]);
  readonly filesLoading = signal(false);
  readonly filesDeletingKey = signal<string | null>(null);

  // ── Vendor papers under this job (read-only) ──
  readonly vendorPapersList = signal<VendorPaperFile[]>([]);
  readonly vendorPapersLoading = signal(false);

  // ── Add a File form ──
  readonly docTypes = signal<VendorDropdownOption[]>([]);
  readonly uploadDocTypeKey = signal('');
  readonly uploadComment = signal('');
  readonly pendingFiles = signal<File[]>([]);
  readonly uploading = signal(false);
  readonly dragActive = signal(false);

  // ── Delete confirm ──
  readonly deleteConfirmFile = signal<BroadcastJobFileDto | null>(null);

  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  /**
   * File payload captured at Save-click time, persisted only once any doc-type-driven
   * confirmation prompt resolves. Ported from job-details-accordion.component.ts.
   */
  private pendingFileUpload: {
    jobKey: string;
    docTypeKey: string;
    comment: string;
    files: File[];
  } | null = null;

  /**
   * RBR-486 flow control. On a Vendor-Estimate upload the status prompt (popup #1) means:
   *   NO  → just upload the file, no status change, no second popup.
   *   YES → upload the file, then open the Send Estimate to Vendor modal (popup #2). The status
   *         change is deferred to popup #2's outcome — Green/Orange → "Need Vendor Estimate" (8),
   *         plain Close → "Vendor Estimate Received" (9) — never stamped at YES-time.
   */
  private openEstimateModalAfterUpload = false;

  // ── Approve-customer-estimate-on-behalf modal ──
  readonly approveEstimateModalOpen = signal(false);
  readonly approveEstimateList = signal<CustomerEstimateForApproval[]>([]);
  readonly approveEstimateCustomerDne = signal(0);
  /** True while the legacy "approve on behalf" save is in flight (RBR — no-new-tab fix). */
  readonly approveEstimateSaving = signal(false);

  // ── Doc-type-driven "Change Job Status?" confirm modal ──
  readonly statusChangeModalOpen = signal(false);
  readonly statusChangeTargetLabel = signal('');
  readonly statusChangeTriggerBit = signal(0);
  readonly statusChangeNoteTitle = signal('');
  readonly statusChangeNoteMessage = signal('');
  readonly statusChangeSaving = signal(false);

  // ── Send Estimate to Vendor modal (RBR-483) — opens after a vendor-estimate
  //    file is saved, mirroring legacy #ModalSendEstimateToVendor. ──
  readonly sendEstimateModalOpen = signal(false);
  readonly sendEstimateLoading = signal(false);
  readonly sendEstimateVendors = signal<VendorForEstimate[]>([]);
  /** JobVendor.PKey of the currently selected vendor (radio group). */
  readonly sendEstimateSelectedVendorKey = signal<string>('');
  /** Set of selected VendorContact.contactKey values (checkboxes). */
  readonly sendEstimateSelectedContacts = signal<Set<string>>(new Set());
  readonly sendEstimateEmailNote = signal(
    'We received your estimate via email/(call) but please click the Create estimate button here and upload as required for submittal.',
  );
  readonly sendEstimateCustomEmail = signal('');
  readonly sendEstimateError = signal<string | null>(null);
  readonly sendEstimateMessage = signal<string | null>(null);
  readonly sendEstimateSending = signal(false);
  /** True once an estimate request email has been sent — disables the action buttons. */
  readonly sendEstimateSent = signal(false);
  /**
   * True once Green/Orange has already resolved the "Need Vendor Estimate" status change for
   * this modal's lifetime, so a subsequent plain Close doesn't overwrite it with "Vendor
   * Estimate Received" (9).
   */
  readonly sendEstimateStatusResolved = signal(false);

  private lastLoadedJobKey: string | null = null;

  constructor() {
    // Load (or reload) both lists whenever the popup opens for a job — same trigger pattern
    // as the sibling job-level popups (fresh data per job selection, no stale carryover).
    effect(() => {
      const open = this.isOpen();
      const jobKey = this.jobKey();
      if (open && jobKey && jobKey !== this.lastLoadedJobKey) {
        this.lastLoadedJobKey = jobKey;
        this.resetFormState();
        this.loadAll(jobKey);
      }
      if (!open) {
        // Clear all per-job state on close so a later job's popup never shows stale rows
        // for a split second before its own load resolves.
        this.lastLoadedJobKey = null;
        this.filesList.set([]);
        this.vendorPapersList.set([]);
        this.deleteConfirmFile.set(null);
        this.errorMessage.set('');
        this.successMessage.set('');
        this.resetFormState();
        this.approveEstimateModalOpen.set(false);
        this.approveEstimateList.set([]);
        this.statusChangeModalOpen.set(false);
        this.sendEstimateModalOpen.set(false);
        this.sendEstimateVendors.set([]);
        this.sendEstimateSelectedContacts.set(new Set());
        this.sendEstimateSelectedVendorKey.set('');
        this.pendingFileUpload = null;
        this.openEstimateModalAfterUpload = false;
      }
    });
  }

  private resetFormState(): void {
    this.uploadDocTypeKey.set('');
    this.uploadComment.set('');
    this.pendingFiles.set([]);
    this.dragActive.set(false);
  }

  private loadAll(jobKey: string): void {
    this.errorMessage.set('');
    this.loadFiles(jobKey);
    this.loadVendorPapers(jobKey);
    if (this.docTypes().length === 0) this.loadDocTypes();
  }

  private loadFiles(jobKey: string): void {
    this.filesLoading.set(true);
    this.assignVendorSvc
      .getJobFilesForBroadcast(jobKey)
      .pipe(finalize(() => this.filesLoading.set(false)))
      .subscribe({
        next: (res) => {
          if (res?.status && Array.isArray(res.data)) {
            this.filesList.set(res.data);
          } else {
            this.errorMessage.set(res?.message || 'Failed to load files.');
          }
        },
        error: () => this.errorMessage.set('Failed to load files.'),
      });
  }

  private loadVendorPapers(jobKey: string): void {
    this.vendorPapersLoading.set(true);
    this.assignVendorSvc
      .getVendorPapersForJob(jobKey)
      .pipe(finalize(() => this.vendorPapersLoading.set(false)))
      .subscribe({
        next: (papers) => this.vendorPapersList.set(papers ?? []),
        error: () => this.vendorPapersList.set([]),
      });
  }

  private loadDocTypes(): void {
    this.assignVendorSvc.getDocumentTypes(1).subscribe({
      next: (types) => this.docTypes.set(types ?? []),
      error: () => this.docTypes.set([]),
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  /** Close only when the click landed on the dimmed backdrop itself, not inside the modal card. */
  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  // ── Add a File form ──

  onFilePick(input: HTMLInputElement): void {
    input.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.pendingFiles.update((existing) => [...existing, ...Array.from(input.files!)]);
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    const dropped = event.dataTransfer?.files;
    if (!dropped?.length) return;
    this.pendingFiles.update((existing) => [...existing, ...Array.from(dropped)]);
  }

  onRemovePendingFile(index: number): void {
    this.pendingFiles.update((files) => files.filter((_, i) => i !== index));
  }

  /**
   * Save button — ported verbatim from job-details-accordion.component.ts's
   * `onSaveFilesUpload()` decision tree. Certain Document Types trigger an extra confirm
   * modal (and, on Yes, a job/vendor status change + note) before the file is actually
   * persisted; every other doc type persists immediately as before.
   */
  onSave(): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.uploading()) return;

    if (!this.uploadDocTypeKey()) {
      this.errorMessage.set('Document Type is required (**).');
      return;
    }
    const files = this.pendingFiles();
    if (files.length === 0) {
      this.errorMessage.set('Choose or drop a file first.');
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.openEstimateModalAfterUpload = false;

    const docTypeKey = this.uploadDocTypeKey();
    const docTypeKeyLower = docTypeKey.toLowerCase();
    const docTypeText =
      this.docTypes().find((o) => o.value.toLowerCase() === docTypeKeyLower)?.text ?? '';

    this.pendingFileUpload = { jobKey, docTypeKey, comment: this.uploadComment(), files };
    this.uploading.set(true);

    // Doc-type-driven confirm prompts — file is NOT persisted until the prompt resolves.
    if (docTypeKeyLower === JobAttachmentsModalComponent.CUSTOMER_APPROVAL_DOCTYPE) {
      this.openCustomerApprovalStatusModal();
      return;
    }
    if (docTypeKeyLower === JobAttachmentsModalComponent.CUSTOMER_ADDITIONAL_APPROVAL_DOCTYPE) {
      this.checkCustomerEstimatesForApproval();
      return;
    }
    if (JobAttachmentsModalComponent.VENDOR_ESTIMATE_DOCTYPES.includes(docTypeKeyLower)) {
      const dateStr = new Date().toDateString();
      this.openStatusChangeModal(
        'VENDOR ESTIMATE RECEIVED',
        JobAttachmentsModalComponent.VENDOR_ESTIMATE_RECEIVED_TRIGGER_BIT,
        'Vendor Estimate Attached',
        `Attached ${docTypeText} to this job on ${dateStr}`,
      );
      return;
    }

    // Plain doc type — no confirm prompt, persist immediately (legacy's final else-branch).
    this.performPendingFileUpload();
  }

  /**
   * Persists the file captured by the most recent Save click. Called immediately for
   * plain doc types, or deferred until a confirm/approve prompt resolves for the
   * special doc types — matching legacy's deferred `$("#fileform").submit()`.
   */
  private performPendingFileUpload(onDone?: () => void): void {
    const pending = this.pendingFileUpload;
    if (!pending) {
      this.uploading.set(false);
      onDone?.();
      return;
    }

    this.assignVendorSvc
      .adminSaveJobFile(pending.jobKey, pending.docTypeKey || null, pending.comment || null, pending.files)
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.successMessage.set(res.message || 'File uploaded successfully.');
            this.resetFormState();
            this.pendingFileUpload = null;
            this.loadFiles(pending.jobKey);
            // RBR-483/486: open the Send Estimate to Vendor modal (popup #2) only on the
            // Vendor-Estimate YES path. NO (and every other doc type) just uploads. The status
            // change is decided by popup #2's outcome, never here.
            if (this.openEstimateModalAfterUpload) {
              this.openEstimateModalAfterUpload = false;
              this.openSendEstimateModal(pending.jobKey);
            }
          } else {
            this.errorMessage.set(res?.message || 'Upload failed.');
          }
          onDone?.();
        },
        error: (err) => {
          this.errorMessage.set(err?.message || 'Upload failed. Please try again.');
          onDone?.();
        },
      });
  }

  // ── Change Job Status confirm modal (Customer Approval / Vendor Estimate) ──

  private openCustomerApprovalStatusModal(): void {
    const dateStr = new Date().toDateString();
    this.openStatusChangeModal(
      'Customer Approval',
      JobAttachmentsModalComponent.CUSTOMER_APPROVAL_TRIGGER_BIT,
      'Additional Approval Attached',
      `Additional approval has been attached to this job on ${dateStr}`,
    );
  }

  private openStatusChangeModal(
    targetLabel: string,
    triggerBit: number,
    noteTitle: string,
    noteMessage: string,
  ): void {
    this.statusChangeTargetLabel.set(targetLabel);
    this.statusChangeTriggerBit.set(triggerBit);
    this.statusChangeNoteTitle.set(noteTitle);
    this.statusChangeNoteMessage.set(noteMessage);
    this.statusChangeModalOpen.set(true);
  }

  /** "No" — legacy still submits the file form on No, just without the status change/note. */
  onCancelStatusChange(): void {
    this.statusChangeModalOpen.set(false);
    this.performPendingFileUpload();
  }

  /**
   * "Yes" on the status-change prompt.
   *
   * RBR-486 — Vendor-Estimate flow: YES does NOT change any status here. It uploads the file and
   * opens the Send Estimate to Vendor modal (popup #2); the status change is decided entirely by
   * popup #2's outcome (Green/Orange → "Need Vendor Estimate" 8, plain Close → "Vendor Estimate
   * Received" 9), each scoped to the vendor (JobVendor always, Job only if Default).
   *
   * Customer-approval flow (trigger 14): unchanged — change job status, save the note, persist.
   */
  onConfirmStatusChange(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;

    if (
      this.statusChangeTriggerBit() ===
      JobAttachmentsModalComponent.VENDOR_ESTIMATE_RECEIVED_TRIGGER_BIT
    ) {
      this.statusChangeModalOpen.set(false);
      this.openEstimateModalAfterUpload = true;
      this.performPendingFileUpload();
      return;
    }

    this.statusChangeSaving.set(true);
    this.assignVendorSvc
      .changeJobStatusByTriggerBit(jobKey, this.statusChangeTriggerBit())
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.assignVendorSvc
              .saveGeneralAdminNote({
                jobKey,
                title: this.statusChangeNoteTitle(),
                comment: this.statusChangeNoteMessage(),
              })
              .subscribe({
                next: () => this.finishStatusChangeAndPersist(jobKey, res.message),
                // Status already changed even if the note fails to save; don't block the file save on it.
                error: () => this.finishStatusChangeAndPersist(jobKey, res.message),
              });
          } else {
            this.errorMessage.set(res?.message || 'Failed to change job status.');
            this.finishStatusChangeAndPersist(jobKey, null);
          }
        },
        error: (err) => {
          this.errorMessage.set(err?.message || 'Failed to change job status.');
          this.finishStatusChangeAndPersist(jobKey, null);
        },
      });
  }

  private finishStatusChangeAndPersist(jobKey: string, statusMessage: string | null | undefined): void {
    this.statusChangeModalOpen.set(false);
    this.statusChangeSaving.set(false);
    this.performPendingFileUpload(() => {
      if (statusMessage) {
        this.successMessage.update((current) => (current ? `${current} ${statusMessage}` : statusMessage));
      }
    });
  }

  // ── Send Estimate to Vendor modal (RBR-483/486) ──

  /**
   * Opens the "Vendor Estimates" / Send Estimate to Vendor modal (RBR-483) and loads the
   * job's assigned vendors + contacts. Defaults the selected vendor to the default (or first)
   * and pre-checks each vendor's default contacts, matching legacy GetDefaultVendorContactList.
   */
  private openSendEstimateModal(jobKey: string): void {
    this.sendEstimateModalOpen.set(true);
    this.sendEstimateLoading.set(true);
    this.sendEstimateVendors.set([]);
    this.sendEstimateSelectedVendorKey.set('');
    this.sendEstimateSelectedContacts.set(new Set());
    this.sendEstimateError.set(null);
    this.sendEstimateMessage.set(null);
    this.sendEstimateSending.set(false);
    this.sendEstimateSent.set(false);
    this.sendEstimateStatusResolved.set(false);

    this.assignVendorSvc
      .getVendorContactsForEstimate(jobKey)
      .pipe(finalize(() => this.sendEstimateLoading.set(false)))
      .subscribe({
        next: (res) => {
          const data = res?.data;
          if (!res?.status || !data?.hasVendors) {
            this.sendEstimateVendors.set([]);
            return;
          }
          this.sendEstimateVendors.set(data.vendors);

          const defaultVendor = data.vendors.find((v) => v.isDefault) ?? data.vendors[0];
          if (defaultVendor) {
            this.sendEstimateSelectedVendorKey.set(defaultVendor.jobVendorKey);
            const preChecked = new Set(
              defaultVendor.contacts.filter((c) => c.isDefault).map((c) => c.contactKey),
            );
            this.sendEstimateSelectedContacts.set(preChecked);
          }
        },
        error: () => this.sendEstimateVendors.set([]),
      });
  }

  /** Radio change — select an assigned vendor and pre-check its default contacts. */
  onSelectSendEstimateVendor(vendor: VendorForEstimate): void {
    this.sendEstimateSelectedVendorKey.set(vendor.jobVendorKey);
    const preChecked = new Set(
      vendor.contacts.filter((c) => c.isDefault).map((c) => c.contactKey),
    );
    this.sendEstimateSelectedContacts.set(preChecked);
  }

  /** Checkbox toggle for a single vendor contact. */
  onToggleSendEstimateContact(contactKey: string): void {
    this.sendEstimateSelectedContacts.update((set) => {
      const next = new Set(set);
      if (next.has(contactKey)) {
        next.delete(contactKey);
      } else {
        next.add(contactKey);
      }
      return next;
    });
  }

  /**
   * Closes the Send Estimate to Vendor modal.
   *
   * RBR-486 — if neither Green nor Orange resolved the flow (a plain Close / X / backdrop after
   * the YES path opened this modal), the vendor moves to "Vendor Estimate Received" (9), scoped
   * to the selected vendor (JobVendor always, Job only if Default). When Green/Orange already
   * moved it to "Need Vendor Estimate" (8), `sendEstimateStatusResolved` is set and this skips
   * the 9-change so it can't overwrite the 8 the button just applied.
   */
  onCloseSendEstimateModal(): void {
    const selectedVendorKey = this.sendEstimateSelectedVendorKey();
    if (!this.sendEstimateStatusResolved() && selectedVendorKey) {
      this.fireChangeVendorStatus(
        selectedVendorKey,
        JobAttachmentsModalComponent.VENDOR_ESTIMATE_RECEIVED_TRIGGER_BIT,
      );
    }

    this.sendEstimateModalOpen.set(false);
    this.sendEstimateVendors.set([]);
    this.sendEstimateSelectedContacts.set(new Set());
    this.sendEstimateSelectedVendorKey.set('');
    this.sendEstimateError.set(null);
    this.sendEstimateMessage.set(null);
    this.sendEstimateSending.set(false);
    this.sendEstimateSent.set(false);
    this.sendEstimateStatusResolved.set(false);
  }

  /**
   * RBR-486: moves a single vendor to the given status by TriggerBit, scoped on the backend to
   * that JobVendor row (Job.JobStatusKey moves too only if it's the Default vendor). Used by the
   * Send Estimate to Vendor modal's three outcomes — Green/Orange pass "Need Vendor Estimate" (8),
   * a plain Close passes "Vendor Estimate Received" (9). Non-blocking: a failure here shouldn't
   * stop the button's primary action (opening the portal / sending the email), so errors are
   * logged rather than surfaced as a modal error.
   */
  private fireChangeVendorStatus(jobVendorKey: string, triggerBit: number): void {
    this.assignVendorSvc.changeVendorStatusByTriggerBit(jobVendorKey, triggerBit).subscribe({
      next: (res) => {
        if (!res?.status) {
          console.error('changeVendorStatusByTriggerBit failed:', res?.message);
          return;
        }
        const jobKey = this.jobKey();
        if (jobKey) {
          this.loadFiles(jobKey);
          this.loadVendorPapers(jobKey);
        }
      },
      error: (err) => console.error('changeVendorStatusByTriggerBit failed:', err),
    });
  }

  /**
   * Resolves the (vendor, contact) pair for the first checked contact, in vendor→contact
   * display order. Mirrors legacy's `$(this).closest('div').attr('name')` resolution: each
   * vendor's contact checkboxes live inside a block named for that vendor's JobVendor.PKey, so
   * the checked contact's *owning* vendor is "the vendor" for this action — not whatever the
   * separate vendor radio currently points to. The radio only matters when no contact is
   * checked at all (the custom-email path — see {@link onSendEstimateEmail}).
   */
  private firstCheckedContact(): { vendorKey: string; contactKey: string } | null {
    const selected = this.sendEstimateSelectedContacts();
    for (const vendor of this.sendEstimateVendors()) {
      for (const contact of vendor.contacts) {
        if (selected.has(contact.contactKey)) {
          return { vendorKey: vendor.jobVendorKey, contactKey: contact.contactKey };
        }
      }
    }
    return null;
  }

  /**
   * GREEN — "Create estimate on behalf of the vendors": opens the vendor portal via SSO
   * (logged in as the admin, landing directly on the create-estimate form for the selected
   * contact). Mirrors legacy #CreateEstimate: requires a selected contact, then opens
   * `{vendorLoginWithTaskOptionsUrl}{jobKey}&ContactKey={contactKey}&Option=1&adminKey={adminKey}`.
   * RBR-486: the vendor moved to "Need Vendor Estimate" is the checked contact's *owning*
   * vendor (legacy never consults the vendor radio here at all).
   */
  onCreateEstimateOnBehalf(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;

    this.sendEstimateError.set(null);
    this.sendEstimateMessage.set(null);

    const checked = this.firstCheckedContact();
    if (!checked) {
      this.sendEstimateError.set(
        'Please select a contact — it is required for the portal login to open the create-estimate form.',
      );
      return;
    }

    this.sendEstimateStatusResolved.set(true);
    this.fireChangeVendorStatus(
      checked.vendorKey,
      JobAttachmentsModalComponent.NEED_VENDOR_ESTIMATE_TRIGGER_BIT,
    );

    const adminKey = this.authTokenSvc.getAdminKeyFromToken() || '';
    const url =
      `${environment.vendorLoginWithTaskOptionsUrl}${jobKey}` +
      `&ContactKey=${checked.contactKey}&Option=1&adminKey=${adminKey}`;
    window.open(url, '_blank', 'noopener');
    this.onCloseSendEstimateModal();
  }

  /**
   * ORANGE — "Send email to vendor": emails the selected contacts (or a custom email) the
   * "Need Vendor Estimate" request with the create-estimate link. Reuses the Assign Vendor tab's
   * vendor-action email engine (POST vendor-status-action/send-mail, emailType 5 =
   * legacy SendVendorMails). Mirrors legacy #SendEstimate exactly: when a contact is checked,
   * the target vendor is that contact's *owning* vendor (not the radio); the vendor radio is
   * only required as a fallback when sending to a custom email address with no contact checked.
   * RBR-486: same resolved vendor is moved to "Need Vendor Estimate".
   */
  onSendEstimateEmail(): void {
    this.sendEstimateError.set(null);
    this.sendEstimateMessage.set(null);

    const contactKeys = Array.from(this.sendEstimateSelectedContacts());
    const customEmail = this.sendEstimateCustomEmail().trim();

    let jobVendorKey: string;
    if (contactKeys.length > 0) {
      // A contact is checked — legacy resolves the vendor from that contact's own block,
      // ignoring the radio entirely.
      jobVendorKey = this.firstCheckedContact()!.vendorKey;
    } else if (customEmail) {
      // No contact checked — legacy falls back to the vendor radio for the custom-email path.
      jobVendorKey = this.sendEstimateSelectedVendorKey();
      if (!jobVendorKey) {
        this.sendEstimateError.set(
          'Please select a vendor for the customer email address that you have entered.',
        );
        return;
      }
    } else {
      this.sendEstimateError.set('Please select a contact.');
      return;
    }

    const req: SendVendorActionMailRequest = {
      jobVendorKey,
      emailType: 5,
      emailNote: this.sendEstimateEmailNote(),
      vendorContactKeys: contactKeys.length > 0 ? contactKeys : [],
      customEmail: contactKeys.length > 0 ? '' : customEmail,
      estimateKey: null,
    };

    this.sendEstimateStatusResolved.set(true);
    this.fireChangeVendorStatus(
      jobVendorKey,
      JobAttachmentsModalComponent.NEED_VENDOR_ESTIMATE_TRIGGER_BIT,
    );

    this.sendEstimateSending.set(true);
    this.assignVendorSvc
      .sendVendorActionMail(req)
      .pipe(finalize(() => this.sendEstimateSending.set(false)))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.sendEstimateMessage.set(res.message || 'Estimate request sent to the vendor.');
            this.sendEstimateSent.set(true);
          } else {
            this.sendEstimateError.set(res?.message || 'Failed to send the estimate request.');
          }
        },
        error: (err) => this.sendEstimateError.set(err?.message || 'Failed to send the estimate request.'),
      });
  }

  // ── Approve Customer Estimate on Behalf modal ──

  private checkCustomerEstimatesForApproval(): void {
    const jobKey = this.jobKey();
    if (!jobKey) {
      this.performPendingFileUpload();
      return;
    }
    this.assignVendorSvc.getCustomerEstimatesForApproval(jobKey).subscribe({
      next: (res) => {
        const data = res?.data;
        if (res?.status && data?.hasUnapprovedEstimate && data.estimates.length > 0) {
          this.approveEstimateList.set(data.estimates);
          this.approveEstimateCustomerDne.set(data.customerDne ?? 0);
          this.approveEstimateModalOpen.set(true);
        } else {
          // Legacy fallback: no unapproved estimate present → offer the plain
          // "Change Job status to Customer Approval?" prompt instead.
          this.openCustomerApprovalStatusModal();
        }
      },
      // Can't determine estimate state — don't block the file save on it.
      error: () => this.performPendingFileUpload(),
    });
  }

  /** Dismissing this modal (either way) resolves the prompt — persist the file now. */
  onCloseApproveEstimateModal(): void {
    this.approveEstimateModalOpen.set(false);
    this.approveEstimateList.set([]);
    this.performPendingFileUpload();
  }

  /**
   * Approve a customer estimate on behalf of the customer. The full legacy engine
   * (CheckIfVendorWillBeApproved → SaveAcceptedEstimate, with vendor auto-approval and
   * emails) is not yet ported to RFIJobOps, so this still routes to the proven legacy
   * approval endpoint — but as a background request instead of `window.open(url, '_blank')`.
   * `fetch(..., { mode: 'no-cors' })` sends the legacy admin session cookie along with the
   * GET (same as a normal browser navigation would) without requiring the legacy app to add
   * CORS headers, and without leaving the admin on a new tab. Because the response is opaque
   * we can't read a status back — resolving the fetch just means the legacy save finished
   * running — so on completion we close this modal and refresh every grid this popup shows
   * that the legacy action could have touched (job files, vendor papers).
   */
  onApproveEstimateOnBehalf(estimate: CustomerEstimateForApproval): void {
    const jobKey = this.jobKey();
    const url =
      `${environment.legacyAdminBaseUrl}/MgtJobSalesOrder/SaveAcceptedEstimate` +
      `?JobKey=${jobKey}&EstimateKey=${estimate.mutiEstiIdentifier ?? ''}&SelectedKey=${estimate.invoiceKey}`;

    this.approveEstimateSaving.set(true);
    this.errorMessage.set('');

    fetch(url, { method: 'GET', mode: 'no-cors', credentials: 'include' })
      .then(() => {
        this.approveEstimateSaving.set(false);
        this.onCloseApproveEstimateModal();
        // Refresh every grid this popup shows — the legacy save can add a customer-approval
        // file/note and change job/vendor status.
        if (jobKey) {
          this.loadFiles(jobKey);
          this.loadVendorPapers(jobKey);
        }
      })
      .catch(() => {
        this.approveEstimateSaving.set(false);
        this.errorMessage.set(
          'Failed to approve the estimate on behalf of the customer. Please try again.',
        );
      });
  }

  // ── Files table — view / delete ──

  onViewFile(file: BroadcastJobFileDto): void {
    if (file.fileUrl) {
      window.open(file.fileUrl, '_blank', 'noopener');
    } else {
      this.errorMessage.set('This file has no viewable URL yet.');
    }
  }

  onRequestDelete(file: BroadcastJobFileDto): void {
    if (!file.fileKey) return;
    this.deleteConfirmFile.set(file);
  }

  onCancelDelete(): void {
    this.deleteConfirmFile.set(null);
  }

  onConfirmDelete(): void {
    const file = this.deleteConfirmFile();
    const jobKey = this.jobKey();
    if (!file?.fileKey || !jobKey) return;

    this.filesDeletingKey.set(file.fileKey);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.assignVendorSvc
      .adminDeleteJobFile(file.fileKey)
      .pipe(finalize(() => this.filesDeletingKey.set(null)))
      .subscribe({
        next: (res) => {
          this.deleteConfirmFile.set(null);
          if (res?.status) {
            this.filesList.update((list) => list.filter((f) => f.fileKey !== file.fileKey));
            this.successMessage.set(res.message || 'File deleted.');
          } else {
            this.errorMessage.set(res?.message || 'Delete failed.');
          }
        },
        error: () => {
          this.deleteConfirmFile.set(null);
          this.errorMessage.set('Delete failed. Please try again.');
        },
      });
  }

  // ── Vendor papers table — view only, no delete/edit (matches the approved design) ──

  onViewVendorPaper(paper: VendorPaperFile): void {
    if (paper.fileUrl) {
      window.open(paper.fileUrl, '_blank', 'noopener');
    } else {
      this.errorMessage.set('This vendor paper has no viewable URL yet.');
    }
  }
}
