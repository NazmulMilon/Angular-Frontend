import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  ViewChild,
  forwardRef,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Lightweight, dependency-free rich-text editor — a drop-in replacement for a plain `<textarea>`
 * that produces HTML. Built on a `contenteditable` div + a minimal toolbar (bold / italic /
 * underline / lists / link / clear). Implements {@link ControlValueAccessor} so it works exactly
 * like the textareas it replaces: `[ngModel]` / `(ngModelChange)` / `name` / `required` all apply,
 * and Angular form validation still tracks emptiness.
 *
 * Uses `document.execCommand` — deprecated but universally supported — deliberately, to stay free
 * of any editor library (per the "lightweight, not CKEditor" requirement).
 */
@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  templateUrl: './rich-text-editor.component.html',
  styleUrl: './rich-text-editor.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true,
    },
  ],
})
export class RichTextEditorComponent implements ControlValueAccessor, AfterViewInit {
  /** Placeholder shown while the editor is empty. */
  @Input() placeholder = '';

  @ViewChild('editor', { static: true }) private editorRef!: ElementRef<HTMLDivElement>;

  protected readonly showLinkInput = signal(false);
  protected readonly linkUrl = signal('');

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private pending: string | null = null;
  private savedRange: Range | null = null;

  // ── ControlValueAccessor ──────────────────────────────────────────────

  writeValue(value: string): void {
    const html = value ?? '';
    const el = this.editorRef?.nativeElement;
    if (el) {
      if (el.innerHTML !== html) {
        el.innerHTML = html;
      }
    } else {
      this.pending = html;
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.editorRef?.nativeElement?.setAttribute('contenteditable', String(!isDisabled));
  }

  ngAfterViewInit(): void {
    if (this.pending !== null) {
      this.editorRef.nativeElement.innerHTML = this.pending;
      this.pending = null;
    }
  }

  // ── Editing ───────────────────────────────────────────────────────────

  protected onInput(): void {
    const el = this.editorRef.nativeElement;
    let html = el.innerHTML;
    // Normalize a "visually empty" editor (e.g. a lone <br>) back to "" so the placeholder
    // reappears and required-validation sees it as empty.
    if (this.isEmpty(html)) {
      if (html !== '') {
        el.innerHTML = '';
      }
      html = '';
    }
    this.onChange(html);
  }

  protected onBlur(): void {
    this.onTouched();
  }

  /** Runs a formatting command against the current selection, keeping the editor focused. */
  protected exec(command: string): void {
    this.editorRef.nativeElement.focus();
    document.execCommand(command, false);
    this.onInput();
  }

  protected clearFormat(): void {
    this.editorRef.nativeElement.focus();
    document.execCommand('removeFormat', false);
    document.execCommand('unlink', false);
    this.onInput();
  }

  // ── Link (inline input, no native prompt) ─────────────────────────────

  protected openLink(): void {
    this.saveSelection();
    this.linkUrl.set('');
    this.showLinkInput.set(true);
  }

  protected applyLink(): void {
    const url = this.linkUrl().trim();
    this.showLinkInput.set(false);
    if (!url) {
      return;
    }
    this.editorRef.nativeElement.focus();
    this.restoreSelection();
    document.execCommand('createLink', false, url);
    this.onInput();
  }

  protected cancelLink(): void {
    this.showLinkInput.set(false);
  }

  private saveSelection(): void {
    const sel = window.getSelection();
    this.savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
  }

  private restoreSelection(): void {
    if (!this.savedRange) {
      return;
    }
    const sel = window.getSelection();
    if (!sel) {
      return;
    }
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  }

  /** True when the markup has no visible text (ignores empty tags / <br> / &nbsp;). */
  private isEmpty(html: string): boolean {
    const text = html
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim();
    return text.length === 0;
  }
}
