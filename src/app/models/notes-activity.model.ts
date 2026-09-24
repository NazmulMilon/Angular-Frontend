/**
 * Notes & Activity Tab — TypeScript interfaces.
 * Maps to the Job Ops API endpoints under /api/v2/admin-activity/jobs/{jobKey}/...
 */

// ──────────────────────────────────────────────────────────────
//  Generic API response wrapper
// ──────────────────────────────────────────────────────────────

export interface NotesActivityApiResponse<T = unknown> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
  details: ApiErrorDetail[];
  unixTime: number;
  traceId: string | null;
}

export interface ApiErrorDetail {
  message: string;
  code: string | null;
  field: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Page Context (Initial page load data)
// ──────────────────────────────────────────────────────────────

export interface NotesActivityPageContext {
  jobKey: string;
  jobName: string;
  locationKey: string | null;
  customerKey: string | null;
  tradeName: string | null;
  locationDetail: string | null;
  isPrimary: number;
  primaryVendorKey: string;
}

// ──────────────────────────────────────────────────────────────
//  Job Header Detail (reuses shared component interface)
// ──────────────────────────────────────────────────────────────

export interface JobHeaderDetail {
  po: string | null;
  jobStatusName: string | null;
  jobTypeName: string | null;
  customerDne: string | null;
  revCustomerDne: string | null;
  serviceRequest: string | null;
  serviceRequestPreview: string | null;

  customerName: string | null;
  customerContactName: string | null;
  customerContactTitle: string | null;
  customerContactEmail: string | null;
  customerContactPhone: string | null;
  customerContactPhoneExt: string | null;
  customerContactAltPhone: string | null;
  customerContactAltPhoneExt: string | null;
  hasCustomerContract: boolean;
  customerContractKey: string | null;
  customerNotice: string | null;

  locationName: string | null;
  locationAddress: string | null;
  locationAddress2: string | null;
  cityName: string | null;
  stateName: string | null;
  zipCode: string | null;
  locationPhone: string | null;
  locationContactName: string | null;
  locationContactTitle: string | null;
  locationContactEmail: string | null;
  locationContactPhone: string | null;
  locationContactPhoneExt: string | null;
  locationContactAltPhone: string | null;
  locationContactAltPhoneExt: string | null;

  assignedVendors: AssignedVendorDetail[];
}

export interface AssignedVendorDetail {
  vendorKey: string;
  vendorName: string | null;
  isDefault: boolean;
  jobStatusName: string | null;
  vendorDne: number | null;
  revVendorDne: number | null;
  scheduleDate: string | null;
  returnScheduleDate: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPhoneExt: string | null;
  contactAltPhone: string | null;
  contactAltPhoneExt: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Notes Data Models
// ──────────────────────────────────────────────────────────────

export interface NoteItem {
  noteKey: string;
  jobKey: string;
  title: string | null;
  comment: string | null;
  addedOn: string | null;
  dateInString: string | null;
  addedBy: string | null;
  addedByName: string | null;
  fromMsg: string | null;
  toMsg: string | null;
  fileLinks: string | null;
  isPinned: boolean;
  isViewed: boolean;
  isNew: boolean;
  setViewed: string | null;
  noteType: NoteType;
  msgType: number;
  bgColor: string | null;
  vendorKey: string | null;
  /** Personnel/vendor context from accounting notes (`sp_GetAccountingNotesForJob` AccountingPersonKey). */
  accountingPersonKey: string | null;
  /**
   * Server-computed permission flag from GET .../notes/accounting (`NoteDto.CanEditAccountingNote`):
   * true when the current authenticated user owns this accounting note (AdminActionNotes.VendorKey
   * matches their PersonnelKey) and may edit it. Optional/undefined for every other note source
   * (pinned, internal, vendor, customer) where this has no meaning — only the "🏷 Notes To Accounting"
   * popup (NotesToAccountingModalComponent) reads it. The frontend never independently reasons about
   * "who is the current user" for this decision; it trusts this server-provided flag.
   */
  canEditAccountingNote?: boolean | null;
  vendorName: string | null;
  attachmentCount: number;
}

/**
 * Note types based on MsgType from spListOfAllMessege:
 * - MsgType 1: adminToCustomer (Admin sends to Customer via CustomerMesseging)
 * - MsgType 2: adminToAdmin (Admin sends to Admin/Internal via RCSmesseging)
 * - MsgType 3: adminToVendor (Admin sends to Vendor via VendorMesseging)
 * - MsgType 4: noteToLocation (Admin sends to Location via LocationNotes)
 * - MsgType 5: vendorAction (Vendor Action Notes - system/process)
 * - MsgType 6: customerAction (Customer Action Notes - system/process)
 * - MsgType 7: systemGenerated (System Generated from ProcessTrigger)
 * - MsgType 8: adminAction (Admin Action Notes - process executed)
 * - MsgType 9: customerToAdmin (Customer sends to Admin via CustomerContactMesseging)
 * - MsgType 11: vendorToAdmin (Vendor sends to Admin via VendorContactMesseging)
 */
export type NoteType = 
  | 'adminToCustomer'   // MsgType 1
  | 'adminToAdmin'      // MsgType 2
  | 'adminToVendor'     // MsgType 3
  | 'noteToLocation'    // MsgType 4
  | 'vendorAction'      // MsgType 5
  | 'customerAction'    // MsgType 6
  | 'systemGenerated'   // MsgType 7
  | 'adminAction'       // MsgType 8
  | 'customerToAdmin'   // MsgType 9
  | 'vendorToAdmin'     // MsgType 11
  | 'general'
  | 'internal'          // Tab: Internal notes
  | 'vendor'            // Tab: Vendor notes
  | 'customer'          // Tab: Customer notes
  | 'accounting';       // Tab: Accounting notes

/** Human-created messages (MsgType 1,2,3,9,11) vs Action/System notes (MsgType 4,5,6,7,8) */
export const HUMAN_MESSAGE_TYPES: NoteType[] = ['adminToCustomer', 'adminToAdmin', 'adminToVendor', 'customerToAdmin', 'vendorToAdmin'];
export const ACTION_NOTE_TYPES: NoteType[] = ['noteToLocation', 'vendorAction', 'customerAction', 'systemGenerated', 'adminAction'];

export interface ConsolidatedNotes {
  internalNotes: NoteItem[];
  vendorNotes: NoteItem[];
  customerNotes: NoteItem[];
  locationNotes: NoteItem[];
  allNotes: NoteItem[];
}

// ──────────────────────────────────────────────────────────────
//  Contact Models for sending emails
// ──────────────────────────────────────────────────────────────

export interface ContactItem {
  personnelKey: string;
  staffName: string;
  email: string;
  isAccountManager?: boolean;
  isJobAccountManager?: boolean;
  isSelected?: boolean;
}

export interface VendorContactItem {
  vendorKey: string;
  contactKey: string;
  vendorName: string;
  contactName: string;
  email: string;
  isDefault: boolean;
  isSelected?: boolean;
}

export interface CustomerContactItem {
  customerKey: string;
  contactKey: string;
  customerName: string;
  contactName: string;
  email: string;
  isDefault: boolean;
  isJobCustomerContact?: boolean;
  isJobRequester?: boolean;
  isSelected?: boolean;
}

export interface LocationContactItem {
  locationKey: string;
  contactKey: string;
  locationName: string;
  contactName: string;
  email: string;
  isSelected?: boolean;
}

/**
 * Categorized contact selections grouped by type.
 * Each array contains the keys of selected contacts for that category.
 */
export interface CategorizedContacts {
  internal: string[];
  customer: string[];
  vendor: string[];
  location: string[];
  accounting: string[];
}

// ──────────────────────────────────────────────────────────────
//  File Models
// ──────────────────────────────────────────────────────────────

export interface JobFileItem {
  fileKey: string;
  fileName: string | null;
  fileType: string | null;
  documentTypeName: string | null;
  addedOn: string | null;
  addedByName: string | null;
  fileSize: number | null;
  isSelected?: boolean;
}

export interface VendorFileItem {
  fileKey: string;
  fileName: string | null;
  vendorKey: string;
  vendorName: string | null;
  uploadType: string | null;
  addedOn: string | null;
  fileSize: number | null;
  isSelected?: boolean;
}

export interface NoteAttachment {
  attachmentKey: string;
  noteKey: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  addedOn: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Templates
// ──────────────────────────────────────────────────────────────

export interface NoteTemplate {
  templateKey: string;
  templateName: string;
  templateContent: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Request DTOs
// ──────────────────────────────────────────────────────────────

export interface SaveNoteRequest {
  jobKey: string;
  noteKey?: string | null;
  title: string;
  comment: string;
  noteType: NoteType;
  vendorKey?: string | null;
  isNewNote: boolean;
}

export interface PinNoteRequest {
  noteKey: string;
  isPinned: boolean;
  msgType: number;
}

export interface SetNoteViewedRequest {
  noteKey: string;
  msgType: number;
}

export interface DeleteNoteRequest {
  noteKey: string;
  msgType: number;
}

export interface SendNoteEmailRequest {
  jobKey: string;
  noteKey?: string | null;
  subject: string;
  body: string;
  attachmentFileKeys: string[];
  noteType: NoteType;
}

export interface SendInternalEmailRequest extends SendNoteEmailRequest {
  recipientPersonnelKeys: string[];
}

export interface SendCustomerEmailRequest extends SendNoteEmailRequest {
  customerKey: string;
  recipientContactKeys: string[];
}

export interface SendVendorEmailRequest extends SendNoteEmailRequest {
  vendorKey: string;
  recipientContactKeys: string[];
  includeWorkOrder: boolean;
}

export interface SendLocationEmailRequest extends SendNoteEmailRequest {
  locationKey: string;
  recipientContactKeys: string[];
}

export interface SendAccountingEmailRequest extends SendNoteEmailRequest {
  recipientPersonnelKeys: string[];
}

// ──────────────────────────────────────────────────────────────
//  Response DTOs
// ──────────────────────────────────────────────────────────────

export interface DataReturn {
  flag: number;
  message: string;
  key: string | null;
}

export interface SendEmailResponse {
  success: boolean;
  message: string;
  noteKey: string | null;
  messageId: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Unified Save & Email (mirrors legacy SaveMail)
// ──────────────────────────────────────────────────────────────

/** Required on Save & Email when any email recipients are selected (mirrors Job Ops). */
export type NoteEmailSenderChoice = 'Self' | 'ServiceAdmin';

export interface SaveAndEmailRequest {
  jobKey: string;
  notes: string;
  pinNote?: boolean;
  /** Required for Save & Email when sending to any recipient; omit for save-only. */
  emailSenderChoice?: NoteEmailSenderChoice;
  internalRecipients?: string[];
  accountingRecipients?: string[];
  customerRecipients?: string[];
  vendorRecipients?: string[];
  locationRecipients?: string[];
  jobFileKeys?: string[];
  vendorFileKeys?: string[];
  sendEstimateButtonToVendor?: boolean;
  vendorKey?: string;
}

export interface RecipientResult {
  recipientKey: string;
  recipientName: string;
  noteSaved: boolean;
  emailSent: boolean;
  noteKey: string | null;
  error: string | null;
}

export interface SaveAndEmailResults {
  internal: RecipientResult[];
  accounting: RecipientResult[];
  customer: RecipientResult[];
  vendor: RecipientResult[];
  location: RecipientResult[];
}

export interface SaveAndEmailApiResponse {
  success: boolean;
  message: string;
  responseCode: number;
  results: SaveAndEmailResults;
}

export type SaveAndEmailResponse = NotesActivityApiResponse<{
  success: boolean;
  message: string;
  results: SaveAndEmailResults;
}>;

// ──────────────────────────────────────────────────────────────
//  File Upload
// ──────────────────────────────────────────────────────────────

export interface FileUploadRequest {
  jobKey: string;
  file: File;
  documentTypeKey?: string;
}

export interface FileUploadResponse {
  success: boolean;
  fileKey: string | null;
  fileName: string | null;
  message: string;
}

// ──────────────────────────────────────────────────────────────
//  Vendor Selection (for vendor tab)
// ──────────────────────────────────────────────────────────────

export interface JobVendorOption {
  vendorKey: string;
  vendorName: string;
  isDefault: boolean;
}

// ──────────────────────────────────────────────────────────────
//  WebSocket Events for real-time updates
// ──────────────────────────────────────────────────────────────

export interface NoteCreatedEvent {
  type: 'note_created';
  note: NoteItem;
  jobKey: string;
}

export interface NoteUpdatedEvent {
  type: 'note_updated';
  note: NoteItem;
  jobKey: string;
}

export interface NoteDeletedEvent {
  type: 'note_deleted';
  noteKey: string;
  jobKey: string;
}

export interface NotePinnedEvent {
  type: 'note_pinned';
  noteKey: string;
  isPinned: boolean;
  jobKey: string;
}

export type NoteWebSocketEvent =
  | NoteCreatedEvent
  | NoteUpdatedEvent
  | NoteDeletedEvent
  | NotePinnedEvent;

// ──────────────────────────────────────────────────────────────
//  Excel Export
// ──────────────────────────────────────────────────────────────

export interface NoteExportItem {
  title: string;
  comment: string;
  addedBy: string;
  addedOn: string;
  type: string;
  vendor: string;
  isPinned: string;
}

// ──────────────────────────────────────────────────────────────
//  Reply functionality
// ──────────────────────────────────────────────────────────────

export interface ReplyNoteRequest {
  originalNoteKey: string;
  jobKey: string;
  title: string;
  comment: string;
  noteType: NoteType;
}

// ──────────────────────────────────────────────────────────────
//  Unread Indicators
// ──────────────────────────────────────────────────────────────

export interface UnreadCounts {
  internal: number;
  vendor: number;
  customer: number;
  location: number;
  all: number;
}
