import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  ElementRef,
  HostListener,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SelectOption {
  key: string;
  label: string;
}

@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="ms-wrapper">
      @if (label) {
        <label class="ms-label">{{ label }}</label>
      }
      <div class="ms-trigger" [class.ms-trigger--open]="isOpen()" (click)="toggle()">
        <span class="ms-trigger__text" [class.ms-trigger__text--placeholder]="selectedKeys.length === 0">
          @if (selectedKeys.length === 0) {
            {{ placeholder }}
          } @else if (selectedKeys.length === 1) {
            {{ selectedLabel() }}
          } @else {
            {{ selectedKeys.length }} selected
          }
        </span>
        <span class="ms-trigger__actions">
          @if (selectedKeys.length > 0) {
            <button class="ms-trigger__clear" (click)="clearAll($event)" title="Clear selection">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          }
          <svg class="ms-trigger__arrow" [class.ms-trigger__arrow--up]="isOpen()" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>

      @if (isOpen()) {
        <div class="ms-dropdown">
          @if (options.length > 6) {
            <div class="ms-search">
              <input
                type="text"
                class="ms-search__input"
                placeholder="Search..."
                [value]="searchText()"
                (input)="onSearch($event)"
                (click)="$event.stopPropagation()"
              />
            </div>
          }
          <div class="ms-options">
            @if (filteredOptions().length === 0) {
              <div class="ms-empty">No options found</div>
            }
            @for (opt of filteredOptions(); track opt.key) {
              <label class="ms-option" (click)="$event.stopPropagation()">
                <input
                  type="checkbox"
                  [checked]="isSelected(opt.key)"
                  (change)="toggleOption(opt.key)"
                />
                <span class="ms-option__check"></span>
                <span class="ms-option__label">{{ opt.label }}</span>
              </label>
            }
          </div>
          @if (selectedKeys.length > 0) {
            <div class="ms-footer">
              <button class="ms-clear" (click)="clearAll($event)">Clear all</button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .ms-wrapper {
      position: relative;
      min-width: 180px;
    }

    .ms-label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary, #64748b);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .ms-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: var(--radius-md, 8px);
      background: var(--surface-color, #fff);
      cursor: pointer;
      transition: all 0.15s ease;
      min-height: 38px;

      &:hover {
        border-color: var(--border-hover, #cbd5e1);
      }

      &--open {
        border-color: var(--primary-color, #3b82f6);
        box-shadow: 0 0 0 2px var(--primary-light, #dbeafe);
      }
    }

    .ms-trigger__text {
      font-size: 0.875rem;
      color: var(--text-primary, #1e293b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      &--placeholder {
        color: var(--text-muted, #94a3b8);
      }
    }

    .ms-trigger__actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .ms-trigger__clear {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--border-color, #e2e8f0);
      color: var(--text-secondary, #64748b);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: #dc2626;
        color: #fff;
      }
    }

    .ms-trigger__arrow {
      flex-shrink: 0;
      color: var(--text-secondary, #64748b);
      transition: transform 0.2s ease;

      &--up {
        transform: rotate(180deg);
      }
    }

    .ms-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      min-width: 220px;
      background: var(--surface-color, #fff);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: var(--radius-md, 8px);
      box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.07));
      z-index: 100;
      overflow: hidden;
    }

    .ms-search {
      padding: 8px;
      border-bottom: 1px solid var(--border-light, #f1f5f9);
    }

    .ms-search__input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: var(--radius-sm, 6px);
      font-size: 0.8rem;
      outline: none;
      color: var(--text-primary, #1e293b);

      &:focus {
        border-color: var(--primary-color, #3b82f6);
      }
    }

    .ms-options {
      max-height: 220px;
      overflow-y: auto;
      padding: 4px 0;
    }

    .ms-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      cursor: pointer;
      transition: background 0.1s ease;
      font-size: 0.85rem;
      color: var(--text-primary, #1e293b);

      &:hover {
        background: var(--surface-alt, #f8fafc);
      }

      input[type="checkbox"] {
        display: none;
      }
    }

    .ms-option__check {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      border: 1.5px solid var(--border-color, #e2e8f0);
      border-radius: 4px;
      background: #fff;
      position: relative;
      transition: all 0.15s ease;

      input:checked + & {
        background: var(--primary-color, #3b82f6);
        border-color: var(--primary-color, #3b82f6);

        &::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 5px;
          width: 4px;
          height: 7px;
          border: solid #fff;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
      }
    }

    .ms-option__label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ms-empty {
      padding: 16px 12px;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted, #94a3b8);
      font-style: italic;
    }

    .ms-footer {
      padding: 6px 8px;
      border-top: 1px solid var(--border-light, #f1f5f9);
      text-align: right;
    }

    .ms-clear {
      padding: 4px 10px;
      font-size: 0.78rem;
      border: none;
      background: none;
      color: var(--primary-color, #3b82f6);
      cursor: pointer;
      font-weight: 500;

      &:hover {
        text-decoration: underline;
      }
    }
  `,
})
export class MultiSelectComponent {
  private readonly elRef = inject(ElementRef);

  @Input() options: SelectOption[] = [];
  @Input() selectedKeys: string[] = [];
  @Input() placeholder = 'Select...';
  @Input() label = '';
  @Output() selectedKeysChange = new EventEmitter<string[]>();

  readonly isOpen = signal(false);
  readonly searchText = signal('');

  filteredOptions(): SelectOption[] {
    const term = this.searchText().toLowerCase().trim();
    if (!term) return this.options;
    return this.options.filter((o) => o.label.toLowerCase().includes(term));
  }

  selectedLabel(): string {
    if (this.selectedKeys.length !== 1) return '';
    const match = this.options.find((o) => o.key === this.selectedKeys[0]);
    return match?.label ?? '1 selected';
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
      this.searchText.set('');
    }
  }

  toggle(): void {
    this.isOpen.update((v) => !v);
    if (!this.isOpen()) this.searchText.set('');
  }

  isSelected(key: string): boolean {
    return this.selectedKeys.includes(key);
  }

  toggleOption(key: string): void {
    const updated = this.isSelected(key)
      ? this.selectedKeys.filter((k) => k !== key)
      : [...this.selectedKeys, key];
    this.selectedKeysChange.emit(updated);
  }

  clearAll(event: MouseEvent): void {
    event.stopPropagation();
    this.selectedKeysChange.emit([]);
  }

  onSearch(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }
}
