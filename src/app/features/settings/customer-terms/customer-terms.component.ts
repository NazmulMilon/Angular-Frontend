import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerContractService } from '../../../services/customer-contract.service';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-customer-terms',
  standalone: true,
  imports: [FormsModule, RouterLink, RichTextEditorComponent],
  templateUrl: './customer-terms.component.html',
  styleUrl: './customer-terms.component.scss',
})
export class CustomerTermsComponent implements OnInit {
  private readonly service = inject(CustomerContractService);

  protected contractDetail = signal('');
  protected loading = signal(false);
  protected saving = signal(false);
  protected saved = signal(false);
  protected error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getContract().subscribe({
      next: (res) => {
        this.contractDetail.set(res?.contractDetail ?? '');
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load the terms and conditions. Please try again.');
        this.loading.set(false);
      },
    });
  }

  save(): void {
    const detail = this.contractDetail().trim();
    if (!detail) return;

    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.service.saveContract(detail).subscribe({
      next: (res) => {
        this.contractDetail.set(res?.contractDetail ?? detail);
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: () => {
        this.error.set('Failed to save the terms and conditions. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
