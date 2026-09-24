import { Component, inject, signal, computed, effect, ViewChild, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import { environment } from '../../../../environments/environment';
import {
  ChargeType,
  CostIncurredType,
  RateType,
  LaborCategory,
  TripChargeLineItem,
  MaterialLineItem,
  LaborLineItem,
  OnSiteEstimateInitResponse,
  EstimateLineItem,
  EstimateUploadedFile,
  CustomerMarkupResponse,
  VendorRateResponse,
  VendorTradeRateResponse,
  CustomerEstimateLineItem,
  EditEstimateResponse,
  EditEstimateLineItem,
  SaveVendorApprovalDataRequest,
  CustomChargeTypeOption,
  CUSTOM_CHARGE_TYPE_OPTIONS,
  UpdateCustomerEstimateLineItemRequest,
} from '../../../models/on-site-estimate.model';
import { AdditionalApprovalModalComponent } from '../additional-approval-modal/additional-approval-modal.component';

@Component({
  selector: 'app-on-site-estimate-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AdditionalApprovalModalComponent],
  templateUrl: './on-site-estimate-modal.component.html',
  styleUrls: ['./on-site-estimate-modal.component.scss'],
})
export class OnSiteEstimateModalComponent {
  /** Job priority key for Emergency — matches assign-vendor / legacy CreateJob.js. */
  private static readonly EMERGENCY_JOB_TYPE_KEY = 'fc078fd5-5ddc-4088-8a9f-d982436e20fd';
  private readonly fb = inject(FormBuilder);
  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild(AdditionalApprovalModalComponent) additionalApprovalModal?: AdditionalApprovalModalComponent;

  // ──────────────────────────────────────────────────────────────
  //  State
  // ──────────────────────────────────────────────────────────────

  readonly isVisible = signal(false);
  readonly isSubmitting = signal(false);
  readonly currentStep = signal(1);
  readonly maxStep = 5;

  readonly jobKey = signal<string>('');
  readonly vendorKey = signal<string>('');
  readonly tradeKey = signal<string | null>(null);
  readonly jobTypeKey = signal<string | null>(null);
  readonly customerEmail = signal<string | null>(null);

  // Edit mode
  readonly isEditMode = signal(false);
  readonly existingEstimateKey = signal<string | null>(null);
  readonly editData = signal<EditEstimateResponse | null>(null);

  readonly initData = signal<OnSiteEstimateInitResponse | null>(null);
  readonly lineItems = signal<(TripChargeLineItem | MaterialLineItem | LaborLineItem)[]>([]);
  readonly uploadedFiles = signal<EstimateUploadedFile[]>([]);
  readonly savedEstimateKey = signal<string | null>(null);
  readonly customerMarkup = signal<CustomerMarkupResponse | null>(null); // Customer markup percentages for estimate calculations
  readonly customerEstimateResponse = signal<any>(null); // Store customer estimate response for comparison grid
  // Tracks the backend-generated JobSalesInvoiceDetail key for the synthetic "Admin Fee" row,
  // once the backend has confirmed/created it. Null until the first successful save that includes
  // an admin markup amount (or until create-customer-estimate starts returning it directly).
  readonly adminMarkupLineItemKey = signal<string | null>(null);
  readonly editingCell = signal<{ rowIndex: number; field: string } | null>(null); // Track which cell is being edited
  readonly hasUnsavedChanges = signal(false); // Track if there are unsaved changes
  readonly isSavingChanges = signal(false); // Track if auto-save is in progress
  readonly vendorRates = signal<VendorTradeRateResponse | VendorRateResponse | null>(null); // Vendor rates for pre-filling forms
  readonly isLoadingRates = signal(false); // Track if rates are being loaded

  // Editing state for materials and labor
  readonly editingMaterialIndex = signal<number | null>(null); // Track which material is being edited
  readonly editingLaborIndex = signal<number | null>(null); // Track which labor is being edited

  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly guidanceMessage = signal('');
  readonly showValidationHints = signal(false);

  readonly stepContextSubtitle = computed(() => {
    switch (this.currentStep()) {
      case 1:
        return 'Enter the trip charge for this service call, or skip if not applicable.';
      case 5:
        return 'Review totals and choose how to submit the estimate.';
      default:
        return '';
    }
  });

  /** Fixed list of charge types selectable when adding a custom (admin-added) line item. */
  readonly customChargeTypeOptions: CustomChargeTypeOption[] = CUSTOM_CHARGE_TYPE_OPTIONS;

  // ──────────────────────────────────────────────────────────────
  //  Computed Values
  // ──────────────────────────────────────────────────────────────

  readonly estimateTotal = computed(() => {
    return this.lineItems().reduce((sum, item) => {
      if (item.chargeType === ChargeType.TripCharge) {
        return sum + (item as TripChargeLineItem).amount;
      } else if (item.chargeType === ChargeType.Material) {
        const mat = item as MaterialLineItem;
        return sum + mat.quantity * mat.rate;
      } else if (item.chargeType === ChargeType.Labor) {
        const lab = item as LaborLineItem;
        return sum + lab.techCount * lab.laborHours * lab.laborRate;
      }
      return sum;
    }, 0);
  });

  readonly dneTracker = computed(() => {
    const init = this.initData();
    const markup = this.customerMarkup();

    if (!init) {
      return null;
    }

    const customerDne = init.customerDne || 0;
    const vendorDne = init.vendorDne || 0;
    const committedAmount = this.estimateTotal();

    // We show the DNE tracker even if values are 0 — the backend initialize endpoint
    // returns 0 for DNE values when not configured.
    // TODO: Backend should populate DNE from Job/Customer data

    // Use labor markup as the minimum markup requirement (typically 18-35%)
    const minimumMarkupPercent = markup?.laborAndTripMarkupPercent || 18;
    const minimumMarkupAmount = vendorDne * (minimumMarkupPercent / 100);

    const result = {
      customerDne,
      vendorDne,
      minimumMarkupPercent,
      minimumMarkupAmount,
      committedAmount,
    };

    return result;
  });

  readonly dneProgressPercent = computed(() => {
    const dne = this.dneTracker();
    if (!dne || dne.customerDne <= 0) return 0;
    return Math.min(100, (dne.committedAmount / dne.customerDne) * 100);
  });

  readonly tripCharge = computed(() => {
    return this.lineItems().find(
      (item) => item.chargeType === ChargeType.TripCharge
    ) as TripChargeLineItem | undefined;
  });

  readonly materials = computed(() => {
    return this.lineItems().filter(
      (item) => item.chargeType === ChargeType.Material
    ) as MaterialLineItem[];
  });

  readonly laborItems = computed(() => {
    return this.lineItems().filter(
      (item) => item.chargeType === ChargeType.Labor
    ) as LaborLineItem[];
  });

  // ──────────────────────────────────────────────────────────────
  //  Forms
  // ──────────────────────────────────────────────────────────────

  readonly tripForm: FormGroup;
  readonly materialForm: FormGroup;
  readonly laborForm: FormGroup;

  constructor() {
    // Trip charge form - defaults to Incurred since trip charges are already charged when arriving
    this.tripForm = this.fb.group({
      costIncurred: [CostIncurredType.Incurred, Validators.required],
      rateType: [RateType.Flat, Validators.required],
      amount: [0, [Validators.required, Validators.min(0)]],
    });

    // Material form - defaults to Proposed since materials are work to be done
    this.materialForm = this.fb.group({
      costIncurred: [CostIncurredType.Proposed, Validators.required],
      description: ['', Validators.required], // Description is now required since itemName is removed
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      rate: [0, [Validators.required, Validators.min(0)]],
    });

    // Labor form - defaults to Proposed since labor is work to be done
    this.laborForm = this.fb.group({
      costIncurred: [CostIncurredType.Proposed, Validators.required],
      laborCategory: [LaborCategory.MainTech, Validators.required],
      rateType: [RateType.Standard, Validators.required],
      techCount: [1, [Validators.required, Validators.min(1)]],
      laborHours: [0, [Validators.required, Validators.min(0.01)]],
      laborRate: [0, [Validators.required, Validators.min(0)]],
      workDescription: ['', Validators.required],
    });

    this.laborForm.get('laborCategory')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyVendorLaborRateToForm());

    this.laborForm.get('rateType')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyVendorLaborRateToForm());
  }

  // ──────────────────────────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────────────────────────

  /**
   * Open the modal to create a new estimate
   */
  open(
    jobKey: string,
    vendorKey: string,
    customerEmail?: string | null,
    customerDne?: number,
    vendorDne?: number,
    tradeKey?: string | null,
    jobTypeKey?: string | null
  ): void {
    this.jobKey.set(jobKey);
    this.vendorKey.set(vendorKey);
    this.tradeKey.set(tradeKey ?? null);
    this.jobTypeKey.set(jobTypeKey ?? null);
    this.customerEmail.set(customerEmail || null);
    
    this.isVisible.set(true);
    this.isEditMode.set(false);
    this.existingEstimateKey.set(null);
    this.editData.set(null);
    this.currentStep.set(1);
    this.lineItems.set([]);
    this.uploadedFiles.set([]);
    this.savedEstimateKey.set(null);
    this.customerEstimateResponse.set(null);
    this.adminMarkupLineItemKey.set(null);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.guidanceMessage.set('');
    this.showValidationHints.set(false);

    // Initialize the estimate
    // Note: We'll override DNE values after initialize completes
    this.initialize(customerDne, vendorDne);
  }

  /**
   * Open the modal to edit an existing estimate
   */
  openForEdit(estimateKey: string): void {
    this.isVisible.set(true);
    this.isEditMode.set(true);
    this.existingEstimateKey.set(estimateKey);
    this.currentStep.set(1);
    this.lineItems.set([]);
    this.uploadedFiles.set([]);
    this.savedEstimateKey.set(null);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.guidanceMessage.set('');
    this.showValidationHints.set(false);

    // Load the existing estimate
    this.loadEstimateForEdit(estimateKey);
  }

  /**
   * Open the modal directly on the comparison/send-email step (step 5) for a vendor estimate
   * that already has (or should have) a customer estimate — the "Get More Approval from
   * Customer" flow. Uses the read/create-on-demand GET endpoint rather than re-running the
   * full submit-for-approval sequence, since the vendor estimate is already submitted.
   */
  openForReapproval(jobKey: string, vendorEstimateKey: string): void {
    this.isVisible.set(true);
    this.isEditMode.set(true);
    this.existingEstimateKey.set(vendorEstimateKey);
    this.jobKey.set(jobKey);
    this.currentStep.set(5);
    this.lineItems.set([]);
    this.uploadedFiles.set([]);
    this.savedEstimateKey.set(vendorEstimateKey);
    this.customerEstimateResponse.set(null);
    this.adminMarkupLineItemKey.set(null);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.guidanceMessage.set('');
    this.showValidationHints.set(false);

    this.isSubmitting.set(true);
    this.assignVendorSvc.getCustomerEstimate(jobKey, vendorEstimateKey).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        if (res.status && res.data) {
          this.customerEstimateResponse.set(res.data);
          this.adminMarkupLineItemKey.set(res.data.adminMarkupLineItemKey || null);
        } else {
          this.errorMessage.set(res.message || 'Failed to load customer estimate.');
        }
      },
      error: () => {
        this.isSubmitting.set(false);
        this.errorMessage.set('Failed to load customer estimate.');
      },
    });

    this.assignVendorSvc.getCustomerMarkupByJobKey(jobKey).subscribe({
      next: (markupRes) => {
        if (markupRes.status && markupRes.data) {
          this.customerMarkup.set(markupRes.data);
        }
      },
      error: (err) => {
        console.error('Customer Markup Load Error:', err);
      },
    });
  }

  close(): void {
    this.isVisible.set(false);
    this.initData.set(null);
    this.lineItems.set([]);
    this.uploadedFiles.set([]);
    this.savedEstimateKey.set(null);
    this.customerEstimateResponse.set(null);
    this.adminMarkupLineItemKey.set(null);
    this.guidanceMessage.set('');
    this.showValidationHints.set(false);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  /** Strips redundant "Vendor :" prefix from API display names. */
  formatVendorDisplay(name: string | null | undefined): string {
    if (!name) return '';
    return name.replace(/^vendor\s*:\s*/i, '').trim();
  }

  // ──────────────────────────────────────────────────────────────
  //  Initialization
  // ──────────────────────────────────────────────────────────────

  private initialize(customerDne?: number, vendorDne?: number): void {
    this.isSubmitting.set(true);
    this.assignVendorSvc
      .initializeOnSiteEstimate(this.jobKey(), this.vendorKey())
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            // Convert backend's flat object structure to array format
            let documentTypes: { documentTypeKey: string; label: string }[] = [];
            
            if (Array.isArray(res.data.documentTypes)) {
              // Backend returned an array (expected format)
              documentTypes = res.data.documentTypes;
            } else if (res.data.documentTypes && typeof res.data.documentTypes === 'object') {
              // Backend returned a flat object - convert it to array
              const docTypesObj = res.data.documentTypes as any;
              
              // Map the flat object structure to our array format
              if (docTypesObj.estimateDocKey && docTypesObj.estimateDocLabel) {
                documentTypes.push({
                  documentTypeKey: docTypesObj.estimateDocKey,
                  label: docTypesObj.estimateDocLabel.trim(),
                });
              }
              if (docTypesObj.signOffKey && docTypesObj.signOffLabel) {
                documentTypes.push({
                  documentTypeKey: docTypesObj.signOffKey,
                  label: docTypesObj.signOffLabel.trim(),
                });
              }
              if (docTypesObj.jobPicturesKey && docTypesObj.jobPicturesLabel) {
                documentTypes.push({
                  documentTypeKey: docTypesObj.jobPicturesKey,
                  label: docTypesObj.jobPicturesLabel.trim(),
                });
              }
            }
            
            // Normalize backend field names to match our model
            // Backend returns 'newEstimateKey' but our model expects 'tempEstimateKey'
            const rawData = res.data as any;
            const tempEstimateKey = rawData.tempEstimateKey || rawData.newEstimateKey;
            
            // Override DNE values if provided from parent component
            // The initialize endpoint may return 0, but parent has actual values from job header
            const finalCustomerDne = customerDne !== undefined ? customerDne : (res.data.customerDne || 0);
            const finalVendorDne = vendorDne !== undefined ? vendorDne : (res.data.vendorDne || 0);
            
            const data = {
              ...res.data,
              tempEstimateKey,
              documentTypes,
              customerDne: finalCustomerDne,
              vendorDne: finalVendorDne,
              jobTypeKey: rawData.jobTypeKey || rawData.JobTypeKey || this.jobTypeKey() || null,
            };
            
            this.initData.set(data);
            this.errorMessage.set('');
            
            // Load customer markup percentages for estimate calculations
            this.loadCustomerMarkup();
          } else {
            console.error('initializeOnSiteEstimate failed:', res.message);
            this.errorMessage.set(res.message || 'Failed to initialize estimate');
          }
          this.isSubmitting.set(false);
        },
        error: (err) => {
          console.error('initializeOnSiteEstimate error:', err);
          this.errorMessage.set('Failed to initialize estimate');
          this.isSubmitting.set(false);
        },
      });
  }

  /**
   * Load an existing estimate for editing
   */
  private loadEstimateForEdit(estimateKey: string): void {
    this.isSubmitting.set(true);
    this.assignVendorSvc
      .loadEstimateForEdit(estimateKey)
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            const editData = res.data;
            this.editData.set(editData);

            // Set keys from edit data
            this.jobKey.set(editData.jobKey);
            this.vendorKey.set(editData.vendorKey);

            // Check if estimate is editable
            if (editData.tempHeader === "99") {
              this.errorMessage.set('This estimate cannot be edited (vendor removed or job archived)');
              this.isSubmitting.set(false);
              return;
            }

            if (editData.tempHeader === "3") {
              console.warn('Estimate is already approved. Editing will require re-approval.');
            }

            // Convert backend line items to frontend format
            const convertedLineItems = this.convertEditLineItemsToFrontend(editData.lineItems);
            this.lineItems.set(convertedLineItems);

            // Populate trip charge form if one exists
            this.populateTripChargeForm();

            // Load customer markup for calculations
            this.assignVendorSvc
              .getCustomerMarkupByJobKey(editData.jobKey)
              .subscribe({
                next: (markupRes) => {
                  if (markupRes.status && markupRes.data) {
                    this.customerMarkup.set(markupRes.data);
                  }
                },
                error: (err) => {
                  console.error('Customer Markup Load Error:', err);
                },
              });

            // Initialize to get document types and load existing files
            this.assignVendorSvc
              .initializeOnSiteEstimate(editData.jobKey, editData.vendorKey)
              .subscribe({
                next: (initRes) => {
                  if (initRes.status && initRes.data) {
                    // Convert backend's flat object structure to array format
                    let documentTypes: { documentTypeKey: string; label: string }[] = [];

                    if (Array.isArray(initRes.data.documentTypes)) {
                      documentTypes = initRes.data.documentTypes;
                    } else if (initRes.data.documentTypes && typeof initRes.data.documentTypes === 'object') {
                      const docTypesObj = initRes.data.documentTypes as any;

                      if (docTypesObj.estimateDocKey && docTypesObj.estimateDocLabel) {
                        documentTypes.push({
                          documentTypeKey: docTypesObj.estimateDocKey,
                          label: docTypesObj.estimateDocLabel.trim(),
                        });
                      }
                      if (docTypesObj.signOffKey && docTypesObj.signOffLabel) {
                        documentTypes.push({
                          documentTypeKey: docTypesObj.signOffKey,
                          label: docTypesObj.signOffLabel.trim(),
                        });
                      }
                      if (docTypesObj.jobPicturesKey && docTypesObj.jobPicturesLabel) {
                        documentTypes.push({
                          documentTypeKey: docTypesObj.jobPicturesKey,
                          label: docTypesObj.jobPicturesLabel.trim(),
                        });
                      }
                    }

                    // Store init data with document types (merge with existing edit data)
                    this.initData.set({
                      ...initRes.data,
                      documentTypes: documentTypes,
                    });

                    // Load existing uploaded files
                    this.loadExistingFiles(editData.jobKey);
                  }
                },
                error: (err) => {
                  console.error('initializeOnSiteEstimate error:', err);
                },
              });

            this.errorMessage.set('');
            this.isSubmitting.set(false);
          } else {
            console.error('loadEstimateForEdit failed:', res.message);
            this.errorMessage.set(res.message || 'Failed to load estimate for editing');
            this.isSubmitting.set(false);
          }
        },
        error: (err) => {
          console.error('loadEstimateForEdit error:', err);
          this.errorMessage.set('Failed to load estimate for editing');
          this.isSubmitting.set(false);
        },
      });
  }

  /**
   * Load existing uploaded files for edit mode
   */
  private loadExistingFiles(jobKey: string): void {
    const vendorKey = this.vendorKey();
    if (!vendorKey) {
      return;
    }

    this.assignVendorSvc.getOnSiteEstimateFiles(jobKey, vendorKey).subscribe({
      next: (res) => {
        if (res.status && res.data) {
          this.uploadedFiles.set(res.data);
        } else {
          this.uploadedFiles.set([]);
        }
      },
      error: (err) => {
        console.error('getOnSiteEstimateFiles error:', err);
        this.uploadedFiles.set([]);
      },
    });
  }

  /**
   * Convert backend edit line items to frontend format
   */
  private convertEditLineItemsToFrontend(
    backendItems: EditEstimateLineItem[]
  ): (TripChargeLineItem | MaterialLineItem | LaborLineItem)[] {
    return backendItems.map((item) => {
      // Determine charge type based on chargeTypeKey
      if (item.chargeTypeKey.includes('Trip') || item.chargeTypeKey.includes('TRIP')) {
        const tripItem: TripChargeLineItem = {
          chargeType: ChargeType.TripCharge,
          rateType: item.chargeTypeKey.includes('Emergency') ? RateType.Emergency : RateType.Flat,
          amount: item.rate * item.quantity,
          costIncurred: item.costIncurred === 0 ? CostIncurredType.Incurred : CostIncurredType.Proposed,
          description: item.description,
          displayLevel: parseInt(item.displayLevel) || 1,
        };
        // Store detailKey for update
        (tripItem as any).detailKey = item.detailKey;
        return tripItem;
      } else if (item.isLabor) {
        const laborItem: LaborLineItem = {
          chargeType: ChargeType.Labor,
          laborCategory: LaborCategory.MainTech,
          rateType: item.chargeTypeKey.includes('Overtime') ? RateType.Overtime : RateType.Standard,
          techCount: item.techCount || 1,
          laborHours: item.laborHours || 0,
          laborRate: item.rate,
          workDescription: item.description,
          costIncurred: item.costIncurred === 0 ? CostIncurredType.Incurred : CostIncurredType.Proposed,
          description: item.description,
          displayLevel: parseInt(item.displayLevel) || 2,
        };
        // Store detailKey for update
        (laborItem as any).detailKey = item.detailKey;
        return laborItem;
      } else {
        const materialItem: MaterialLineItem = {
          chargeType: ChargeType.Material,
          itemName: item.itemName,
          quantity: item.quantity,
          rate: item.rate,
          costIncurred: item.costIncurred === 0 ? CostIncurredType.Incurred : CostIncurredType.Proposed,
          description: item.description,
          displayLevel: parseInt(item.displayLevel) || 3,
        };
        // Store detailKey for update
        (materialItem as any).detailKey = item.detailKey;
        return materialItem;
      }
    });
  }

  /**
   * Loads customer markup percentages from the backend.
   * These are used to automatically calculate customer estimates from vendor estimates.
   */
  private loadCustomerMarkup(): void {
    this.assignVendorSvc
      .getCustomerMarkupByJobKey(this.jobKey())
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            this.customerMarkup.set(res.data);
            // Warn if markup is not fully configured
            if (res.data.markupStatus !== 'Full Markup Configured') {
              console.warn('Customer markup is not fully configured:', res.data.markupStatus);
            }
          } else {
            // Don't fail the whole flow - the backend will use default markup calculation if not provided
            console.warn('Failed to load customer markup:', res.message);
          }
        },
        error: (err) => {
          console.error('Customer Markup Load Error:', err);
          // Don't fail the whole flow - backend will use defaults
        },
      });
    
    // Load vendor rates for pre-filling forms
    this.loadVendorRates();
  }

  /**
   * Load vendor rates using legacy-style hierarchical fallback logic.
   * This matches ProjectRCS behavior with automatic fallback:
   * 1. VendorTrade (specific trade)
   * 2. VendorTrade ("All Trades")
   * 3. VendorRates (general)
   * 4. $0 fallback (creates new record)
   */
  private loadVendorRates(): void {
    const tradeKeyValue = this.tradeKey();
    const jobTypeKeyValue = this.jobTypeKey() || this.initData()?.jobTypeKey || undefined;

    this.isLoadingRates.set(true);

    // Pass tradeKey / jobTypeKey when available from parent or initialize response
    
    this.assignVendorSvc
      .getVendorRatesLegacy(
        this.vendorKey(),
        tradeKeyValue || undefined,
        jobTypeKeyValue || undefined,
      )
      .subscribe({
        next: (res) => {
          if (res.status && res.data && res.data.success) {
            const rates = res.data;

            // Convert legacy response to the format expected by prefillFormsWithRates
            this.vendorRates.set({
              vendorKey: rates.vendorKey,
              vendorName: null,
              hourlyRate: rates.hourlyRate,
              tripCharge: rates.tripCharge,
              serviceCharge: rates.serviceCharge,
              emergencyHourlyRate: rates.emergencyHourlyRate,
              emergencyTripCharge: rates.emergencyTripCharge,
              emergencyServiceCharge: rates.emergencyServiceCharge,
              helperRates: rates.helperRate,
              emergencyHelperRates: rates.emergencyHelperRate,
            });
            
            this.prefillFormsWithRates();
          } else {
            console.warn('getVendorRatesLegacy unsuccessful:', res.data?.errorMessage || res.message);
          }

          this.isLoadingRates.set(false);
        },
        error: (err) => {
          console.error('getVendorRatesLegacy error:', err);
          this.isLoadingRates.set(false);
        },
      });
  }

  /**
   * Pre-fills the trip charge and labor forms with vendor rates
   */
  private prefillFormsWithRates(): void {
    const rates = this.vendorRates();
    if (!rates) return;

    const init = this.initData();
    if (!init) return;

    const isEmergency = this.isEmergencyJob(init);

    // Pre-fill trip charge form
    const tripRate = isEmergency
      ? (rates.emergencyTripCharge || rates.tripCharge || 0)
      : (rates.tripCharge || 0);

    if (tripRate > 0) {
      this.tripForm.patchValue({
        amount: tripRate,
        rateType: isEmergency ? RateType.Emergency : RateType.Flat,
      });
    }

    this.laborForm.patchValue({
      rateType: isEmergency ? RateType.Overtime : RateType.Standard,
    }, { emitEvent: false });
    this.applyVendorLaborRateToForm();
  }

  /** Applies the vendor labor rate matching the current category + rate type selections. */
  private applyVendorLaborRateToForm(): void {
    const rates = this.vendorRates();
    if (!rates) return;

    const isHelper = this.laborForm.get('laborCategory')?.value === LaborCategory.Helper;
    const useEmergencyRates = this.laborForm.get('rateType')?.value === RateType.Overtime;
    const laborRate = this.resolveVendorLaborRate(isHelper, useEmergencyRates, rates);

    if (laborRate > 0) {
      this.laborForm.patchValue({ laborRate }, { emitEvent: false });
    }
  }

  private resolveVendorLaborRate(
    isHelper: boolean,
    useEmergencyRates: boolean,
    rates: VendorTradeRateResponse | VendorRateResponse,
  ): number {
    if (isHelper) {
      return useEmergencyRates
        ? (rates.emergencyHelperRates ?? rates.helperRates ?? rates.emergencyHourlyRate ?? rates.hourlyRate ?? 0)
        : (rates.helperRates ?? rates.hourlyRate ?? 0);
    }

    return useEmergencyRates
      ? (rates.emergencyHourlyRate ?? rates.hourlyRate ?? 0)
      : (rates.hourlyRate ?? 0);
  }

  private resetLaborFormToDefaults(): void {
    const init = this.initData();
    const isEmergency = init ? this.isEmergencyJob(init) : false;

    this.laborForm.reset({
      costIncurred: CostIncurredType.Proposed,
      laborCategory: LaborCategory.MainTech,
      rateType: isEmergency ? RateType.Overtime : RateType.Standard,
      techCount: 1,
      laborHours: 0,
      laborRate: 0,
      workDescription: '',
    });
    this.applyVendorLaborRateToForm();
  }

  private isEmergencyJob(init: OnSiteEstimateInitResponse): boolean {
    const emergencyKey = OnSiteEstimateModalComponent.EMERGENCY_JOB_TYPE_KEY;

    if (this.normalizeJobTypeKey(this.jobTypeKey()) === emergencyKey) return true;
    if (this.normalizeJobTypeKey(init.jobTypeKey) === emergencyKey) return true;
    // Initialize may return the GUID in jobType instead of the display name
    if (this.normalizeJobTypeKey(init.jobType) === emergencyKey) return true;

    return init.jobType?.toLowerCase().includes('emergency') ?? false;
  }

  private normalizeJobTypeKey(key: string | null | undefined): string {
    return (key ?? '').trim().toLowerCase();
  }

  // ──────────────────────────────────────────────────────────────
  //  Navigation
  // ──────────────────────────────────────────────────────────────

  goToStep(step: number): void {
    if (step >= 1 && step <= this.maxStep) {
      this.currentStep.set(step);
      this.errorMessage.set('');
      this.successMessage.set('');
      this.guidanceMessage.set('');
      this.showValidationHints.set(false);
    }
  }

  goNext(): void {
    this.goToStep(this.currentStep() + 1);
  }

  goBack(): void {
    this.goToStep(this.currentStep() - 1);
  }

  getStepHint(): string {
    switch (this.currentStep()) {
      case 1:
        return 'Trip charge is typically a flat or emergency fee for the service visit.';
      case 2:
        return 'Add at least one material to continue, or use Skip if none apply.';
      case 3:
        return 'Add at least one labor entry to continue, or use Skip if none apply.';
      case 4:
        return 'Uploads are optional — you can skip this step and add files later.';
      default:
        return '';
    }
  }

  isFieldInvalid(form: FormGroup, fieldName: string): boolean {
    const control = form.get(fieldName);
    return !!control && control.invalid && (control.touched || this.showValidationHints());
  }

  getFooterPrimaryLabel(): string {
    if (this.isSubmitting()) {
      switch (this.currentStep()) {
        case 1:
          return 'Saving…';
        case 4:
          return 'Saving…';
        default:
          return 'Processing…';
      }
    }
    switch (this.currentStep()) {
      case 1:
        return 'Save & continue';
      case 2:
      case 3:
        return 'Continue';
      case 4:
        return 'Continue to review';
      default:
        return 'Continue';
    }
  }

  private markFormTouched(form: FormGroup): void {
    form.markAllAsTouched();
    this.showValidationHints.set(true);
  }

  // ──────────────────────────────────────────────────────────────
  //  Step 1: Trip Charge
  // ──────────────────────────────────────────────────────────────

  /**
   * Populate trip charge form from saved line item when navigating back
   */
  private populateTripChargeForm(): void {
    const tripCharge = this.tripCharge();
    if (tripCharge) {
      this.tripForm.patchValue({
        costIncurred: tripCharge.costIncurred,
        rateType: tripCharge.rateType,
        amount: tripCharge.amount,
      });
    }
  }

  saveTripCharge(): void {
    if (this.tripForm.invalid) {
      this.markFormTouched(this.tripForm);
      this.errorMessage.set('Please fill in all required fields');
      return;
    }

    const formValue = this.tripForm.value;
    const tripItem: TripChargeLineItem = {
      chargeType: ChargeType.TripCharge,
      costIncurred: formValue.costIncurred,
      rateType: formValue.rateType,
      amount: formValue.amount,
      description: `${formValue.rateType === RateType.Flat ? 'Flat' : 'Emergency'} Trip Charge`,
    };

    // If editing an existing trip charge, preserve its detailKey
    const existingTrip = this.tripCharge();
    if (existingTrip && (existingTrip as any).detailKey) {
      (tripItem as any).detailKey = (existingTrip as any).detailKey;
    }

    // Remove any existing trip charge and add the new one
    const items = this.lineItems().filter(
      (item) => item.chargeType !== ChargeType.TripCharge
    );
    this.lineItems.set([...items, tripItem]);
    this.successMessage.set('Trip charge saved');
    this.goNext();
  }

  skipTripCharge(): void {
    // Remove any existing trip charge
    const items = this.lineItems().filter(
      (item) => item.chargeType !== ChargeType.TripCharge
    );
    this.lineItems.set(items);
    this.goNext();
  }

  // ──────────────────────────────────────────────────────────────
  //  Step 2: Materials
  // ──────────────────────────────────────────────────────────────

  addMaterial(): void {
    if (this.materialForm.invalid) {
      this.markFormTouched(this.materialForm);
      this.errorMessage.set('Please fill in all required fields');
      return;
    }

    const formValue = this.materialForm.value;
    const editIndex = this.editingMaterialIndex();

    if (editIndex !== null) {
      // Update existing material
      const mats = this.materials();
      if (editIndex >= 0 && editIndex < mats.length) {
        const existingMaterial = mats[editIndex];
        const updatedMaterial: MaterialLineItem = {
          chargeType: ChargeType.Material,
          costIncurred: formValue.costIncurred,
          itemName: formValue.description || 'Material',
          description: formValue.description,
          quantity: formValue.quantity,
          rate: formValue.rate,
        };

        // Preserve detailKey if it exists
        if ((existingMaterial as any).detailKey) {
          (updatedMaterial as any).detailKey = (existingMaterial as any).detailKey;
        }

        // Replace the material at the specific index
        this.lineItems.update((items) => {
          const newItems = [...items];
          const actualIndex = newItems.indexOf(existingMaterial);
          if (actualIndex !== -1) {
            newItems[actualIndex] = updatedMaterial;
          }
          return newItems;
        });

        this.successMessage.set('Material updated');
        this.editingMaterialIndex.set(null);
      }
    } else {
      // Add new material
      const materialItem: MaterialLineItem = {
        chargeType: ChargeType.Material,
        costIncurred: formValue.costIncurred,
        itemName: formValue.description || 'Material',
        description: formValue.description,
        quantity: formValue.quantity,
        rate: formValue.rate,
      };

      this.lineItems.update((items) => [...items, materialItem]);
      this.successMessage.set('Material added');
    }

    this.materialForm.reset({
      costIncurred: CostIncurredType.Proposed,
      description: '',
      quantity: 1,
      rate: 0,
    });
  }

  editMaterial(index: number): void {
    const mats = this.materials();
    if (index >= 0 && index < mats.length) {
      const material = mats[index];
      
      // Populate the form with existing material data
      this.materialForm.patchValue({
        costIncurred: material.costIncurred,
        description: material.description || '',
        quantity: material.quantity,
        rate: material.rate,
      });

      // Set the editing index
      this.editingMaterialIndex.set(index);
      
      // Scroll to the form (optional, for better UX)
      setTimeout(() => {
        const formElement = document.querySelector('.material-form');
        if (formElement) {
          formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }

  cancelEditMaterial(): void {
    this.editingMaterialIndex.set(null);
    this.materialForm.reset({
      costIncurred: CostIncurredType.Proposed,
      description: '',
      quantity: 1,
      rate: 0,
    });
  }

  removeMaterial(index: number): void {
    const mats = this.materials();
    if (index >= 0 && index < mats.length) {
      const itemToRemove = mats[index];
      this.lineItems.update((items) =>
        items.filter((item) => item !== itemToRemove)
      );
      
      // Clear editing state if we're removing the item being edited
      if (this.editingMaterialIndex() === index) {
        this.editingMaterialIndex.set(null);
        this.materialForm.reset({
          costIncurred: CostIncurredType.Proposed,
          description: '',
          quantity: 1,
          rate: 0,
        });
      }
    }
  }

  saveMaterials(): void {
    this.goNext();
  }

  skipMaterials(): void {
    // Remove all materials
    this.lineItems.update((items) =>
      items.filter((item) => item.chargeType !== ChargeType.Material)
    );
    this.goNext();
  }

  // ──────────────────────────────────────────────────────────────
  //  Step 3: Labor
  // ──────────────────────────────────────────────────────────────

  addLabor(): void {
    if (this.laborForm.invalid) {
      this.markFormTouched(this.laborForm);
      this.errorMessage.set('Please fill in all required fields');
      return;
    }

    const formValue = this.laborForm.value;
    const editIndex = this.editingLaborIndex();

    if (editIndex !== null) {
      // Update existing labor
      const labs = this.laborItems();
      if (editIndex >= 0 && editIndex < labs.length) {
        const existingLabor = labs[editIndex];
        const updatedLabor: LaborLineItem = {
          chargeType: ChargeType.Labor,
          costIncurred: formValue.costIncurred,
          laborCategory: formValue.laborCategory,
          rateType: formValue.rateType,
          techCount: formValue.techCount,
          laborHours: formValue.laborHours,
          laborRate: formValue.laborRate,
          workDescription: formValue.workDescription,
        };

        // Preserve detailKey if it exists
        if ((existingLabor as any).detailKey) {
          (updatedLabor as any).detailKey = (existingLabor as any).detailKey;
        }

        // Replace the labor at the specific index
        this.lineItems.update((items) => {
          const newItems = [...items];
          const actualIndex = newItems.indexOf(existingLabor);
          if (actualIndex !== -1) {
            newItems[actualIndex] = updatedLabor;
          }
          return newItems;
        });

        this.successMessage.set('Labor updated');
        this.editingLaborIndex.set(null);
      }
    } else {
      // Add new labor
      const laborItem: LaborLineItem = {
        chargeType: ChargeType.Labor,
        costIncurred: formValue.costIncurred,
        laborCategory: formValue.laborCategory,
        rateType: formValue.rateType,
        techCount: formValue.techCount,
        laborHours: formValue.laborHours,
        laborRate: formValue.laborRate,
        workDescription: formValue.workDescription,
      };

      this.lineItems.update((items) => [...items, laborItem]);
      this.successMessage.set('Labor added');
    }

    this.resetLaborFormToDefaults();
  }

  editLabor(index: number): void {
    const labs = this.laborItems();
    if (index >= 0 && index < labs.length) {
      const labor = labs[index];
      
      // Populate the form with existing labor data (preserve saved rate on load)
      this.laborForm.patchValue({
        costIncurred: labor.costIncurred,
        laborCategory: labor.laborCategory,
        rateType: labor.rateType,
        techCount: labor.techCount,
        laborHours: labor.laborHours,
        laborRate: labor.laborRate,
        workDescription: labor.workDescription || '',
      }, { emitEvent: false });

      // Set the editing index
      this.editingLaborIndex.set(index);
      
      // Scroll to the form (optional, for better UX)
      setTimeout(() => {
        const formElement = document.querySelector('.estimate-form');
        if (formElement) {
          formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }

  cancelEditLabor(): void {
    this.editingLaborIndex.set(null);
    this.resetLaborFormToDefaults();
  }

  removeLabor(index: number): void {
    const labs = this.laborItems();
    if (index >= 0 && index < labs.length) {
      const itemToRemove = labs[index];
      this.lineItems.update((items) =>
        items.filter((item) => item !== itemToRemove)
      );
      
      // Clear editing state if we're removing the item being edited
      if (this.editingLaborIndex() === index) {
        this.editingLaborIndex.set(null);
        this.resetLaborFormToDefaults();
      }
    }
  }

  saveLabor(): void {
    this.goNext();
  }

  skipLabor(): void {
    // Remove all labor
    this.lineItems.update((items) =>
      items.filter((item) => item.chargeType !== ChargeType.Labor)
    );
    this.goNext();
  }

  // ──────────────────────────────────────────────────────────────
  //  Step 4: File Uploads
  // ──────────────────────────────────────────────────────────────

  onFileSelected(event: Event, documentTypeKey: string): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const init = this.initData();
    if (!init) {
      this.errorMessage.set('Estimate not initialized');
      return;
    }

    const filesArray = Array.from(input.files);

    this.isSubmitting.set(true);

    this.assignVendorSvc
      .uploadOnSiteEstimateFiles(
        init.tempEstimateKey,
        documentTypeKey,
        filesArray,
        this.jobKey(),
        this.vendorKey()
      )
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            const count = res.data.filesUploaded || res.data.uploadedCount || 0;
            this.successMessage.set(`${count} file(s) uploaded successfully`);
            this.loadUploadedFiles();
          } else {
            console.error('uploadOnSiteEstimateFiles failed:', res.message);
            this.errorMessage.set(res.message || 'Upload failed');
          }
          this.isSubmitting.set(false);
        },
        error: (err) => {
          console.error('uploadOnSiteEstimateFiles error:', err);
          this.errorMessage.set('File upload failed');
          this.isSubmitting.set(false);
        },
      });
  }

  private loadUploadedFiles(): void {
    this.assignVendorSvc
      .getOnSiteEstimateFiles(this.jobKey(), this.vendorKey())
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            this.uploadedFiles.set(res.data);
          }
        },
      });
  }

  deleteFile(uploadKey: string): void {
    if (!confirm('Delete this file?')) return;

    this.isSubmitting.set(true);
    this.assignVendorSvc.deleteOnSiteEstimateFile(uploadKey).subscribe({
      next: (res) => {
        if (res.status) {
          this.successMessage.set('File deleted');
          this.loadUploadedFiles();
        } else {
          this.errorMessage.set(res.message || 'Delete failed');
        }
        this.isSubmitting.set(false);
      },
      error: () => {
        this.errorMessage.set('Delete failed');
        this.isSubmitting.set(false);
      },
    });
  }

  saveUploads(): void {
    this.goNext();
  }

  skipUploads(): void {
    this.goNext();
  }

  // ──────────────────────────────────────────────────────────────
  //  Step 5: Review & Submit
  // ──────────────────────────────────────────────────────────────

  submitForCustomerApproval(): void {
    if (this.estimateTotal() === 0) {
      this.errorMessage.set('Estimate total cannot be zero');
      return;
    }

    this.isSubmitting.set(true);

    // Check if we're in edit mode
    if (this.isEditMode()) {
      this.updateExistingEstimate(() => {
        // After update, proceed with customer approval flow
        const estimateKey = this.existingEstimateKey();
        if (!estimateKey) {
          this.errorMessage.set('Missing estimate key');
          this.isSubmitting.set(false);
          return;
        }
        this.proceedWithCustomerApproval(estimateKey);
      });
      return;
    }

    // Normal create mode
    const init = this.initData();
    if (!init) {
      this.errorMessage.set('Estimate not initialized');
      this.isSubmitting.set(false);
      return;
    }

    // First save the estimate
    const saveRequest = {
      tempEstimateKey: init.tempEstimateKey,
      jobKey: this.jobKey(),
      vendorKey: this.vendorKey(),
      lineItems: this.lineItems(),
    };
    
    this.assignVendorSvc
      .saveOnSiteEstimate(saveRequest)
      .subscribe({
        next: (saveRes) => {
          if (saveRes.status && saveRes.data) {
            // Backend returns 'invoiceKey' (also used as estimateKey)
            const estimateKey = saveRes.data.invoiceKey || saveRes.data.estimateKey;
            
            if (!estimateKey) {
              this.errorMessage.set('Failed to get estimate key from save response');
              this.isSubmitting.set(false);
              return;
            }
            
            this.savedEstimateKey.set(estimateKey);
            this.proceedWithCustomerApproval(estimateKey);
          } else {
            this.errorMessage.set(saveRes.message || 'Failed to save estimate');
            this.isSubmitting.set(false);
          }
        },
        error: () => {
          this.errorMessage.set('Failed to save estimate');
          this.isSubmitting.set(false);
        },
      });
  }

  /**
   * Proceed with customer approval after estimate is saved/updated
   */
  private proceedWithCustomerApproval(estimateKey: string): void {
    // Submit for customer approval
    const submitRequest = {
      estimateKey: estimateKey,
    };
    
    this.assignVendorSvc
      .submitOnSiteEstimateForCustomerApproval(submitRequest)
      .subscribe({
        next: (submitRes) => {
          
          if (submitRes.status && submitRes.data) {
            // Step 2: Automatically create customer estimate
            const createCustomerRequest = {
              vendorEstimateKey: estimateKey,
            };
            
            this.assignVendorSvc
              .createCustomerEstimate(createCustomerRequest)
              .subscribe({
                next: (createRes) => {
                  if (createRes.status && createRes.data) {
                            
                            // Store customer estimate response for comparison grid
                            this.customerEstimateResponse.set(createRes.data);
                            // Seed the admin fee's detail key since the backend inserts the Admin Fee
                            // row up front (when the customer has AdminMarkup configured) - without this,
                            // the first edit-triggered save would treat it as brand new and insert a
                            // duplicate row instead of updating the one that already exists.
                            this.adminMarkupLineItemKey.set(createRes.data.adminMarkupLineItemKey || null);
                            
                            this.isSubmitting.set(false);
                            this.successMessage.set(
                              `✅ SUCCESS! Customer estimate created ($${createRes.data.customerTotal.toFixed(2)}). ` +
                              `Scroll down to see comparison grid and edit if needed.`
                            );
                            
                          } else {
                            console.warn('createCustomerEstimate returned false status:', createRes.message);

                            // Still show success for vendor estimate submission
                            this.isSubmitting.set(false);
                            this.errorMessage.set(
                              '⚠️ Vendor estimate submitted but customer estimate creation FAILED. ' +
                              'Check console for details.'
                            );

                          }
                        },
                        error: (createErr) => {
                          console.error('createCustomerEstimate error:', createErr);

                          // Don't fail the whole flow - vendor estimate was submitted successfully
                          this.isSubmitting.set(false);
                          this.errorMessage.set(
                            '❌ Vendor estimate submitted but customer estimate auto-create FAILED. ' +
                            'Check console for error.'
                          );
                          
                },
              });
          } else {
            this.errorMessage.set(submitRes.message || 'Submit failed');
            this.isSubmitting.set(false);
          }
        },
        error: (err) => {
          this.errorMessage.set(err.message || 'Submit failed');
          this.isSubmitting.set(false);
        },
      });
  }

  /**
   * Update an existing estimate (for edit mode)
   */
  private updateExistingEstimate(onSuccess: () => void): void {
    const estimateKey = this.existingEstimateKey();
    if (!estimateKey) {
      this.errorMessage.set('Missing estimate key for update');
      this.isSubmitting.set(false);
      return;
    }

    // Convert frontend line items to update format
    const updateLineItems = this.lineItems().map((item) => {
      const baseItem: any = {
        detailKey: (item as any).detailKey || '00000000-0000-0000-0000-000000000000', // Guid.Empty for new items
        costIncurred: item.costIncurred === CostIncurredType.Incurred ? 0 : 1,
        description: item.description || '',
        displayLevel: (item.displayLevel || 1).toString(),
      };

      if (item.chargeType === ChargeType.TripCharge) {
        const trip = item as TripChargeLineItem;
        return {
          ...baseItem,
          chargeTypeKey: trip.rateType === RateType.Emergency ? 'Emergency Trip Charge' : 'Flat Trip Charge',
          itemName: trip.rateType === RateType.Emergency ? 'Emergency Trip Charge' : 'Flat Trip Charge',
          rate: trip.amount,
          quantity: 1.0,
          isLabor: false,
        };
      } else if (item.chargeType === ChargeType.Material) {
        const mat = item as MaterialLineItem;
        return {
          ...baseItem,
          chargeTypeKey: 'MATERIALS',
          itemName: mat.itemName || 'MATERIALS',
          rate: mat.rate,
          quantity: mat.quantity,
          isLabor: false,
        };
      } else if (item.chargeType === ChargeType.Labor) {
        const lab = item as LaborLineItem;
        const isOvertime = lab.rateType === RateType.Overtime;
        return {
          ...baseItem,
          chargeTypeKey: isOvertime ? 'Overtime Hourly Rate' : 'Standard Hourly Rate',
          itemName: isOvertime ? 'Overtime Hourly Rate' : 'Standard Hourly Rate',
          rate: lab.laborRate,
          quantity: 0, // Labor uses hours, not quantity
          laborHours: lab.laborHours,
          techCount: lab.techCount,
          isLabor: true,
        };
      }

      return baseItem;
    });

    const updateRequest = {
      vendorEstimateKey: estimateKey,
      jobKey: this.jobKey(),
      vendorKey: this.vendorKey(),
      lineItems: updateLineItems,
    };

    this.assignVendorSvc
      .updateOnSiteEstimate(updateRequest)
      .subscribe({
        next: (updateRes) => {
          if (updateRes.status && updateRes.data) {
            this.savedEstimateKey.set(updateRes.data.invoiceKey);
            onSuccess();
          } else {
            this.errorMessage.set(updateRes.message || 'Failed to update estimate');
            this.isSubmitting.set(false);
          }
        },
        error: (err) => {
          console.error('updateOnSiteEstimate error:', err);
          this.errorMessage.set('Failed to update estimate');
          this.isSubmitting.set(false);
        },
      });
  }

  approveVendorEstimateDirectly(): void {
    if (this.estimateTotal() === 0) {
      this.errorMessage.set('Estimate total cannot be zero');
      return;
    }

    this.isSubmitting.set(true);

    // Check if we're in edit mode
    if (this.isEditMode()) {
      this.updateExistingEstimate(() => {
        // After update, proceed with approval
        const estimateKey = this.existingEstimateKey();
        if (!estimateKey) {
          this.errorMessage.set('Missing estimate key');
          this.isSubmitting.set(false);
          return;
        }
        this.proceedWithDirectApproval(estimateKey);
      });
      return;
    }

    // Normal create mode
    const init = this.initData();
    if (!init) {
      this.errorMessage.set('Estimate not initialized');
      this.isSubmitting.set(false);
      return;
    }

    // First save the estimate
    this.assignVendorSvc
      .saveOnSiteEstimate({
        tempEstimateKey: init.tempEstimateKey,
        jobKey: this.jobKey(),
        vendorKey: this.vendorKey(),
        lineItems: this.lineItems(),
      })
      .subscribe({
        next: (saveRes) => {
          if (saveRes.status && saveRes.data) {
            // Backend returns 'invoiceKey' (also used as estimateKey)
            const estimateKey = saveRes.data.invoiceKey || saveRes.data.estimateKey;
            
            if (!estimateKey) {
              this.errorMessage.set('Failed to get estimate key from save response');
              this.isSubmitting.set(false);
              return;
            }
            
            this.savedEstimateKey.set(estimateKey);
            this.proceedWithDirectApproval(estimateKey);
          } else {
            this.errorMessage.set(saveRes.message || 'Save failed');
            this.isSubmitting.set(false);
          }
        },
        error: () => {
          this.errorMessage.set('Save failed');
          this.isSubmitting.set(false);
        },
      });
  }

  /**
   * Proceed with direct vendor approval after estimate is saved/updated
   */
  private proceedWithDirectApproval(estimateKey: string): void {
    // Customer-DNE guardrail (matches the legacy admin portal): hard-block at/above 100% of the
    // customer DNE; soft-warn (still allow) between 80% and 100%.
    this.assignVendorSvc
      .getCustomerDneCalculation(this.jobKey())
      .subscribe({
        next: (dneRes) => {
                  if (dneRes.status && dneRes.data) {
                    const customerDne = dneRes.data.customerDne;
                    const total = this.estimateTotal();

                    if (customerDne > 0 && total >= customerDne) {
                      // Hard block — cannot be overridden. Backend enforces the same block.
                      this.errorMessage.set(
                        `Approval blocked: the estimate total ($${total.toFixed(
                          2
                        )}) meets or exceeds the Customer DNE ($${customerDne.toFixed(
                          2
                        )}). Raise the Customer DNE first if the customer has approved a higher amount.`,
                      );
                      this.isSubmitting.set(false);
                      return;
                    }

                    if (customerDne > 0 && total > customerDne * 0.8) {
                      // Soft warning (80%–100%): admin may proceed after acknowledging.
                      if (
                        !confirm(
                          `This estimate ($${total.toFixed(
                            2,
                          )}) exceeds 80% of the Customer DNE ($${customerDne.toFixed(
                            2,
                          )}). Only proceed if you have approval from the customer.\n\nContinue with approval?`,
                        )
                      ) {
                        this.isSubmitting.set(false);
                        return;
                      }
                    }

                    // Proceed with approval (within DNE, or 80–100% acknowledged).
                    this.assignVendorSvc
                      .approveOnSiteVendorEstimate({
                        estimateKey: estimateKey,
                        bypassDneCheck: false,
                      })
                      .subscribe({
                        next: (approveRes) => {
                          if (approveRes.status && approveRes.data) {
                            if (approveRes.data.success) {
                              // Check if additional approval workflow is required
                              if (approveRes.data.requiresAdditionalApproval) {
                                // Need to call save-vendor-approval-data to get workOrderKey
                                this.assignVendorSvc.saveVendorApprovalData({
                                  jobKey: approveRes.data.jobKey || this.jobKey(),
                                  vendorKey: approveRes.data.vendorKey || this.vendorKey(),
                                  estimateKey: approveRes.data.estimateKey || estimateKey,
                                  fifthApprovalOption: 1, // Default to option 1 (Set Return ETA)
                                  approvalText: 'Approved. Please proceed with the work.',
                                }).subscribe({
                                  next: (saveRes) => {
                                    if (saveRes.status && saveRes.data && saveRes.data.workOrderKey) {
                                      const workOrderKey = saveRes.data.workOrderKey;
                                      const invoiceType = saveRes.data.invoiceType || 9;
                                      const jobStatusTrigger = invoiceType === 9 ? 15 : 0;

                                      const legacyUrl = `${environment.legacyAdminBaseUrl}/JobWorkOrder/EmailWorkOrderToVendor/${workOrderKey}?id1=${invoiceType}&id3=${jobStatusTrigger}`;

                                      this.successMessage.set('Estimate approved. Redirecting to email page...');
                                      this.isSubmitting.set(false);

                                      // Close modal and redirect
                                      setTimeout(() => {
                                        this.close();
                                        window.location.href = legacyUrl;
                                      }, 1000);
                                    } else {
                                      console.error('saveVendorApprovalData missing workOrderKey:', saveRes);
                                      this.errorMessage.set('Failed to get work order key. Please try again.');
                                      this.isSubmitting.set(false);
                                    }
                                  },
                                  error: (err) => {
                                    console.error('saveVendorApprovalData error:', err);
                                    this.errorMessage.set('Failed to save approval data. Please try again.');
                                    this.isSubmitting.set(false);
                                  },
                                });
                              } else {
                                // Standard approval without additional workflow
                                this.successMessage.set('Vendor estimate approved');
                                this.isSubmitting.set(false);
                                // Close modal after 2 seconds
                                setTimeout(() => {
                                  this.close();
                                  // Reload the page to refresh vendor cards
                                  window.location.reload();
                                }, 2000);
                              }
                            } else {
                              this.errorMessage.set(
                                approveRes.data.message || 'Approval failed'
                              );
                              this.isSubmitting.set(false);
                            }
                          } else {
                            this.errorMessage.set(approveRes.message || 'Approval failed');
                            this.isSubmitting.set(false);
                          }
                        },
                        error: () => {
                          this.errorMessage.set('Approval failed');
                          this.isSubmitting.set(false);
                        },
                      });
                  } else {
                    this.errorMessage.set('Could not verify DNE threshold');
                    this.isSubmitting.set(false);
                  }
                },
              });
  }

  // ──────────────────────────────────────────────────────────────
  //  Customer Estimate Editing (Click-to-Edit)
  // ──────────────────────────────────────────────────────────────

  isEditingCell(rowIndex: number, field: string): boolean {
    const editing = this.editingCell();
    return editing !== null && editing.rowIndex === rowIndex && editing.field === field;
  }

  startEditCell(rowIndex: number, field: string): void {
    this.editingCell.set({ rowIndex, field });
  }

  updateCustomerQty(index: number, newQty: number): void {
    const response = this.customerEstimateResponse();
    if (response && response.lineItems[index]) {
      const item = response.lineItems[index];
      item.customerQty = Number(newQty);
      item.customerAmount = item.customerQty * item.customerRate;
      item.calculatedMarkupPercent = item.vendorAmount > 0
        ? ((item.customerAmount - item.vendorAmount) / item.vendorAmount) * 100
        : 0;
      
      this.customerEstimateResponse.set({ ...response });
      this.hasUnsavedChanges.set(true);
    }
  }

  updateCustomerRate(index: number, newRate: number): void {
    const response = this.customerEstimateResponse();
    if (response && response.lineItems[index]) {
      const item = response.lineItems[index];
      item.customerRate = Number(newRate);
      item.customerAmount = item.customerQty * item.customerRate;
      item.calculatedMarkupPercent = item.vendorAmount > 0
        ? ((item.customerAmount - item.vendorAmount) / item.vendorAmount) * 100
        : 0;
      
      this.customerEstimateResponse.set({ ...response });
      this.hasUnsavedChanges.set(true);
    }
  }

  updateMarkupPercent(index: number, newMarkupPercent: number): void {
    const response = this.customerEstimateResponse();
    if (response && response.lineItems[index]) {
      const item = response.lineItems[index];

      // Markup % isn't meaningful for custom charges without a vendor-side cost baseline
      if (item.isCustomLineItem || !item.vendorAmount) return;

      const markup = Number(newMarkupPercent);
      
      // Calculate target customer amount based on desired markup
      const targetCustomerAmount = item.vendorAmount * (1 + markup / 100);
      
      // Adjust the customer rate to achieve the target amount (keep qty the same)
      item.customerRate = targetCustomerAmount / item.customerQty;
      item.customerAmount = targetCustomerAmount;
      item.calculatedMarkupPercent = markup;
      
      this.customerEstimateResponse.set({ ...response });
      this.hasUnsavedChanges.set(true);
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Custom Line Items (Add-on Charges)
  // ──────────────────────────────────────────────────────────────

  /**
   * Adds a new, blank ad-hoc charge to the customer estimate comparison grid.
   * Has no vendor-side counterpart (vendor fields are zeroed) since it did not
   * originate from the vendor's estimate.
   */
  addCustomLineItem(): void {
    const response = this.customerEstimateResponse();
    if (!response) return;

    const newItem: CustomerEstimateLineItem = {
      chargeType: '',
      chargeTypeKey: '',
      description: '',
      vendorRate: 0,
      vendorQty: 0,
      vendorAmount: 0,
      customerRate: 0,
      customerQty: 1,
      customerAmount: 0,
      calculatedMarkupPercent: 0,
      wasHourAdjusted: false,
      lineType: 'custom',
      costIncurred: CostIncurredType.Proposed,
      isCustomLineItem: true,
    };

    const updatedLineItems = [...response.lineItems, newItem];
    this.customerEstimateResponse.set({ ...response, lineItems: updatedLineItems });
    this.hasUnsavedChanges.set(true);

    // Immediately drop the new row into edit mode so the admin picks a charge type right away
    const newIndex = updatedLineItems.length - 1;
    setTimeout(() => this.startEditCell(newIndex, 'chargeType'), 0);
  }

  /**
   * Removes a custom (admin-added) line item. Only custom charges can be removed this way -
   * real vendor-sourced line items must stay in sync with the vendor estimate.
   */
  removeCustomLineItem(index: number): void {
    const response = this.customerEstimateResponse();
    if (!response || !response.lineItems[index]) return;

    const item = response.lineItems[index];
    if (!item.isCustomLineItem) return;

    if (!confirm('Remove this custom charge from the customer estimate?')) return;

    const wasPersisted = !!item.customerEstimateDetailKey;
    const updatedLineItems = response.lineItems.filter((_: unknown, i: number) => i !== index);
    this.customerEstimateResponse.set({ ...response, lineItems: updatedLineItems });

    if (wasPersisted) {
      // NOTE: the update-customer-estimate endpoint currently has no delete semantics,
      // so removing an already-saved custom charge here only updates the UI/local total.
      // Backend support is required to actually delete the row - see saveCustomerEstimate().
      this.hasUnsavedChanges.set(true);
      this.autoSaveCustomerEstimate();
    }
  }

  updateCustomLineDescription(index: number, value: string): void {
    const response = this.customerEstimateResponse();
    if (response && response.lineItems[index]) {
      response.lineItems[index].description = value;
      this.customerEstimateResponse.set({ ...response });
      this.hasUnsavedChanges.set(true);
    }
  }

  /**
   * Marks a custom line item as Incurred (0 - already charged/completed) or
   * Proposed (1 - work/cost not yet incurred), matching the CostIncurredType
   * convention used everywhere else in this component (see vendor Trip/Material/
   * Labor forms' "Cost Status" radio buttons).
   */
  updateCustomLineCostIncurred(index: number, value: string | number): void {
    const response = this.customerEstimateResponse();
    if (response && response.lineItems[index]) {
      response.lineItems[index].costIncurred = Number(value);
      this.customerEstimateResponse.set({ ...response });
      this.hasUnsavedChanges.set(true);
    }
  }

  /**
   * Applies a selected charge type (from the fixed CUSTOM_CHARGE_TYPE_OPTIONS list) to a
   * custom line item, updating its display label, lineType, and tech count accordingly.
   */
  updateCustomLineChargeType(index: number, optionKey: string): void {
    const response = this.customerEstimateResponse();
    const option = this.customChargeTypeOptions.find((o) => o.key === optionKey);
    if (response && response.lineItems[index] && option) {
      const item = response.lineItems[index];
      item.chargeTypeKey = option.key;
      item.chargeType = option.label;
      item.lineType = option.lineType;
      item.techCount = option.techCount;
      this.customerEstimateResponse.set({ ...response });
      this.hasUnsavedChanges.set(true);
    }
  }

  onCellBlur(rowIndex: number, field: string): void {
    // Save changes when user clicks out of the cell
    this.editingCell.set(null);
    
    if (this.hasUnsavedChanges()) {
      this.autoSaveCustomerEstimate();
    }
  }

  getCustomerTotal(): number {
    const response = this.customerEstimateResponse();
    if (!response || !response.lineItems) return 0;
    return response.lineItems.reduce((sum: number, item: any) => sum + (item.customerAmount || 0), 0);
  }

  /**
   * Calculate the admin markup amount based on customer subtotal.
   * Admin markup is applied to the subtotal as a separate fee.
   */
  getAdminMarkupAmount(): number {
    const markup = this.customerMarkup();
    if (!markup || !markup.adminMarkupPercent) return 0;
    
    const subtotal = this.getCustomerTotal();
    return subtotal * (markup.adminMarkupPercent / 100);
  }

  /**
   * Get the admin markup percentage from customer profile.
   */
  getAdminMarkupPercent(): number {
    const markup = this.customerMarkup();
    return markup?.adminMarkupPercent || 0;
  }

  /**
   * Calculate the final customer total including admin markup.
   */
  getCustomerTotalWithAdminMarkup(): number {
    return this.getCustomerTotal() + this.getAdminMarkupAmount();
  }

  /**
   * Builds the line-item payload for PUT /update-customer-estimate, including a synthetic
   * "Admin Fee" entry (appended after the real line items) whenever the customer has an
   * admin markup % configured and the current subtotal produces a non-zero fee. The admin
   * fee amount is derived from the *current* subtotal, so any time a line item is added,
   * removed, or edited (changing the subtotal), the admin fee sent here is recalculated too -
   * keeping it in sync instead of only ever reflecting the subtotal at estimate-creation time.
   */
  private buildCustomerEstimateUpdateLineItems(response: any): {
    items: (UpdateCustomerEstimateLineItemRequest & { tempIndex: number })[];
    adminMarkupTempIndex: number | null;
  } {
    const items: (UpdateCustomerEstimateLineItemRequest & { tempIndex: number })[] = response.lineItems.map(
      (item: CustomerEstimateLineItem, index: number) => ({
        lineItemKey: item.customerEstimateDetailKey || '',
        // chargeType/chargeTypeKey/description/isNewLineItem are only relevant for admin-added
        // custom charges (isCustomLineItem) that don't have a customerEstimateDetailKey yet.
        chargeType: item.chargeType,
        chargeTypeKey: item.chargeTypeKey,
        description: item.description,
        // 0 = Incurred (already charged/completed), 1 = Proposed (not yet incurred) - see CostIncurredType
        costIncurred: item.costIncurred,
        customerQty: item.customerQty,
        customerRate: item.customerRate,
        customerAmount: item.customerAmount,
        isNewLineItem: !item.customerEstimateDetailKey,
        tempIndex: index,
      })
    );

    let adminMarkupTempIndex: number | null = null;
    const adminMarkupAmount = this.getAdminMarkupAmount();
    if (adminMarkupAmount > 0) {
      adminMarkupTempIndex = items.length;
      items.push({
        lineItemKey: this.adminMarkupLineItemKey() || '',
        chargeType: 'Admin Fee',
        chargeTypeKey: 'ADMIN_MARKUP',
        description: `Admin Markup (${this.getAdminMarkupPercent().toFixed(2)}%)`,
        customerQty: 1,
        customerRate: adminMarkupAmount,
        customerAmount: adminMarkupAmount,
        isNewLineItem: !this.adminMarkupLineItemKey(),
        tempIndex: adminMarkupTempIndex,
      });
    }

    return { items, adminMarkupTempIndex };
  }

  /**
   * Applies the backend-generated keys for any newly-inserted rows (regular custom charges
   * AND the synthetic admin fee row) back onto local state, matched by `tempIndex`. Without
   * this, those rows would still look "new" on the next save and get re-inserted as duplicates.
   */
  private applyCreatedLineItemKeys(
    response: any,
    createdLineItems: { tempIndex: number; lineItemKey: string }[] | undefined,
    adminMarkupTempIndex: number | null
  ): void {
    if (!createdLineItems?.length) return;

    for (const created of createdLineItems) {
      if (adminMarkupTempIndex !== null && created.tempIndex === adminMarkupTempIndex) {
        this.adminMarkupLineItemKey.set(created.lineItemKey);
        continue;
      }
      const targetItem = response.lineItems[created.tempIndex];
      if (targetItem) {
        targetItem.customerEstimateDetailKey = created.lineItemKey;
      }
    }
  }

  private autoSaveCustomerEstimate(): void {
    const customerEstimateKey = this.customerEstimateResponse()?.customerEstimateKey;
    if (!customerEstimateKey) return;

    const response = this.customerEstimateResponse();
    const { items: lineItems, adminMarkupTempIndex } = this.buildCustomerEstimateUpdateLineItems(response);
    const updateRequest = { customerEstimateKey, lineItems };

    this.isSavingChanges.set(true);
    this.hasUnsavedChanges.set(false); // Clear unsaved flag immediately when save starts

    this.assignVendorSvc.updateCustomerEstimate(updateRequest).subscribe({
      next: (updateRes) => {
        this.isSavingChanges.set(false);
        if (updateRes.status) {
          this.applyCreatedLineItemKeys(response, updateRes.data?.createdLineItems, adminMarkupTempIndex);
          // Update the customer total
          response.customerTotal = this.getCustomerTotal();
          this.customerEstimateResponse.set({ ...response });
        } else {
          // Save failed, restore unsaved changes flag
          this.hasUnsavedChanges.set(true);
          this.errorMessage.set('Failed to save changes');
        }
      },
      error: (err) => {
        console.error('updateCustomerEstimate auto-save error:', err);
        this.isSavingChanges.set(false);
        this.hasUnsavedChanges.set(true); // Restore unsaved flag on error
        this.errorMessage.set('Failed to save changes automatically');
      },
    });
  }

  /**
   * Save customer estimate without sending email.
   * Note: This only works AFTER customer estimate has been created (i.e., after "Submit for Customer Approval")
   * It updates an existing customer estimate with any inline edits made in the comparison grid.
   */
  saveCustomerEstimate(): void {
    const response = this.customerEstimateResponse();
    
    // Check if customer estimate exists
    if (!response || !response.customerEstimateKey) {
      this.errorMessage.set('Customer estimate has not been created yet. Please submit for customer approval first.');
      return;
    }
    
    if (!response.lineItems || response.lineItems.length === 0) {
      this.errorMessage.set('No line items to save');
      return;
    }

    const incompleteCustomItem = response.lineItems.find(
      (item: CustomerEstimateLineItem) =>
        item.isCustomLineItem && (!item.chargeTypeKey || !item.description?.trim() || !item.customerRate)
    );
    if (incompleteCustomItem) {
      this.errorMessage.set('Please select a charge type, description, and rate for all custom charges before saving.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const { items: lineItems, adminMarkupTempIndex } = this.buildCustomerEstimateUpdateLineItems(response);
    const updateRequest = {
      customerEstimateKey: response.customerEstimateKey,
      lineItems,
    };

    this.assignVendorSvc.updateCustomerEstimate(updateRequest).subscribe({
      next: (updateRes) => {
        this.isSubmitting.set(false);
        
        if (updateRes.status) {
          // Persist backend-generated keys for any newly-inserted rows (custom charges and/or
          // the admin fee row) - see autoSaveCustomerEstimate/buildCustomerEstimateUpdateLineItems.
          this.applyCreatedLineItemKeys(response, updateRes.data?.createdLineItems, adminMarkupTempIndex);
          // Update the customer total
          response.customerTotal = this.getCustomerTotal();
          this.customerEstimateResponse.set({ ...response });
          this.hasUnsavedChanges.set(false);
          this.successMessage.set('Customer estimate saved successfully!');
        } else {
          this.errorMessage.set(updateRes.message || 'Failed to save customer estimate');
        }
      },
      error: (err) => {
        console.error('updateCustomerEstimate error:', err);
        this.isSubmitting.set(false);
        this.errorMessage.set('Failed to save customer estimate');
      },
    });
  }

  /**
   * Opens the legacy admin page to send customer estimate email.
   * Uses the JobSalesInvoice.InvoiceKey (customer estimate key) to route to:
   * https://admin-dev.retailfixitapp.com/MgtJobSalesOrder/EmailEstimateToCustomer/{invoiceKey}
   */
  sendCustomerEstimateEmail(): void {
    const customerEstimateKey = this.customerEstimateResponse()?.customerEstimateKey;
    
    if (!customerEstimateKey) {
      this.errorMessage.set('No customer estimate found. Please create the estimate first.');
      return;
    }
    
    // Construct legacy admin URL for email estimate page
    // Uses JobSalesInvoice.InvoiceKey at the end of the URL
    const url = `${environment.legacyAdminBaseUrl}/MgtJobSalesOrder/EmailEstimateToCustomer/${customerEstimateKey}`;
    
    // Open in new tab
    window.open(url, '_blank', 'noopener');
    
    this.successMessage.set('Opening email estimate page in new tab...');
  }
}
