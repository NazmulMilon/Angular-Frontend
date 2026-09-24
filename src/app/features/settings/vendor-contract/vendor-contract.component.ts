import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VendorContractService } from '../../../services/vendor-contract.service';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-vendor-contract',
  standalone: true,
  imports: [FormsModule, RouterLink, RichTextEditorComponent],
  templateUrl: './vendor-contract.component.html',
  styleUrl: './vendor-contract.component.scss',
})
export class VendorContractComponent implements OnInit {
  private readonly service = inject(VendorContractService);

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
        this.error.set('Failed to load the vendor contract. Please try again.');
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
        this.error.set('Failed to save the vendor contract. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
