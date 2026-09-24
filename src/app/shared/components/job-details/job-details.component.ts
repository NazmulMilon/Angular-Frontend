import { Component, Input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { AccordionComponent } from '../accordion/accordion.component';
import { telHref } from '../../utils/phone-tel.util';

/**
 * Job Header Detail interface - core job information.
 * Reused across Assign Vendor, Notes & Activity, and other job-related features.
 */
export interface JobHeaderDetailData {
  po: string | null;
  jobStatusName: string | null;
  jobTypeName: string | null;
  customerDne: string | null;
  revCustomerDne: string | null;
  serviceRequest: string | null;
  serviceRequestPreview: string | null;

  customerName: string | null;
  customerContactName: string | null;
  customerContactTitle: string | null;
  customerContactEmail: string | null;
  customerContactPhone: string | null;
  customerContactPhoneExt: string | null;
  customerContactAltPhone: string | null;
  customerContactAltPhoneExt: string | null;
  hasCustomerContract: boolean;
  customerContractKey: string | null;
  customerNotice: string | null;

  locationName: string | null;
  locationAddress: string | null;
  locationAddress2: string | null;
  cityName: string | null;
  stateName: string | null;
  zipCode: string | null;
  locationPhone: string | null;
  locationContactName: string | null;
  locationContactTitle: string | null;
  locationContactEmail: string | null;
  locationContactPhone: string | null;
  locationContactPhoneExt: string | null;
  locationContactAltPhone: string | null;
  locationContactAltPhoneExt: string | null;

  assignedVendors: AssignedVendorDetailData[];
}

export interface AssignedVendorDetailData {
  vendorKey: string;
  vendorName: string | null;
  isDefault: boolean;
  jobStatusName: string | null;
  vendorDne: number | null;
  revVendorDne: number | null;
  scheduleDate: string | null;
  returnScheduleDate: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPhoneExt: string | null;
  contactAltPhone: string | null;
  contactAltPhoneExt: string | null;
}

export interface JobContextData {
  jobKey: string;
  jobName: string;
  tradeName: string | null;
  locationDetail: string | null;
  isPrimary: number;
  primaryVendorKey: string;
}

/**
 * Reusable Job Details component displayed within an accordion.
 * Shows comprehensive job information: core details, customer, location, and assigned vendors.
 * Used in Assign Vendor, Notes & Activity, and potentially other job-related features.
 */
@Component({
  selector: 'app-job-details',
  standalone: true,
  imports: [DecimalPipe, AccordionComponent],
  template: `
    <app-accordion
      heading="Job Details"
      [badge]="contextValue?.jobName ?? ''"
      [defaultOpen]="defaultOpen"
    >
      <div class="jd-panel">
        @if (contextValue; as ctx) {
          @if (headerDetailValue; as hd) {
            <!-- Row 1: Core job info -->
            <div class="jd-grid jd-grid--top-line">
              @if (hd.po) { <div class="jd-cell"><label>PO#</label><span>{{ hd.po }}</span></div> }
              <div class="jd-cell"><label>Job Name</label><span>{{ ctx.jobName }}</span></div>
              @if (hd.jobStatusName) { <div class="jd-cell"><label>Status</label><span>{{ hd.jobStatusName }}</span></div> }
              @if (hd.jobTypeName) { <div class="jd-cell"><label>Type</label><span>{{ hd.jobTypeName }}</span></div> }
              @if (hd.customerDne) { <div class="jd-cell"><label>Cust DNE</label><span>{{ hd.customerDne }}</span></div> }
              @if (hd.revCustomerDne) { <div class="jd-cell"><label>Rev Cust DNE</label><span>{{ hd.revCustomerDne }}</span></div> }
              <div class="jd-cell"><label>Trade</label><span>{{ ctx.tradeName }}</span></div>
            </div>

            <!-- Primary Vendor Indicator -->
            @if (ctx.isPrimary && ctx.primaryVendorKey) {
              <div class="jd-grid">
                <div class="jd-cell jd-cell--hl"><label>Primary Vendor</label><span>Assigned</span></div>
              </div>
            }

            <!-- Service Request -->
            @if (hd.serviceRequest) {
              <div class="jd-sr">
                <label>Service Request:</label>
                @if (showFullServiceRequest()) {
                  <span [innerHTML]="cleanedServiceRequest"></span>
                  <button class="jd-link" (click)="showFullServiceRequest.set(false)">Show less</button>
                } @else {
                  <span [innerHTML]="cleanedServiceRequestPreview"></span>
                  @if (hd.serviceRequest!.length > 100) {
                    <button class="jd-link" (click)="showFullServiceRequest.set(true)">Show more</button>
                  }
                }
              </div>
            }

            <!-- Customer Notice -->
            @if (hd.customerNotice) {
              <div class="jd-notice">
                <span class="jd-notice__icon">⚠</span>
                <span [innerHTML]="hd.customerNotice"></span>
              </div>
            }

            <!-- Customer Section -->
            <div class="jd-section-label">Customer</div>
            <div class="jd-grid">
              @if (hd.customerName) { <div class="jd-cell"><label>Name</label><span>{{ hd.customerName }}</span></div> }
              @if (hd.customerContactName) { <div class="jd-cell"><label>Contact</label><span>{{ hd.customerContactName }}</span></div> }
              @if (hd.customerContactTitle) { <div class="jd-cell"><label>Title</label><span>{{ hd.customerContactTitle }}</span></div> }
              @if (hd.customerContactEmail) { <div class="jd-cell"><label>Email</label><a [href]="'mailto:' + hd.customerContactEmail">{{ hd.customerContactEmail }}</a></div> }
              @if (hd.customerContactPhone) {
                <div class="jd-cell"><label>Phone</label>
                  <a [href]="telHref(hd.customerContactPhone)">{{ hd.customerContactPhone }}</a>
                  @if (hd.customerContactPhoneExt) { <small>x{{ hd.customerContactPhoneExt }}</small> }
                </div>
              }
              @if (hd.customerContactAltPhone) {
                <div class="jd-cell"><label>Alt Phone</label>
                  <a [href]="telHref(hd.customerContactAltPhone)">{{ hd.customerContactAltPhone }}</a>
                  @if (hd.customerContactAltPhoneExt) { <small>x{{ hd.customerContactAltPhoneExt }}</small> }
                </div>
              }
            </div>

            <!-- Location Section -->
            <div class="jd-section-label">Location</div>
            <div class="jd-grid">
              @if (hd.locationName) { <div class="jd-cell"><label>Name</label><span>{{ hd.locationName }}</span></div> }
              @if (hd.locationAddress) {
                <div class="jd-cell"><label>Address</label>
                  <span>{{ hd.locationAddress }}@if (hd.locationAddress2) {, {{ hd.locationAddress2 }}}</span>
                </div>
              }
              @if (hd.cityName || hd.stateName || hd.zipCode) {
                <div class="jd-cell"><label>City/St/Zip</label>
                  <span>{{ hd.cityName ?? '' }}@if (hd.stateName) {, {{ hd.stateName }}} {{ hd.zipCode ?? '' }}</span>
                </div>
              }
              @if (hd.locationPhone && isValidPhoneNumber(hd.locationPhone)) {
                <div class="jd-cell"><label>Contact Phone</label><a [href]="telHref(hd.locationPhone)">{{ hd.locationPhone }}</a></div>
              }
              @if (hd.locationContactName) { <div class="jd-cell"><label>Contact</label><span>{{ hd.locationContactName }}</span></div> }
              @if (hd.locationContactTitle) { <div class="jd-cell"><label>Title</label><span>{{ hd.locationContactTitle }}</span></div> }
              @if (hd.locationContactEmail) { <div class="jd-cell"><label>Email</label><a [href]="'mailto:' + hd.locationContactEmail">{{ hd.locationContactEmail }}</a></div> }
              @if (hd.locationContactPhone) {
                <div class="jd-cell"><label>Phone</label>
                  <a [href]="telHref(hd.locationContactPhone)">{{ hd.locationContactPhone }}</a>
                  @if (hd.locationContactPhoneExt) { <small>x{{ hd.locationContactPhoneExt }}</small> }
                </div>
              }
              @if (hd.locationContactAltPhone) {
                <div class="jd-cell"><label>Alt Phone</label>
                  <a [href]="telHref(hd.locationContactAltPhone)">{{ hd.locationContactAltPhone }}</a>
                  @if (hd.locationContactAltPhoneExt) { <small>x{{ hd.locationContactAltPhoneExt }}</small> }
                </div>
              }
            </div>

            <!-- Assigned Vendors Section -->
            @if (hd.assignedVendors.length) {
              <div class="jd-section-label">Assigned Vendors</div>
              @for (v of hd.assignedVendors; track v.vendorKey) {
                <div class="jd-vendor-card">
                  <div class="jd-vendor-header">
                    <strong>{{ v.vendorName ?? 'Unknown' }}</strong>
                    @if (v.isDefault) { <span class="jd-badge jd-badge--blue">Default</span> }
                    @if (v.jobStatusName) { <span class="jd-badge">{{ v.jobStatusName }}</span> }
                  </div>
                  <div class="jd-grid jd-grid--tight">
                    @if (v.vendorDne != null) { <div class="jd-cell"><label>DNE</label><span>{{ v.vendorDne | number:'1.2-2' }}</span></div> }
                    @if (v.revVendorDne != null) { <div class="jd-cell"><label>Rev DNE</label><span>{{ v.revVendorDne | number:'1.2-2' }}</span></div> }
                    @if (v.scheduleDate) { <div class="jd-cell"><label>ETA</label><span>{{ v.scheduleDate }}</span></div> }
                    @if (v.returnScheduleDate) { <div class="jd-cell"><label>Return ETA</label><span>{{ v.returnScheduleDate }}</span></div> }
                    @if (v.contactName) { <div class="jd-cell"><label>Contact</label><span>{{ v.contactName }}</span></div> }
                    @if (v.contactEmail) { <div class="jd-cell"><label>Email</label><a [href]="'mailto:' + v.contactEmail">{{ v.contactEmail }}</a></div> }
                    @if (v.contactPhone) {
                      <div class="jd-cell"><label>Phone</label>
                        <a [href]="telHref(v.contactPhone)">{{ v.contactPhone }}</a>
                        @if (v.contactPhoneExt) { <small>x{{ v.contactPhoneExt }}</small> }
                      </div>
                    }
                    @if (v.contactAltPhone) {
                      <div class="jd-cell"><label>Alt Phone</label>
                        <a [href]="telHref(v.contactAltPhone)">{{ v.contactAltPhone }}</a>
                        @if (v.contactAltPhoneExt) { <small>x{{ v.contactAltPhoneExt }}</small> }
                      </div>
                    }
                  </div>
                </div>
              }
            }
          } @else {
            <!-- Minimal context when header detail not loaded -->
            <div class="jd-grid jd-grid--top-line">
              <div class="jd-cell"><label>Job Name</label><span>{{ ctx.jobName }}</span></div>
              <div class="jd-cell"><label>Trade</label><span>{{ ctx.tradeName }}</span></div>
            </div>
          }
        } @else {
          <p class="jd-loading">Loading job details...</p>
        }
      </div>
    </app-accordion>
  `,
  styles: `
    .jd-panel {
      padding: 16px 20px;
    }

    .jd-loading {
      color: var(--text-muted, #94a3b8);
      font-style: italic;
      margin: 0;
    }

    .jd-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px 24px;
      margin-bottom: 12px;
    }

    .jd-grid--top-line {
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color, #e2e8f0);
      margin-bottom: 16px;
    }

    .jd-grid--tight {
      gap: 8px 16px;
      margin-bottom: 0;
    }

    .jd-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;

      label {
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--text-muted, #94a3b8);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      span, a {
        font-size: 0.9rem;
        color: var(--text-primary, #1e293b);
        word-break: break-word;
      }

      a {
        color: var(--primary-color, #3b82f6);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }

      small {
        color: var(--text-muted, #64748b);
        margin-left: 4px;
      }
    }

    .jd-cell--hl {
      span {
        color: var(--success-color, #22c55e);
        font-weight: 600;
      }
    }

    .jd-section-label {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-secondary, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 20px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-color, #e2e8f0);
    }

    .jd-sr {
      margin: 12px 0;
      padding: 12px 16px;
      background: var(--surface-alt, #f8fafc);
      border-radius: 8px;
      border-left: 3px solid var(--primary-color, #3b82f6);

      label {
        font-weight: 600;
        color: var(--text-secondary, #64748b);
        margin-right: 8px;
      }

      span {
        color: var(--text-primary, #1e293b);
        line-height: 1.5;
      }
    }

    .jd-link {
      background: none;
      border: none;
      color: var(--primary-color, #3b82f6);
      font-size: 0.85rem;
      cursor: pointer;
      padding: 0;
      margin-left: 8px;

      &:hover {
        text-decoration: underline;
      }
    }

    .jd-notice {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 16px;
      background: #fef3c7;
      border-radius: 8px;
      margin: 12px 0;
      border-left: 3px solid #f59e0b;

      .jd-notice__icon {
        flex-shrink: 0;
        font-size: 1.1rem;
      }

      span {
        color: #92400e;
        font-size: 0.9rem;
        line-height: 1.4;
      }
    }

    .jd-vendor-card {
      padding: 12px 16px;
      background: var(--surface-alt, #f8fafc);
      border-radius: 8px;
      margin-bottom: 10px;
      border: 1px solid var(--border-color, #e2e8f0);
    }

    .jd-vendor-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      flex-wrap: wrap;

      strong {
        color: var(--text-primary, #1e293b);
        font-size: 0.95rem;
      }
    }

    .jd-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      font-size: 0.7rem;
      font-weight: 600;
      border-radius: 12px;
      background: var(--surface-color, #e2e8f0);
      color: var(--text-secondary, #64748b);
    }

    .jd-badge--blue {
      background: var(--primary-color, #3b82f6);
      color: #fff;
    }

    /* Mobile responsive styles */
    @media (max-width: 768px) {
      .jd-panel {
        padding: 12px 14px;
      }

      .jd-grid {
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 10px 16px;
      }

      .jd-cell {
        label {
          font-size: 0.68rem;
        }
        span, a {
          font-size: 0.85rem;
        }
      }

      .jd-sr,
      .jd-notice {
        padding: 10px 12px;
      }
    }

    @media (max-width: 480px) {
      .jd-panel {
        padding: 10px 12px;
      }

      .jd-grid {
        grid-template-columns: 1fr 1fr;
        gap: 8px 12px;
      }

      .jd-vendor-card {
        padding: 10px 12px;
      }

      .jd-vendor-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
    }
  `,
})
export class JobDetailsComponent {
  /** Normalized {@code tel:} href when header phones include a redundant scheme. */
  readonly telHref = telHref;

  /** Job context data (basic info) - accepts a signal/computed function */
  private _context: (() => JobContextData | null) | null = null;
  @Input() set context(value: (() => JobContextData | null) | null) {
    this._context = value;
  }
  get contextValue(): JobContextData | null {
    return this._context ? this._context() : null;
  }

  /** Full job header detail data - accepts a signal/computed function */
  private _headerDetail: (() => JobHeaderDetailData | null) | null = null;
  @Input() set headerDetail(value: (() => JobHeaderDetailData | null) | null) {
    this._headerDetail = value;
  }
  get headerDetailValue(): JobHeaderDetailData | null {
    return this._headerDetail ? this._headerDetail() : null;
  }

  /** Whether accordion starts open (default: false) */
  @Input() defaultOpen = false;

  /** Show full service request toggle */
  showFullServiceRequest = signal(false);

  /** Cleaned service request text without "Service Request:" prefix */
  get cleanedServiceRequest(): string {
    const raw = this.headerDetailValue?.serviceRequest ?? '';
    return this.cleanServiceRequestText(raw);
  }

  /** Cleaned service request preview without "Service Request:" prefix */
  get cleanedServiceRequestPreview(): string {
    const raw = this.headerDetailValue?.serviceRequestPreview ?? '';
    return this.cleanServiceRequestText(raw);
  }

  /** Remove common "Service Request:" prefix from text */
  private cleanServiceRequestText(text: string): string {
    if (!text) return '';
    return text
      .replace(/^Service Request:\s*/i, '')
      .replace(/^<[^>]+>Service Request:\s*/i, '<p>')
      .trim();
  }

  /** Validate phone number has actual digits */
  isValidPhoneNumber(phone: string | null): boolean {
    if (!phone) return false;
    return /\d{7,}/.test(phone.replace(/\D/g, ''));
  }
}
