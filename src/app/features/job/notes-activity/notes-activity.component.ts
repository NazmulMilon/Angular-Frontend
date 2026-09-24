import { Component, OnInit, OnDestroy, inject, signal, computed, effect, viewChild, Input } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil, forkJoin, finalize } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AddJobComponent } from '../../add-job/add-job.component';
import { NotesActivityService } from '../../../services/notes-activity.service';
import { AuthTokenService } from '../../../services/auth-token.service';
import {
  NoteItem,
  UnreadCounts,
  NoteType,
  JobVendorOption,
  NoteTemplate,
} from '../../../models/notes-activity.model';
import { AccordionComponent } from '../../../shared/components/accordion/accordion.component';
import { NoteEditorComponent } from './components/note-editor.component';
import { NotesGridComponent } from './components/notes-grid.component';
import { JobDetailsAccordionComponent } from '../../../shared/components/job-details-accordion/job-details-accordion.component';
import { VendorBillsService } from '../../../services/vendor-bills.service';
import { resolveEstimateChatInterstitial } from '../../../shared/utils/estimate-chat-interstitial.util';
import {
  EstimateChatInterstitialModalComponent,
} from '../../../shared/components/estimate-chat-interstitial-modal/estimate-chat-interstitial-modal.component';

/** Tab ids for Notes & Activity (exported for embed / modal hosts). */
export type NotesActivityTabId = 'all' | 'internal' | 'vendor' | 'customer';

type TabId = NotesActivityTabId;

/** Human admin↔vendor thread only (Vendor tab). Excludes location/action/system rows. */
function isVendorTabMsgType(msgType: unknown): boolean {
  const mt = Number(msgType);
  return mt === 3 || mt === 11;
}

interface Tab {
  id: TabId;
  label: string;
  noteType: NoteType;
}

/**
 * Notes & Activity Tab — Main component for managing job notes and communications.
 * Features:
 * - All Notes consolidated view
 * - Internal, vendor, and customer note tabs
 * - File attachments via Azure Blob Storage
 * - Email sending with template support
 */
@Component({
  selector: 'app-notes-activity',
  standalone: true,
  imports: [
    RouterLink,
    AccordionComponent,
    NoteEditorComponent,
    NotesGridComponent,
    JobDetailsAccordionComponent,
    AddJobComponent,
    EstimateChatInterstitialModalComponent,
  ],
  templateUrl: './notes-activity.component.html',
  styleUrl: './notes-activity.component.scss',
})
export class NotesActivityComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notesSvc = inject(NotesActivityService);
  private readonly authTokenSvc = inject(AuthTokenService);
  private readonly vendorBillsSvc = inject(VendorBillsService);
  private readonly destroy$ = new Subject<void>();
  private readonly estimateChatInterstitialModal =
    viewChild(EstimateChatInterstitialModalComponent);

  onEstimatesTabClick(): void {
    const key = this.jobKey();
    if (!key) return;
    resolveEstimateChatInterstitial(this.vendorBillsSvc, key, ({ shouldIntercept, vendorKey }) => {
      if (shouldIntercept) {
        this.estimateChatInterstitialModal()?.open({ jobKey: key, vendorKey });
      } else {
        void this.router.navigate(['/job', key, 'estimates']);
      }
    });
  }

  /**
   * When set (e.g. embed in assign-vendor modal), selects this tab on init — same as calling {@link selectTab}.
   */
  @Input() initialActiveTab: NotesActivityTabId | null = null;

  /**
   * When set, after job vendors load, pre-selects this vendor in the Vendor tab dropdown (must exist in API list).
   */
  @Input() initialVendorKey = '';

  /** Emails to pre-select as recipients when opening from Assign Vendor (route query or embed). */
  prefillRecipientEmails = signal<string[]>([]);

  /** Vendor key from route query when not embedded. */
  private routeVendorKey = '';

  /**
   * When embedded (e.g. assign-vendor modal), pass the job key from the host. The routed page uses
   * {@link ActivatedRoute} params; embedded instances can miss the same route context, so loading
   * would never run without this input.
   */
  @Input() embedJobKey = '';

  /**
   * When true, suppresses the embedded {@link JobDetailsAccordionComponent} block (job header:
   * customer/PO/address/etc). Off by default so the existing Assign Vendor embed keeps its current
   * behaviour unchanged. Set this for hosts that already render their own job-header UI alongside
   * this component and don't want it duplicated inside the Notes & Activity popup (e.g. the
   * Accounting V2 "Job Notes / Activity" popup, which sits next to AccountingJobDetailsComponent).
   */
  @Input() hideJobDetails = false;

  /**
   * Visual reskin switch, purely presentational. 'accounting' matches the
   * Move-to-Accounting "Notes & Activity" popup spec (complete-screen-v2.html
   * renderNotesModal()) via CSS scoped under the `.na--accounting-variant` host
   * class (see notes-activity.component.scss). Defaults to 'default' so every
   * other embed (Assign Vendor popup, standalone /job/:jobKey/notes-activity
   * route) keeps its current look unchanged.
   */
  @Input() designVariant: 'default' | 'accounting' = 'default';

  // ═══════════════════════════════════════════════════════════════
  //  TABS CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  readonly tabs: Tab[] = [
    { id: 'all', label: 'All Notes', noteType: 'general' },
    { id: 'internal', label: 'Internal', noteType: 'internal' },
    { id: 'vendor', label: 'Vendor', noteType: 'vendor' },
    { id: 'customer', label: 'Customer', noteType: 'customer' },
  ];

  // ═══════════════════════════════════════════════════════════════
  //  STATE SIGNALS
  // ═══════════════════════════════════════════════════════════════

  jobKey = signal('');
  activeTab = signal<TabId>('all');

  // ═══════════════════════════════════════════════════════════════
  //  APP HEADER (mirrors the global chrome in app.html, which is
  //  hidden on the /notes-activity route). Only shown standalone.
  // ═══════════════════════════════════════════════════════════════

  /** Legacy admin portal home — environment-specific (dev/uat/prod). */
  readonly legacyAdminHomeUrl = `${environment.legacyAdminBaseUrl.replace(/\/$/, '')}/UserHome/Index`;

  /** Legacy Main Job Page tab (MgtJob/EditJob) for the current job. */
  readonly legacyAssignVendorV1Url = computed(() => {
    const jobKey = this.jobKey();
    if (!jobKey || jobKey === '0') return null;
    const base = environment.legacyAdminBaseUrl.replace(/\/$/, '');
    return `${base}/MgtJob/EditJob/${jobKey}`;
  });

  readonly addJobDeferred = signal(false);
  private readonly addJobModal = viewChild<AddJobComponent>('addJobRef');
  private readonly addJobOpenRequests = signal(0);

  openAddJob(): void {
    this.addJobDeferred.set(true);
    this.addJobOpenRequests.update((n) => n + 1);
  }

  private readonly openAddJobEffect = effect(() => {
    const modal = this.addJobModal();
    if (modal && this.addJobOpenRequests() > 0) {
      modal.open();
    }
  });

  // Notes data
  allNotes = signal<NoteItem[]>([]);
  internalNotes = signal<NoteItem[]>([]);
  vendorNotes = signal<NoteItem[]>([]);
  customerNotes = signal<NoteItem[]>([]);
  pinnedNotes = signal<NoteItem[]>([]);
  accountingNotes = signal<NoteItem[]>([]);
  
  // Unread counts for tab badges
  unreadCounts = signal<UnreadCounts>({ internal: 0, vendor: 0, customer: 0, location: 0, all: 0 });
  
  // Vendor selection (for vendor tab)
  jobVendors = signal<JobVendorOption[]>([]);
  selectedVendorKey = signal<string>('');
  
  // Templates
  templates = signal<NoteTemplate[]>([]);
  
  // UI state
  isLoading = signal(false);
  isSubmitting = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  /** Modal shown after Save Note / Save & Email succeed (avoids easy-to-miss inline banner). */
  successDialogOpen = signal(false);
  successDialogMessage = signal('');
  
  // Admin info from token
  adminKey = signal('');
  adminName = signal('');
  adminEmail = signal('');
  
  // Editor content (for reply/forward)
  editorContent = signal('');

  // ═══════════════════════════════════════════════════════════════
  //  COMPUTED VALUES
  // ═══════════════════════════════════════════════════════════════

  /** Current tab's notes based on active tab */
  currentNotes = computed(() => {
    const tab = this.activeTab();
    let notes: NoteItem[] = [];
    
    switch (tab) {
      case 'all':
        notes = this.allNotes();
        break;
      case 'internal':
        // For Internal tab, filter to only show MsgType 2 (Admin-to-Admin/Internal)
        notes = this.internalNotes().filter(n => n.msgType === 2);
        break;
      case 'vendor':
        // Vendor tab: only MsgType 3 (admin→vendor) and 11 (vendor→admin); coerce in case API sends strings
        notes = this.vendorNotes().filter(n => isVendorTabMsgType(n.msgType));
        break;
      case 'customer':
        notes = this.customerNotes();
        break;
      default:
        notes = [];
    }
    
    return notes;
  });

  /** Filtered pinned notes based on active tab */
  filteredPinnedNotes = computed(() => {
    const tab = this.activeTab();
    const pinned = this.pinnedNotes();
    
    // For Internal tab, only show pinned notes with MsgType 2
    if (tab === 'internal') {
      return pinned.filter(n => n.msgType === 2);
    }
    
    // For Vendor tab, only show pinned notes with MsgType 3 and 11
    if (tab === 'vendor') {
      return pinned.filter(n => isVendorTabMsgType(n.msgType));
    }
    
    // For other tabs, show all pinned notes
    return pinned;
  });

  /** Current note type based on active tab */
  currentNoteType = computed<NoteType>(() => {
    const tab = this.tabs.find(t => t.id === this.activeTab());
    return tab?.noteType ?? 'general';
  });

  /** Whether the current tab shows vendor-specific features */
  isVendorTab = computed(() => this.activeTab() === 'vendor');
  
  /** Whether the current tab is Internal */
  isInternalTab = computed(() => this.activeTab() === 'internal');

  /** Whether there are any unread notes */
  hasUnreadNotes = computed(() => {
    const counts = this.unreadCounts();
    return counts.all > 0;
  });

  // ═══════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.extractAdminInfo();

    const qp = this.route.snapshot.queryParamMap;
    const tabParam = qp.get('tab') as NotesActivityTabId | null;
    const emailParam = (qp.get('email') ?? '').trim();
    this.routeVendorKey = (qp.get('vendorKey') ?? '').trim();

    if (emailParam) {
      this.prefillRecipientEmails.set([emailParam]);
    }

    const tabToSelect = this.initialActiveTab ?? tabParam;
    if (tabToSelect && this.tabs.some(t => t.id === tabToSelect)) {
      this.selectTab(tabToSelect);
    }

    const embeddedKey = (this.embedJobKey ?? '').trim();
    if (embeddedKey) {
      // Modal on Assign Vendor: job key comes from the host (no router param for the child).
      this.jobKey.set(embeddedKey);
      this.loadPageData(embeddedKey);
    } else {
      // Full-page route: same pattern as AssignVendorComponent — snapshot only, same authGuard + JWT.
      const jobKey = this.route.snapshot.paramMap.get('jobKey') ?? '';
      this.jobKey.set(jobKey);

      if (!jobKey) {
        this.errorMessage.set('No job key provided. Please navigate from a valid job.');
        return;
      }

      this.loadPageData(jobKey);
    }

    // Subscribe to unread counts updates
    this.notesSvc.unreadCounts$.pipe(takeUntil(this.destroy$)).subscribe((counts) => {
      this.unreadCounts.set(counts);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.notesSvc.clearCache();
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA LOADING
  // ═══════════════════════════════════════════════════════════════

  private loadPageData(jobKey: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    forkJoin({
      notes: this.notesSvc.getConsolidatedNotes(jobKey),
      pinned: this.notesSvc.getPinnedNotes(jobKey),
      accounting: this.notesSvc.getAccountingNotes(jobKey),
      vendors: this.notesSvc.getJobVendors(jobKey),
      templates: this.notesSvc.getNoteTemplates(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ notes, pinned, accounting, vendors, templates }) => {
          if (notes.status && notes.data) {
            this.allNotes.set(notes.data.allNotes);
            this.internalNotes.set(notes.data.internalNotes);
            this.vendorNotes.set(notes.data.vendorNotes);
            this.customerNotes.set(notes.data.customerNotes);
          } else if (!notes.status) {
            // forkJoin still completes when HTTP uses handleError — surface empty UI cause (often admin-activity vs job-vendor).
            this.errorMessage.set(
              notes.message || 'Unable to load notes. Verify Job Ops admin-activity API is deployed and authorized.',
            );
          }
          if (pinned.status && pinned.data) {
            this.pinnedNotes.set(pinned.data);
          }
          if (accounting.status && accounting.data) {
            this.accountingNotes.set(accounting.data);
          }
          if (vendors.status && vendors.data) {
            this.jobVendors.set(vendors.data);
            if (vendors.data.length > 0) {
              const preset = (this.initialVendorKey || this.routeVendorKey || '').trim();
              const presetLower = preset.toLowerCase();
              const matched =
                preset.length > 0
                  ? vendors.data.find(
                      v => (v.vendorKey ?? '').toLowerCase() === presetLower,
                    )
                  : undefined;
              const defaultVendor =
                matched ?? vendors.data.find(v => v.isDefault) ?? vendors.data[0];
              this.selectedVendorKey.set(defaultVendor.vendorKey);
            }
          }
          if (templates.status && templates.data) {
            this.templates.set(templates.data);
          }

          // Vendor tab: Job Notes use GET .../messaging/vendor (full job vendor thread, no client filter).
          if (this.activeTab() === 'vendor') {
            this.loadVendorTabJobNotes(jobKey);
          }
          // Customer tab: Job Notes use GET .../messaging/customer only.
          if (this.activeTab() === 'customer') {
            this.loadCustomerTabJobNotes(jobKey);
          }
          // Internal tab: Job Notes use GET .../messaging/internal only.
          if (this.activeTab() === 'internal') {
            this.loadInternalTabJobNotes(jobKey);
          }

          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load page data:', err);
          this.errorMessage.set('Failed to load notes. Please refresh the page.');
          this.isLoading.set(false);
        },
      });
  }

  /**
   * Reloads consolidated notes, pinned list, and accounting notes.
   * On the Vendor tab, replaces {@link vendorNotes} from GET .../messaging/vendor (full job thread).
   * @param onComplete Optional callback after all refreshes finish (including vendor messaging when applicable).
   */
  refreshNotes(onComplete?: () => void): void {
    const jobKey = this.jobKey();
    if (!jobKey) {
      onComplete?.();
      return;
    }

    forkJoin({
      notes: this.notesSvc.getConsolidatedNotes(jobKey),
      pinned: this.notesSvc.getPinnedNotes(jobKey),
      accounting: this.notesSvc.getAccountingNotes(jobKey),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ notes, pinned, accounting }) => {
          if (notes.status && notes.data) {
            this.allNotes.set(notes.data.allNotes);
            this.internalNotes.set(notes.data.internalNotes);
            this.vendorNotes.set(notes.data.vendorNotes);
            this.customerNotes.set(notes.data.customerNotes);
          }
          if (pinned.status && pinned.data) {
            this.pinnedNotes.set(pinned.data);
          }
          if (accounting.status && accounting.data) {
            this.accountingNotes.set(accounting.data);
          }

          if (this.activeTab() === 'vendor') {
            this.notesSvc
              .getVendorNotes(jobKey)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (res) => {
                  if (res.status && res.data) {
                    this.vendorNotes.set(res.data);
                  }
                },
                error: () => onComplete?.(),
                complete: () => onComplete?.(),
              });
          } else {
            onComplete?.();
          }
        },
        error: () => onComplete?.(),
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  selectTab(tabId: TabId): void {
    const previous = this.activeTab();
    this.activeTab.set(tabId);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.closeSuccessDialog();

    if (tabId === 'vendor') {
      this.loadVendorTabJobNotes(this.jobKey());
    } else if (tabId === 'customer') {
      this.loadCustomerTabJobNotes(this.jobKey());
    } else if (tabId === 'internal') {
      this.loadInternalTabJobNotes(this.jobKey());
    } else if (previous === 'vendor' || previous === 'customer' || previous === 'internal') {
      // Restore slices from consolidated APIs after leaving Vendor, Customer, or Internal tab.
      this.refreshNotes();
    }
  }

  getTabUnreadCount(tabId: TabId): number {
    const counts = this.unreadCounts();
    switch (tabId) {
      case 'all':
        return counts.all;
      case 'internal':
        return counts.internal;
      case 'vendor':
        return counts.vendor;
      case 'customer':
        return counts.customer;
      default:
        return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  VENDOR SELECTION (Vendor Tab)
  // ═══════════════════════════════════════════════════════════════

  onVendorChange(vendorKey: string): void {
    this.selectedVendorKey.set(vendorKey);
    // Job Notes on Vendor tab always show GET .../messaging/vendor (all vendors). Dropdown only drives recipient picker.
  }

  /**
   * Loads vendor messaging for the job (AdminActivity GET jobs/{jobKey}/messaging/vendor).
   * Used on Vendor tab instead of consolidated vendor slice or per-vendor client filter.
   */
  private loadVendorTabJobNotes(jobKey: string): void {
    if (!jobKey) return;
    this.notesSvc
      .getVendorNotes(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            this.vendorNotes.set(res.data);
          }
        },
      });
  }

  /**
   * Customer tab: populate {@link customerNotes} from GET .../messaging/customer (not the consolidated slice).
   */
  private loadCustomerTabJobNotes(jobKey: string, onComplete?: () => void): void {
    if (!jobKey) {
      onComplete?.();
      return;
    }
    this.notesSvc
      .getCustomerNotes(jobKey)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => onComplete?.()),
      )
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            this.customerNotes.set(res.data);
          }
        },
      });
  }

  /**
   * Internal tab: populate internal notes from GET .../messaging/internal (not the consolidated slice).
   */
  private loadInternalTabJobNotes(jobKey: string, onComplete?: () => void): void {
    if (!jobKey) {
      onComplete?.();
      return;
    }
    this.notesSvc
      .getInternalNotes(jobKey)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => onComplete?.()),
      )
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            this.internalNotes.set(res.data);
            // Keep Internal tab unread badge in sync with GET .../messaging/internal (see service JSDoc).
            this.notesSvc.mergeInternalMessagingIntoConsolidatedAndRecalculateUnread(res.data);
          }
        },
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  NOTE OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  onNoteSaved(result: { success: boolean; message: string }): void {
    if (result.success) {
      this.successMessage.set('');
      this.editorContent.set('');
      const message = result.message || 'Note saved successfully';
      const afterRefresh = () => {
        this.successDialogMessage.set(message);
        this.successDialogOpen.set(true);
      };
      if (this.activeTab() === 'customer') {
        this.loadCustomerTabJobNotes(this.jobKey(), afterRefresh);
      } else if (this.activeTab() === 'internal') {
        this.loadInternalTabJobNotes(this.jobKey(), afterRefresh);
      } else {
        this.refreshNotes(afterRefresh);
      }
    } else {
      this.errorMessage.set(result.message || 'Failed to save note');
    }
  }

  onNoteEmailed(result: { success: boolean; message: string }): void {
    if (result.success) {
      this.successMessage.set('');
      this.editorContent.set('');
      const message = result.message || 'Email sent successfully';
      const afterRefresh = () => {
        this.successDialogMessage.set(message);
        this.successDialogOpen.set(true);
      };
      if (this.activeTab() === 'customer') {
        this.loadCustomerTabJobNotes(this.jobKey(), afterRefresh);
      } else if (this.activeTab() === 'internal') {
        this.loadInternalTabJobNotes(this.jobKey(), afterRefresh);
      } else {
        this.refreshNotes(afterRefresh);
      }
    } else {
      this.errorMessage.set(result.message || 'Failed to send email');
    }
  }

  /** Dismisses the post-save / post-email success modal. */
  closeSuccessDialog(): void {
    this.successDialogOpen.set(false);
    this.successDialogMessage.set('');
  }

  onNotePinned(result: { noteKey: string; isPinned: boolean; msgType: number }): void {
    this.notesSvc.togglePinNote(this.jobKey(), { noteKey: result.noteKey, isPinned: result.isPinned, msgType: result.msgType })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.status) {
            this.successMessage.set(result.isPinned ? 'Note pinned' : 'Note unpinned');
            if (this.activeTab() === 'customer') {
              this.loadCustomerTabJobNotes(this.jobKey());
            } else if (this.activeTab() === 'internal') {
              this.loadInternalTabJobNotes(this.jobKey());
            } else {
              this.refreshNotes();
            }
          } else {
            this.errorMessage.set(res.message || 'Failed to update pin status');
            if (this.activeTab() === 'customer') {
              this.loadCustomerTabJobNotes(this.jobKey());
            } else if (this.activeTab() === 'internal') {
              this.loadInternalTabJobNotes(this.jobKey());
            } else {
              this.refreshNotes();
            }
          }
        },
        error: (err) => {
          console.error('onNotePinned error:', err);
          this.errorMessage.set('Failed to update pin status');
          if (this.activeTab() === 'customer') {
            this.loadCustomerTabJobNotes(this.jobKey());
          } else if (this.activeTab() === 'internal') {
            this.loadInternalTabJobNotes(this.jobKey());
          } else {
            this.refreshNotes();
          }
        },
      });
  }

  onNoteViewed(event: { noteKey: string; msgType: number }): void {
    this.notesSvc.setNoteViewed(this.jobKey(), { noteKey: event.noteKey, msgType: event.msgType })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.status) {
            this.successMessage.set('Message marked as viewed');
            if (this.activeTab() === 'customer') {
              this.loadCustomerTabJobNotes(this.jobKey());
            } else if (this.activeTab() === 'internal') {
              this.loadInternalTabJobNotes(this.jobKey());
            } else {
              this.refreshNotes();
            }
          } else {
            this.errorMessage.set(res.message || 'Failed to mark message as viewed');
            if (this.activeTab() === 'customer') {
              this.loadCustomerTabJobNotes(this.jobKey());
            } else if (this.activeTab() === 'internal') {
              this.loadInternalTabJobNotes(this.jobKey());
            } else {
              this.refreshNotes();
            }
          }
        },
        error: (err) => {
          console.error('onNoteViewed error:', err);
          this.errorMessage.set('Failed to mark message as viewed. Please try again.');
          if (this.activeTab() === 'customer') {
            this.loadCustomerTabJobNotes(this.jobKey());
          } else if (this.activeTab() === 'internal') {
            this.loadInternalTabJobNotes(this.jobKey());
          } else {
            this.refreshNotes();
          }
        },
      });
  }

  onNoteDeleted(event: { noteKey: string; msgType: number }): void {
    if (!confirm('Are you sure you want to delete this note?')) return;

    this.notesSvc.deleteNote(this.jobKey(), { noteKey: event.noteKey, msgType: event.msgType })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.status && res.data?.flag === 1) {
            this.successMessage.set('Note deleted successfully');
            if (this.activeTab() === 'customer') {
              this.loadCustomerTabJobNotes(this.jobKey());
            } else if (this.activeTab() === 'internal') {
              this.loadInternalTabJobNotes(this.jobKey());
            } else {
              this.refreshNotes();
            }
          } else {
            this.errorMessage.set(res.message || 'Failed to delete note');
          }
        },
      });
  }

  onNoteReply(event: { note: NoteItem; replyContent: string }): void {
    // Set the editor content with the reply format
    this.editorContent.set(event.replyContent);
    // Scroll to the editor
    this.scrollToEditor();
  }

  onNoteForward(event: { note: NoteItem; forwardContent: string }): void {
    // Set the editor content with the forwarded message
    this.editorContent.set(event.forwardContent);
    // Scroll to the editor
    this.scrollToEditor();
  }

  private scrollToEditor(): void {
    const editorElement = document.querySelector('app-note-editor');
    if (editorElement) {
      editorElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════

  private extractAdminInfo(): void {
    const adminData = this.authTokenSvc.getAdminDataFromToken();
    this.adminKey.set(adminData.adminKey);
    this.adminName.set(adminData.personName);
    this.adminEmail.set(adminData.adminEmail);
  }

  private createQuotedContent(note: NoteItem): string {
    const date = note.addedOn ? new Date(note.addedOn).toLocaleString() : 'Unknown date';
    const author = note.addedByName || 'Unknown';
    return `
      <blockquote style="border-left: 3px solid #e2e8f0; padding-left: 12px; margin: 16px 0; color: #64748b;">
        <p><strong>On ${date}, ${author} wrote:</strong></p>
        ${note.comment || ''}
      </blockquote>
      <p></p>
    `;
  }

  dismissSuccess(): void {
    this.successMessage.set('');
  }

  dismissError(): void {
    this.errorMessage.set('');
  }

  /** Full-page route only — returns to Assign Vendor for this job. */
  goBackToAssignVendor(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    void this.router.navigate(['/job', jobKey, 'assign-vendor']);
  }
}
