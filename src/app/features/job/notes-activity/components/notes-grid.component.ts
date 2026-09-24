import { Component, input, Input, Output, EventEmitter, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import * as XLSX from 'xlsx';

import { NoteItem, HUMAN_MESSAGE_TYPES, ACTION_NOTE_TYPES } from '../../../../models/notes-activity.model';

/**
 * Notes grid component for displaying notes in a modern card layout.
 * Features:
 * - Unread highlighting with subtle animation
 * - Pin/unpin functionality
 * - Reply action
 * - Delete action
 * - Excel export
 * - Responsive design
 */
@Component({
  selector: 'app-notes-grid',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="notes-grid-container">
      <!-- Actions bar -->
      <div class="grid-actions">
        <div class="search-box">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
          </svg>
          <input
            type="text"
            placeholder="Search notes..."
            [value]="searchTerm()"
            (input)="onSearchChange($any($event.target).value)"
          />
        </div>

        <div class="action-buttons">
          @if (!isPinnedSection && notes().length > 0) {
            <button class="action-btn" (click)="exportToExcel()" title="Export to Excel">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clip-rule="evenodd"/>
              </svg>
              Export
            </button>
          }
        </div>
      </div>

      <!-- Notes Table (Legacy-style grid) -->
      <div class="notes-table-wrapper">
        <table class="notes-table">
          <thead>
            <tr>
              <th width="12%">Added On</th>
              <th width="15%">From</th>
              <th width="15%">To</th>
              <th>Message</th>
              <th width="14%">Control</th>
            </tr>
          </thead>
          <tbody>
            @for (note of filteredNotes(); track note.noteKey) {
              <tr 
                [class.row-human-msg]="isHumanMessage(note)"
                [class.row-action-note]="isActionNote(note)"
                [style]="getRowStyle(note)"
              >
                <!-- Date Column -->
                <td class="cell-date" data-label="Added On">
                  <!-- New message indicator for any row with isNew -->
                  @if (note.isNew) {
                    <span class="new-msg-pill">New</span>
                  }
                  <!-- Only show Admin badge for MsgType 4 (Location Notes) -->
                  @if (note.msgType === 4) {
                    <span class="entity-pill pill--admin">Admin</span>
                  }
                  <span class="date-text">{{ note.dateInString || (note.addedOn | date:'M/d/yyyy h:mm a') }}</span>
                </td>

                <!-- From Column -->
                <td class="cell-from" data-label="From">
                  <!-- MsgType 1,2,3: Admin pill -->
                  @if (note.msgType === 1 || note.msgType === 2 || note.msgType === 3) {
                    <span class="entity-pill pill--admin">Admin</span>
                  }
                  <!-- MsgType 9: Customer pill -->
                  @if (note.msgType === 9) {
                    <span class="entity-pill pill--customer">Customer</span>
                  }
                  <!-- MsgType 11: Vendor pill -->
                  @if (note.msgType === 11) {
                    <span class="entity-pill pill--vendor">Vendor</span>
                  }
                  <span [innerHTML]="sanitize(note.fromMsg || note.addedByName || '--')"></span>
                </td>

                <!-- To Column -->
                <td class="cell-to" data-label="To">
                  <!-- MsgType 1: Customer pill -->
                  @if (note.msgType === 1) {
                    <span class="entity-pill pill--customer">Customer</span>
                  }
                  <!-- MsgType 2: Admin pill (Internal) -->
                  @if (note.msgType === 2) {
                    <span class="entity-pill pill--admin">Admin</span>
                  }
                  <!-- MsgType 3: Vendor pill -->
                  @if (note.msgType === 3) {
                    <span class="entity-pill pill--vendor">Vendor</span>
                  }
                  <!-- MsgType 9,11: Admin pill -->
                  @if (note.msgType === 9 || note.msgType === 11) {
                    <span class="entity-pill pill--admin">Admin</span>
                  }
                  <span [innerHTML]="sanitize(note.toMsg || '--')"></span>
                
                </td>

                <!-- Message Column -->
                <td class="cell-message" data-label="Message">
                  @if (note.title && isActionNote(note)) {
                    <strong class="note-title action-title">{{ note.title }}</strong>
                  } @else if (note.title) {
                    <strong class="note-title">{{ note.title }}</strong>
                  }
                  <div class="note-content" [innerHTML]="sanitize(note.comment)"></div>
                  @if (note.fileLinks) {
                    <div class="note-files" [innerHTML]="sanitize(note.fileLinks)"></div>
                  }
                </td>

                <!-- Control Column -->
                <td class="cell-control" data-label="Actions">
                  <!-- Viewed: internal (2), customer-to-admin (9), vendor-to-admin (11) when unread -->
                  @if (showMarkViewedButton(note)) {
                    <button 
                      class="btn-control btn-viewed" 
                      (click)="onMarkViewed(note)"
                      title="Mark as viewed"
                    >
                      Viewed
                    </button>
                  }

                  <!-- Forward button for all messages -->
                  <button 
                    class="btn-control btn-forward" 
                    (click)="onForward(note)"
                    title="Forward this note"
                  >
                    Forward
                  </button>

                  <!-- Reply: human message types, or every row when host enables (e.g. Notes To Accounting) -->
                  @if (showReplyForAllNotes || isHumanMessage(note)) {
                    <button 
                      class="btn-control btn-reply" 
                      (click)="onReply(note)"
                      title="Reply to this message"
                    >
                      Reply
                    </button>
                  }

                  <!-- Pin button for all messages -->
                  @if (showPinAction) {
                    <button 
                      class="btn-control btn-pin"
                      [class.btn-pin--active]="note.isPinned"
                      (click)="onPin(note)"
                      [title]="note.isPinned ? 'Unpin this note' : 'Pin this note'"
                    >
                      {{ note.isPinned ? 'Unpin' : 'Pin' }}
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="empty-row">
                  @if (searchTerm()) {
                    <p>No notes match your search</p>
                    <button class="clear-search" (click)="clearSearch()">Clear search</button>
                  } @else {
                    <p>No notes available</p>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: `
    .notes-grid-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
    }

    .grid-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      background: var(--surface-alt, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 8px;
      flex: 1;
      max-width: 400px;

      svg {
        width: 18px;
        height: 18px;
        color: var(--text-muted, #94a3b8);
        flex-shrink: 0;
      }

      input {
        flex: 1;
        border: none;
        background: transparent;
        font-size: 0.9rem;
        color: var(--text-primary, #1e293b);
        outline: none;

        &::placeholder {
          color: var(--text-muted, #94a3b8);
        }
      }
    }

    .action-buttons {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: var(--surface-alt, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-secondary, #64748b);
      cursor: pointer;
      transition: all 0.15s;

      svg {
        width: 16px;
        height: 16px;
      }

      &:hover {
        background: var(--surface-hover, #f1f5f9);
        border-color: var(--primary-color, #3b82f6);
        color: var(--primary-color, #3b82f6);
      }
    }

    .notes-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .note-card {
      position: relative;
      padding: 16px 20px;
      background: var(--surface-color, #fff);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 10px;
      transition: all 0.2s ease;

      &:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      }

      &--unread {
        border-left: 4px solid var(--danger-color, #ef4444);
        background: linear-gradient(90deg, rgba(239, 68, 68, 0.03) 0%, transparent 30%);
        animation: unreadPulse 3s ease-in-out infinite;
      }

      &--pinned {
        background: linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%);
        border-color: #fcd34d;
      }
    }

    @keyframes unreadPulse {
      0%, 100% {
        border-left-color: var(--danger-color, #ef4444);
      }
      50% {
        border-left-color: rgba(239, 68, 68, 0.5);
      }
    }

    .unread-indicator {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 10px;
      height: 10px;
      background: var(--danger-color, #ef4444);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.6;
        transform: scale(1.2);
      }
    }

    .note-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }

    .note-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .note-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      font-size: 0.7rem;
      font-weight: 600;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.3px;

      svg {
        width: 12px;
        height: 12px;
      }

      &--pinned {
        background: #fbbf24;
        color: #78350f;
      }
    }

    .note-vendor {
      font-size: 0.8rem;
      color: var(--text-secondary, #64748b);
      font-style: italic;
    }

    .note-date {
      font-size: 0.8rem;
      color: var(--text-muted, #94a3b8);
      white-space: nowrap;
    }

    .note-title {
      margin: 0 0 8px;
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary, #1e293b);
      line-height: 1.4;
    }

    .note-content {
      font-size: 0.9rem;
      color: var(--text-secondary, #475569);
      line-height: 1.6;
      margin-bottom: 12px;

      :host ::ng-deep {
        p { margin: 0 0 8px; }
        ul, ol { margin: 8px 0; padding-left: 20px; }
        a { color: var(--primary-color, #3b82f6); }
        blockquote {
          border-left: 3px solid var(--border-color, #e2e8f0);
          padding-left: 12px;
          margin: 8px 0;
          color: var(--text-muted, #64748b);
          font-style: italic;
        }
      }
    }

    .note-footer {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color, #e2e8f0);
      flex-wrap: wrap;
    }

    .note-author {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      color: var(--text-secondary, #64748b);

      svg {
        width: 16px;
        height: 16px;
        color: var(--text-muted, #94a3b8);
      }
    }

    .note-attachments {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.8rem;
      color: var(--text-muted, #94a3b8);

      svg {
        width: 14px;
        height: 14px;
      }
    }

    .note-actions {
      display: flex;
      gap: 6px;
      margin-left: auto;
    }

    .note-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: var(--surface-alt, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;

      svg {
        width: 16px;
        height: 16px;
        color: var(--text-secondary, #64748b);
      }

      &:hover {
        background: var(--primary-color, #3b82f6);
        border-color: var(--primary-color, #3b82f6);

        svg {
          color: #fff;
        }
      }

      &--active {
        background: #fbbf24;
        border-color: #f59e0b;

        svg {
          color: #78350f;
        }
      }

      &--danger:hover {
        background: var(--danger-color, #ef4444);
        border-color: var(--danger-color, #ef4444);
      }
    }

    .no-results {
      text-align: center;
      padding: 32px;
      color: var(--text-muted, #94a3b8);

      p {
        margin: 0 0 12px;
        font-size: 0.95rem;
      }
    }

    .clear-search {
      background: none;
      border: none;
      color: var(--primary-color, #3b82f6);
      font-size: 0.9rem;
      cursor: pointer;
      text-decoration: underline;

      &:hover {
        color: var(--primary-hover, #2563eb);
      }
    }

    /* Table Styles (Legacy-style grid) */
    .notes-table-wrapper {
      overflow-x: auto;
    }

    .notes-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;

      th, td {
        padding: 10px 12px;
        text-align: left;
        border: 1px solid var(--border-color, #e2e8f0);
        vertical-align: top;
      }

      th {
        background: var(--surface-alt, #f8fafc);
        font-weight: 600;
        color: var(--text-primary, #1e293b);
        white-space: nowrap;
      }

      tbody tr {
        transition: background 0.15s;

        &:hover {
          filter: brightness(0.97);
        }
      }

      .row-human-msg {
        background: #ffffff;
      }

      .row-action-note {
        /* bgColor applied via inline style */
      }
    }

    .cell-date {
      .entity-pill {
        display: inline-block;
        padding: 2px 8px;
        font-size: 0.65rem;
        font-weight: 600;
        border-radius: 10px;
        margin-bottom: 4px;
        margin-right: 4px;
        text-transform: uppercase;
      }

      .pill--admin {
        background: #dbeafe;
        color: #1e40af;
      }

      .new-msg-pill {
        display: inline-block;
        padding: 2px 6px;
        font-size: 0.6rem;
        font-weight: 700;
        background: #ef4444;
        color: #fff;
        border-radius: 8px;
        margin-right: 4px;
        animation: pulse-new 1.5s infinite;
      }

      @keyframes pulse-new {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .date-text {
        display: block;
        font-size: 0.8rem;
        color: var(--text-secondary, #64748b);
        margin-top: 4px;
      }
    }

    .cell-from, .cell-to {
      color: var(--text-secondary, #475569);
      font-size: 0.85rem;

      .entity-pill {
        display: inline-block;
        padding: 2px 8px;
        font-size: 0.65rem;
        font-weight: 600;
        border-radius: 10px;
        margin-right: 6px;
        margin-bottom: 2px;
        text-transform: uppercase;
        vertical-align: middle;
      }

      .pill--admin {
        background: #dbeafe;
        color: #1e40af;
      }

      .pill--customer {
        background: #fce7f3;
        color: #9d174d;
      }

      .pill--vendor {
        background: #d1fae5;
        color: #065f46;
      }

      :host ::ng-deep {
        .entity-pill {
          display: inline-block;
          padding: 2px 8px;
          font-size: 0.65rem;
          font-weight: 600;
          border-radius: 10px;
          margin-right: 6px;
          margin-bottom: 2px;
          text-transform: uppercase;
          vertical-align: middle;
        }

        .pill--admin {
          background: #dbeafe;
          color: #1e40af;
        }

        .pill--customer {
          background: #fce7f3;
          color: #9d174d;
        }

        .pill--vendor {
          background: #d1fae5;
          color: #065f46;
        }
      }
    }

    .cell-message {
      .note-title {
        display: block;
        margin-bottom: 6px;
        color: var(--text-primary, #1e293b);
        font-size: 0.9rem;
      }

      .action-title {
        color: #0f766e;
        font-style: italic;
      }

      .note-content {
        line-height: 1.5;
        color: var(--text-secondary, #475569);

        :host ::ng-deep {
          p { margin: 0 0 6px; }
          table { 
            width: 100%; 
            border-collapse: collapse;
            margin: 8px 0;
            font-size: 0.8rem;
          }
          table th, table td {
            padding: 4px 8px;
            border: 1px solid #ddd;
          }
          a { color: var(--primary-color, #3b82f6); }
        }
      }

      .note-files {
        margin-top: 8px;
        
        :host ::ng-deep a {
          color: var(--primary-color, #3b82f6);
          text-decoration: underline;
        }
      }
    }

    .cell-control {
      .btn-control {
        display: block;
        width: 100%;
        padding: 5px 10px;
        margin: 3px 0;
        font-size: 0.75rem;
        font-weight: 500;
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
        text-align: center;
      }

      .btn-viewed {
        background: #2563eb;
        color: #fff;
        border-color: #2563eb;

        &:hover {
          background: #1d4ed8;
        }
      }

      .btn-forward {
        background: #f8fafc;
        color: #64748b;
        border-color: #cbd5e1;

        &:hover {
          background: #6366f1;
          border-color: #6366f1;
          color: #fff;
        }
      }

      .btn-reply {
        background: #f8fafc;
        color: #64748b;
        border-color: #cbd5e1;

        &:hover {
          background: #10b981;
          border-color: #10b981;
          color: #fff;
        }
      }

      .btn-pin {
        background: #f8fafc;
        color: #64748b;
        border-color: #cbd5e1;

        &:hover {
          background: #fbbf24;
          border-color: #f59e0b;
          color: #78350f;
        }

        &--active {
          background: #fbbf24;
          border-color: #f59e0b;
          color: #78350f;
        }
      }
    }

    .empty-row {
      text-align: center;
      padding: 24px;
      color: var(--text-muted, #94a3b8);
    }

    @media (max-width: 768px) {
      .notes-grid-container {
        padding: 10px;
        gap: 12px;
      }

      .grid-actions {
        flex-direction: column;
        align-items: stretch;
      }

      .search-box {
        max-width: 100%;
        min-height: 44px;
        padding: 10px 14px;

        input {
          font-size: 16px;
        }
      }

      .action-buttons {
        width: 100%;
      }

      .action-btn {
        width: 100%;
        justify-content: center;
        min-height: 44px;
        padding: 10px 14px;
      }

      .notes-table-wrapper {
        overflow-x: visible;
      }

      .notes-table {
        min-width: 0;
        font-size: 0.875rem;

        thead {
          display: none;
        }

        tbody tr {
          display: block;
          margin-bottom: 14px;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 10px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);

          &:hover {
            filter: none;
          }
        }

        td {
          display: block;
          width: 100%;
          border: none;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          padding: 12px 14px;

          &:last-child {
            border-bottom: none;
          }

          &::before {
            content: attr(data-label);
            display: block;
            font-size: 0.68rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-muted, #94a3b8);
            margin-bottom: 6px;
          }
        }

        .empty-row {
          display: block;
          border: none;
          box-shadow: none;
          background: transparent;

          &::before {
            display: none;
          }
        }
      }

      .cell-date .date-text {
        font-size: 0.875rem;
      }

      .cell-from,
      .cell-to {
        font-size: 0.875rem;
        word-break: break-word;
      }

      .cell-message .note-content {
        font-size: 0.875rem;
        word-break: break-word;
      }

      .cell-control {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;

        &::before {
          grid-column: 1 / -1;
        }

        .btn-control {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 40px;
          margin: 0;
          padding: 8px 10px;
          font-size: 0.8rem;
        }
      }
    }

    @media (max-width: 480px) {
      .notes-grid-container {
        padding: 8px;
      }

      .cell-control {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class NotesGridComponent {
  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Signal input so `filteredNotes` computed re-runs when the parent tab changes the list.
   * (A plain @Input is not tracked by computed(); the grid would stay stuck on the first array.)
   */
  readonly notes = input<NoteItem[]>([]);
  @Input() showPinAction = true;
  /**
   * When true, every row gets Reply (same handler as human messages). Used for Notes To Accounting
   * where rows include MsgType 8 (admin action) that are not in {@link HUMAN_MESSAGE_TYPES}.
   */
  @Input() showReplyForAllNotes = false;
  @Input() isPinnedSection = false;
  @Input() adminName = 'Admin';

  @Output() pinNote = new EventEmitter<{ noteKey: string; isPinned: boolean; msgType: number }>();
  @Output() viewNote = new EventEmitter<{ noteKey: string; msgType: number }>();
  @Output() deleteNote = new EventEmitter<{ noteKey: string; msgType: number }>();
  @Output() replyNote = new EventEmitter<{ note: NoteItem; replyContent: string }>();
  @Output() forwardNote = new EventEmitter<{ note: NoteItem; forwardContent: string }>();

  searchTerm = signal('');

  /** Check if note is a human-created message (MsgType 1,2,3,9,11) */
  isHumanMessage(note: NoteItem): boolean {
    return HUMAN_MESSAGE_TYPES.includes(note.noteType);
  }

  /** Check if note is an action/system note (MsgType 4,5,6,7,8) */
  isActionNote(note: NoteItem): boolean {
    return ACTION_NOTE_TYPES.includes(note.noteType);
  }

  /** Get row inline style - applies bgColor from data to highlight row */
  getRowStyle(note: NoteItem): string {
    if (note.bgColor) {
      return `background-color: ${note.bgColor};`;
    }
    return '';
  }

  /** Filter and sort notes by date descending */
  filteredNotes = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const source = this.notes();
    let filtered = source;

    if (term) {
      filtered = source.filter(note =>
        (note.title?.toLowerCase().includes(term)) ||
        (note.comment?.toLowerCase().includes(term)) ||
        (note.addedByName?.toLowerCase().includes(term)) ||
        (note.fromMsg?.toLowerCase().includes(term)) ||
        (note.toMsg?.toLowerCase().includes(term)) ||
        (note.vendorName?.toLowerCase().includes(term))
      );
    }

    // Sort by date descending (newest first)
    return [...filtered].sort((a, b) => {
      const dateA = a.addedOn ? new Date(a.addedOn).getTime() : 0;
      const dateB = b.addedOn ? new Date(b.addedOn).getTime() : 0;
      return dateB - dateA;
    });
  });

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  sanitize(html: string | null): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html || '');
  }

  /** Sanitize HTML and remove img tags from content */
  sanitizeWithoutImages(html: string | null): SafeHtml {
    if (!html) return this.sanitizer.bypassSecurityTrustHtml('');
    const cleanedHtml = html.replace(/<img[^>]*>/gi, '');
    return this.sanitizer.bypassSecurityTrustHtml(cleanedHtml);
  }

  /**
   * Get human-readable label for note type based on MsgType
   */
  getNoteTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      adminToCustomer: 'To Customer',
      adminToAdmin: 'Internal',
      adminToVendor: 'To Vendor',
      noteToLocation: 'Location',
      vendorAction: 'Vendor Action',
      customerAction: 'Customer Action',
      systemGenerated: 'System',
      adminAction: 'Admin Action',
      customerToAdmin: 'From Customer',
      vendorToAdmin: 'From Vendor',
    };
    return labels[type] || '';
  }

  /** MsgTypes that support mark-as-viewed in this grid (must match Job Ops mark-viewed API). */
  showMarkViewedButton(note: NoteItem): boolean {
    if (!note.isNew) return false;
    const mt = Number(note.msgType);
    return mt === 2 || mt === 9 || mt === 11;
  }

  /** Mark note as viewed (MsgType 2 internal, 9 customer, 11 vendor when unread). */
  onMarkViewed(note: NoteItem): void {
    const msgType = Number(note.msgType);
    this.viewNote.emit({
      noteKey: note.noteKey,
      msgType: Number.isFinite(msgType) ? msgType : 2,
    });
  }

  /** Pin/Unpin note - calls API and refreshes grid */
  onPin(note: NoteItem): void {
    this.pinNote.emit({ noteKey: note.noteKey, isPinned: !note.isPinned, msgType: note.msgType });
  }

  /** 
   * Reply to message - copies msg body with prefix
   * Format: "Reply from {Admin Name}\nOriginal Message: {Msg body}"
   */
  onReply(note: NoteItem): void {
    const originalContent = this.stripHtml(note.comment || '');
    const replyContent = `<p><strong>Reply from ${this.adminName}</strong></p><p><strong>Original Message:</strong> ${note.comment || ''}</p>`;
    this.replyNote.emit({ note, replyContent });
  }

  /** Forward message - copies msg body to editor */
  onForward(note: NoteItem): void {
    const forwardContent = note.comment || '';
    this.forwardNote.emit({ note, forwardContent });
  }

  onDelete(note: NoteItem): void {
    this.deleteNote.emit({ noteKey: note.noteKey, msgType: note.msgType });
  }

  exportToExcel(): void {
    const data = this.notes().map(note => ({
      'Date': note.dateInString || (note.addedOn ? new Date(note.addedOn).toLocaleString() : ''),
      'Type': this.getNoteTypeLabel(note.noteType),
      'From': this.stripHtml(note.fromMsg || note.addedByName || ''),
      'To': this.stripHtml(note.toMsg || ''),
      'Title': note.title || '',
      'Message': this.stripHtml(note.comment || ''),
      'Pinned': note.isPinned ? 'Yes' : 'No',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Notes');

    const fileName = `notes_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  private stripHtml(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }
}
