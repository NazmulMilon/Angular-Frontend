import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  ElementRef,
  HostListener,
  inject,
  forwardRef,
  computed,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

export interface SearchableSelectOption {
  value: string;
  text: string;
  /** Optional secondary line (e.g. consolidator label under vendor name). */
  subtitle?: string;
  /** Alias used by vendor dropdown options from Job Ops. */
  consolidator?: string | null;
}

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelectComponent),
      multi: true,
    },
  ],
  template: `
    <div class="ss-wrapper" [class.ss-wrapper--invalid]="invalid">
      <div class="ss-trigger" [class.ss-trigger--open]="isOpen()" [class.ss-trigger--disabled]="disabled" [class.ss-trigger--multiline]="!!selectedSubtitle()" (click)="toggle()">
        <span class="ss-trigger__content">
          <span class="ss-trigger__text" [class.ss-trigger__text--placeholder]="!selectedValue()">
            {{ displayText() }}
          </span>
          @if (selectedSubtitle()) {
            <span class="ss-trigger__subtitle">{{ selectedSubtitle() }}</span>
          }
        </span>
        <span class="ss-trigger__actions">
          @if (selectedValue() && !disabled) {
            <button type="button" class="ss-trigger__clear" (click)="clear($event)" title="Clear selection">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          }
          <svg class="ss-trigger__arrow" [class.ss-trigger__arrow--up]="isOpen()" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>

      @if (isOpen()) {
        <div class="ss-dropdown">
          <div class="ss-search">
            <input
              #searchInput
              type="text"
              class="ss-search__input"
              placeholder="Type to search..."
              [value]="searchText()"
              (input)="onSearch($event)"
              (click)="$event.stopPropagation()"
              (keydown)="onKeydown($event)"
            />
          </div>
          <div class="ss-options" (scroll)="onOptionsScroll($event)">
            @if (loading) {
              <div class="ss-empty">Searching…</div>
            } @else if (filteredOptions().length === 0) {
              <div class="ss-empty">No options found</div>
            }
            @for (opt of filteredOptions(); track opt.value; let i = $index) {
              <div
                class="ss-option"
                [class.ss-option--selected]="opt.value === selectedValue()"
                [class.ss-option--highlighted]="i === highlightedIndex()"
                [class.ss-option--multiline]="!!optionSubtitle(opt)"
                (click)="selectOption(opt, $event)"
                (mouseenter)="highlightedIndex.set(i)"
              >
                <span class="ss-option__text">{{ opt.text }}</span>
                @if (optionSubtitle(opt); as sub) {
                  <span class="ss-option__subtitle">{{ sub }}</span>
                }
              </div>
            }
            @if (loadingMore) {
              <div class="ss-empty ss-empty--more">Loading more…</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    /* ── Figma node 1:1160 / 1:1166 — dropdown trigger ── */
    .ss-wrapper {
      position: relative;
      width: 100%;

      &--invalid .ss-trigger {
        border-color: #b42318;
      }
    }

    .ss-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 10px;
      border: 1px solid #e4e7ec;
      border-radius: 7px;
      background: #fff;
      cursor: pointer;
      min-height: 37px;
      height: auto;
      transition: border-color 0.15s, box-shadow 0.15s;

      &--multiline {
        padding-top: 6px;
        padding-bottom: 6px;
      }

      &:hover:not(.ss-trigger--disabled) {
        border-color: #d0d5dd;
      }

      &--open {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
      }

      &--disabled {
        background: #f9fafb;
        cursor: not-allowed;
        opacity: 0.7;
      }
    }

    .ss-trigger__content {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }

    .ss-trigger__text {
      font-size: 13px;
      font-weight: 400;
      color: #0f1729;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 18.85px;

      &--placeholder {
        color: #667085;
        font-weight: 400;
      }
    }

    .ss-trigger__subtitle {
      font-size: 11px;
      font-weight: 500;
      line-height: 1.25;
      color: #475569;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ss-trigger__actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .ss-trigger__clear {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: #eef0f3;
      color: #667085;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;

      &:hover {
        background: #fee2e2;
        color: #b42318;
      }
    }

    .ss-trigger__arrow {
      flex-shrink: 0;
      color: #667085;
      transition: transform 0.18s ease;

      &--up {
        transform: rotate(180deg);
      }
    }

    .ss-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      min-width: min(360px, calc(100vw - 32px));
      max-width: calc(100vw - 32px);
      background: #fff;
      border: 1px solid #e4e7ec;
      border-radius: 8px;
      box-shadow: 0 8px 24px -4px rgba(16, 24, 40, 0.1), 0 2px 8px -2px rgba(16, 24, 40, 0.06);
      z-index: 1000;
      overflow: hidden;
    }

    .ss-search {
      padding: 8px 8px 6px;
      border-bottom: 1px solid #f2f4f7;
    }

    .ss-search__input {
      width: 100%;
      padding: 7px 10px;
      border: 1px solid #e4e7ec;
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      color: #0f1729;
      background: #fff;

      &:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
      }

      &::placeholder {
        color: #9ea9bb;
        font-weight: 400;
      }
    }

    .ss-options {
      max-height: 260px;
      overflow-y: auto;
      padding: 4px 0;
    }

    .ss-option {
      padding: 9px 12px;
      cursor: pointer;
      transition: background 0.08s;
      font-size: 13px;
      color: #0f1729;

      &--multiline {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      &__text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &__subtitle {
        font-size: 11px;
        font-weight: 500;
        line-height: 1.25;
        color: #475569;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &:hover, &--highlighted {
        background: #f5f8ff;
      }

      &--selected {
        background: #eff4ff;
        color: #2563eb;
        font-weight: 500;

        .ss-option__subtitle {
          color: #475569;
        }
      }
    }

    .ss-empty {
      padding: 14px 12px;
      text-align: center;
      font-size: 13px;
      color: #9ea9bb;
      font-style: italic;

      &--more {
        padding: 8px 12px;
      }
    }

    /* Mobile responsive styles */
    @media (max-width: 768px) {
      .ss-wrapper {
        min-width: 100%;
      }

      .ss-trigger {
        padding: 0 12px;
        min-height: 44px;
        height: auto;
        border-radius: 10px;
      }

      .ss-trigger__text,
      .ss-trigger__subtitle {
        white-space: normal;
        word-break: break-word;
        overflow: visible;
        text-overflow: unset;
      }

      .ss-dropdown {
        min-width: 100%;
        max-width: calc(100vw - 32px);
        border-radius: 12px;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
      }

      .ss-options {
        max-height: min(240px, 45dvh);
      }

      .ss-option {
        padding: 12px 14px;
        white-space: normal;
        word-wrap: break-word;
        min-height: 44px;
        display: flex;
        align-items: center;
      }
    }

    @media (max-width: 480px) {
      .ss-trigger {
        padding: 8px 10px;
      }

      .ss-trigger__text {
        font-size: 0.82rem;
      }

      .ss-search__input {
        padding: 10px 12px;
        font-size: 0.9rem;
      }

      .ss-option {
        padding: 12px 10px;
        font-size: 0.85rem;
      }
    }
  `,
})
export class SearchableSelectComponent implements ControlValueAccessor {
  private readonly elRef = inject(ElementRef);

  /**
   * Routed through a signal (not read as a plain field) so `filteredOptions` — a `computed()` —
   * actually invalidates when the parent assigns a new array (e.g. after an infinite-scroll
   * page load). A `computed()` only re-runs when a *signal* it read changes; reading a plain
   * `@Input()` field does not register as a dependency, so new pages would render once and then
   * silently stop updating without this.
   */
  private readonly options$ = signal<SearchableSelectOption[]>([]);
  @Input() set options(value: SearchableSelectOption[]) {
    this.options$.set(value ?? []);
  }
  get options(): SearchableSelectOption[] {
    return this.options$();
  }
  @Input() placeholder = '-- Select --';
  @Input() disabled = false;
  @Input() invalid = false;
  @Input() loading = false;
  /**
   * When true, `options` is treated as already filtered by the caller (e.g. a debounced
   * server-side search) and the built-in client-side `filteredOptions` filter is skipped.
   */
  @Input() serverSideSearch = false;
  /** True while a `loadMore` page request is in flight (shows a "Loading more…" row). */
  @Input() loadingMore = false;
  /** True when the caller has more pages available — enables the scroll-near-bottom trigger. */
  @Input() hasMore = false;
  @Output() selectionChange = new EventEmitter<string>();
  /** Emits the raw search text on every keystroke — only useful when `serverSideSearch` is true. */
  @Output() searchTextChange = new EventEmitter<string>();
  /** Fires when the dropdown is scrolled near the bottom and `hasMore` is true. */
  @Output() loadMore = new EventEmitter<void>();

  readonly isOpen = signal(false);
  readonly searchText = signal('');
  readonly selectedValue = signal<string>('');
  readonly highlightedIndex = signal(0);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  filteredOptions = computed(() => {
    const options = this.options$();
    if (this.serverSideSearch) return options;
    const term = this.searchText().toLowerCase().trim();
    if (!term) return options;
    return options.filter((o) => {
      const haystack = `${o.text} ${this.optionSubtitle(o)}`.toLowerCase();
      return haystack.includes(term);
    });
  });

  displayText(): string {
    const val = this.selectedValue();
    if (!val) return this.placeholder;
    const match = this.options$().find((o) => o.value === val);
    return match?.text ?? this.placeholder;
  }

  selectedSubtitle(): string {
    const val = this.selectedValue();
    if (!val) return '';
    const match = this.options$().find((o) => o.value === val);
    return match ? this.optionSubtitle(match) : '';
  }

  optionSubtitle(opt: SearchableSelectOption): string {
    const raw = opt.subtitle ?? opt.consolidator ?? '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '--') return '';
    return trimmed;
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  toggle(): void {
    if (this.disabled) return;
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    this.isOpen.set(true);
    this.searchText.set('');
    this.highlightedIndex.set(0);
    setTimeout(() => {
      const input = this.elRef.nativeElement.querySelector('.ss-search__input');
      input?.focus();
    }, 0);
  }

  close(): void {
    this.isOpen.set(false);
    this.searchText.set('');
    this.onTouched();
  }

  selectOption(opt: SearchableSelectOption, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedValue.set(opt.value);
    this.onChange(opt.value);
    this.selectionChange.emit(opt.value);
    this.close();
  }

  clear(event: MouseEvent): void {
    event.stopPropagation();
    this.selectedValue.set('');
    this.onChange('');
    this.selectionChange.emit('');
  }

  /** Fires `loadMore` once when scrolled within one row-height of the bottom. */
  onOptionsScroll(event: Event): void {
    if (!this.hasMore || this.loadingMore || this.loading) return;
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
    if (nearBottom) this.loadMore.emit();
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchText.set(value);
    this.highlightedIndex.set(0);
    if (this.serverSideSearch) this.searchTextChange.emit(value);
  }

  onKeydown(event: KeyboardEvent): void {
    const opts = this.filteredOptions();
    const current = this.highlightedIndex();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex.set(Math.min(current + 1, opts.length - 1));
        this.scrollToHighlighted();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex.set(Math.max(current - 1, 0));
        this.scrollToHighlighted();
        break;
      case 'Enter':
        event.preventDefault();
        if (opts[current]) {
          this.selectedValue.set(opts[current].value);
          this.onChange(opts[current].value);
          this.selectionChange.emit(opts[current].value);
          this.close();
        }
        break;
      case 'Escape':
        this.close();
        break;
    }
  }

  private scrollToHighlighted(): void {
    setTimeout(() => {
      const container = this.elRef.nativeElement.querySelector('.ss-options');
      const highlighted = container?.querySelector('.ss-option--highlighted');
      highlighted?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  writeValue(value: string): void {
    this.selectedValue.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
