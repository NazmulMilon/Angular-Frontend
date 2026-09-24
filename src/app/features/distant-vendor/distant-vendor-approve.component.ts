import { Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AssignVendorService } from '../../services/assign-vendor.service';
import { DistantVendorApprovalDetailsResponse } from '../../models/assign-vendor.model';
import { ButtonComponent } from '../../shared/components/button/button.component';

/**
 * Standalone component for approving distant vendor assignment.
 * Accessed via email link without authentication.
 * Displays job/vendor details and processes approval with optional remark.
 */
@Component({
  selector: 'app-distant-vendor-approve',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <div class="approval-container">
      <div class="approval-card">
        <div class="logo-header">
          <img src="assets/RFI-Logo.png" alt="RFI Logo" class="rfi-logo" />
        </div>
        @if (loading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading approval details...</p>
          </div>
        } @else if (errorMessage()) {
          <div class="error-state">
            <div class="error-icon">&#10008;</div>
            <h2>Error</h2>
            <p>{{ errorMessage() }}</p>
          </div>
        } @else if (infoMessage()) {
          <div class="info-state">
            <div class="info-icon">&#8505;</div>
            <h2>Information</h2>
            <p>{{ infoMessage() }}</p>
            <app-button variant="primary" (clicked)="closeTab()">Close</app-button>
          </div>
        } @else if (successMessage()) {
          <div class="success-state">
            <div class="success-icon">&#10004;</div>
            <h2>Approval Successful</h2>
            <p>{{ successMessage() }}</p>
             <app-button variant="primary" (clicked)="closeTab()">Close</app-button>
          </div>
        } @else if (details()) {
          <div class="approval-header">
            <h1>Approve Distant Vendor Assignment</h1>
            <div class="distance-alert">
              <span class="alert-icon">&#9888;</span>
              <span>This vendor is <strong>{{ formatNumber(details()!.distanceFromLocation) }} miles</strong> from the job location, 
              which exceeds the limit of <strong>{{ formatNumber(details()!.distanceRuleValue) }} miles</strong>.</span>
            </div>
          </div>

          <div class="details-section">
            <h3>PO#: {{ details()!.jobPO ?? 'N/A' }}</h3>
            <div class="details-grid">
              <div class="detail-row">
                <span class="label">Job Name:</span>
                <span class="value">{{ details()!.jobName ?? 'N/A' }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Location:</span>
                <span class="value">{{ details()!.locationName ?? 'N/A' }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Address:</span>
                <span class="value">{{ details()!.locationAddress ?? 'N/A' }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Trade:</span>
                <span class="value">{{ details()!.tradeName ?? 'N/A' }}</span>
              </div>
            </div>
          </div>

          <div class="details-section">
            <h3>Vendor Details</h3>
            <div class="details-grid">
              <div class="detail-row">
                <span class="label">Name:</span>
                <span class="value">{{ details()!.vendorName ?? 'N/A' }}</span>
              </div>
              <div class="detail-row inline-row">
                <span class="inline-item"><span class="label">Email:</span> <span class="value">{{ details()!.vendorEmail ?? 'N/A' }}</span></span>
                <span class="inline-item"><span class="label">Phone:</span> <span class="value">{{ details()!.vendorPhone ?? 'N/A' }}</span></span>
              </div>
              <div class="detail-row">
                <span class="label">Distance:</span>
                <span class="value distance-value">{{ formatNumber(details()!.distanceFromLocation) }} miles</span>
              </div>
            </div>
          </div>

          <div class="details-section">
            <h3>Vendor Rates</h3>
            <div class="details-grid">
              <div class="detail-row inline-row">
                <span class="inline-item"><span class="label">Hourly Rate:</span> <span class="value">\${{ formatNumber(details()!.hourlyRate) }}</span></span>
                <span class="inline-item"><span class="label">Trip Charge:</span> <span class="value">\${{ formatNumber(details()!.tripCharge) }}</span></span>
                <span class="inline-item"><span class="label">Service Charge:</span> <span class="value">\${{ formatNumber(details()!.serviceCharge) }}</span></span>
              </div>
              @if (details()!.hasTradeSpecificRate) {
                <div class="detail-row inline-row trade-rate">
                  <span class="inline-item"><span class="label">Trade Hourly Rate:</span> <span class="value">\${{ formatNumber(details()!.tradeHourlyRate) }}</span></span>
                  <span class="inline-item"><span class="label">Trade Trip Charge:</span> <span class="value">\${{ formatNumber(details()!.tradeTripCharge) }}</span></span>
                </div>
              }
            </div>
          </div>

          <div class="action-section">
            <div class="form-group">
              <label for="remark">Remark (Optional)</label>
              <textarea 
                id="remark" 
                [(ngModel)]="remark" 
                rows="3"
                placeholder="Enter any notes about this approval..."
                [disabled]="processing()"
              ></textarea>
            </div>

            <div class="action-buttons">
              <app-button 
                variant="primary"
                size="lg"
                [loading]="processing()"
                [disabled]="processing()"
                (clicked)="onApprove()"
              >
                Approve & Assign Vendor
              </app-button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .approval-container {
      min-height: 100vh;
      background-color: #f5f5f5;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }

    .approval-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      max-width: 700px;
      width: 100%;
      padding: 30px;
    }

    .logo-header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #eee;
    }

    .rfi-logo {
      width: 200px;
      height: auto;
    }

    .loading-state, .error-state, .info-state, .success-state {
      text-align: center;
      padding: 40px 20px;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e0e0e0;
      border-top: 4px solid #333399;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }


    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error-icon {
      font-size: 48px;
      color: #dc3545;
      margin-bottom: 10px;
    }

    .info-icon {
      font-size: 48px;
      color: #0d6efd;
      margin-bottom: 10px;
    }

    .info-state app-button {
      margin-top: 20px;
    }

    .success-icon {
      font-size: 48px;
      color: #28a745;
      margin-bottom: 10px;
    }

    .approval-header {
      margin-bottom: 30px;
    }

    .approval-header h1 {
      font-size: 24px;
      color: #333;
      margin: 0 0 15px 0;
    }

    .distance-alert {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .alert-icon {
      font-size: 20px;
      color: #856404;
    }

    .distance-alert span {
      color: #856404;
    }

    .details-section {
      margin-bottom: 25px;
    }

    .details-section h3 {
      font-size: 16px;
      color: #333;
      margin: 0 0 15px 0;
      padding-bottom: 10px;
      border-bottom: 1px solid #eee;
    }

    .details-grid {
      display: grid;
      gap: 10px;
    }

    .detail-row {
      display: flex;
      gap: 15px;
    }

    .detail-row .label {
      font-weight: 500;
      color: #666;
      min-width: 140px;
    }

    .detail-row .value {
      color: #333;
    }

    .inline-row {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
    }

    .inline-row .inline-item {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .inline-row .inline-item .label {
      min-width: auto;
    }

    .distance-value {
      color: #dc3545;
      font-weight: bold;
    }

    .trade-rate {
      background-color: #d4edda;
      padding: 5px 10px;
      border-radius: 4px;
    }

    .action-section {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      font-weight: 500;
      margin-bottom: 8px;
      color: #333;
    }

    .form-group textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      resize: vertical;
      box-sizing: border-box;
    }

    .form-group textarea:focus {
      outline: none;
      border-color: #333399;
    }

    .action-buttons {
      display: flex;
      justify-content: center;
    }

    .btn {
      padding: 12px 30px;
      border: none;
      border-radius: 5px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }

    .btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }


  `]
})
export class DistantVendorApproveComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly destroy$ = new Subject<void>();

  readonly loading = signal(true);
  readonly processing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly redirectUrl = signal<string | null>(null);
  readonly details = signal<DistantVendorApprovalDetailsResponse | null>(null);

  remark = '';

  /** Safely format a number to 2 decimal places */
  formatNumber(value: number | null | undefined): string {
    if (value == null) return 'N/A';
    return Number(value).toFixed(2);
  }

  /** Close the browser tab */
  closeTab(): void {
    window.close();
  }

  ngOnInit(): void {
    const approvalKey = this.route.snapshot.paramMap.get('approvalKey');
    if (!approvalKey) {
      this.loading.set(false);
      this.errorMessage.set('Invalid approval link. Missing approval key.');
      return;
    }

    this.loadDetails(approvalKey);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadDetails(approvalKey: string): void {
    this.assignVendorSvc
      .getDistantVendorApprovalDetails(approvalKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          if (res?.status && res.data) {
            if (res.data.processedAndDeployed) {
              this.infoMessage.set(
                `This request has already been ${res.data.isApproved ? 'approved' : 'declined'}.`
              );
            } else {
              this.details.set(res.data);
            }
          } else {
            console.error('API returned error or no data:', res);
            this.errorMessage.set(res?.message ?? 'Failed to load approval details.');
          }
        },
        error: (err) => {
          console.error('API call failed:', err);
          this.loading.set(false);
          this.errorMessage.set('Failed to load approval details. Please try again.');
        },
      });
  }

  onApprove(): void {
    const approvalKey = this.route.snapshot.paramMap.get('approvalKey');
    if (!approvalKey) return;

    this.processing.set(true);
    this.assignVendorSvc
      .processDistantVendorApproval(approvalKey, { remark: this.remark || null })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.processing.set(false);
          if (res?.status && res.data?.success) {
            this.successMessage.set(res.data.message ?? 'Vendor has been approved and assigned to the job.');
            this.redirectUrl.set(res.data.redirectUrl);
            this.details.set(null);
          } else {
            this.errorMessage.set(res?.message ?? res?.data?.message ?? 'Failed to process approval.');
          }
        },
        error: () => {
          this.processing.set(false);
          this.errorMessage.set('Failed to process approval. Please try again.');
        },
      });
  }
}
