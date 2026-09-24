import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DocumentSetup, DocumentSetupService } from '../../../services/document-setup.service';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-document-setup',
  standalone: true,
  imports: [FormsModule, RouterLink, RichTextEditorComponent],
  templateUrl: './document-setup.component.html',
  styleUrl: './document-setup.component.scss',
})
export class DocumentSetupComponent implements OnInit {
  private readonly service = inject(DocumentSetupService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  // Email subjects (plain text)
  protected readonly workOrderSubject = signal('');
  protected readonly invoiceSubject = signal('');
  protected readonly estimateSubject = signal('');

  // Document headers (rich-text)
  protected readonly workOrderHeader = signal('');
  protected readonly invoiceHeader = signal('');
  protected readonly estimateHeader = signal('');
  protected readonly signOffSheet = signal('');
  protected readonly quoteConfiguration = signal('');

  // Email bodies (rich-text)
  protected readonly estimateEmailBody = signal('');
  protected readonly invoiceEmailBody = signal('');

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (d) => {
        this.apply(d);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load document setup. Please try again.');
        this.loading.set(false);
      },
    });
  }

  private apply(d: DocumentSetup): void {
    this.workOrderSubject.set(d.workOrderSubject);
    this.invoiceSubject.set(d.invoiceSubject);
    this.estimateSubject.set(d.estimateSubject);
    this.workOrderHeader.set(d.workOrderHeader);
    this.invoiceHeader.set(d.invoiceHeader);
    this.estimateHeader.set(d.estimateHeader);
    this.signOffSheet.set(d.signOffSheet);
    this.quoteConfiguration.set(d.quoteConfiguration);
    this.estimateEmailBody.set(d.estimateEmailBody);
    this.invoiceEmailBody.set(d.invoiceEmailBody);
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.service
      .save({
        workOrderSubject: this.workOrderSubject(),
        invoiceSubject: this.invoiceSubject(),
        estimateSubject: this.estimateSubject(),
        workOrderHeader: this.workOrderHeader(),
        invoiceHeader: this.invoiceHeader(),
        estimateHeader: this.estimateHeader(),
        signOffSheet: this.signOffSheet(),
        quoteConfiguration: this.quoteConfiguration(),
        estimateEmailBody: this.estimateEmailBody(),
        invoiceEmailBody: this.invoiceEmailBody(),
      })
      .subscribe({
        next: (d) => {
          this.apply(d);
          this.saving.set(false);
          this.saved.set(true);
          setTimeout(() => this.saved.set(false), 3000);
        },
        error: () => {
          this.error.set('Failed to save. Please try again.');
          this.saving.set(false);
        },
      });
  }
}
