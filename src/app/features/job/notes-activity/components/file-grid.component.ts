import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Subject, takeUntil, forkJoin } from 'rxjs';

import { NotesActivityService } from '../../../../services/notes-activity.service';
import { JobFileItem, VendorFileItem } from '../../../../models/notes-activity.model';

type FileItem = JobFileItem | VendorFileItem;

/**
 * File grid component for displaying and uploading files.
 * Supports drag-and-drop upload and file downloads.
 * Integrates with Azure Blob Storage via BlobFileService.
 */
@Component({
  selector: 'app-file-grid',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="file-grid-container">
      <!-- Upload Section -->
      @if (showUpload) {
        <div
          class="upload-zone"
          [class.upload-zone--dragover]="isDragOver()"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)"
        >
          <input
            type="file"
            #fileInput
            multiple
            (change)="onFileSelected($event)"
            style="display: none"
          />

          @if (isUploading()) {
            <div class="upload-progress">
              <div class="spinner"></div>
              <span>Uploading {{ uploadingFiles().length }} file(s)...</span>
            </div>
          } @else {
            <div class="upload-content" (click)="fileInput.click()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
              <p><strong>Click to upload</strong> or drag and drop</p>
              <span>PDF, Images, Documents (max 25MB)</span>
            </div>
          }
        </div>
      }

      <!-- Upload Error -->
      @if (uploadError()) {
        <div class="upload-error">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
          </svg>
          <span>{{ uploadError() }}</span>
          <button (click)="uploadError.set('')">&times;</button>
        </div>
      }

      <!-- Files List -->
      @if (isLoading()) {
        <div class="loading">
          <div class="spinner"></div>
          <span>Loading files...</span>
        </div>
      } @else if (files().length > 0) {
        <div class="files-header">
          <span class="files-count">{{ files().length }} files</span>
        </div>

        <div class="files-list">
          @for (file of files(); track file.fileKey) {
            <div class="file-card">
              <div class="file-icon" [attr.data-type]="getFileExtension(file)">
                {{ getFileExtension(file) }}
              </div>

              <div class="file-info">
                <span class="file-name" [title]="file.fileName">{{ file.fileName }}</span>
                <div class="file-meta">
                  @if (getDocumentType(file)) {
                    <span class="file-type">{{ getDocumentType(file) }}</span>
                  }
                  @if (getVendorName(file)) {
                    <span class="file-vendor">{{ getVendorName(file) }}</span>
                  }
                  @if (file.addedOn) {
                    <span class="file-date">{{ file.addedOn | date:'MMM d, y' }}</span>
                  }
                </div>
              </div>

              <div class="file-actions">
                <button
                  class="file-action-btn"
                  (click)="downloadFile(file)"
                  title="Download"
                  [disabled]="downloadingFile() === file.fileKey"
                >
                  @if (downloadingFile() === file.fileKey) {
                    <div class="spinner-small"></div>
                  } @else {
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
                    </svg>
                  }
                </button>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="no-files">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          <p>No files uploaded yet</p>
          @if (showUpload) {
            <span>Upload files using the form above</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .file-grid-container {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .upload-zone {
      border: 2px dashed var(--border-color, #e2e8f0);
      border-radius: 12px;
      padding: 32px;
      background: var(--surface-alt, #f8fafc);
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--primary-color, #3b82f6);
        background: rgba(59, 130, 246, 0.04);
      }

      &--dragover {
        border-color: var(--primary-color, #3b82f6);
        background: rgba(59, 130, 246, 0.08);
        transform: scale(1.01);
      }
    }

    .upload-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      text-align: center;

      svg {
        width: 48px;
        height: 48px;
        color: var(--text-muted, #94a3b8);
      }

      p {
        margin: 0;
        font-size: 0.95rem;
        color: var(--text-secondary, #64748b);
      }

      span {
        font-size: 0.8rem;
        color: var(--text-muted, #94a3b8);
      }
    }

    .upload-progress {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;

      span {
        color: var(--text-secondary, #64748b);
        font-size: 0.9rem;
      }
    }

    .upload-error {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #991b1b;
      font-size: 0.9rem;

      svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      span {
        flex: 1;
      }

      button {
        background: none;
        border: none;
        font-size: 1.25rem;
        cursor: pointer;
        opacity: 0.6;

        &:hover {
          opacity: 1;
        }
      }
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 32px;
      color: var(--text-secondary, #64748b);
      font-size: 0.9rem;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid var(--border-color, #e2e8f0);
      border-top-color: var(--primary-color, #3b82f6);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    .spinner-small {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border-color, #e2e8f0);
      border-top-color: var(--primary-color, #3b82f6);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .files-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .files-count {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-secondary, #64748b);
    }

    .files-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }

    .file-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: var(--surface-color, #fff);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 10px;
      transition: all 0.15s;

      &:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      }
    }

    .file-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      background: var(--surface-alt, #f1f5f9);
      border-radius: 8px;
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--text-secondary, #64748b);
      text-transform: uppercase;
      flex-shrink: 0;

      &[data-type="pdf"] {
        background: #fef2f2;
        color: #ef4444;
      }

      &[data-type="doc"], &[data-type="docx"] {
        background: #dbeafe;
        color: #3b82f6;
      }

      &[data-type="xls"], &[data-type="xlsx"] {
        background: #dcfce7;
        color: #22c55e;
      }

      &[data-type="jpg"], &[data-type="jpeg"], &[data-type="png"], &[data-type="gif"] {
        background: #fef3c7;
        color: #f59e0b;
      }
    }

    .file-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .file-name {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-primary, #1e293b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .file-type,
    .file-vendor,
    .file-date {
      font-size: 0.75rem;
      color: var(--text-muted, #94a3b8);
    }

    .file-type {
      padding: 2px 8px;
      background: var(--surface-alt, #f1f5f9);
      border-radius: 4px;
    }

    .file-actions {
      display: flex;
      gap: 6px;
    }

    .file-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      background: var(--surface-alt, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      svg {
        width: 16px;
        height: 16px;
        color: var(--text-secondary, #64748b);
      }

      &:hover:not(:disabled) {
        background: var(--primary-color, #3b82f6);
        border-color: var(--primary-color, #3b82f6);

        svg {
          color: #fff;
        }
      }
    }

    .no-files {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 24px;
      color: var(--text-muted, #94a3b8);
      text-align: center;

      svg {
        width: 56px;
        height: 56px;
      }

      p {
        margin: 8px 0 0;
        font-size: 1rem;
        font-weight: 500;
        color: var(--text-secondary, #64748b);
      }

      span {
        font-size: 0.85rem;
      }
    }

    @media (max-width: 768px) {
      .file-grid-container {
        padding: 12px;
        gap: 12px;
      }

      .upload-zone {
        padding: 24px 16px;
      }

      .upload-content svg {
        width: 40px;
        height: 40px;
      }

      .files-list {
        grid-template-columns: 1fr;
      }

      .file-card {
        padding: 12px;
      }

      .file-icon {
        width: 38px;
        height: 38px;
      }
    }

    @media (max-width: 480px) {
      .file-grid-container {
        padding: 10px;
      }

      .upload-zone {
        padding: 20px 12px;
      }

      .no-files {
        padding: 32px 16px;

        svg {
          width: 44px;
          height: 44px;
        }
      }
    }
  `,
})
export class FileGridComponent implements OnInit, OnChanges {
  private readonly notesSvc = inject(NotesActivityService);
  private readonly destroy$ = new Subject<void>();

  @Input() jobKey = '';
  @Input() vendorKey: string | null = null;
  @Input() showUpload = true;

  files = signal<FileItem[]>([]);
  isLoading = signal(false);
  isUploading = signal(false);
  uploadingFiles = signal<File[]>([]);
  uploadError = signal('');
  downloadingFile = signal<string | null>(null);
  isDragOver = signal(false);

  ngOnInit(): void {
    this.loadFiles();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jobKey'] || changes['vendorKey']) {
      this.loadFiles();
    }
  }

  private loadFiles(): void {
    if (!this.jobKey) return;

    this.isLoading.set(true);

    const requests: any = {
      jobFiles: this.notesSvc.getJobFiles(this.jobKey),
    };

    if (this.vendorKey) {
      requests['vendorFiles'] = this.notesSvc.getVendorFiles(this.jobKey, this.vendorKey);
    }

    forkJoin(requests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results: any) => {
          this.isLoading.set(false);
          const allFiles: FileItem[] = [];

          if (results.jobFiles?.status && results.jobFiles?.data) {
            allFiles.push(...results.jobFiles.data);
          }
          if (results.vendorFiles?.status && results.vendorFiles?.data) {
            allFiles.push(...results.vendorFiles.data);
          }

          this.files.set(allFiles);
        },
        error: () => {
          this.isLoading.set(false);
        },
      });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadFiles(Array.from(files));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadFiles(Array.from(input.files));
      input.value = '';
    }
  }

  private async uploadFiles(files: File[]): Promise<void> {
    const maxSize = 25 * 1024 * 1024; // 25MB
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        this.uploadError.set(`File "${file.name}" exceeds 25MB limit`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    this.isUploading.set(true);
    this.uploadingFiles.set(validFiles);
    this.uploadError.set('');

    let successCount = 0;
    let errorCount = 0;

    for (const file of validFiles) {
      try {
        const response = await this.notesSvc.uploadFile(this.jobKey, file).toPromise();
        if (response?.status && response?.data?.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    this.isUploading.set(false);
    this.uploadingFiles.set([]);

    if (errorCount > 0) {
      this.uploadError.set(`${errorCount} file(s) failed to upload`);
    }

    if (successCount > 0) {
      this.loadFiles();
    }
  }

  downloadFile(file: FileItem): void {
    if (this.downloadingFile()) return;

    this.downloadingFile.set(file.fileKey);

    this.notesSvc.downloadFile(this.jobKey, file.fileKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          this.downloadingFile.set(null);
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = file.fileName || 'download';
          link.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => {
          this.downloadingFile.set(null);
          this.uploadError.set('Failed to download file');
        },
      });
  }

  getFileExtension(file: FileItem): string {
    const name = file.fileName || '';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ext.substring(0, 4);
  }

  getDocumentType(file: FileItem): string | null {
    if ('documentTypeName' in file) {
      return file.documentTypeName;
    }
    if ('uploadType' in file) {
      return file.uploadType;
    }
    return null;
  }

  getVendorName(file: FileItem): string | null {
    if ('vendorName' in file) {
      return file.vendorName;
    }
    return null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
