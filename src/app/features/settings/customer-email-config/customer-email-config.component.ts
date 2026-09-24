import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CustomerEmailConfig,
  CustomerEmailConfigService,
} from '../../../services/customer-email-config.service';

@Component({
  selector: 'app-customer-email-config',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './customer-email-config.component.html',
  styleUrl: './customer-email-config.component.scss',
})
export class CustomerEmailConfigComponent implements OnInit {
  private readonly service = inject(CustomerEmailConfigService);

  protected emailAddress = signal('');
  protected smtpServer = signal('');
  protected smtpPort = signal('');
  protected smtpUsername = signal('');
  protected smtpPassword = signal('');
  protected isSmtpSsl = signal<boolean>(true);
  protected loading = signal(false);
  protected saving = signal(false);
  protected saved = signal(false);
  protected error = signal<string | null>(null);
  protected showPassword = signal(false);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (c) => {
        this.emailAddress.set(c?.emailAddress ?? '');
        this.smtpServer.set(c?.smtpServer ?? '');
        this.smtpPort.set(c?.smtpPort ?? '');
        this.smtpUsername.set(c?.smtpUsername ?? '');
        this.smtpPassword.set(c?.smtpPassword ?? '');
        this.isSmtpSsl.set(c?.isSmtpSsl ?? true);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load the email configuration. Please try again.');
        this.loading.set(false);
      },
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);

    const config: CustomerEmailConfig = {
      emailAddress: this.emailAddress().trim() || null,
      smtpServer: this.smtpServer().trim(),
      smtpPort: this.smtpPort().trim(),
      smtpUsername: this.smtpUsername().trim(),
      smtpPassword: this.smtpPassword(),
      isSmtpSsl: this.isSmtpSsl(),
    };

    this.service.save(config).subscribe({
      next: (c) => {
        this.smtpPassword.set(c?.smtpPassword ?? this.smtpPassword());
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: () => {
        this.error.set('Failed to save the email configuration. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
