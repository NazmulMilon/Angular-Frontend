import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { Subject, takeUntil } from 'rxjs';

import { NotesActivityService } from '../../../../services/notes-activity.service';
import {
  NoteType,
  NoteTemplate,
  ContactItem,
  VendorContactItem,
  CustomerContactItem,
  JobFileItem,
  VendorFileItem,
  SaveAndEmailRequest,
  NoteEmailSenderChoice,
  CategorizedContacts,
} from '../../../../models/notes-activity.model';
import { ContactSelectorComponent } from './contact-selector.component';

/**
 * Rich text editor component for composing notes with email functionality.
 * Uses ngx-editor for modern Angular-native editing experience.
 */
@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [FormsModule, NgxEditorModule, ContactSelectorComponent],
  template: `
    <div class="editor-container">
      <!-- Two Column Layout -->
      <div class="editor-layout">
        <!-- LEFT COLUMN: Rich Text Editor -->
        <div class="editor-left">
          <div class="editor-wrapper">
            <ngx-editor-menu [editor]="editor" [toolbar]="toolbar" />
            <ngx-editor
              [editor]="editor"
              [(ngModel)]="editorContent"
              [placeholder]="'Type your note here...'"
            />
          </div>

          <!-- File Upload Area -->
          <div class="upload-area"
            [class.upload-area--dragover]="isDragOver()"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event)"
          >
            <input
              type="file"
              id="fileInput"
              multiple
              (change)="onFileSelected($event)"
              #fileInput
              hidden
            />
            <div class="upload-content">
              <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
              <span class="upload-text">Drag & drop files here or</span>
              <button type="button" class="upload-btn" (click)="fileInput.click()">Browse Files</button>
            </div>
          </div>

          <!-- Uploaded Files List -->
          @if (uploadedFiles().length > 0) {
            <div class="uploaded-files">
              @for (file of uploadedFiles(); track file.name) {
                <div class="uploaded-file">
                  <svg class="file-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
                  </svg>
                  <span class="file-name">{{ file.name }}</span>
                  <span class="file-size">{{ formatFileSize(file.size) }}</span>
                  <button type="button" class="file-remove" (click)="removeUploadedFile(file)" title="Remove">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                    </svg>
                  </button>
                </div>
              }
            </div>
          }

          <!-- Action Buttons -->
          <div class="editor-actions">
            <button
              class="btn btn--secondary"
              type="button"
              (click)="clearEditor()"
              [disabled]="isSubmitting()"
            >
              Clear
            </button>

            <div class="action-group">
              <button
                class="btn btn--primary"
                type="button"
                (click)="saveNote()"
                [disabled]="isSubmitting() || !canSave()"
              >
                @if (isSubmitting() && submitAction() === 'save') {
                  <span class="spinner"></span>
                }
                Save Note
              </button>

              <button
                class="btn btn--success"
                type="button"
                (click)="saveAndEmail()"
                [disabled]="isSubmitting() || !canEmail()"
              >
                @if (isSubmitting() && submitAction() === 'email') {
                  <span class="spinner"></span>
                }
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                </svg>
                Save & Email
              </button>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: Templates, Recipients, Attachments (subject hidden for now) -->
        <div class="editor-right">
          <!-- Date/Time Picker -->
          <div class="editor-field">
            <label for="noteDateTime">Date & Time</label>
            <input
              type="datetime-local"
              id="noteDateTime"
              [(ngModel)]="noteDateTime"
            />
          </div>

          @if (activeTab !== 'vendor' && activeTab !== 'customer' && activeTab !== 'internal') {
            <!-- Pin Note Checkbox -->
            <label class="pin-checkbox">
              <input type="checkbox" [(ngModel)]="pinNote" />
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v2h2a1 1 0 010 2h-1.586l-.707 7.071A2 2 0 0112.72 18H7.28a2 2 0 01-1.987-1.929L4.586 9H3a1 1 0 110-2h2V5zm4 0v2h2V5H9z"/>
              </svg>
              <span>Pin this note</span>
            </label>

            <!-- Send as (required for Save & Email) -->
            <div class="editor-field sender-choice" [class.sender-choice--invalid]="senderChoiceTouched() && !emailSenderChoice">
              <span class="sender-choice__label">Send as <span class="sender-choice__required">*</span></span>
              <p class="sender-choice__hint">Required when using Save &amp; Email</p>
              <div class="sender-choice__options">
                <label class="sender-choice__option">
                  <input
                    type="radio"
                    name="emailSenderChoice"
                    value="Self"
                    [(ngModel)]="emailSenderChoice"
                    (blur)="onSenderChoiceBlur()"
                  />
                  <span>Self</span>
                </label>
                <label class="sender-choice__option">
                  <input
                    type="radio"
                    name="emailSenderChoice"
                    value="ServiceAdmin"
                    [(ngModel)]="emailSenderChoice"
                    (blur)="onSenderChoiceBlur()"
                  />
                  <span>Service Admin</span>
                </label>
              </div>
            </div>
          }

          <!-- Template Selector -->
          @if (templates.length > 0) {
            <div class="editor-field">
              <label for="templateSelect">Template</label>
              <select id="templateSelect" (change)="applyTemplate($any($event.target).value)">
                <option value="">-- Select template --</option>
                @for (template of templates; track template.templateKey) {
                  <option [value]="template.templateKey">{{ template.templateName }}</option>
                }
              </select>
            </div>
          }

          <!-- Contact Selector (for email sending) -->
          @if (showContactSelector()) {
            <div class="contact-section">
              <h4>
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                </svg>
                Select Recipients
              </h4>
              <app-contact-selector
                [jobKey]="jobKey"
                [noteType]="noteType"
                [vendorKey]="vendorKey"
                [addedBy]="adminKey"
                [activeTab]="activeTab"
                [preselectEmails]="preselectEmails"
                (contactsSelected)="onContactsSelected($event)"
              />
            </div>
          }

          <!-- File Attachments Selection -->
          @if (showAttachments()) {
            <div class="attachments-section">
              <h4>
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clip-rule="evenodd"/>
                </svg>
                Attachments ({{ selectedFiles().length }} selected)
              </h4>
              <div class="file-list">
                @for (file of availableFiles(); track file.fileKey) {
                  <label class="file-item">
                    <input
                      type="checkbox"
                      [checked]="isFileSelected(file.fileKey)"
                      (change)="toggleFileSelection(file.fileKey)"
                    />
                    <span class="file-name">{{ file.fileName }}</span>
                    @if (file.documentTypeName) {
                      <span class="file-type">{{ file.documentTypeName }}</span>
                    }
                  </label>
                }
                @if (availableFiles().length === 0) {
                  <p class="no-files">No files available</p>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      max-width: 100%;
      min-width: 0;
    }

    .editor-container {
      padding: 12px 16px;
    }

    .editor-layout {
      display: grid;
      grid-template-columns: 1fr 400px;
      gap: 16px;
    }

    .editor-left {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    .editor-right {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    @media (max-width: 900px) {
      .editor-layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .editor-layout {
        gap: 14px;
      }

      /* Keep editor above options on mobile (natural DOM order) */
      .editor-left {
        order: 0;
      }

      .editor-right {
        order: 0;
      }
    }

    .editor-field {
      display: flex;
      flex-direction: column;
      gap: 4px;

      label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      input, select {
        padding: 6px 10px;
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 5px;
        font-size: 0.85rem;
        color: var(--text-primary, #1e293b);
        transition: border-color 0.15s, box-shadow 0.15s;

        &:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
        }

        &::placeholder {
          color: var(--text-muted, #94a3b8);
        }
      }
    }

    .editor-wrapper {
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 6px;
      overflow: hidden;
      flex: 1;
    }

    /* NgxEditor global overrides - must be at root level with ::ng-deep */
    ::ng-deep .NgxEditor__MenuBar {
      background: var(--surface-alt, #f8fafc) !important;
      border-bottom: 1px solid var(--border-color, rgb(132, 148, 171)) !important;
      padding: 4px 6px !important;
    }

    ::ng-deep .NgxEditor {
      min-height: 450px !important;
      padding: 10px !important;
      font-size: 0.9rem !important;
      line-height: 1.5 !important;
      height: 500px !important;
    }

    ::ng-deep .NgxEditor__Placeholder {
      color: var(--text-muted, #94a3b8) !important;
    }

    .upload-area {
      border: 2px dashed var(--border-color, #e2e8f0);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      background: var(--surface-alt, #f8fafc);
      transition: all 0.2s;
      cursor: pointer;

      &:hover {
        border-color: var(--primary-color, #3b82f6);
        background: rgba(59, 130, 246, 0.04);
      }

      &--dragover {
        border-color: var(--primary-color, #3b82f6);
        background: rgba(59, 130, 246, 0.08);
      }
    }

    .upload-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .upload-icon {
      width: 32px;
      height: 32px;
      color: var(--text-muted, #94a3b8);
    }

    .upload-text {
      font-size: 0.85rem;
      color: var(--text-secondary, #64748b);
    }

    .upload-btn {
      padding: 6px 14px;
      background: var(--primary-color, #3b82f6);
      color: #fff;
      border: none;
      border-radius: 5px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;

      &:hover {
        background: var(--primary-hover, #2563eb);
      }
    }

    .uploaded-files {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .uploaded-file {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: var(--surface-alt, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 6px;
    }

    .uploaded-file .file-icon {
      width: 18px;
      height: 18px;
      color: var(--primary-color, #3b82f6);
      flex-shrink: 0;
    }

    .uploaded-file .file-name {
      flex: 1;
      font-size: 0.85rem;
      color: var(--text-primary, #1e293b);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .uploaded-file .file-size {
      font-size: 0.75rem;
      color: var(--text-muted, #94a3b8);
      flex-shrink: 0;
    }

    .file-remove {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-muted, #94a3b8);
      transition: all 0.15s;
      flex-shrink: 0;

      &:hover {
        background: #fee2e2;
        color: #ef4444;
      }

      svg {
        width: 14px;
        height: 14px;
      }
    }

    .contact-section,
    .attachments-section {
      padding: 10px;
      background: var(--surface-alt, #f8fafc);
      border-radius: 6px;
      border: 1px solid var(--border-color, #e2e8f0);

      h4 {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 8px;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.3px;

        svg {
          width: 14px;
          height: 14px;
          color: var(--primary-color, #3b82f6);
        }
      }
    }

    .file-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .file-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--surface-color, #fff);
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;

      &:hover {
        background: var(--surface-hover, #f1f5f9);
      }

      input[type="checkbox"] {
        width: 14px;
        height: 14px;
        accent-color: var(--primary-color, #3b82f6);
      }
    }

    .file-name {
      flex: 1;
      font-size: 0.8rem;
      color: var(--text-primary, #1e293b);
      word-break: break-word;
    }

    .file-type {
      font-size: 0.65rem;
      color: var(--text-muted, #94a3b8);
      padding: 2px 6px;
      background: var(--border-color, #e2e8f0);
      border-radius: 3px;
    }

    .no-files {
      color: var(--text-muted, #94a3b8);
      font-size: 0.8rem;
      font-style: italic;
      margin: 0;
    }

    .sender-choice {
      padding: 10px 12px;
      background: var(--surface-alt, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 6px;

      &--invalid {
        border-color: #f97316;
        background: rgba(249, 115, 22, 0.06);
      }
    }

    .sender-choice__label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-primary, #1e293b);
      margin-bottom: 2px;
    }

    .sender-choice__required {
      color: #dc2626;
    }

    .sender-choice__hint {
      margin: 0 0 8px;
      font-size: 0.7rem;
      color: var(--text-muted, #64748b);
    }

    .sender-choice__options {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sender-choice__option {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.8rem;
      color: var(--text-primary, #1e293b);
      cursor: pointer;

      input[type='radio'] {
        width: 14px;
        height: 14px;
        accent-color: var(--primary-color, #3b82f6);
      }
    }

    .pin-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--surface-alt, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 5px;
      cursor: pointer;
      font-size: 0.8rem;
      color: var(--text-primary, #1e293b);
      transition: all 0.15s;

      &:hover {
        background: var(--border-color, #e2e8f0);
      }

      &:has(input:checked) {
        background: rgba(245, 158, 11, 0.1);
        border-color: #f59e0b;
        color: #b45309;
      }

      input[type="checkbox"] {
        width: 14px;
        height: 14px;
        accent-color: #f59e0b;
      }

      svg {
        width: 14px;
        height: 14px;
        color: #f59e0b;
      }

      span {
        font-weight: 500;
      }
    }

    .editor-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border-color, #e2e8f0);
      flex-wrap: wrap;
    }

    .action-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      border: none;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      svg {
        width: 14px;
        height: 14px;
      }
    }

    .btn--primary {
      background: var(--primary-color, #3b82f6);
      color: #fff;

      &:hover:not(:disabled) {
        background: var(--primary-hover, #2563eb);
      }
    }

    .btn--secondary {
      background: var(--surface-alt, #f1f5f9);
      color: var(--text-secondary, #64748b);

      &:hover:not(:disabled) {
        background: var(--border-color, #e2e8f0);
      }
    }

    .btn--success {
      background: var(--success-color, #22c55e);
      color: #fff;

      &:hover:not(:disabled) {
        background: #16a34a;
      }
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .editor-container {
        padding: 10px 12px;
        gap: 14px;
      }

      .editor-wrapper {
        border-radius: 8px;
        overflow: hidden;
      }

      .editor-field--inline {
        flex-direction: column;
        align-items: stretch;

        select {
          max-width: 100%;
        }
      }

      .editor-field input,
      .editor-field select {
        font-size: 16px;
        min-height: 44px;
        padding: 10px 12px;
      }

      .contact-section,
      .attachments-section {
        padding: 12px;
      }

      .contact-section h4,
      .attachments-section h4 {
        font-size: 0.8rem;
      }

      .file-item {
        min-height: 44px;
        padding: 10px 12px;

        input[type="checkbox"] {
          width: 18px;
          height: 18px;
        }
      }

      .upload-area {
        padding: 16px 12px;
      }

      .upload-btn {
        min-height: 40px;
        padding: 10px 16px;
      }

      ::ng-deep .NgxEditor__MenuBar {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        flex-wrap: nowrap;
        scrollbar-width: none;

        &::-webkit-scrollbar {
          display: none;
        }
      }

      ::ng-deep .NgxEditor {
        min-height: 220px !important;
        height: 260px !important;
        font-size: 16px !important;
      }

      .editor-actions {
        flex-direction: column;
        gap: 10px;
      }

      .action-group {
        width: 100%;
        flex-direction: column;
      }

      .btn {
        width: 100%;
        padding: 12px 16px;
        min-height: 44px;
      }

      .sender-choice__option {
        min-height: 40px;
        font-size: 0.875rem;

        input[type='radio'] {
          width: 18px;
          height: 18px;
        }
      }

      .pin-checkbox {
        min-height: 44px;
        font-size: 0.875rem;
      }
    }

    @media (max-width: 480px) {
      .editor-container {
        padding: 12px;
        gap: 12px;
      }

      ::ng-deep .NgxEditor {
        min-height: 180px !important;
        height: 220px !important;
      }

      .file-list {
        max-height: 150px;
      }
    }
  `,
})
export class NoteEditorComponent implements OnInit, OnDestroy, OnChanges {
  private readonly notesSvc = inject(NotesActivityService);
  private readonly destroy$ = new Subject<void>();

  @ViewChild(ContactSelectorComponent)
  private contactSelector?: ContactSelectorComponent;

  @Input() jobKey = '';
  @Input() noteType: NoteType = 'general';
  @Input() vendorKey: string | null = null;
  @Input() templates: NoteTemplate[] = [];
  @Input() adminKey = '';
  @Input() quotedContent = '';
  @Input() activeTab: 'all' | 'internal' | 'vendor' | 'customer' = 'all';
  @Input() preselectEmails: string[] = [];

  @Output() noteSaved = new EventEmitter<{ success: boolean; message: string }>();
  @Output() noteEmailed = new EventEmitter<{ success: boolean; message: string }>();

  editor!: Editor;
  toolbar: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['ordered_list', 'bullet_list'],
    ['link'],
    ['text_color', 'background_color'],
    ['align_left', 'align_center', 'align_right'],
    ['undo', 'redo'],
  ];

  noteDateTime = '';
  editorContent = '';
  pinNote = false;

  /** Required for Save & Email; not sent on Save Note only. */
  emailSenderChoice: NoteEmailSenderChoice | '' = '';

  /** Highlights sender radios if user attempts Save & Email without a choice. */
  senderChoiceTouched = signal(false);

  // State
  isSubmitting = signal(false);
  submitAction = signal<'save' | 'email' | null>(null);
  showContactSelector = signal(true);
  showAttachments = signal(true);

  // Contacts (categorized by type)
  selectedContacts = signal<CategorizedContacts>({
    internal: [],
    customer: [],
    vendor: [],
    location: [],
    accounting: [],
  });

  // Files
  availableFiles = signal<JobFileItem[]>([]);
  selectedFiles = signal<string[]>([]);

  // File Upload
  uploadedFiles = signal<File[]>([]);
  isDragOver = signal(false);

  ngOnInit(): void {
    this.editor = new Editor();
    this.loadFiles();
    this.initDateTime();

    if (this.quotedContent) {
      this.editorContent = this.quotedContent;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['quotedContent'] && !changes['quotedContent'].firstChange) {
      const newContent = changes['quotedContent'].currentValue;
      if (newContent) {
        this.editorContent = newContent;
      }
    }
    if (
      changes['activeTab'] &&
      (this.activeTab === 'vendor' || this.activeTab === 'customer' || this.activeTab === 'internal')
    ) {
      this.senderChoiceTouched.set(false);
    }
  }

  private initDateTime(): void {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    this.noteDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  ngOnDestroy(): void {
    this.editor.destroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadFiles(): void {
    if (!this.jobKey) return;

    this.notesSvc.getJobFiles(this.jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            this.availableFiles.set(res.data);
          }
        },
      });
  }

  applyTemplate(templateKey: string): void {
    if (!templateKey) return;
    const template = this.templates.find(t => t.templateKey === templateKey);
    if (template?.templateContent) {
      this.editorContent = template.templateContent;
    }
  }

  toggleFileSelection(fileKey: string): void {
    const current = this.selectedFiles();
    if (current.includes(fileKey)) {
      this.selectedFiles.set(current.filter(k => k !== fileKey));
    } else {
      this.selectedFiles.set([...current, fileKey]);
    }
  }

  isFileSelected(fileKey: string): boolean {
    return this.selectedFiles().includes(fileKey);
  }

  onContactsSelected(contacts: CategorizedContacts): void {
    this.selectedContacts.set(contacts);
  }

  /**
   * Vendor tab sends only vendor recipients; other recipient arrays are omitted so Save/Save & Email
   * cannot accidentally use stale selections from another tab.
   */
  private recipientFieldsForSave(contacts: CategorizedContacts): Pick<
    SaveAndEmailRequest,
    | 'internalRecipients'
    | 'customerRecipients'
    | 'vendorRecipients'
    | 'locationRecipients'
    | 'accountingRecipients'
    | 'vendorKey'
  > {
    if (this.activeTab === 'vendor') {
      return {
        internalRecipients: undefined,
        customerRecipients: undefined,
        locationRecipients: undefined,
        accountingRecipients: undefined,
        vendorRecipients: contacts.vendor.length > 0 ? contacts.vendor : undefined,
        vendorKey: this.vendorKey || undefined,
      };
    }
    if (this.activeTab === 'customer') {
      return {
        internalRecipients: undefined,
        vendorRecipients: undefined,
        locationRecipients: undefined,
        accountingRecipients: undefined,
        customerRecipients: contacts.customer.length > 0 ? contacts.customer : undefined,
        vendorKey: undefined,
      };
    }
    if (this.activeTab === 'internal') {
      return {
        customerRecipients: undefined,
        vendorRecipients: undefined,
        locationRecipients: undefined,
        accountingRecipients: undefined,
        internalRecipients: contacts.internal.length > 0 ? contacts.internal : undefined,
        vendorKey: undefined,
      };
    }
    return {
      internalRecipients: contacts.internal.length > 0 ? contacts.internal : undefined,
      customerRecipients: contacts.customer.length > 0 ? contacts.customer : undefined,
      vendorRecipients: contacts.vendor.length > 0 ? contacts.vendor : undefined,
      locationRecipients: contacts.location.length > 0 ? contacts.location : undefined,
      accountingRecipients: contacts.accounting.length > 0 ? contacts.accounting : undefined,
      vendorKey: this.vendorKey || undefined,
    };
  }

  /**
   * Save Note requires non-empty note body. Uploaded files are optional;
   * attachments are sent in addition when present.
   */
  canSave(): boolean {
    return this.editorContent.trim().length > 0;
  }

  canEmail(): boolean {
    const contacts = this.selectedContacts();
    const isVendorTab = this.activeTab === 'vendor';
    const isCustomerTab = this.activeTab === 'customer';
    const isInternalTab = this.activeTab === 'internal';
    const hasAnyContact = isVendorTab
      ? contacts.vendor.length > 0
      : isCustomerTab
        ? contacts.customer.length > 0
        : isInternalTab
          ? contacts.internal.length > 0
          : contacts.internal.length > 0 ||
            contacts.customer.length > 0 ||
            contacts.vendor.length > 0 ||
            contacts.location.length > 0 ||
            contacts.accounting.length > 0;
    const senderOk =
      isVendorTab ||
      isCustomerTab ||
      isInternalTab ||
      this.emailSenderChoice === 'Self' ||
      this.emailSenderChoice === 'ServiceAdmin';
    return this.canSave() && hasAnyContact && senderOk;
  }

  onSenderChoiceBlur(): void {
    this.senderChoiceTouched.set(true);
  }

  /**
   * Resets compose fields and recipient state. When the contact selector is shown,
   * also reloads contacts from the API so checkbox UI stays in sync with cleared selection.
   */
  clearEditor(): void {
    this.editorContent = '';
    this.initDateTime();
    this.pinNote = false;
    this.emailSenderChoice = '';
    this.senderChoiceTouched.set(false);
    this.selectedFiles.set([]);
    this.selectedContacts.set({
      internal: [],
      customer: [],
      vendor: [],
      location: [],
      accounting: [],
    });
    this.uploadedFiles.set([]);
    this.contactSelector?.reloadContactsFromApi();
  }

  /**
   * Reset compose after Save / Save & Email on the Vendor tab: same as {@link clearEditor} but kept
   * separate so vendor-only UX (hidden pin / Send as, forced Service Admin on the wire) stays obvious.
   */
  clearEditorAfterVendorSave(): void {
    this.clearEditor();
  }

  /**
   * Reset compose after Save / Save & Email on the Customer tab: clears fields like {@link clearEditor}
   * but does not reload all contact APIs (only Customer recipients are shown; parent reloads the grid).
   */
  clearEditorAfterCustomerSave(): void {
    this.editorContent = '';
    this.initDateTime();
    this.pinNote = false;
    this.emailSenderChoice = '';
    this.senderChoiceTouched.set(false);
    this.selectedFiles.set([]);
    this.selectedContacts.set({
      internal: [],
      customer: [],
      vendor: [],
      location: [],
      accounting: [],
    });
    this.uploadedFiles.set([]);
    this.contactSelector?.clearRecipientSelection();
  }

  /**
   * Reset compose after Save / Save & Email on the Internal tab: like {@link clearEditorAfterCustomerSave}
   * (no full contact API reload; parent reloads internal messaging grid).
   */
  clearEditorAfterInternalSave(): void {
    this.editorContent = '';
    this.initDateTime();
    this.pinNote = false;
    this.emailSenderChoice = '';
    this.senderChoiceTouched.set(false);
    this.selectedFiles.set([]);
    this.selectedContacts.set({
      internal: [],
      customer: [],
      vendor: [],
      location: [],
      accounting: [],
    });
    this.uploadedFiles.set([]);
    this.contactSelector?.clearRecipientSelection();
  }

  // File Upload Methods
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
      this.addFiles(Array.from(files));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.addFiles(Array.from(input.files));
      input.value = '';
    }
  }

  private addFiles(files: File[]): void {
    const current = this.uploadedFiles();
    const newFiles = files.filter(
      f => !current.some(existing => existing.name === f.name && existing.size === f.size)
    );
    this.uploadedFiles.set([...current, ...newFiles]);
  }

  removeUploadedFile(file: File): void {
    const current = this.uploadedFiles();
    this.uploadedFiles.set(current.filter(f => f !== file));
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  saveNote(): void {
    if (!this.canSave()) return;

    this.isSubmitting.set(true);
    this.submitAction.set('save');

    const contacts = this.selectedContacts();
    const isVendorTab = this.activeTab === 'vendor';
    const isCustomerTab = this.activeTab === 'customer';
    const isInternalTab = this.activeTab === 'internal';
    const request: SaveAndEmailRequest = {
      jobKey: this.jobKey,
      notes: this.editorContent,
      pinNote: isVendorTab || isCustomerTab || isInternalTab ? false : this.pinNote,
      jobFileKeys: this.selectedFiles(),
      ...this.recipientFieldsForSave(contacts),
    };

    this.notesSvc.saveNote(request, this.uploadedFiles())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isSubmitting.set(false);
          this.submitAction.set(null);

          // Check for success - either from status or data.success
          const isSuccess = res.status || res.data?.success;
          if (isSuccess) {
            if (isVendorTab) {
              this.clearEditorAfterVendorSave();
            } else if (isCustomerTab) {
              this.clearEditorAfterCustomerSave();
            } else if (isInternalTab) {
              this.clearEditorAfterInternalSave();
            } else {
              this.clearEditor();
            }
            this.loadFiles();
            this.noteSaved.emit({ success: true, message: res.data?.message || res.message || 'Note saved successfully' });
          } else {
            this.noteSaved.emit({ success: false, message: res.data?.message || res.message || 'Failed to save note' });
          }
        },
        error: (err) => {
          console.error('saveNote error:', err);
          this.isSubmitting.set(false);
          this.submitAction.set(null);
          this.noteSaved.emit({ success: false, message: 'Failed to save note' });
        },
      });
  }

  saveAndEmail(): void {
    if (this.activeTab !== 'vendor' && this.activeTab !== 'customer' && this.activeTab !== 'internal') {
      this.senderChoiceTouched.set(true);
    }
    if (!this.canEmail()) {
      return;
    }

    this.isSubmitting.set(true);
    this.submitAction.set('email');

    const contacts = this.selectedContacts();
    const isVendorTab = this.activeTab === 'vendor';
    const isCustomerTab = this.activeTab === 'customer';
    const isInternalTab = this.activeTab === 'internal';

    const request: SaveAndEmailRequest = {
      jobKey: this.jobKey,
      notes: this.editorContent,
      pinNote: isVendorTab || isCustomerTab || isInternalTab ? false : this.pinNote,
      emailSenderChoice: isVendorTab
        ? 'ServiceAdmin'
        : isCustomerTab || isInternalTab
          ? 'Self'
          : (this.emailSenderChoice as NoteEmailSenderChoice),
      jobFileKeys: this.selectedFiles(),
      ...this.recipientFieldsForSave(contacts),
    };

    this.notesSvc.saveAndEmail(request, this.uploadedFiles()).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.submitAction.set(null);

        // Check for success - either from status or data.success
        const isSuccess = res.status || res.data?.success;
        if (isSuccess) {
          if (isVendorTab) {
            this.clearEditorAfterVendorSave();
          } else if (isCustomerTab) {
            this.clearEditorAfterCustomerSave();
          } else if (isInternalTab) {
            this.clearEditorAfterInternalSave();
          } else {
            this.clearEditor();
          }
          this.loadFiles();
          this.noteEmailed.emit({ success: true, message: res.data?.message || res.message || 'Email sent successfully' });
        } else {
          this.noteEmailed.emit({ success: false, message: res.data?.message || res.message || 'Failed to send email' });
        }
      },
      error: (err) => {
        console.error('saveAndEmail error:', err);
        this.isSubmitting.set(false);
        this.submitAction.set(null);
        this.noteEmailed.emit({ success: false, message: 'Failed to send email' });
      },
    });
  }

  toggleContactSelector(): void {
    this.showContactSelector.update(v => !v);
  }

  toggleAttachments(): void {
    this.showAttachments.update(v => !v);
  }
}
