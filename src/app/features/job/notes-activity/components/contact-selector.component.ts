import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { Subject, forkJoin, takeUntil } from 'rxjs';

import { NotesActivityService } from '../../../../services/notes-activity.service';
import {
  NoteType,
  ContactItem,
  VendorContactItem,
  CustomerContactItem,
  LocationContactItem,
  CategorizedContacts,
} from '../../../../models/notes-activity.model';

type Contact = ContactItem | VendorContactItem | CustomerContactItem | LocationContactItem;

interface ContactGroup {
  id: string;
  label: string;
  contacts: Contact[];
  expanded: boolean;
}

/**
 * Contact selector component for choosing email recipients.
 * Loads ALL contact types on init with collapsible sections:
 * - Internal Team
 * - Customer
 * - Vendor
 * - Accounting
 */
@Component({
  selector: 'app-contact-selector',
  standalone: true,
  template: `
    <div class="contact-selector">
      @if (isLoading()) {
        <div class="loading">
          <div class="spinner"></div>
          <span>Loading contacts...</span>
        </div>
      } @else {
        @for (group of filteredContactGroups(); track group.id) {
          <div class="contact-group">
            <!-- Group Header (collapsible) -->
            <button
              type="button"
              class="group-header"
              [class.group-header--expanded]="group.expanded"
              (click)="toggleGroup(group.id)"
            >
              <span class="group-toggle">
                @if (group.expanded) {
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>
                } @else {
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
                }
              </span>
              <span class="group-label">{{ group.label }}</span>
              <span class="group-count">
                {{ getGroupSelectedCount(group.id) }}/{{ group.contacts.length }}
              </span>
            </button>

            <!-- Group Contacts (expandable) -->
            @if (group.expanded && group.contacts.length > 0) {
              <div class="group-contacts">
                @for (contact of group.contacts; track getContactKey(contact)) {
                  <div
                    class="contact-item"
                    [class.contact-item--selected]="isSelected(contact)"
                    [class.contact-item--account-manager]="isJobAccountManager(contact)"
                    [class.contact-item--job-customer-contact]="isJobCustomerContact(contact)"
                    [class.contact-item--job-requester]="isJobRequester(contact)"
                  >
                    <label class="contact-row">
                      <input
                        type="checkbox"
                        class="contact-row__checkbox"
                        [checked]="isSelected(contact)"
                        (change)="toggleContact(contact)"
                      />
                      <div class="contact-row__primary">
                        <span class="contact-name">
                          @if (isVendorContact(contact)) {
                            <span class="contact-name__vendor-line">
                              <strong class="contact-name__vendor">{{ getVendorName(contact) }}</strong>
                              <span class="contact-name__sep"> : </span>
                              <span class="contact-name__person">{{ getVendorContactPersonName(contact) }}</span>
                            </span>
                          } @else {
                            {{ getContactName(contact) }}
                          }
                        </span>
                      </div>
                      <div class="contact-row__meta">
                        <span class="contact-email" [attr.title]="getContactEmail(contact)">{{
                          getContactEmail(contact)
                        }}</span>
                        <div class="contact-badges">
                          @if (isJobAccountManager(contact)) {
                            <span class="contact-badge contact-badge--account-manager">Account Manager</span>
                          }
                          @if (isJobCustomerContact(contact)) {
                            <span class="contact-badge contact-badge--job-customer-contact">Job Default Contact</span>
                          }
                          @if (isJobRequester(contact)) {
                            <span class="contact-badge contact-badge--job-requester">Job Requester</span>
                          }
                          @if (isDefaultContact(contact)) {
                            <span class="contact-badge contact-badge--default">Default</span>
                          }
                        </div>
                        @if (isCustomerContact(contact)) {
                          <a
                            class="portal-login-link"
                            [href]="getPortalLoginUrl(contact)"
                            target="_blank"
                            (click)="$event.stopPropagation()"
                          >( Portal Login )</a>
                        }
                      </div>
                    </label>
                  </div>
                }
              </div>
            }
            @if (group.expanded && group.contacts.length === 0) {
              <div class="group-empty">No contacts available</div>
            }
          </div>
        }

        @if (getTotalContacts() === 0) {
          <div class="no-contacts">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
            </svg>
            <p>No contacts available</p>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .contact-selector {
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      color: var(--text-secondary, #64748b);
      font-size: 0.8rem;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border-color, #e2e8f0);
      border-top-color: var(--primary-color, #3b82f6);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .contact-group {
      margin-bottom: 4px;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 5px;
      overflow: hidden;
    }

    .group-header {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 6px 10px;
      background: var(--surface-alt, #f8fafc);
      border: none;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-primary, #1e293b);
      transition: background 0.15s;

      &:hover {
        background: var(--border-color, #e2e8f0);
      }

      &--expanded {
        border-bottom: 1px solid var(--border-color, #e2e8f0);
      }
    }

    .group-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      color: var(--primary-color, #3b82f6);

      svg {
        width: 12px;
        height: 12px;
      }
    }

    .group-label {
      flex: 1;
      text-align: left;
    }

    .group-count {
      font-size: 0.7rem;
      font-weight: 500;
      color: var(--text-muted, #94a3b8);
      padding: 1px 6px;
      background: var(--surface-color, #fff);
      border-radius: 8px;
    }

    .group-contacts {
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: var(--surface-color, #fff);
    }

    .group-empty {
      padding: 10px;
      text-align: center;
      color: var(--text-muted, #94a3b8);
      font-size: 0.75rem;
      font-style: italic;
    }

    .contact-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px 8px;
      background: var(--surface-color, #fff);
      border-radius: 4px;
      transition: all 0.15s;
      border: 1px solid transparent;

      &:hover {
        background: var(--surface-alt, #f8fafc);
      }

      &--selected {
        background: rgba(59, 130, 246, 0.08);
        border-color: var(--primary-color, #3b82f6);
      }

      &--account-manager {
        background: rgba(139, 92, 246, 0.08);
        border-color: #8b5cf6;

        &:hover {
          background: rgba(139, 92, 246, 0.12);
        }
      }

      &--job-customer-contact {
        background: rgba(59, 130, 246, 0.08);
        border-color: #3b82f6;

        &:hover {
          background: rgba(59, 130, 246, 0.12);
        }
      }

      &--job-requester {
        background: rgba(34, 197, 94, 0.08);
        border-color: #22c55e;

        &:hover {
          background: rgba(34, 197, 94, 0.12);
        }
      }
    }

    /** Checkbox + name row + meta row (email, badges, links) aligned in a grid */
    .contact-row {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr);
      grid-template-rows: auto auto;
      column-gap: 10px;
      row-gap: 6px;
      align-items: start;
      width: 100%;
      margin: 0;
      cursor: pointer;
    }

    .contact-row__checkbox {
      grid-column: 1;
      grid-row: 1 / span 2;
      width: 14px;
      height: 14px;
      margin-top: 3px;
      accent-color: var(--primary-color, #3b82f6);
      flex-shrink: 0;
      cursor: pointer;
    }

    .contact-row__primary {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }

    .contact-row__meta {
      grid-column: 2;
      grid-row: 2;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      min-width: 0;
    }

    .contact-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .portal-login-link {
      flex-shrink: 0;
      font-size: 0.7rem;
      color: var(--primary-color, #3b82f6);
      text-decoration: none;
      white-space: nowrap;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.1);
      transition: all 0.15s;

      &:hover {
        background: rgba(59, 130, 246, 0.2);
        text-decoration: underline;
      }
    }

    .contact-name {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      line-height: 1.45;
      color: var(--text-primary, #1e293b);
      min-width: 0;
      overflow-wrap: break-word;
      word-break: normal;

      &__vendor-line {
        display: inline;
      }

      &__vendor {
        font-weight: 700;
      }

      &__sep {
        font-weight: 400;
        color: var(--text-secondary, #64748b);
      }

      &__person {
        font-weight: 500;
      }
    }

    .contact-email {
      flex: 1 1 12rem;
      min-width: 0;
      max-width: 100%;
      font-size: 0.75rem;
      line-height: 1.35;
      color: var(--text-muted, #94a3b8);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .contact-badge {
      padding: 1px 5px;
      font-size: 0.6rem;
      font-weight: 600;
      color: #fff;
      border-radius: 8px;
      flex-shrink: 0;
      white-space: nowrap;

      &--default {
        background: var(--primary-color, #3b82f6);
      }

      &--account-manager {
        background: #8b5cf6;
      }

      &--job-customer-contact {
        background: #3b82f6;
      }

      &--job-requester {
        background: #22c55e;
      }
    }

    .no-contacts {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 16px;
      color: var(--text-muted, #94a3b8);
      text-align: center;

      svg {
        width: 24px;
        height: 24px;
      }

      p {
        margin: 0;
        font-size: 0.8rem;
      }
    }

    @media (max-width: 768px) {
      :host {
        display: block;
        min-width: 0;
        max-width: 100%;
      }

      .group-header {
        min-height: 44px;
        padding: 10px 12px;
        font-size: 0.875rem;
      }

      .contact-item {
        padding: 10px;
      }

      .contact-row__checkbox {
        width: 18px;
        height: 18px;
        margin-top: 2px;
      }

      .contact-name {
        font-size: 0.9rem;
      }

      .contact-email {
        flex: 1 1 100%;
        font-size: 0.8rem;
        white-space: normal;
        overflow: visible;
        text-overflow: unset;
        word-break: break-word;
      }

      .portal-login-link {
        white-space: normal;
        min-height: 32px;
        display: inline-flex;
        align-items: center;
      }
    }
  `,
})
export class ContactSelectorComponent implements OnInit, OnChanges {
  private readonly notesSvc = inject(NotesActivityService);
  private readonly destroy$ = new Subject<void>();

  @Input() jobKey = '';
  @Input() noteType: NoteType = 'internal';
  @Input() vendorKey: string | null = null;
  @Input() addedBy = '';
  @Input() activeTab: 'all' | 'internal' | 'vendor' | 'customer' = 'all';
  /** When set, matching contacts are checked after the contact lists load. */
  @Input() preselectEmails: string[] = [];

  @Output() contactsSelected = new EventEmitter<CategorizedContacts>();

  contactGroups = signal<ContactGroup[]>([
    { id: 'internal', label: 'Internal Team', contacts: [], expanded: false },
    { id: 'customer', label: 'Customer', contacts: [], expanded: false },
    { id: 'location', label: 'Locations', contacts: [], expanded: false },
    { id: 'vendor', label: 'Vendor', contacts: [], expanded: false },
    { id: 'accounting', label: 'Notes To Accounting', contacts: [], expanded: false },
  ]);

  /** Filter contact groups based on active tab */
  filteredContactGroups(): ContactGroup[] {
    const allGroups = this.contactGroups();
    
    // When Internal tab is selected, only show Internal Team
    if (this.activeTab === 'internal') {
      return allGroups.filter(g => g.id === 'internal');
    }
    
    // When Vendor tab is selected, only show Vendor
    if (this.activeTab === 'vendor') {
      return allGroups.filter(g => g.id === 'vendor');
    }

    // Customer tab: only Customer contacts (email recipients)
    if (this.activeTab === 'customer') {
      return allGroups.filter(g => g.id === 'customer');
    }
    
    // For other tabs, show all groups
    return allGroups;
  }

  selectedKeys = signal<Set<string>>(new Set());
  isLoading = signal(false);

  ngOnInit(): void {
    this.loadAllContacts();
  }

  /**
   * Re-fetches all recipient lists using the same API calls as the initial load
   * (`getInternalTeamContacts`, `getCustomerContacts`, `getLocationContacts`,
   * `getVendorContacts`, `getAccountingContacts`). Clears checkbox selection
   * immediately before the requests run.
   */
  reloadContactsFromApi(): void {
    this.loadAllContacts();
  }

  /**
   * Clears all recipient checkboxes and re-emits an empty selection (no API refetch).
   * Used after Customer- or Internal-tab save so the UI matches cleared parent state.
   */
  clearRecipientSelection(): void {
    this.selectedKeys.set(new Set());
    this.emitSelection();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jobKey'] && !changes['jobKey'].firstChange) {
      this.loadAllContacts();
    }
    // Vendor tab: show vendor recipients opened (Select Recipients)
    if (changes['activeTab'] && this.activeTab === 'vendor') {
      this.expandVendorGroup();
    }
    if (changes['activeTab'] && this.activeTab === 'customer') {
      this.expandCustomerGroup();
    }
    if (changes['activeTab'] && this.activeTab === 'internal') {
      this.expandInternalGroup();
    }
    if (changes['preselectEmails'] && !changes['preselectEmails'].firstChange) {
      this.applyPreselectedEmails();
    }
  }

  private loadAllContacts(): void {
    if (!this.jobKey) return;

    this.isLoading.set(true);
    this.selectedKeys.set(new Set());

    forkJoin({
      internal: this.notesSvc.getInternalTeamContacts(this.jobKey, this.addedBy),
      customer: this.notesSvc.getCustomerContacts(this.jobKey),
      location: this.notesSvc.getLocationContacts(this.jobKey),
      vendor: this.notesSvc.getVendorContacts(this.jobKey, this.vendorKey || undefined),
      accounting: this.notesSvc.getAccountingContacts(this.jobKey, this.addedBy),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ internal, customer, location, vendor, accounting }) => {
          const groups: ContactGroup[] = [
            {
              id: 'internal',
              label: 'Internal Team',
              contacts: internal.status && internal.data ? internal.data as Contact[] : [],
              expanded: false,
            },
            {
              id: 'customer',
              label: 'Customer',
              contacts: customer.status && customer.data ? customer.data as Contact[] : [],
              expanded: false,
            },
            {
              id: 'location',
              label: 'Locations',
              contacts: location.status && location.data ? location.data as Contact[] : [],
              expanded: false,
            },
            {
              id: 'vendor',
              label: 'Vendor',
              contacts: vendor.status && vendor.data ? vendor.data as Contact[] : [],
              expanded: this.activeTab === 'vendor',
            },
            {
              id: 'accounting',
              label: 'Notes To Accounting',
              contacts: accounting.status && accounting.data ? accounting.data as Contact[] : [],
              expanded: false,
            },
          ];

          this.contactGroups.set(groups);
          if (this.activeTab === 'vendor') {
            this.expandVendorGroup();
          }
          if (this.activeTab === 'customer') {
            this.expandCustomerGroup();
          }
          if (this.activeTab === 'internal') {
            this.expandInternalGroup();
          }
          this.applyPreselectedEmails();
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        },
      });
  }

  /** Select recipient checkboxes whose email matches {@link preselectEmails} (case-insensitive). */
  private applyPreselectedEmails(): void {
    const targets = new Set(
      (this.preselectEmails ?? [])
        .map(e => e.trim().toLowerCase())
        .filter(Boolean),
    );
    if (targets.size === 0) return;

    const keys = new Set<string>();
    for (const group of this.contactGroups()) {
      for (const contact of group.contacts) {
        const email = (contact.email ?? '').trim().toLowerCase();
        if (email && targets.has(email)) {
          keys.add(this.getContactKey(contact));
        }
      }
    }

    if (keys.size > 0) {
      this.selectedKeys.set(keys);
      this.emitSelection();
    }
  }

  private preselectDefaults(groups: ContactGroup[]): void {
    const defaultKeys = new Set<string>();

    for (const group of groups) {
      for (const contact of group.contacts) {
        if (this.isDefaultContact(contact)) {
          defaultKeys.add(this.getContactKey(contact));
        }
      }
    }

    if (defaultKeys.size > 0) {
      this.selectedKeys.set(defaultKeys);
      this.emitSelection();
    }
  }

  /** Keep Vendor section expanded while on the Vendor tab (user can still collapse via header). */
  private expandVendorGroup(): void {
    this.contactGroups.update(groups =>
      groups.map(g => (g.id === 'vendor' ? { ...g, expanded: true } : g)),
    );
  }

  /** Customer tab: expand Customer group only (single visible section). */
  private expandCustomerGroup(): void {
    this.contactGroups.update(groups =>
      groups.map(g => (g.id === 'customer' ? { ...g, expanded: true } : g)),
    );
  }

  /** Internal tab: expand Internal Team group only (single visible section). */
  private expandInternalGroup(): void {
    this.contactGroups.update(groups =>
      groups.map(g => (g.id === 'internal' ? { ...g, expanded: true } : g)),
    );
  }

  toggleGroup(groupId: string): void {
    const groups = this.contactGroups().map(g => ({
      ...g,
      expanded: g.id === groupId ? !g.expanded : g.expanded,
    }));
    this.contactGroups.set(groups);
  }

  getGroupSelectedCount(groupId: string): number {
    const group = this.contactGroups().find(g => g.id === groupId);
    if (!group) return 0;
    return group.contacts.filter(c => this.selectedKeys().has(this.getContactKey(c))).length;
  }

  getTotalContacts(): number {
    return this.contactGroups().reduce((sum, g) => sum + g.contacts.length, 0);
  }

  getContactKey(contact: Contact): string {
    if ('personnelKey' in contact) {
      return contact.personnelKey;
    }
    if ('contactKey' in contact) {
      return contact.contactKey;
    }
    return '';
  }

  getContactName(contact: Contact): string {
    if ('staffName' in contact) {
      return contact.staffName;
    }
    if ('contactName' in contact) {
      return contact.contactName;
    }
    return 'Unknown';
  }

  /** Vendor group: show company + person separately in the template. */
  isVendorContact(contact: Contact): contact is VendorContactItem {
    return 'vendorKey' in contact;
  }

  getVendorName(contact: Contact): string {
    return this.isVendorContact(contact) ? (contact.vendorName || '') : '';
  }

  getVendorContactPersonName(contact: Contact): string {
    return this.isVendorContact(contact) ? (contact.contactName || '—') : '';
  }

  getContactEmail(contact: Contact): string {
    return contact.email;
  }

  isDefaultContact(contact: Contact): boolean {
    if ('isDefault' in contact) {
      return contact.isDefault;
    }
    return false;
  }

  isAccountManager(contact: Contact): boolean {
    if ('isAccountManager' in contact) {
      return !!contact.isAccountManager;
    }
    return false;
  }

  isJobAccountManager(contact: Contact): boolean {
    if ('isJobAccountManager' in contact) {
      return !!(contact as any).isJobAccountManager;
    }
    return false;
  }

  isJobCustomerContact(contact: Contact): boolean {
    if ('isJobCustomerContact' in contact) {
      return !!contact.isJobCustomerContact;
    }
    return false;
  }

  isJobRequester(contact: Contact): boolean {
    if ('isJobRequester' in contact) {
      return !!contact.isJobRequester;
    }
    return false;
  }

  isCustomerContact(contact: Contact): boolean {
    return 'customerKey' in contact && 'customerName' in contact;
  }

  getPortalLoginUrl(contact: Contact): string {
    const contactKey = this.getContactKey(contact);
    return `https://customer-dev.retailfixitapp.com/Home/AutoLogin?ContactKey=${contactKey}`;
  }

  isSelected(contact: Contact): boolean {
    return this.selectedKeys().has(this.getContactKey(contact));
  }

  toggleContact(contact: Contact): void {
    const key = this.getContactKey(contact);
    const current = new Set(this.selectedKeys());

    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }

    this.selectedKeys.set(current);
    this.emitSelection();
  }

  private emitSelection(): void {
    const selectedKeys = this.selectedKeys();
    const groups = this.contactGroups();
    
    const categorized: CategorizedContacts = {
      internal: [],
      customer: [],
      vendor: [],
      location: [],
      accounting: [],
    };

    for (const group of groups) {
      for (const contact of group.contacts) {
        const key = this.getContactKey(contact);
        if (selectedKeys.has(key)) {
          switch (group.id) {
            case 'internal':
              categorized.internal.push(key);
              break;
            case 'customer':
              categorized.customer.push(key);
              break;
            case 'vendor':
              categorized.vendor.push(key);
              break;
            case 'location':
              categorized.location.push(key);
              break;
            case 'accounting':
              categorized.accounting.push(key);
              break;
          }
        }
      }
    }

    this.contactsSelected.emit(categorized);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
