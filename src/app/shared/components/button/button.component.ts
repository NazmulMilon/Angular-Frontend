import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Common Button Component
 * Matches the "Send & Select W/O" button in data-grid exactly.
 *
 * Usage:
 * <app-button variant="primary" (clicked)="onSave()">Save</app-button>
 * <app-button variant="secondary" size="sm">Cancel</app-button>
 * <app-button variant="danger" [disabled]="true">Delete</app-button>
 */
@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type"
      [disabled]="disabled || loading"
      [class]="buttonClasses"
      (click)="onClick($event)"
    >
      @if (loading) {
        <span class="btn__spinner"></span>
      }
      <ng-content></ng-content>
    </button>
  `,
  styles: [`
    :host {
      display: inline-block;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: #fff;
      font-family: var(--font-family, 'Inter', sans-serif);
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      text-decoration: none;
      outline: none;
      color: var(--text-primary, #334155);

      &:hover:not(:disabled) {
        background: var(--surface-alt, #f1f5f9);
        border-color: var(--border-hover, #cbd5e1);
      }

      &:focus-visible {
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    /* Sizes */
    .btn--sm {
      padding: 3px 8px;
      font-size: 0.7rem;
    }

    .btn--md {
      padding: 4px 10px;
      font-size: 0.78rem;
    }

    .btn--lg {
      padding: 6px 14px;
      font-size: 0.85rem;
    }

    /* Primary - Indigo (matches "Send & Select W/O" exactly) */
    .btn--primary {
      background: var(--primary-color, #6366f1);
      color: #fff;
      border-color: var(--primary-color, #6366f1);

      &:hover:not(:disabled) {
        background: var(--primary-hover, #4f46e5);
        border-color: var(--primary-hover, #4f46e5);
      }

      &:active:not(:disabled) {
        background: #4338ca;
        border-color: #4338ca;
      }
    }

    /* Secondary */
    .btn--secondary {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;

      &:hover:not(:disabled) {
        background: #e2e8f0;
        border-color: #cbd5e1;
      }

      &:active:not(:disabled) {
        background: #cbd5e1;
      }
    }

    /* Danger */
    .btn--danger {
      color: #dc2626;
      border-color: #fecaca;
      background: #fff;

      &:hover:not(:disabled) {
        background: #fef2f2;
        border-color: #dc2626;
      }

      &:active:not(:disabled) {
        background: #fee2e2;
      }
    }

    /* Success */
    .btn--success {
      color: #16a34a;
      border-color: #bbf7d0;
      background: #fff;

      &:hover:not(:disabled) {
        background: #f0fdf4;
        border-color: #16a34a;
      }

      &:active:not(:disabled) {
        background: #dcfce7;
      }
    }

    /* Warning */
    .btn--warning {
      color: #d97706;
      border-color: #fde68a;
      background: #fff;

      &:hover:not(:disabled) {
        background: #fffbeb;
        border-color: #d97706;
      }

      &:active:not(:disabled) {
        background: #fef3c7;
      }
    }

    /* Outline */
    .btn--outline {
      background: transparent;
      color: var(--primary-color, #6366f1);
      border: 1px solid var(--primary-color, #6366f1);

      &:hover:not(:disabled) {
        background: rgba(99, 102, 241, 0.08);
      }

      &:active:not(:disabled) {
        background: rgba(99, 102, 241, 0.12);
      }
    }

    /* Ghost */
    .btn--ghost {
      background: transparent;
      color: #64748b;
      border-color: transparent;

      &:hover:not(:disabled) {
        background: #f1f5f9;
        color: #334155;
      }

      &:active:not(:disabled) {
        background: #e2e8f0;
      }
    }

    /* Loading spinner */
    .btn__spinner {
      width: 12px;
      height: 12px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* Full width */
    .btn--full-width {
      width: 100%;
    }
  `],
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() fullWidth = false;

  @Output() clicked = new EventEmitter<MouseEvent>();

  get buttonClasses(): string {
    const classes = ['btn', `btn--${this.variant}`, `btn--${this.size}`];
    if (this.fullWidth) {
      classes.push('btn--full-width');
    }
    return classes.join(' ');
  }

  onClick(event: MouseEvent): void {
    if (!this.disabled && !this.loading) {
      this.clicked.emit(event);
    }
  }
}
