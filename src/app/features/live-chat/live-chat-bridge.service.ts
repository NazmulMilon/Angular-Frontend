import { Injectable, signal } from '@angular/core';

export interface OpenThreadRequest {
  jobKey: string;
  vendorKey: string | null;
  /** Bumped on every request so the widget's effect re-fires even for the same job/vendor pair. */
  requestId: number;
}

/**
 * Lets other components ask the global {@link LiveChatWidgetComponent} to open a specific
 * job/vendor thread, since the widget is a single app-wide instance with no `@Input`s.
 */
@Injectable({ providedIn: 'root' })
export class LiveChatBridgeService {
  private nextRequestId = 1;
  readonly openThreadRequest = signal<OpenThreadRequest | null>(null);

  requestOpenThread(jobKey: string, vendorKey: string | null): void {
    this.openThreadRequest.set({ jobKey, vendorKey, requestId: this.nextRequestId++ });
  }
}
