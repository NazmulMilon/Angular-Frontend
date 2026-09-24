import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { AccordionComponent } from '../../../shared/components/accordion/accordion.component';
import {
  JobDetailsAccordionComponent,
  VendorBillsNavTab,
} from '../../../shared/components/job-details-accordion/job-details-accordion.component';
import { CreateCustomerEstimateModalComponent } from '../../../shared/components/create-customer-estimate-modal/create-customer-estimate-modal.component';
import { SendCustomerEstimateModalComponent } from '../../../shared/components/send-customer-estimate-modal/send-customer-estimate-modal.component';
import { EstimateVendorDepositModalComponent } from '../estimates/estimate-vendor-deposit-modal/estimate-vendor-deposit-modal.component';
import { CreateCustomerInvoiceModalComponent } from '../../../shared/components/create-customer-invoice-modal/create-customer-invoice-modal.component';
import { CustomerInvoicesListComponent } from '../../../shared/components/customer-invoices-list/customer-invoices-list.component';
import { CustomerInvoiceSource } from '../../../models/customer-invoice.model';
import { environment } from '../../../../environments/environment';
import { VendorBillsService } from '../../../services/vendor-bills.service';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import { AuthTokenService } from '../../../services/auth-token.service';
import {
  AdminJobCheckInOutRow,
  AdminJobCheckInOutVendorOption,
  AdminVendorPaperRow,
  AdminJobBillRow,
  AdminVendorSubmittedInvoiceRow,
  AdminUploadVendorPapersModal,
  SaveVendorPapersRequest,
  AdminJobEstimateCard,
} from '../../../models/vendor-bills.model';
import { VendorRates } from '../../../models/assign-vendor.model';
import { resolveEstimateChatInterstitial } from '../../../shared/utils/estimate-chat-interstitial.util';
import {
  EstimateChatInterstitialModalComponent,
} from '../../../shared/components/estimate-chat-interstitial-modal/estimate-chat-interstitial-modal.component';

@Component({
  selector: 'app-vendor-bills',
  standalone: true,
  imports: [
    RouterLink,
    AccordionComponent,
    JobDetailsAccordionComponent,
    FormsModule,
    CreateCustomerEstimateModalComponent,
    SendCustomerEstimateModalComponent,
    EstimateVendorDepositModalComponent,
    CreateCustomerInvoiceModalComponent,
    CustomerInvoicesListComponent,
    EstimateChatInterstitialModalComponent,
  ],
  templateUrl: './vendor-bills.component.html',
  styleUrl: './vendor-bills.component.scss',
})
export class VendorBillsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vendorBillsSvc = inject(VendorBillsService);
  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly authTokenSvc = inject(AuthTokenService);
  private readonly destroy$ = new Subject<void>();
  private readonly cioSearch$ = new Subject<string>();

  jobKey = signal('');
  /** Set from ?customerInvoiceKey= on the review-email deep link — auto-opens the invoices tab. */
  readonly highlightInvoiceKey = signal<string | null>(null);
  activeNavTab = signal<VendorBillsNavTab>('check-in-out');

  // ── Check-In / Out ──────────────────────────────────────────
  cioRows = signal<AdminJobCheckInOutRow[]>([]);
  cioTotalRecords = signal(0);
  cioIsLoading = signal(false);
  cioErrorMessage = signal('');
  cioSuccessMessage = signal('');
  cioPageSize = signal(10);
  cioCurrentPage = signal(1);
  cioSearchText = signal('');
  cioSortCol = signal(0);
  cioSortDir = signal<'asc' | 'desc'>('desc');
  cioEditModalOpen = signal(false);
  cioEditRow = signal<AdminJobCheckInOutRow | null>(null);
  cioEditNewCheckIn = signal('');
  cioEditNewCheckOut = signal('');
  cioEditAdminNote = signal('');
  cioEditSaving = signal(false);
  cioEditError = signal('');
  cioManualModalOpen = signal(false);
  cioManualVendors = signal<AdminJobCheckInOutVendorOption[]>([]);
  cioManualVendorKey = signal('');
  cioManualCheckInDate = signal('');
  cioManualNoOfTech = signal(1);
  cioManualSaving = signal(false);
  cioManualError = signal('');

  readonly cioPageSizeOptions = [10, 25, 50, 100];
  readonly cioTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.cioTotalRecords() / this.cioPageSize())),
  );
  readonly cioShowingFrom = computed(() =>
    this.cioTotalRecords() === 0 ? 0 : (this.cioCurrentPage() - 1) * this.cioPageSize() + 1,
  );
  readonly cioShowingTo = computed(() =>
    Math.min(this.cioCurrentPage() * this.cioPageSize(), this.cioTotalRecords()),
  );

  // ── Invoices (MgtVendorBill/Index parity) ───────────────────
  invJobName = signal('');
  invAlertMessage = signal('');
  invHasActiveCustomerInvoice = signal(false);
  invBills = signal<AdminJobBillRow[]>([]);
  invVendorInvoices = signal<AdminVendorSubmittedInvoiceRow[]>([]);
  invIsLoading = signal(false);
  invErrorMessage = signal('');
  invBillsSearchText = signal('');
  invBillsPageSize = signal(10);
  invBillsCurrentPage = signal(1);
  invSearchText = signal('');
  invVendorPageSize = signal(100);
  invVendorCurrentPage = signal(1);
  readonly invBillsPageSizeOptions = [10, 25, 50, 100];
  readonly invVendorPageSizeOptions = [10, 25, 50, 100];
  readonly invFilteredBills = computed(() => {
    const term = this.invBillsSearchText().trim().toLowerCase();
    const rows = this.invBills();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.vendorName.toLowerCase().includes(term) ||
        r.billNo.toLowerCase().includes(term) ||
        r.customerName.toLowerCase().includes(term) ||
        r.statusLabel.toLowerCase().includes(term) ||
        r.paymentLabel.toLowerCase().includes(term),
    );
  });
  readonly invBillsTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.invFilteredBills().length / this.invBillsPageSize())),
  );
  readonly invBillsShowingFrom = computed(() => {
    const total = this.invFilteredBills().length;
    if (total === 0) return 0;
    return (this.invBillsCurrentPage() - 1) * this.invBillsPageSize() + 1;
  });
  readonly invBillsShowingTo = computed(() =>
    Math.min(this.invBillsCurrentPage() * this.invBillsPageSize(), this.invFilteredBills().length),
  );
  readonly invPaginatedBills = computed(() => {
    const start = (this.invBillsCurrentPage() - 1) * this.invBillsPageSize();
    return this.invFilteredBills().slice(start, start + this.invBillsPageSize());
  });
  readonly invFilteredVendorInvoices = computed(() => {
    const term = this.invSearchText().trim().toLowerCase();
    const rows = this.invVendorInvoices();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.vendorName.toLowerCase().includes(term) ||
        r.invoiceNo.toLowerCase().includes(term) ||
        r.statusLabel.toLowerCase().includes(term) ||
        r.remarks.toLowerCase().includes(term),
    );
  });
  readonly invVendorTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.invFilteredVendorInvoices().length / this.invVendorPageSize())),
  );
  readonly invVendorShowingFrom = computed(() => {
    const total = this.invFilteredVendorInvoices().length;
    if (total === 0) return 0;
    return (this.invVendorCurrentPage() - 1) * this.invVendorPageSize() + 1;
  });
  readonly invVendorShowingTo = computed(() =>
    Math.min(this.invVendorCurrentPage() * this.invVendorPageSize(), this.invFilteredVendorInvoices().length),
  );
  readonly invPaginatedVendorInvoices = computed(() => {
    const start = (this.invVendorCurrentPage() - 1) * this.invVendorPageSize();
    return this.invFilteredVendorInvoices().slice(start, start + this.invVendorPageSize());
  });

  // ── Vendor rates popup (Invoices submitted by vendors) ────────
  showRatesModal = signal(false);
  ratesVendorName = signal('');
  ratesData = signal<VendorRates | null>(null);
  ratesLoading = signal(false);

  // ── Vendor Estimate Files (Attachments — Estimate Stage) ──────
  veFiles = signal<AdminVendorPaperRow[]>([]);
  veHasNewFiles = signal(false);
  veIsLoading = signal(false);
  veErrorMessage = signal('');
  veSuccessMessage = signal('');
  veUnchecking = signal(false);
  veSearchText = signal('');
  vePageSize = signal(100);
  veCurrentPage = signal(1);
  readonly vePageSizeOptions = [10, 25, 50, 100];
  readonly veFilteredFiles = computed(() => {
    const term = this.veSearchText().trim().toLowerCase();
    const rows = this.veFiles();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.vendorName.toLowerCase().includes(term) ||
        r.fileName.toLowerCase().includes(term) ||
        r.fileType.toLowerCase().includes(term) ||
        (r.remark ?? '').toLowerCase().includes(term) ||
        r.uploadedByDisplay.toLowerCase().includes(term),
    );
  });
  readonly veTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.veFilteredFiles().length / this.vePageSize())),
  );
  readonly veShowingFrom = computed(() => {
    const total = this.veFilteredFiles().length;
    if (total === 0) return 0;
    return (this.veCurrentPage() - 1) * this.vePageSize() + 1;
  });
  readonly veShowingTo = computed(() =>
    Math.min(this.veCurrentPage() * this.vePageSize(), this.veFilteredFiles().length),
  );
  readonly vePaginatedFiles = computed(() => {
    const start = (this.veCurrentPage() - 1) * this.vePageSize();
    return this.veFilteredFiles().slice(start, start + this.vePageSize());
  });

  // ── Upload Vendor Papers modal ──────────────────────────────
  vpUploadModalOpen = signal(false);
  vpUploadModalLoading = signal(false);
  vpUploadModalSaving = signal(false);
  vpUploadModalUploading = signal(false);
  vpUploadModalData = signal<AdminUploadVendorPapersModal | null>(null);
  vpUploadModalMessage = signal('');
  vpUploadVendorKey = signal('');
  vpUploadDocumentTypeKey = signal('');
  vpUploadRemark = signal('');
  vpUploadStagedFiles = signal<{ fileName: string }[]>([]);
  vpUploadDragOver = signal(false);
  readonly vpUploadTempCount = computed(() => this.vpUploadStagedFiles().length);

  // ── Vendor Invoice Files (Attachments — Invoice Stage) ──────
  vpPapers = signal<AdminVendorPaperRow[]>([]);
  vpHasNewPapers = signal(false);
  vpIsLoading = signal(false);
  vpErrorMessage = signal('');
  vpSuccessMessage = signal('');
  vpUnchecking = signal(false);
  vpSearchText = signal('');
  vpPageSize = signal(100);
  vpCurrentPage = signal(1);
  readonly vpPageSizeOptions = [10, 25, 50, 100];
  readonly vpFilteredPapers = computed(() => {
    const term = this.vpSearchText().trim().toLowerCase();
    const rows = this.vpPapers();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.vendorName.toLowerCase().includes(term) ||
        r.fileName.toLowerCase().includes(term) ||
        r.fileType.toLowerCase().includes(term) ||
        (r.remark ?? '').toLowerCase().includes(term) ||
        r.uploadedByDisplay.toLowerCase().includes(term),
    );
  });
  readonly vpTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.vpFilteredPapers().length / this.vpPageSize())),
  );
  readonly vpShowingFrom = computed(() => {
    const total = this.vpFilteredPapers().length;
    if (total === 0) return 0;
    return (this.vpCurrentPage() - 1) * this.vpPageSize() + 1;
  });
  readonly vpShowingTo = computed(() =>
    Math.min(this.vpCurrentPage() * this.vpPageSize(), this.vpFilteredPapers().length),
  );
  readonly vpPaginatedPapers = computed(() => {
    const start = (this.vpCurrentPage() - 1) * this.vpPageSize();
    return this.vpFilteredPapers().slice(start, start + this.vpPageSize());
  });


  @ViewChild('jobDetailsAccordion') private jobDetailsAccordion?: JobDetailsAccordionComponent;
  @ViewChild('checkInOutAccordion') private checkInOutAccordion?: AccordionComponent;
  @ViewChild('attachmentsEstimateAccordion') private attachmentsEstimateAccordion?: AccordionComponent;
  @ViewChild('invoicesAccordion') private invoicesAccordion?: AccordionComponent;
  @ViewChild('attachmentsInvoiceAccordion') private attachmentsInvoiceAccordion?: AccordionComponent;
  @ViewChild(EstimateChatInterstitialModalComponent)
  private estimateChatInterstitialModal?: EstimateChatInterstitialModalComponent;

  onEstimatesTabClick(): void {
    const key = this.jobKey();
    if (!key) return;
    resolveEstimateChatInterstitial(this.vendorBillsSvc, key, ({ shouldIntercept, vendorKey }) => {
      if (shouldIntercept) {
        this.estimateChatInterstitialModal?.open({ jobKey: key, vendorKey });
      } else {
        void this.router.navigate(['/job', key, 'estimates']);
      }
    });
  }

  // Path 3 — native customer-estimate creation from a vendor estimate (reused from the estimates section).
  @ViewChild(CreateCustomerEstimateModalComponent)
  private createCustomerEstimateModal?: CreateCustomerEstimateModalComponent;
  @ViewChild(SendCustomerEstimateModalComponent)
  private sendCustomerEstimateModal?: SendCustomerEstimateModalComponent;
  @ViewChild(EstimateVendorDepositModalComponent)
  private estimateVendorDepositModal?: EstimateVendorDepositModalComponent;

  // Phase 2 — native customer-invoice creation (Paths 1/2/4).
  @ViewChild(CreateCustomerInvoiceModalComponent)
  private createCustomerInvoiceModal?: CreateCustomerInvoiceModalComponent;

  constructor() {
    this.cioSearch$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.cioCurrentPage.set(1);
        this.loadCioRows();
      });
  }

  ngOnInit(): void {

    const key = this.route.snapshot.paramMap.get('jobKey') ?? '';
    this.jobKey.set(key);
    if (key) {
      this.loadCioRows();
      this.loadInvoicesPage();
      this.loadEstimateFiles();
      this.loadInvoiceFiles();
    }

    const invoiceKeyParam = this.route.snapshot.queryParamMap.get('customerInvoiceKey');
    if (invoiceKeyParam) {
      this.highlightInvoiceKey.set(invoiceKeyParam);
      this.scrollToSection('section-invoices', 'invoices');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private accordionForTab(tab: VendorBillsNavTab): AccordionComponent | undefined {
    switch (tab) {
      case 'job-details':
        return this.jobDetailsAccordion?.accordion;
      case 'check-in-out':
        return this.checkInOutAccordion;
      case 'attachments-estimate':
        return this.attachmentsEstimateAccordion;
      case 'invoices':
        return this.invoicesAccordion;
      case 'attachments-invoice':
        return this.attachmentsInvoiceAccordion;
      default:
        return undefined;
    }
  }

  scrollToSection(sectionId: string, tab: VendorBillsNavTab): void {
    this.activeNavTab.set(tab);
    const accordion = this.accordionForTab(tab);
    if (accordion && !accordion.isOpen()) {
      accordion.isOpen.set(true);
    }
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── Check-In / Out actions ──────────────────────────────────

  onRefreshCheckInOutLog(): void {
    this.loadCioRows();
  }

  onManualCheckInEntry(): void {
    this.openCioManualEntry();
  }

  onCioSearchInput(value: string): void {
    this.cioSearchText.set(value);
    this.cioSearch$.next(value.trim());
  }

  onCioPageSizeChange(value: string): void {
    this.cioPageSize.set(Number(value) || 10);
    this.cioCurrentPage.set(1);
    this.loadCioRows();
  }

  cioSortBy(col: number): void {
    if (this.cioSortCol() === col) {
      this.cioSortDir.set(this.cioSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.cioSortCol.set(col);
      this.cioSortDir.set('asc');
    }
    this.loadCioRows();
  }

  cioGoToPage(page: number): void {
    if (page < 1 || page > this.cioTotalPages()) return;
    this.cioCurrentPage.set(page);
    this.loadCioRows();
  }

  openCioEditModal(row: AdminJobCheckInOutRow): void {
    this.cioEditRow.set(row);
    this.cioEditNewCheckIn.set(row.editCheckInLocal ?? '');
    this.cioEditNewCheckOut.set(row.isCheckedOut ? (row.editCheckOutLocal ?? '') : '');
    this.cioEditAdminNote.set('');
    this.cioEditError.set('');
    this.cioEditModalOpen.set(true);
  }

  closeCioEditModal(): void {
    this.cioEditModalOpen.set(false);
    this.cioEditRow.set(null);
  }

  saveCioEdit(): void {
    const row = this.cioEditRow();
    if (!row) return;

    const note = this.cioEditAdminNote().trim();
    if (!note) {
      this.cioEditError.set(
        'A note is mandatory when editing check-in/out times. This will be recorded as a Note to Accounting.',
      );
      return;
    }

    this.cioEditSaving.set(true);
    this.cioEditError.set('');

    this.vendorBillsSvc
      .editCheckInOut({
        checkinKey: row.checkinKey,
        newCheckInTime: this.cioEditNewCheckIn() || null,
        newCheckOutTime: row.isCheckedOut ? this.cioEditNewCheckOut() || null : null,
        adminNote: note,
      })
      .subscribe((res) => {
        this.cioEditSaving.set(false);
        if (res.status) {
          this.cioSuccessMessage.set(res.message || 'Check-in/out updated successfully.');
          this.closeCioEditModal();
          this.loadCioRows();
        } else {
          this.cioEditError.set(res.message || 'Failed to save changes.');
        }
      });
  }

  cioMarkViewed(row: AdminJobCheckInOutRow): void {
    this.vendorBillsSvc.markCheckInViewed(row.checkinKey).subscribe((res) => {
      if (res.status) {
        this.loadCioRows();
      } else {
        this.cioErrorMessage.set(res.message || 'Failed to mark as viewed.');
      }
    });
  }

  openCioManualEntry(): void {
    const key = this.jobKey();
    if (!key) return;
    this.cioManualError.set('');
    this.cioManualVendorKey.set('');
    this.cioManualNoOfTech.set(1);
    this.cioManualCheckInDate.set(this.toLocalDatetimeInput(new Date()));
    this.cioManualModalOpen.set(true);

    this.vendorBillsSvc.getJobVendorsForManualEntry(key).subscribe((res) => {
      if (res.status && res.data) {
        this.cioManualVendors.set(res.data.filter((v) => !v.isCurrentlyCheckedIn));
      } else {
        this.cioManualError.set(res.message || 'Failed to load vendors.');
      }
    });
  }

  closeCioManualEntry(): void {
    this.cioManualModalOpen.set(false);
  }

  saveCioManualEntry(): void {
    const vendor = this.cioManualVendors().find((v) => v.jobVendorKey === this.cioManualVendorKey());
    if (!vendor) {
      this.cioManualError.set('Please select a vendor.');
      return;
    }
    if (!this.cioManualCheckInDate()) {
      this.cioManualError.set('Check-in date/time is required.');
      return;
    }

    this.cioManualSaving.set(true);
    this.cioManualError.set('');

    this.assignVendorSvc
      .adminSaveCheckIn({
        jobVendorKey: vendor.jobVendorKey,
        checkInDate: new Date(this.cioManualCheckInDate()).toISOString(),
        noOfTech: this.cioManualNoOfTech(),
      })
      .subscribe((res) => {
        this.cioManualSaving.set(false);
        if (res.status) {
          this.cioSuccessMessage.set(res.message || 'Manual check-in saved.');
          this.closeCioManualEntry();
          this.loadCioRows();
        } else {
          this.cioManualError.set(res.message || 'Failed to save check-in.');
        }
      });
  }

  cioRowClass(row: AdminJobCheckInOutRow): string {
    const classes: string[] = [];
    if (row.isVendorDeleted) classes.push('cio-row--deleted');
    if (!row.isSelected) classes.push('cio-row--unviewed');
    return classes.join(' ');
  }


  openLegacyUrl(url: string): void {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  /** Legacy EIndex parity: VendorLogin/LoginByRCSadmin/{contactKey}?adminKey={adminKey} */
  openVendorLogin(contactKey: string | null | undefined): void {
    if (!contactKey) return;
    const adminKey = this.authTokenSvc.getAdminKeyFromToken();
    if (!adminKey) return;
    const url = `${environment.vendorPortalBaseUrl}/VendorLogin/LoginByRCSadmin/${contactKey}?adminKey=${adminKey}`;
    window.open(url, '_blank', 'noopener');
  }

  legacyVendorBillsUrl(): string {
    return `${environment.legacyAdminBaseUrl}/MgtVendorBill/Index/${this.jobKey()}`;
  }

  legacyAddNewBillUrl(): string {
    return `${environment.legacyAdminBaseUrl}/MgtVendorBill/ReCheckCreate/${this.jobKey()}?id1=0`;
  }

  legacyPayVendorCcUrl(): string {
    return `${environment.legacyAdminBaseUrl}/MgtVendorBill/ReCheckCreate/${this.jobKey()}?id1=1`;
  }

  /** MgtVendorBill/Index — Create RCS Invoice (CheckForDepositInvoice then CreateInvoiceNew). */
  legacyCreateRcsInvoiceUrl(invoiceKey: string): string {
    return `${environment.legacyAdminBaseUrl}/MgtVendorInvoiceToCustomerInvoice/CreateInvoiceNew/${invoiceKey}?id1=1`;
  }

  // ── Create Customer Invoice — path entry points ─────────────────
  // Phase 1: the four legacy creation paths are surfaced on the Invoices accordion.
  // Path 3 (vendor estimate → customer estimate) runs natively via the shared modal;
  // Paths 1/2/4 (which produce a customer invoice) deep-link to the legacy MVC pages
  // until the native RFIJobOps invoice-write endpoints land (Phase 2). The legacy pages
  // still enforce the deposit/approval gate server-side.

  /** Path 1 — Create Customer Invoice from scratch: MgtJobSalesOrder/Index/{jobKey}?id2=1. */
  legacyCreateInvoiceScratchUrl(): string {
    return `${environment.legacyAdminBaseUrl}/MgtJobSalesOrder/Index/${this.jobKey()}?id2=1`;
  }

  /** Path 2 — Create Customer Invoice from an existing customer estimate: the Invoices & Estimates hub
   * (SaleEstimated), where the "Save As Invoice" action lives per estimate row. */
  legacyInvoicesAndEstimatesUrl(): string {
    return `${environment.legacyAdminBaseUrl}/MgtJobSalesOrder/SaleEstimated/${this.jobKey()}`;
  }

  /**
   * Duplicate guard for the invoice-producing path: if the job already has an active customer invoice,
   * ask before creating another. Purely the "don't double-invoice" prompt; the deposit gate is separate.
   */
  private confirmWhenActiveInvoiceExists(): boolean {
    if (!this.invHasActiveCustomerInvoice()) return true;
    return confirm(
      'This job already has an active customer invoice. Do you still want to create another one?',
    );
  }

  /**
   * Shared pre-flight for the invoice-producing paths: the duplicate-invoice confirm (client) followed by
   * the server deposit gate (a deposit estimate not yet customer-approved blocks creation). Runs `open`
   * only when both pass.
   */
  private runInvoiceGates(open: () => void): void {
    if (!this.confirmWhenActiveInvoiceExists()) return;
    const key = this.jobKey();
    if (!key) {
      open();
      return;
    }
    this.invErrorMessage.set('');
    this.vendorBillsSvc
      .checkDepositGate(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (res.status && res.data && !res.data.canProceed) {
          this.invErrorMessage.set(res.data.message);
          return;
        }
        open();
      });
  }

  /** Path 4 — from a vendor-submitted invoice row (native). Paths 1 & 2 now live on the Estimates page. */
  onCreateInvoiceFromVendorInvoice(inv: AdminVendorSubmittedInvoiceRow): void {
    if (inv.isVendorDeleted || !inv.canCreateInvoice) return;
    this.runInvoiceGates(() =>
      this.createCustomerInvoiceModal?.open({
        source: CustomerInvoiceSource.VendorInvoice,
        jobKey: this.jobKey(),
        sourceKey: inv.vendorInvoiceKey || inv.invoiceKey,
        sourceLabel: `From Vendor Invoice #${inv.invoiceNo || ''}`.trim(),
      }),
    );
  }

  /** A customer invoice was persisted — refresh the invoices grid and surface the invoice number. */
  onCustomerInvoiceCreated(event: { customerInvoiceKey: string; invoiceNo: number | null }): void {
    this.invErrorMessage.set('');
    this.loadInvoicesPage();
    if (event.invoiceNo) {
      this.invAlertMessage.set(`Customer invoice #${event.invoiceNo} created.`);
    }
  }

  /** A lifecycle action (receivables/email/edit/void/resubmit) changed a customer invoice. */
  onCustomerInvoiceListChanged(): void {
    this.loadInvoicesPage();
  }

  // ── Path 3 — vendor estimate → customer estimate (native) ───────
  // Source picker: the Invoices accordion lists vendor invoices, not vendor estimates, so a
  // small picker loads the job's vendor estimates and hands the chosen one to the native modal.
  p3PickerOpen = signal(false);
  p3PickerLoading = signal(false);
  p3PickerError = signal('');
  p3Estimates = signal<AdminJobEstimateCard[]>([]);
  private p3CustomerKey = signal<string | undefined>(undefined);

  openVendorEstimatePicker(): void {
    const key = this.jobKey();
    if (!key) return;

    this.p3PickerOpen.set(true);
    this.p3PickerLoading.set(true);
    this.p3PickerError.set('');
    this.p3Estimates.set([]);

    this.vendorBillsSvc
      .getJobEstimatesPage(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.p3PickerLoading.set(false);
        if (!res.status || !res.data) {
          this.p3PickerError.set(res.message || 'Failed to load vendor estimates.');
          return;
        }
        this.p3CustomerKey.set(res.data.dneTracker?.customerKey ?? undefined);
        this.p3Estimates.set(
          (res.data.estimates?.data ?? []).filter((c) => !c.isDeleted && !c.isVendorDeleted),
        );
      });
  }

  closeVendorEstimatePicker(): void {
    this.p3PickerOpen.set(false);
  }

  /** Seed the native customer-estimate modal from the chosen vendor estimate (create mode). */
  createCustomerEstimateFromVendorEstimate(card: AdminJobEstimateCard): void {
    this.closeVendorEstimatePicker();
    this.createCustomerEstimateModal?.open({
      jobKey: this.jobKey(),
      vendorEstimateKey: card.estimateKey,
      mode: 'create',
      customerKey: this.p3CustomerKey(),
      vendorName: card.vendorName,
      estimateNo: card.estimateNo,
      customerEmail: null,
    });
  }

  // Post-creation follow-ups mirror the estimates section: refresh, then prompt the send dialog
  // and the vendor-deposit modal after the estimate is emailed.
  private readonly p3PendingDepositTotals = new Map<string, number>();
  private readonly p3ResendOnlyKeys = new Set<string>();

  onCustomerEstimateCreated(event: { customerEstimateKey: string; customerTotal: number }): void {
    this.p3PendingDepositTotals.set(event.customerEstimateKey, event.customerTotal);
    this.loadInvoicesPage();
  }

  onSendRequested(event: { customerEstimateKey: string; isResend: boolean }): void {
    if (event.isResend) {
      this.p3ResendOnlyKeys.add(event.customerEstimateKey);
    } else {
      this.p3ResendOnlyKeys.delete(event.customerEstimateKey);
    }
    this.sendCustomerEstimateModal?.open({ customerEstimateKey: event.customerEstimateKey });
  }

  onCustomerEstimateSent(event: { customerEstimateKey: string; sentCount: number }): void {
    this.loadInvoicesPage();

    if (this.p3ResendOnlyKeys.delete(event.customerEstimateKey)) {
      this.p3PendingDepositTotals.delete(event.customerEstimateKey);
      return;
    }

    this.estimateVendorDepositModal?.open({
      jobKey: this.jobKey(),
      customerEstimateKey: event.customerEstimateKey,
      customerEstimateTotal: this.p3PendingDepositTotals.get(event.customerEstimateKey) ?? 0,
    });
    this.p3PendingDepositTotals.delete(event.customerEstimateKey);
  }

  onSendCancelled(): void {
    this.p3ResendOnlyKeys.clear();
  }

  invBillRowClass(row: AdminJobBillRow): string {
    return row.rowVariant === 'muted' ? 'inv-row inv-row--muted' : 'inv-row';
  }

  invVendorInvoiceRowClass(row: AdminVendorSubmittedInvoiceRow): string {
    if (row.rowVariant === 'muted') return 'inv-row inv-row--muted';
    if (row.rowVariant === 'new') return 'inv-row inv-row--new';
    return 'inv-row';
  }

  invBillStatusVariant(bill: AdminJobBillRow): string {
    if (bill.isDeleted) return 'deleted';
    const label = bill.statusLabel.toLowerCase();
    if (label.includes('pending')) return 'pending';
    if (label.includes('no payable')) return 'muted';
    if (label.includes('paid') || label.includes('approved')) return 'approved';
    return 'default';
  }

  invVendorStatusVariant(row: AdminVendorSubmittedInvoiceRow): string {
    return row.statusBadgeVariant || 'default';
  }

  onShowVendorRates(inv: AdminVendorSubmittedInvoiceRow): void {
    if (!inv.vendorKey || inv.isVendorDeleted) return;

    this.ratesVendorName.set(inv.vendorName || 'Vendor');
    this.ratesData.set(null);
    this.ratesLoading.set(true);
    this.showRatesModal.set(true);

    this.assignVendorSvc
      .getVendorRates(inv.vendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.ratesLoading.set(false);
        if (res?.status) {
          this.ratesData.set(res.data);
        }
      });
  }

  formatVendorRate(amount: number | null | undefined): string {
    return amount != null ? `$${amount.toFixed(2)}` : '—';
  }

  onInvBillsSearchInput(value: string): void {
    this.invBillsSearchText.set(value);
    this.invBillsCurrentPage.set(1);
  }

  onInvBillsPageSizeChange(size: number | string): void {
    this.invBillsPageSize.set(Number(size) || 10);
    this.invBillsCurrentPage.set(1);
  }

  invBillsGoToPage(page: number): void {
    const p = Math.max(1, Math.min(page, this.invBillsTotalPages()));
    this.invBillsCurrentPage.set(p);
  }

  onInvVendorSearchInput(value: string): void {
    this.invSearchText.set(value);
    this.invVendorCurrentPage.set(1);
  }

  onInvVendorPageSizeChange(size: number | string): void {
    this.invVendorPageSize.set(Number(size) || 100);
    this.invVendorCurrentPage.set(1);
  }

  invVendorGoToPage(page: number): void {
    const p = Math.max(1, Math.min(page, this.invVendorTotalPages()));
    this.invVendorCurrentPage.set(p);
  }

  legacyAttachFileUrl(): string {
    return `${environment.legacyAdminBaseUrl}/MgtJobFile/Index/${this.jobKey()}`;
  }

  legacyDeleteEstimateFileUrl(uploadKey: string): string {
    return `${environment.legacyAdminBaseUrl}/MdtVendorEstimateNew/DeleteFile/${uploadKey}`;
  }

  legacyVendorPaperViewUrl(uploadKey: string): string {
    return `${environment.legacyAdminBaseUrl}/ShowImage/GetVendorPapers?id=${uploadKey}`;
  }

  vendorPaperFileBadge(fileName: string | null | undefined): string | null {
    const ext = (fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return 'PDF';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'IMG';
    return null;
  }

  onVePageSizeChange(size: number | string): void {
    this.vePageSize.set(Number(size) || 100);
    this.veCurrentPage.set(1);
  }

  onVeSearchInput(value: string): void {
    this.veSearchText.set(value);
    this.veCurrentPage.set(1);
  }

  veGoToPage(page: number): void {
    const p = Math.max(1, Math.min(page, this.veTotalPages()));
    this.veCurrentPage.set(p);
  }

  deleteEstimateFile(file: AdminVendorPaperRow): void {
    if (!confirm('Are you sure you want to DELETE this ?')) return;
    this.openLegacyUrl(this.legacyDeleteEstimateFileUrl(file.uploadKey));
  }

  openEstimateFile(file: AdminVendorPaperRow): void {
    const url = file.fileUrl || this.legacyVendorPaperViewUrl(file.uploadKey);
    if (url) window.open(url, '_blank', 'noopener');
  }

  onUncheckNewEstimateFile(file: AdminVendorPaperRow): void {
    if (!file.isNew) return;

    this.vendorBillsSvc
      .markVendorPaperViewed(file.uploadKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status) {
          this.veErrorMessage.set(res?.message || 'Failed to mark file as viewed.');
          return;
        }
        this.loadEstimateFiles();
      });
  }

  onUncheckAllEstimateFiles(): void {
    const key = this.jobKey();
    if (!key || !this.veHasNewFiles()) return;
    if (!confirm('Are you sure you want to Uncheck all NEW file(s)?')) return;

    this.veUnchecking.set(true);
    this.veErrorMessage.set('');
    this.vendorBillsSvc
      .uncheckAllVendorPapers(key, 'estimate')
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.veUnchecking.set(false);
        if (!res?.status) {
          this.veErrorMessage.set(res?.message || 'Failed to uncheck estimate files.');
          return;
        }
        this.veSuccessMessage.set(res.data ?? res.message ?? 'All new estimate files unchecked.');
        this.loadEstimateFiles();
      });
  }

  onVpPageSizeChange(size: number | string): void {
    this.vpPageSize.set(Number(size) || 100);
    this.vpCurrentPage.set(1);
  }

  onVpSearchInput(value: string): void {
    this.vpSearchText.set(value);
    this.vpCurrentPage.set(1);
  }

  vpGoToPage(page: number): void {
    const p = Math.max(1, Math.min(page, this.vpTotalPages()));
    this.vpCurrentPage.set(p);
  }

  deleteVendorPaper(paper: AdminVendorPaperRow): void {
    if (!confirm('Are you sure you want to DELETE this ?')) return;

    this.vpErrorMessage.set('');
    this.vpSuccessMessage.set('');

    this.vendorBillsSvc
      .deleteVendorPaper(paper.uploadKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status) {
          this.vpErrorMessage.set(res?.message || 'Failed to delete vendor paper.');
          return;
        }
        this.vpSuccessMessage.set(res.data ?? res.message ?? 'File deleted successfully.');
        this.loadInvoiceFiles();
      });
  }

  openVendorPaper(paper: AdminVendorPaperRow): void {
    const url = paper.fileUrl || this.legacyVendorPaperViewUrl(paper.uploadKey);
    if (url) window.open(url, '_blank', 'noopener');
  }

  onUncheckNewVendorPaper(paper: AdminVendorPaperRow): void {
    if (!paper.isNew) return;

    this.vendorBillsSvc
      .markVendorPaperViewed(paper.uploadKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status) {
          this.vpErrorMessage.set(res?.message || 'Failed to mark paper as viewed.');
          return;
        }
        this.loadInvoiceFiles();
      });
  }

  onUncheckAllVendorPapers(): void {
    const key = this.jobKey();
    if (!key || !this.vpHasNewPapers()) return;
    if (!confirm('Are you sure you want to Uncheck all NEW file(s)?')) return;

    this.vpUnchecking.set(true);
    this.vpErrorMessage.set('');
    this.vendorBillsSvc
      .uncheckAllVendorPapers(key, 'invoice')
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.vpUnchecking.set(false);
        if (!res?.status) {
          this.vpErrorMessage.set(res?.message || 'Failed to uncheck vendor papers.');
          return;
        }
        this.vpSuccessMessage.set(res.data ?? res.message ?? 'All new vendor papers unchecked.');
        this.loadInvoiceFiles();
      });
  }

  openUploadVendorPapersModal(): void {
    const key = this.jobKey();
    if (!key) return;

    this.vpUploadModalOpen.set(true);
    this.vpUploadModalLoading.set(true);
    this.vpUploadModalSaving.set(false);
    this.vpUploadModalUploading.set(false);
    this.vpUploadModalMessage.set('');
    this.vpUploadVendorKey.set('');
    this.vpUploadDocumentTypeKey.set('');
    this.vpUploadRemark.set('');
    this.vpUploadStagedFiles.set([]);
    this.vpUploadModalData.set(null);

    this.vendorBillsSvc
      .getUploadVendorPapersModal(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.vpUploadModalLoading.set(false);
        if (!res?.status || !res.data) {
          this.vpUploadModalMessage.set(res?.message || 'Failed to load upload vendor papers form.');
          return;
        }
        this.vpUploadModalData.set(res.data);
        if (res.data.vendors.length === 1) {
          this.vpUploadVendorKey.set(res.data.vendors[0].vendorKey);
        }
      });
  }

  closeUploadVendorPapersModal(): void {
    if (this.vpUploadModalSaving() || this.vpUploadModalUploading()) return;
    this.vpUploadModalOpen.set(false);
  }

  onVpUploadDragOver(event: DragEvent): void {
    event.preventDefault();
    this.vpUploadDragOver.set(true);
  }

  onVpUploadDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.vpUploadDragOver.set(false);
  }

  onVpUploadDrop(event: DragEvent): void {
    event.preventDefault();
    this.vpUploadDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.stageVpUploadFiles(Array.from(files));
    }
  }

  onVpUploadFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.stageVpUploadFiles(Array.from(input.files));
      input.value = '';
    }
  }

  private stageVpUploadFiles(files: File[]): void {
    const modal = this.vpUploadModalData();
    if (!modal) return;

    const maxSize = 10 * 1024 * 1024;
    const maxFiles = 25;
    const validFiles = files.filter((file) => {
      if (file.size > maxSize) {
        this.vpUploadModalMessage.set(`File "${file.name}" exceeds 10 MB limit.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const remaining = maxFiles - this.vpUploadStagedFiles().length;
    if (remaining <= 0) {
      this.vpUploadModalMessage.set('Maximum 25 files allowed per upload.');
      return;
    }

    const toUpload = validFiles.slice(0, remaining);
    this.vpUploadModalUploading.set(true);
    this.vpUploadModalMessage.set('');

    this.vendorBillsSvc
      .uploadVendorPaperTempFiles(modal.checkKey, toUpload)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.vpUploadModalUploading.set(false);
        if (!res?.status) {
          this.vpUploadModalMessage.set(res?.message || 'Failed to upload file(s).');
          return;
        }
        const staged = [...this.vpUploadStagedFiles()];
        for (const file of toUpload) {
          if (!staged.some((s) => s.fileName === file.name)) {
            staged.push({ fileName: file.name });
          }
        }
        this.vpUploadStagedFiles.set(staged);
      });
  }

  removeVpUploadStagedFile(fileName: string): void {
    const modal = this.vpUploadModalData();
    if (!modal) return;

    this.vendorBillsSvc
      .removeVendorPaperTempFile(modal.checkKey, fileName)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status) {
          this.vpUploadModalMessage.set(res?.message || 'Failed to remove file.');
          return;
        }
        this.vpUploadStagedFiles.update((files) => files.filter((f) => f.fileName !== fileName));
      });
  }

  saveUploadVendorPapers(): void {
    const modal = this.vpUploadModalData();
    const key = this.jobKey();
    if (!modal || !key) return;

    if (!this.vpUploadDocumentTypeKey()) {
      this.vpUploadModalMessage.set('Document Type is compulsory.');
      return;
    }
    if (!this.vpUploadVendorKey()) {
      this.vpUploadModalMessage.set('Vendor is compulsory.');
      return;
    }
    if (this.vpUploadTempCount() <= 0) {
      this.vpUploadModalMessage.set('Please attach file.');
      return;
    }

    const request: SaveVendorPapersRequest = {
      jobKey: key,
      checkKey: modal.checkKey,
      vendorKey: this.vpUploadVendorKey(),
      documentTypeKey: this.vpUploadDocumentTypeKey(),
      remark: this.vpUploadRemark().trim() || null,
    };

    this.vpUploadModalSaving.set(true);
    this.vpUploadModalMessage.set('Uploading file in database…');

    this.vendorBillsSvc
      .saveVendorPapers(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.vpUploadModalSaving.set(false);
        if (!res?.status) {
          this.vpUploadModalMessage.set(res?.message || 'Failed to save vendor papers.');
          return;
        }

        this.vpUploadModalMessage.set(res.data ?? res.message ?? 'Data has been updated successfully.');
        this.vpUploadStagedFiles.set([]);
        this.vpUploadRemark.set('');
        this.vpSuccessMessage.set(res.data ?? res.message ?? 'Vendor papers saved.');
        this.loadInvoiceFiles();
        this.refreshUploadModalPapers();
      });
  }

  deleteVpUploadModalPaper(paper: AdminVendorPaperRow): void {
    if (!confirm('Are you sure you want to DELETE this ?')) return;

    this.vendorBillsSvc
      .deleteVendorPaper(paper.uploadKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status) {
          this.vpUploadModalMessage.set(res?.message || 'Failed to delete vendor paper.');
          return;
        }
        this.vpSuccessMessage.set(res.data ?? res.message ?? 'File deleted successfully.');
        this.loadInvoiceFiles();
        this.refreshUploadModalPapers();
      });
  }

  private refreshUploadModalPapers(): void {
    const key = this.jobKey();
    const current = this.vpUploadModalData();
    if (!key || !current) return;

    this.vendorBillsSvc
      .getUploadVendorPapersModal(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status || !res.data) return;
        this.vpUploadModalData.set({
          ...current,
          papers: res.data.papers,
        });
      });
  }

  // ── Data loading ────────────────────────────────────────────

  private loadCioRows(): void {
    const key = this.jobKey();
    if (!key) return;

    this.cioIsLoading.set(true);
    this.cioErrorMessage.set('');

    const start = (this.cioCurrentPage() - 1) * this.cioPageSize();

    this.vendorBillsSvc
      .getJobCheckInOutList(key, {
        start,
        length: this.cioPageSize(),
        searchValue: this.cioSearchText(),
        sortCol: this.cioSortCol(),
        sortDir: this.cioSortDir(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.cioIsLoading.set(false);
        if (res.status && res.data) {
          this.cioRows.set(res.data.data ?? []);
          this.cioTotalRecords.set(res.data.filteredRecords ?? res.data.totalRecords ?? 0);
        } else {
          this.cioRows.set([]);
          this.cioTotalRecords.set(0);
          this.cioErrorMessage.set(res.message || 'Failed to load check-in/out records.');
        }
      });
  }


  private loadInvoicesPage(): void {
    const key = this.jobKey();
    if (!key) return;

    this.invIsLoading.set(true);
    this.invErrorMessage.set('');

    this.vendorBillsSvc
      .getInvoicesPage(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.invIsLoading.set(false);
        if (!res.status || !res.data) {
          this.invBills.set([]);
          this.invVendorInvoices.set([]);
          this.invErrorMessage.set(res.message || 'Failed to load invoices.');
          return;
        }
        this.invJobName.set(res.data.jobName ?? '');
        this.invAlertMessage.set(res.data.alertMessage ?? '');
        this.invHasActiveCustomerInvoice.set(res.data.hasActiveCustomerInvoice ?? false);
        this.invBills.set(res.data.bills ?? []);
        this.invVendorInvoices.set(res.data.vendorInvoices ?? []);
        this.invBillsCurrentPage.set(1);
        this.invVendorCurrentPage.set(1);
      });
  }

  private loadEstimateFiles(): void {
    const key = this.jobKey();
    if (!key) return;

    this.veIsLoading.set(true);
    this.veErrorMessage.set('');

    this.vendorBillsSvc
      .getVendorPapers(key, 'estimate')
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.veIsLoading.set(false);
        if (!res.status || !res.data) {
          this.veFiles.set([]);
          this.veHasNewFiles.set(false);
          this.veErrorMessage.set(res.message || 'Failed to load vendor estimate files.');
          return;
        }
        this.veFiles.set(res.data.papers ?? []);
        this.veHasNewFiles.set(res.data.hasNewPapers ?? false);
      });
  }

  private loadInvoiceFiles(): void {
    const key = this.jobKey();
    if (!key) return;

    this.vpIsLoading.set(true);
    this.vpErrorMessage.set('');

    this.vendorBillsSvc
      .getVendorPapers(key, 'invoice')
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.vpIsLoading.set(false);
        if (!res.status || !res.data) {
          this.vpPapers.set([]);
          this.vpHasNewPapers.set(false);
          this.vpErrorMessage.set(res.message || 'Failed to load vendor papers.');
          return;
        }
        this.vpPapers.set(res.data.papers ?? []);
        this.vpHasNewPapers.set(res.data.hasNewPapers ?? false);
      });
  }

  private toLocalDatetimeInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
