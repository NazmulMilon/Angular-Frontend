import { Component, Input, OnInit, inject, signal } from '@angular/core';

import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CustomerAttachmentRow, CustomerListService, IdNameOption } from '../../../services/customer-list.service';

/**
 * Files & Attachments (RFI-345 Phase 4) — embedded in the Edit Customer page's
 * "Files and attachments" accordion panel. Lists a customer's attachments and
 * uploads / downloads / deletes them via the CustomerProfile attachment endpoints.
 * Bytes are stored on the row (no blob dependency).
 */
@Component({
  selector: 'app-customer-files',
  standalone: true,
  imports: [ButtonComponent],
  templateUrl: './customer-files.component.html',
  styleUrl: './customer-files.component.scss',
})
export class CustomerFilesComponent implements OnInit {
  @Input({ required: true }) customerKey!: string;

  private readonly service = inject(CustomerListService);

  protected readonly attachments = signal<CustomerAttachmentRow[]>([]);
  protected readonly docTypes = signal<IdNameOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly listError = signal<string | null>(null);

  protected readonly showUpload = signal(false);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly comment = signal('');
  protected readonly docTypeKey = signal('');
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly rowBusy = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
    this.service.getAttachmentDocTypes().subscribe({
      next: (d) => this.docTypes.set(d),
      error: () => this.docTypes.set([]),
    });
  }

  private load(): void {
    if (!this.customerKey) return;
    this.loading.set(true);
    this.listError.set(null);
    this.service.getAttachments(this.customerKey).subscribe({
      next: (rows) => { this.attachments.set(rows); this.loading.set(false); },
      error: (err) => { this.listError.set(this.messageFrom(err, 'Failed to load attachments.')); this.loading.set(false); },
    });
  }

  protected startUpload(): void {
    this.selectedFile.set(null);
    this.comment.set('');
    this.docTypeKey.set('');
    this.uploadError.set(null);
    this.showUpload.set(true);
  }

  protected cancelUpload(): void {
    this.showUpload.set(false);
    this.uploadError.set(null);
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  protected doUpload(): void {
    const file = this.selectedFile();
    if (!file) { this.uploadError.set('Please choose a file.'); return; }
    this.uploading.set(true);
    this.uploadError.set(null);
    this.service
      .uploadAttachment(this.customerKey, file, this.comment().trim() || null, this.docTypeKey() || null)
      .subscribe({
        next: () => { this.uploading.set(false); this.showUpload.set(false); this.load(); },
        error: (err) => { this.uploading.set(false); this.uploadError.set(this.messageFrom(err, 'Upload failed.')); },
      });
  }

  protected download(a: CustomerAttachmentRow): void {
    this.rowBusy.set(a.attachementKey);
    this.service.getAttachmentBlob(this.customerKey, a.attachementKey).subscribe({
      next: (blob) => {
        this.rowBusy.set(null);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.filename || 'file';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (err) => { this.rowBusy.set(null); this.listError.set(this.messageFrom(err, 'Failed to download file.')); },
    });
  }

  protected remove(a: CustomerAttachmentRow): void {
    this.rowBusy.set(a.attachementKey);
    this.service.deleteAttachment(this.customerKey, a.attachementKey).subscribe({
      next: () => { this.rowBusy.set(null); this.load(); },
      error: (err) => { this.rowBusy.set(null); this.listError.set(this.messageFrom(err, 'Failed to delete file.')); },
    });
  }

  protected fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  private messageFrom(err: unknown, fallback: string): string {
    const e = err as { error?: { error?: string; details?: string }; message?: string };
    return e?.error?.details || e?.error?.error || e?.message || fallback;
  }
}
