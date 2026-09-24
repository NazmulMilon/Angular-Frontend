import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  CommonEmailConfigService,
  EmailFunction,
  SenderConfig,
} from '../../../services/common-email-config.service';

@Component({
  selector: 'app-common-email-config',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './common-email-config.component.html',
  styleUrl: './common-email-config.component.scss',
})
export class CommonEmailConfigComponent implements OnInit {
  private readonly service = inject(CommonEmailConfigService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly configs = signal<SenderConfig[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly isNew = signal(false);
  protected readonly showPassword = signal(false);

  // Form fields
  protected readonly formFunction = signal<EmailFunction>(1);
  protected readonly formSenderName = signal('');
  protected readonly formEmailAddress = signal('');
  protected readonly formSmtpServer = signal('');
  protected readonly formSmtpPort = signal('');
  protected readonly formSmtpUsername = signal('');
  protected readonly formSmtpPassword = signal('');
  protected readonly formIsSmtpSsl = signal(true);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getAll().subscribe({
      next: (rows) => {
        this.configs.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load email configurations. Please try again.');
        this.loading.set(false);
      },
    });
  }

  functionLabel(fn: EmailFunction): string {
    return fn === 1 ? 'Customer Invoice' : 'Customer Estimate';
  }

  get isFormOpen(): boolean {
    return this.isNew() || this.editingId() !== null;
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  startCreate(): void {
    this.isNew.set(true);
    this.editingId.set(null);
    this.showPassword.set(false);
    this.error.set(null);
    this.formFunction.set(1);
    this.formSenderName.set('');
    this.formEmailAddress.set('');
    this.formSmtpServer.set('');
    this.formSmtpPort.set('');
    this.formSmtpUsername.set('');
    this.formSmtpPassword.set('');
    this.formIsSmtpSsl.set(true);
  }

  startEdit(c: SenderConfig): void {
    this.isNew.set(false);
    this.editingId.set(c.id);
    this.showPassword.set(false);
    this.error.set(null);
    this.formFunction.set(c.functionName);
    this.formSenderName.set(c.senderName);
    this.formEmailAddress.set(c.emailAddress);
    this.formSmtpServer.set(c.smtpServer);
    this.formSmtpPort.set(c.smtpPort);
    this.formSmtpUsername.set(c.smtpUsername);
    this.formSmtpPassword.set(c.smtpPassword);
    this.formIsSmtpSsl.set(c.isSmtpSsl);
  }

  cancelEdit(): void {
    this.isNew.set(false);
    this.editingId.set(null);
  }

  get canSave(): boolean {
    return (
      this.formSenderName().trim().length > 0 &&
      this.formEmailAddress().trim().length > 0 &&
      this.formSmtpServer().trim().length > 0 &&
      this.formSmtpPort().trim().length > 0 &&
      this.formSmtpUsername().trim().length > 0 &&
      this.formSmtpPassword().trim().length > 0
    );
  }

  save(): void {
    if (!this.canSave || this.saving()) return;

    const record: Omit<SenderConfig, 'id'> = {
      functionName: this.formFunction(),
      senderName: this.formSenderName().trim(),
      emailAddress: this.formEmailAddress().trim(),
      smtpServer: this.formSmtpServer().trim(),
      smtpPort: this.formSmtpPort().trim(),
      smtpUsername: this.formSmtpUsername().trim(),
      smtpPassword: this.formSmtpPassword(),
      isSmtpSsl: this.formIsSmtpSsl(),
    };

    this.saving.set(true);
    this.error.set(null);

    const id = this.editingId();
    const request$ =
      !this.isNew() && id ? this.service.update(id, record) : this.service.create(record);

    request$.subscribe({
      next: (saved) => {
        this.configs.update((list) => {
          const others = !this.isNew() && id ? list.filter((c) => c.id !== id) : list;
          return [...others, saved];
        });
        this.saving.set(false);
        this.cancelEdit();
      },
      error: () => {
        this.error.set('Failed to save the email configuration. Please try again.');
        this.saving.set(false);
      },
    });
  }

  async confirmDelete(c: SenderConfig): Promise<void> {
    if (c.id == null) return;
    const confirmed = await this.confirmDialog().open({
      title: 'Delete email configuration',
      message: `Are you sure you want to delete the configuration for "${c.emailAddress}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    const id = c.id;
    this.error.set(null);
    this.service.delete(id).subscribe({
      next: () => {
        this.configs.update((list) => list.filter((item) => item.id !== id));
        if (this.editingId() === id) this.cancelEdit();
      },
      error: () => this.error.set('Failed to delete. Please try again.'),
    });
  }
}
