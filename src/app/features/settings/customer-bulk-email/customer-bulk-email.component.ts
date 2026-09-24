import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BulkEmailContact,
  BulkEmailCustomer,
  BulkEmailTemplate,
  CustomerBulkEmailService,
} from '../../../services/customer-bulk-email.service';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

type SenderMode = 'self' | 'service';
type RecipientTab = 'customers' | 'contacts';

@Component({
  selector: 'app-customer-bulk-email',
  standalone: true,
  imports: [FormsModule, RouterLink, RichTextEditorComponent],
  templateUrl: './customer-bulk-email.component.html',
  styleUrl: './customer-bulk-email.component.scss',
})
export class CustomerBulkEmailComponent implements OnInit {
  private readonly service = inject(CustomerBulkEmailService);

  protected readonly serviceEmail = 'serviceadmin@retailfixit.com';

  // ── Composer state ──
  protected readonly senderMode = signal<SenderMode>('service');
  /** Currently loaded template key. 0 = composing a brand-new template. */
  protected readonly templateKey = signal(0);
  protected readonly templateName = signal('');
  protected readonly subjectLine = signal('');
  protected readonly bodyContent = signal('');
  protected readonly savedFlash = signal(false);

  protected readonly templates = signal<BulkEmailTemplate[]>([]);

  // ── Recipient state ──
  protected readonly recipientTab = signal<RecipientTab>('customers');
  protected readonly searchCustomers = signal('');
  protected readonly searchContacts = signal('');
  protected readonly checkedCustomerIds = signal<Set<string>>(new Set());
  protected readonly checkedContactIds = signal<Set<string>>(new Set());

  protected readonly customers = signal<BulkEmailCustomer[]>([]);
  protected readonly contacts = signal<BulkEmailContact[]>([]);

  // ── Async status ──
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sendResult = signal<string | null>(null);
  // Contacts are heavy to load, so they're fetched lazily the first time the Contacts tab is opened.
  protected readonly contactsLoading = signal(false);
  protected readonly contactsLoaded = signal(false);

  // ── Computed: filtered lists ──
  protected readonly filteredCustomers = computed(() => {
    const q = this.searchCustomers().trim().toLowerCase();
    if (!q) return this.customers();
    return this.customers().filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  });

  protected readonly filteredContacts = computed(() => {
    const q = this.searchContacts().trim().toLowerCase();
    if (!q) return this.contacts();
    return this.contacts().filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  });

  protected readonly selectedCount = computed(() =>
    this.recipientTab() === 'customers' ? this.checkedCustomerIds().size : this.checkedContactIds().size
  );

  protected readonly allCustomersChecked = computed(() => {
    const list = this.filteredCustomers();
    return list.length > 0 && list.every((c) => this.checkedCustomerIds().has(c.id));
  });

  protected readonly allContactsChecked = computed(() => {
    const list = this.filteredContacts();
    return list.length > 0 && list.every((c) => this.checkedContactIds().has(c.id));
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    // Only templates + customers on init — the Customers tab is the default. Contacts are fetched
    // lazily the first time the Contacts tab is opened (see setTab / loadContacts), keeping the
    // initial page load fast.
    this.service.getTemplates().subscribe({
      next: (rows) => this.templates.set(rows ?? []),
      error: () => this.error.set('Failed to load templates. Please try again.'),
    });
    this.service.getCustomers().subscribe({
      next: (rows) => {
        this.customers.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load customers. Please try again.');
        this.loading.set(false);
      },
    });
  }

  /** Fetch the (heavy) contacts list once, on first open of the Contacts tab. */
  private loadContacts(): void {
    this.contactsLoading.set(true);
    this.error.set(null);
    this.service.getContacts().subscribe({
      next: (rows) => {
        this.contacts.set(rows ?? []);
        this.contactsLoaded.set(true);
        this.contactsLoading.set(false);
      },
      error: () => {
        this.error.set('Failed to load contacts. Please try again.');
        this.contactsLoading.set(false);
      },
    });
  }

  // ── Composer actions ──
  loadTemplate(key: string): void {
    if (!key) {
      // "Start from scratch"
      this.templateKey.set(0);
      this.templateName.set('');
      this.subjectLine.set('');
      this.bodyContent.set('');
      return;
    }
    const t = this.templates().find((x) => x.templateKey === Number(key));
    if (!t) return;
    this.templateKey.set(t.templateKey);
    this.templateName.set(t.templateName);
    this.subjectLine.set(t.subjectLine);
    this.bodyContent.set(t.bodyContent);
  }

  saveTemplate(): void {
    if (!this.canSaveTemplate || this.saving()) return;
    this.error.set(null);
    this.saving.set(true);
    this.service
      .saveTemplate({
        templateKey: this.templateKey(),
        templateName: this.templateName().trim(),
        subjectLine: this.subjectLine().trim(),
        bodyContent: this.bodyContent(),
      })
      .subscribe({
        next: (saved) => {
          this.templateKey.set(saved.templateKey);
          this.templates.update((list) => {
            const others = list.filter((t) => t.templateKey !== saved.templateKey);
            return [...others, saved].sort((a, b) => a.templateName.localeCompare(b.templateName));
          });
          this.saving.set(false);
          this.savedFlash.set(true);
          setTimeout(() => this.savedFlash.set(false), 3000);
        },
        error: () => {
          this.saving.set(false);
          this.error.set('Failed to save the template. Please try again.');
        },
      });
  }

  get canSaveTemplate(): boolean {
    return (
      this.templateName().trim().length > 0 &&
      this.subjectLine().trim().length > 0 &&
      this.bodyContent().trim().length > 0
    );
  }

  // ── Recipient actions ──
  setTab(tab: RecipientTab): void {
    this.recipientTab.set(tab);
    if (tab === 'contacts' && !this.contactsLoaded() && !this.contactsLoading()) {
      this.loadContacts();
    }
  }

  isCustomerChecked(id: string): boolean {
    return this.checkedCustomerIds().has(id);
  }

  isContactChecked(id: string): boolean {
    return this.checkedContactIds().has(id);
  }

  toggleCustomer(id: string): void {
    this.checkedCustomerIds.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  toggleContact(id: string): void {
    this.checkedContactIds.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  toggleSelectAllCustomers(): void {
    const list = this.filteredCustomers();
    const allChecked = this.allCustomersChecked();
    this.checkedCustomerIds.update((set) => {
      const next = new Set(set);
      for (const c of list) {
        allChecked ? next.delete(c.id) : next.add(c.id);
      }
      return next;
    });
  }

  toggleSelectAllContacts(): void {
    const list = this.filteredContacts();
    const allChecked = this.allContactsChecked();
    this.checkedContactIds.update((set) => {
      const next = new Set(set);
      for (const c of list) {
        allChecked ? next.delete(c.id) : next.add(c.id);
      }
      return next;
    });
  }

  clearAll(): void {
    this.checkedCustomerIds.set(new Set());
    this.checkedContactIds.set(new Set());
  }

  get canSend(): boolean {
    return (
      !this.sending() &&
      this.subjectLine().trim().length > 0 &&
      this.bodyContent().trim().length > 0 &&
      this.selectedCount() > 0
    );
  }

  send(): void {
    if (!this.canSend) return;
    this.error.set(null);
    this.sendResult.set(null);
    this.sending.set(true);

    const toContacts = this.recipientTab() === 'contacts';
    const recipientIds = toContacts
      ? [...this.checkedContactIds()]
      : [...this.checkedCustomerIds()];

    const req = {
      senderMode: this.senderMode(),
      templateKey: this.templateKey(),
      templateName: this.templateName().trim() || this.subjectLine().trim(),
      subject: this.subjectLine().trim(),
      bodyContent: this.bodyContent(),
      recipientIds,
    };

    const request$ = toContacts
      ? this.service.sendToContacts(req)
      : this.service.sendToCustomers(req);

    request$.subscribe({
      next: (result) => {
        this.sending.set(false);
        this.sendResult.set(
          `Bulk email queued to ${result.recipients} recipient${result.recipients === 1 ? '' : 's'}.`
        );
        this.clearAll();
      },
      error: () => {
        this.sending.set(false);
        this.error.set('Failed to queue the bulk email. Please try again.');
      },
    });
  }
}
