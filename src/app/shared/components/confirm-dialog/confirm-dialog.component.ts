import { Component, ElementRef, effect, signal, viewChild } from '@angular/core';

export interface ConfirmOptions {
  /** Heading shown at the top of the dialog. */
  title?: string;
  /** Main body text — the question being confirmed. */
  message: string;
  /** Label for the confirm (proceed) button. */
  confirmText?: string;
  /** Label for the cancel (dismiss) button. */
  cancelText?: string;
  /** Visual tone of the confirm button. 'danger' for destructive actions (default). */
  tone?: 'danger' | 'primary';
}

/**
 * Reusable, styled confirmation dialog — the in-app replacement for the native
 * `window.confirm()` popup (which renders as an ugly "localhost:4200 says…" browser
 * alert). Drop `<app-confirm-dialog />` once in a host template, grab it with
 * `viewChild.required(ConfirmDialogComponent)`, then `await dialog().open({ … })`,
 * which resolves `true` (confirmed) or `false` (cancelled/dismissed).
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class ConfirmDialogComponent {
  protected readonly isVisible = signal(false);
  protected readonly title = signal('Please confirm');
  protected readonly message = signal('');
  protected readonly confirmText = signal('Confirm');
  protected readonly cancelText = signal('Cancel');
  protected readonly tone = signal<'danger' | 'primary'>('danger');

  private readonly cancelBtn = viewChild<ElementRef<HTMLButtonElement>>('cancelBtn');
  private resolver: ((value: boolean) => void) | null = null;

  constructor() {
    // Focus the (safer) Cancel button whenever the dialog opens, so Enter/Space
    // don't fall on the destructive action and Esc has a focus target.
    effect(() => {
      if (this.isVisible()) {
        this.cancelBtn()?.nativeElement.focus();
      }
    });
  }

  /** Open the dialog and resolve true (confirmed) or false (cancelled/dismissed). */
  open(options: ConfirmOptions): Promise<boolean> {
    this.title.set(options.title ?? 'Please confirm');
    this.message.set(options.message);
    this.confirmText.set(options.confirmText ?? 'Confirm');
    this.cancelText.set(options.cancelText ?? 'Cancel');
    this.tone.set(options.tone ?? 'danger');
    this.isVisible.set(true);
    return new Promise<boolean>((resolve) => (this.resolver = resolve));
  }

  protected confirm(): void {
    this.settle(true);
  }

  protected cancel(): void {
    this.settle(false);
  }

  protected onEscape(): void {
    if (this.isVisible()) this.settle(false);
  }

  private settle(result: boolean): void {
    if (!this.isVisible()) return;
    this.isVisible.set(false);
    const resolve = this.resolver;
    this.resolver = null;
    resolve?.(result);
  }
}
