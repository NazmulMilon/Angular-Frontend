import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface AttachmentCardFile {
  fileKey: string;
  fileName: string | null;
  fileUrl: string | null;
  fileType: string | null;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const PDF_EXTENSIONS = ['pdf'];

function extensionOf(file: AttachmentCardFile): string {
  const source = file.fileName || file.fileUrl || '';
  const match = source.toLowerCase().match(/\.([a-z0-9]+)(?:\?.*)?$/);
  return match ? match[1] : '';
}

@Component({
  selector: 'app-attachment-thumbnail-grid',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="attachment-grid">
      @for (file of files; track file.fileKey) {
        <div
          class="attachment-card"
          [class.attachment-card--selected]="isSelected(file)"
          (click)="onToggle(file)"
        >
          <div class="attachment-card__preview">
            @if (isImage(file)) {
              <img [src]="file.fileUrl" [alt]="file.fileName || 'attachment'" />
            } @else if (isPdf(file) && !previewFailedKeys.has(file.fileKey)) {
              <object
                [data]="file.fileUrl"
                type="application/pdf"
                (error)="onPreviewError(file.fileKey)"
              >
                <div class="attachment-card__icon">📄</div>
              </object>
            } @else {
              <div class="attachment-card__icon">📄</div>
            }
          </div>
          <div class="attachment-card__footer">
            <input
              type="checkbox"
              class="attachment-card__checkbox"
              [checked]="isSelected(file)"
              (click)="$event.stopPropagation()"
              (change)="onToggle(file)"
            />
            <span class="attachment-card__name" [title]="file.fileName || ''">{{ file.fileName }}</span>
            <button
              type="button"
              class="attachment-card__view"
              title="View file"
              (click)="$event.stopPropagation(); onView(file)"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .attachment-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px;
    }

    .attachment-card {
      border: 2px solid var(--border-color, #e2e8f0);
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      background: #fff;
      transition: border-color 0.15s ease;
    }

    .attachment-card--selected {
      border-color: var(--primary-color, #6366f1);
    }

    .attachment-card__preview {
      width: 100%;
      height: 120px;
      background: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .attachment-card__preview img,
    .attachment-card__preview object {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .attachment-card__icon {
      font-size: 2.5rem;
    }

    .attachment-card__footer {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
    }

    .attachment-card__name {
      flex: 1;
      font-size: 0.75rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .attachment-card__view {
      background: none;
      border: none;
      cursor: pointer;
      color: #64748b;
      display: flex;
      align-items: center;
      padding: 0;
    }

    .attachment-card__view:hover {
      color: var(--primary-color, #6366f1);
    }
  `],
})
export class AttachmentThumbnailGridComponent {
  @Input() files: AttachmentCardFile[] = [];
  @Input() selectedKeys: string[] = [];

  @Output() toggle = new EventEmitter<{ fileKey: string; checked: boolean }>();
  @Output() view = new EventEmitter<AttachmentCardFile>();

  previewFailedKeys = new Set<string>();

  isSelected(file: AttachmentCardFile): boolean {
    return this.selectedKeys.includes(file.fileKey);
  }

  isImage(file: AttachmentCardFile): boolean {
    return IMAGE_EXTENSIONS.includes(extensionOf(file));
  }

  isPdf(file: AttachmentCardFile): boolean {
    return PDF_EXTENSIONS.includes(extensionOf(file));
  }

  onToggle(file: AttachmentCardFile): void {
    this.toggle.emit({ fileKey: file.fileKey, checked: !this.isSelected(file) });
  }

  onView(file: AttachmentCardFile): void {
    this.view.emit(file);
  }

  onPreviewError(fileKey: string): void {
    this.previewFailedKeys.add(fileKey);
  }
}
