import { Component, Input, signal } from '@angular/core';

/**
 * Reusable collapsible accordion component.
 * Supports open/closed default state and animated expand/collapse.
 */
@Component({
  selector: 'app-accordion',
  standalone: true,
  template: `
    <div
      class="accordion"
      [class.accordion--open]="isOpen()"
      [class.accordion--primary]="variant === 'primary'"
      [class.accordion--figma]="variant === 'figma'"
      [class.accordion--figma-compact]="variant === 'figmaCompact'"
      [class.accordion--figma-section]="variant === 'figmaSection'"
    >
      <div
        class="accordion__header"
        role="button"
        tabindex="0"
        [attr.aria-expanded]="isOpen()"
        (click)="onHeaderClick($event)"
        (keydown)="onHeaderKeydown($event)"
      >
        <span class="accordion__title" [attr.title]="null">{{ heading }}</span>
        @if (badge) {
          <span class="accordion__badge">{{ badge }}</span>
        }
        <span class="accordion__header-actions">
          <ng-content select="[accordionHeaderActions]" />
        </span>
        @if (isFigmaLike()) {
          <span class="accordion__figma-toggle" aria-hidden="true">
            @if (isOpen()) {
              <span class="accordion__figma-minus"></span>
            } @else {
              <span class="accordion__figma-plus">
                <span></span>
                <span></span>
              </span>
            }
          </span>
        } @else {
          <svg
            class="accordion__chevron"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
          >
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        }
      </div>
      <div class="accordion__body">
        <div class="accordion__content">
          <ng-content />
        </div>
      </div>
    </div>
  `,
  styles: `
    .accordion {
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 10px;
      overflow: hidden;
      background: var(--surface-color, #fff);
      transition: box-shadow 0.2s ease;

      &:hover {
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
      }
    }

    .accordion--figma-section {
      border-radius: 12px;
      border-color: #e4e7ec;
    }

    .accordion__header {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 14px 20px;
      border: none;
      background: var(--surface-alt, #f8fafc);
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary, #1e293b);
      gap: 10px;
      transition: background 0.15s ease;

      &:hover {
        background: var(--surface-hover, #f1f5f9);
      }
    }

    .accordion__title {
      flex: 1;
      text-align: left;
    }

    .accordion__badge {
      background: var(--primary-color, #3b82f6);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 2px 10px;
      border-radius: 12px;
      min-width: 24px;
      text-align: center;
    }

    .accordion--figma .accordion__header,
    .accordion--figma-compact .accordion__header {
      background: #fafbfc;
      border-bottom: 1px solid #eef0f3;
      color: #0f1729;
      padding: 12px 16px;
      gap: 8px;
      font-weight: 600;
      min-height: 54px;

      &:hover {
        background: #f4f5f7;
      }
    }

    .accordion--figma-compact .accordion__header {
      min-height: 45px;
      padding: 10px 14px;
    }

    .accordion--figma .accordion__title {
      font-size: 13.5px;
      line-height: 1.45;
      letter-spacing: -0.06px;
      flex: 0 0 auto;
    }

    .accordion--figma-compact .accordion__title {
      font-size: 12px;
      line-height: 1.35;
      letter-spacing: -0.04px;
      flex: 0 0 auto;
    }

    .accordion--figma .accordion__header-actions,
    .accordion--figma-compact .accordion__header-actions {
      flex: 1;
      overflow: hidden;
    }

    .accordion--figma .accordion__badge,
    .accordion--figma-compact .accordion__badge {
      background: #f4f5f7;
      color: #667085;
      font-weight: 600;
      font-size: 11px;
      line-height: 1;
      border-radius: 999px;
      min-width: 22px;
      padding: 4px 7px;
    }

    .accordion__figma-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      border: 1px solid #d5dae2;
      background: #fff;
      color: #64748b;
      flex-shrink: 0;
    }

    .accordion__figma-plus,
    .accordion__figma-minus {
      position: relative;
      display: block;
      width: 10px;
      height: 10px;
    }

    .accordion__figma-minus::before,
    .accordion__figma-plus span {
      position: absolute;
      display: block;
      content: '';
      left: 0;
      top: 50%;
      width: 10px;
      height: 1.5px;
      background: currentColor;
      transform: translateY(-50%);
      border-radius: 999px;
    }

    .accordion__figma-plus span:last-child {
      transform: translateY(-50%) rotate(90deg);
    }

    .accordion--primary .accordion__header {
      background: var(--primary-color, #3b82f6);
      color: #fff;

      &:hover {
        background: var(--primary-hover, #2563eb);
      }
    }

    .accordion--primary .accordion__chevron {
      color: rgba(255, 255, 255, 0.8);
    }

    .accordion--primary .accordion__badge {
      background: rgba(255, 255, 255, 0.2);
    }

    .accordion--figma-section .accordion__header {
      background: #fafbfc;
      color: #0f1729;
      border-bottom: 1px solid #eef0f3;
      padding: 16px 20px;
      min-height: 56px;
    }

    .accordion--figma-section .accordion__title {
      font-size: 16px;
      font-weight: 700;
      flex: 0 0 auto;
    }

    .accordion--figma-section .accordion__badge {
      display: inline-flex;
      align-items: center;
      background: #f4f5f7;
      color: #475569;
      font-size: 11.5px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      min-width: 24px;
      text-align: center;
    }

    .accordion__header-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .accordion__chevron {
      transition: transform 0.25s ease;
      color: var(--text-secondary, #64748b);
      flex-shrink: 0;
    }

    .accordion--open .accordion__chevron {
      transform: rotate(180deg);
    }

    .accordion__body {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 0.3s ease;
    }

    .accordion--open .accordion__body {
      grid-template-rows: 1fr;
    }

    .accordion__content {
      overflow: hidden;
      min-height: 0;
      max-width: 100%;
    }

    .accordion--open .accordion__content {
      overflow: visible;
    }

    /* Mobile responsive styles */
    @media (max-width: 768px) {
      .accordion__header {
        padding: 12px 14px;
        font-size: 0.88rem;
        gap: 8px;
        flex-wrap: wrap;
      }

      .accordion__title {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .accordion__badge {
        font-size: 0.7rem;
        padding: 2px 8px;
        order: 2;
      }

      .accordion__header-actions {
        order: 3;
        max-width: 100%;
      }

      .accordion--figma .accordion__header-actions,
      .accordion--figma-compact .accordion__header-actions,
      .accordion--figma-section .accordion__header-actions {
        overflow: visible;
        flex: 1 1 100%;
        width: 100%;
      }

      .accordion--figma .accordion__title,
      .accordion--figma-compact .accordion__title {
        white-space: normal;
        word-break: break-word;
        line-height: 1.3;
      }

      .accordion__chevron {
        width: 18px;
        height: 18px;
        order: 4;
      }

      .accordion__figma-toggle {
        order: 4;
        width: 18px;
        height: 18px;
      }
    }

    @media (max-width: 480px) {
      .accordion__header {
        padding: 10px 12px;
        font-size: 0.82rem;
      }

      .accordion__badge {
        font-size: 0.65rem;
        padding: 1px 6px;
      }

      .accordion__chevron {
        width: 16px;
        height: 16px;
      }

      .accordion__figma-toggle {
        width: 16px;
        height: 16px;
      }
    }
  `,
})
export class AccordionComponent {
  /**
   * Heading text shown in the accordion header.
   * Named `heading` (not `title`) so parent templates do not set the native HTML `title`
   * attribute on the host, which would show an unwanted browser tooltip on hover.
   */
  @Input({ required: true }) heading = '';

  /** Optional badge count shown next to the title */
  @Input() badge: string | number | null = null;

  /** Visual variant for accordion header styling. */
  @Input() variant: 'default' | 'primary' | 'figma' | 'figmaCompact' | 'figmaSection' = 'default';

  /** Whether the accordion starts in the open state */
  @Input() set defaultOpen(value: boolean) {
    this.isOpen.set(value);
  }

  /** Reactive open/closed state */
  isOpen = signal(false);

  /** Toggle the accordion open/closed */
  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  /** Toggle unless the click landed on an interactive child (button, link, form control). */
  onHeaderClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, [data-accordion-no-toggle]')) {
      return;
    }
    this.toggle();
  }

  onHeaderKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggle();
    }
  }

  isFigmaLike(): boolean {
    return this.variant === 'figma' || this.variant === 'figmaCompact' || this.variant === 'figmaSection';
  }
}
