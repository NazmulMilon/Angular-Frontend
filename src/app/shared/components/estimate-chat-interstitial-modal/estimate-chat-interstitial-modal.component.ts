import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LiveChatBridgeService } from '../../../features/live-chat/live-chat-bridge.service';

export interface EstimateChatInterstitialData {
  jobKey: string;
  vendorKey: string | null;
}

/**
 * Shown instead of navigating straight to the Estimates page when a job is Tech On-Site and
 * has a submitted vendor estimate — lets the admin jump straight into the vendor chat thread
 * (where on-site estimate actions already live) or continue to the full Estimates page.
 */
@Component({
  selector: 'app-estimate-chat-interstitial-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './estimate-chat-interstitial-modal.component.html',
  styleUrl: './estimate-chat-interstitial-modal.component.scss',
})
export class EstimateChatInterstitialModalComponent {
  private readonly router = inject(Router);
  private readonly chatBridge = inject(LiveChatBridgeService);

  readonly isVisible = signal(false);
  private data: EstimateChatInterstitialData | null = null;

  open(data: EstimateChatInterstitialData): void {
    this.data = data;
    this.isVisible.set(true);
  }

  close(): void {
    this.isVisible.set(false);
    this.data = null;
  }

  chatWithVendor(): void {
    if (!this.data) return;
    this.chatBridge.requestOpenThread(this.data.jobKey, this.data.vendorKey);
    this.close();
  }

  goToEstimates(): void {
    const jobKey = this.data?.jobKey;
    this.close();
    if (jobKey) {
      void this.router.navigate(['/job', jobKey, 'estimates']);
    }
  }
}
