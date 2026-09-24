import { DOCUMENT, DecimalPipe } from '@angular/common';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';

import { telHref } from '../../utils/phone-tel.util';

/**
 * Column definition for the data grid.
 * Each column maps a data field to a rendered table column.
 */
export interface GridColumn {
  /** Unique field key matching the data object property */
  field: string;
  /** Display header label */
  header: string;
  /** When set, header is rendered as multiple lines (narrower columns) instead of a single `header` string */
  headerLines?: string[];
  /** Optional native tooltip on the column header (`<th title>`) */
  headerTooltip?: string;
  /** Whether the column is sortable (default: true) */
  sortable?: boolean;
  /** Column width (CSS value, e.g., '120px', '15%') */
  width?: string;
  /** Custom CSS class for the column cells */
  cssClass?: string;
    /** Template type for special rendering */
  type?: 'text' | 'badge' | 'actions' | 'boolean' | 'link' | 'truncate' | 'vendor-name' | 'vendor-status' | 'jobcount-label' | 'contact-detail' | 'html' | 'ai-vendor-name' | 'ai-phone' | 'ai-email' | 'ai-trade' | 'ai-info' | 'miles' | 'relevance-percent' | 'score' | 'fit-score' | 'maybe-no' | 'svc-call' | 'rate-trade' | 'vendor-company' | 'vendor-contact-cell' | 'trade-badge';
  /** For trade-badge type — called when "View Trade" link is clicked */
  tradeClickHandler?: (row: Record<string, unknown>) => void;
  /** For score type — field containing letter grade (A/B/C/D/F) */
  scoreLetterField?: string;
  /** For score type — field containing hex stroke color for the arc */
  scoreColorField?: string;
  /** For score type — field containing score_tier string (excellent/good/average/needs_improvement/N/A) */
  scoreTierField?: string;
  /** For score type — field containing workloadFlag object ({ activeJobs, scorePenalty, tooltip }) */
  scoreWorkloadField?: string;
  /** For score type — field containing pillarScores record for hover tooltip */
  scorePillarField?: string;
  /** For score type — field containing unscoredRankScore (0–100 signal composite for N/A vendors) */
  scoreUnscoredField?: string;
  /** For score type — field containing signalScores dict (keyed by signal name, 0–100 each) */
  scoreSignalField?: string;
  /** For score type — handler called when the score bubble is clicked (opens detail modal) */
  scoreClickHandler?: (row: Record<string, unknown>) => void;
  /** For maybe-no type — handler called when "No" is clicked */
  noHandler?: (row: Record<string, unknown>) => void;
  /** For maybe-no type — handler called when "Maybe" is clicked */
  maybeHandler?: (row: Record<string, unknown>) => void;
  /** For maybe-no type — row field holding the saved choice ("No" or "Maybe") for pinned/read-only rows */
  maybeNoSelectedField?: string;
  /** For maybe-no type — when true, buttons show selection only (no click handlers) */
  maybeNoReadOnly?: boolean;
  /** For vendor-company type — field for the email address shown below the name */
  emailField?: string;
  /** For vendor-company type — when set, email is clickable and runs this instead of mailto: */
  emailClickHandler?: (row: Record<string, unknown>) => void;
  /** For vendor-company type — when set, company name becomes a hyperlink using this URL builder */
  companyLinkHandler?: (row: Record<string, unknown>) => string;
  /** For vendor-company type — when set, shows a "Vendor Login" link that opens vendor portal for that contact */
  vendorLoginHandler?: (row: Record<string, unknown>) => void;
  /** For vendor-contact-cell type — field for the phone number (formatted tel href) shown below the name */
  phoneField?: string;
  /** For rate-trade type — field containing the trade/service list to display below the rate amount */
  tradeField?: string;
  /** For badge type — maps values to CSS classes */
  badgeMap?: Record<string, string>;
  /** For truncate type — max visible characters before "more" link */
  truncateLength?: number;
  /** For vendor-name type — base URL prefix for the vendor link */
  linkBaseUrl?: string;
  /** For vendor-name type — handler called when the select button is clicked */
  selectHandler?: (row: Record<string, unknown>) => void;
  /** Secondary field (e.g. for {@code type: 'jobcount-label'}) rendered as raw HTML alongside the primary field */
  htmlField?: string;
  /** Field to check for a conditional badge (e.g. highCost → "High Cost" badge) */
  badgeField?: string;
  /** Substring to look for inside badgeField value to trigger the badge (keyword mode) */
  badgeKeyword?: string;
  /** When set, badge shows if badgeField value is NOT equal to this (exclude mode — takes priority over badgeKeyword) */
  badgeExcludeValue?: string;
  /** Label text for the conditional badge */
  badgeLabel?: string;
  /** Background colour for the conditional badge */
  badgeColor?: string;
  /** Handler called when a "Rate" button is clicked (passes the row) */
  rateHandler?: (row: Record<string, unknown>) => void;
  /** Handler called when a "Note" button is clicked (passes the row) */
  noteHandler?: (row: Record<string, unknown>) => void;
  /** Called on mouseenter of the Note button to lazy-load tooltip text into row['_noteTooltip'] */
  noteTooltipLoader?: (row: Record<string, unknown>) => void;
  /** Hide the cell value when it equals 0 */
  hideZero?: boolean;
  /** Field containing vendor category label for a dynamic badge (vendor-name type) */
  categoryField?: string;
  /** Field containing hex colour for the category badge (vendor-name type) */
  categoryColorField?: string;
  /** Handler called when the "Contract" button is clicked in vendor-name column */
  contractHandler?: (row: Record<string, unknown>) => void;
  /** Field containing primary vendor marker — shows PRIMARY badge when value is not '-' */
  primaryMarkerField?: string;
  /** Field containing isDefault flag — shows DEFAULT badge with outer glow when truthy */
  defaultField?: string;
  /** Handler called when "Set Default" button is clicked (vendor-name type) — button only shown when row is NOT default and NOT deleted */
  setDefaultHandler?: (row: Record<string, unknown>) => void;
  /** Field containing isDelete flag — when true, row is greyed out and shows "Assign" button instead of "Set Default" */
  deletedField?: string;
  /** Handler called when "Assign" button is clicked (vendor-name type) — button only shown when row IS deleted */
  reassignHandler?: (row: Record<string, unknown>) => void;
  /** Handler called when "Unassign" button is clicked (vendor-name type) — button only shown when row is NOT deleted */
  unassignHandler?: (row: Record<string, unknown>) => void;
  /** For contact-detail type — builds the vendor login URL using vendorKey from the row */
  vendorLoginUrlBuilder?: (row: Record<string, unknown>) => string;
  /** For contact-detail — optional action below contact lines (e.g. Send Msg on assign-vendor assigned grid) */
  sendMessageHandler?: (row: Record<string, unknown>) => void;
  /** For contact-detail — hide the alternate phone line */
  hideAltPhone?: boolean;
  /** Optional formatter function to transform the cell value before display */
  formatter?: (value: unknown, row: Record<string, unknown>) => string;
  /** For ai-trade — field name of the job's trade to compare against vendor trades */
  jobTradeField?: string;
  /** For ai-email — handler called when user saves an inline email */
  emailSaveHandler?: (row: Record<string, unknown>, email: string) => void;
  /**
   * For ai-email — optional action button (e.g. Recruit) and the same handler runs when the user
   * clicks the displayed address (no `mailto:` on the address text).
   */
  emailActionButton?: {
    label: string;
    variant?: 'default' | 'primary' | 'danger' | 'warning' | 'success' | 'mail';
    handler: (row: Record<string, unknown>) => void;
    /** Native tooltip (use for multi-sentence help; browsers show as a single hover panel). */
    tooltip?: string;
  };
  /** For ai-info — handler called when "More Info" button is clicked */
  infoHandler?: (row: Record<string, unknown>) => void;
  /** For link type — when set, clicking the link copies this text to clipboard then opens the URL (e.g. email body for contact form) */
  linkCopyOnClick?: (row: Record<string, unknown>) => string;
}

/** Sort direction type */
export type SortDirection = 'asc' | 'desc' | null;

/** Sort state */
export interface SortState {
  field: string;
  direction: SortDirection;
}

/**
 * Reusable, sleek data grid component with sorting, filtering, and
 * row-action support. Designed for real-time data updates.
 */
@Component({
  selector: 'app-data-grid',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="grid-container" [class.grid-container--borderless]="borderless">
      @if (showSearch) {
        <div class="grid-toolbar">
          <div class="grid-search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M7.333 12.667A5.333 5.333 0 1 0 7.333 2a5.333 5.333 0 0 0 0 10.667ZM14 14l-2.9-2.9"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              [value]="filterText()"
              (input)="onFilterChange($event)"
              class="grid-search__input"
            />
          </div>
          <span class="grid-count">{{ filteredData().length }} records</span>
        </div>
      }
      <div class="grid-table-wrap">
        <table class="grid-table">
          <thead>
            <tr>
              @for (col of columns; track col.field) {
                <th
                  [style.width]="col.width ?? 'auto'"
                  [class.sortable]="col.sortable !== false"
                  [attr.title]="col.headerTooltip || null"
                  (click)="col.sortable !== false ? sortBy(col.field) : null"
                >
                  <span class="th-content" [class.th-content--multiline]="col.headerLines?.length">
                    @if (col.headerLines?.length) {
                      @for (line of col.headerLines; track line) {
                        <span class="th-line">{{ line }}</span>
                      }
                    } @else {
                      {{ col.header }}
                    }
                    @if (col.sortable !== false && sortState().field === col.field) {
                      <span class="sort-icon">
                        {{ sortState().direction === 'asc' ? '&#9650;' : '&#9660;' }}
                      </span>
                    }
                  </span>
                </th>
              }
              @if (actions.length > 0) {
                <th [style.width]="actionsColumnWidth">Actions</th>
              }
            </tr>
          </thead>
          <tbody>
            @if (filteredData().length === 0) {
              <tr>
                <td [attr.colspan]="columns.length + (actions.length > 0 ? 1 : 0)" class="grid-empty">
                  {{ emptyMessage }}
                </td>
              </tr>
            }
            @for (row of paginatedData(); track trackByFn(row)) {
              <tr
                [class]="getRowClass(row)"
                [class.row--highlight]="isHighlighted(row)"
                [class.row--deleted]="isRowDeleted(row)"
                [class.row--clickable]="hasRowClickHandler(row)"
                [title]="getRowTooltip(row)"
                (click)="onRowClick(row, $event)"
              >
                @for (col of columns; track col.field) {
                  <td [class]="col.cssClass ?? ''">
                    @switch (col.type) {
                      @case ('badge') {
                        <span class="badge" [class]="getBadgeClass(row, col)">
                          {{ getCellValue(row, col.field) }}
                        </span>
                      }
                      @case ('boolean') {
                        @if (getCellValue(row, col.field)) {
                          <span class="badge badge--success">Yes</span>
                        } @else {
                          <span class="badge badge--muted">No</span>
                        }
                      }
                      @case ('jobcount-label') {
                        <span class="jcl-cell">
                          <span class="jcl-count">{{ getCellValue(row, col.field) }}</span>
                          @if (col.htmlField) {
                            @for (star of getVendorLabelImages(row, col.htmlField); track star.src) {
                              <img class="jcl-star" [src]="star.src" [title]="star.tooltip" [alt]="star.tooltip" />
                            }
                          }
                        </span>
                      }
                      @case ('contact-detail') {
                        <div class="cd-cell">
                          <span class="cd-name">{{ getCellValue(row, col.field) }}</span>
                          @if (col.vendorLoginUrlBuilder) {
                            <a class="cd-vendor-login" [href]="col.vendorLoginUrlBuilder(row)" target="_blank">Vendor login</a>
                          }
                          @if (row['phone']) {
                            <a class="cd-phone" [href]="telHref(row['phone'])" (click)="$event.stopPropagation()">{{ formatPhoneDisplay(row['phone']) }}{{ row['phoneEXT'] ? ' x' + row['phoneEXT'] : '' }}</a>
                          }
                          @if (row['email']) {
                            <span class="cd-email" [innerHTML]="row['email']"></span>
                          }
                          @if (!col.hideAltPhone && row['altPhone'] && ('' + row['altPhone']).trim()) {
                            <span class="cd-alt"><b>Alt. Phone: </b><a [href]="telHref(row['altPhone'])">{{ row['altPhone'] }}{{ row['altPhoneEXT'] ?? '' }}</a></span>
                          }
                          @if (col.sendMessageHandler) {
                            <div class="cd-send-msg">
                              <button
                                type="button"
                                title="Send Message"
                                class="action-btn action-btn--primary"
                                (click)="col.sendMessageHandler(row); $event.stopPropagation()"
                              >Send Msg</button>
                            </div>
                          }
                        </div>
                      }
                      @case ('vendor-name') {
                        <div class="vn-cell">
                          <!-- Line 1: Company Name + DEFAULT badge + PRIMARY badge + Category badge -->
                          <span class="vn-row">
                            <a class="vn-link"
                              [href]="(col.linkBaseUrl ?? '') + '/MgtVendor/VendorNotes/' + row['vendorKey']"
                              target="_blank"
                              [title]="getCellValue(row, col.field)"
                            >{{ getCellValue(row, col.field) }}</a>
                            @if (col.defaultField && getCellValue(row, col.defaultField)) {
                              <span class="vn-default-badge">DEFAULT</span>
                            }
                            @if (col.primaryMarkerField && getCellValue(row, col.primaryMarkerField) && getCellValue(row, col.primaryMarkerField) !== '-') {
                              <span class="vn-primary-badge">PRIMARY</span>
                            }
                            @if (col.categoryField && getCellValue(row, col.categoryField)) {
                              <span class="vn-badge"
                                [style.background]="col.categoryColorField ? getCellValue(row, col.categoryColorField) : '#eee'"
                              >{{ getCellValue(row, col.categoryField) }}</span>
                            }
                          </span>
                          <span class="vn-consolidator-raw">{{ consolidatorLabelDisplay(row) }}</span>
                          <!-- Line 3: Contract button + Assign/Unassign buttons -->
                          <span class="vn-row">
                            @if (row['registerLink'] && row['registerLink'] !== '.' && col.contractHandler) {
                              <button class="action-btn action-btn--primary" title="View Contract" (click)="col.contractHandler(row); $event.stopPropagation()">Contract</button>
                            }
                            @if (col.deletedField && getCellValue(row, col.deletedField)) {
                              @if (col.reassignHandler) {
                                <button class="btn btn--primary" title="Assign vendor to job" (click)="col.reassignHandler(row); $event.stopPropagation()">Assign</button>
                              }
                            } @else {
                              @if (col.setDefaultHandler && col.defaultField && !getCellValue(row, col.defaultField)) {
                                <button class="btn btn--primary" title="Set as default vendor for this job" (click)="col.setDefaultHandler(row); $event.stopPropagation()">Set as Default</button>
                              }
                              @if (col.unassignHandler) {
                                <button class="btn btn--primary" title="Remove vendor from job" (click)="col.unassignHandler(row); $event.stopPropagation()">Unassign</button>
                              }
                            }
                          </span>
                          @if (col.selectHandler) {
                            @if (row['isVendorAssigned'] === true) {
                              <span class="vn-assigned-label">Already Selected</span>
                            }
                          }
                        </div>
                      }
                      @case ('vendor-status') {
                        <div class="vs-cell">
                          @if (col.deletedField && getCellValue(row, col.deletedField)) {
                            <span class="vs-pill vs-pill--inactive">Inactive</span>
                            @if (col.reassignHandler) {
                              <button class="action-btn action-btn--primary" title="Assign vendor to job" (click)="col.reassignHandler(row); $event.stopPropagation()">Assign</button>
                            }
                          } @else {
                            <span class="vs-pill vs-pill--active">Active</span>
                            @if (col.unassignHandler) {
                              <button class="action-btn action-btn--primary" title="Remove vendor from job" (click)="col.unassignHandler(row); $event.stopPropagation()">Unassign</button>
                            }
                          }
                        </div>
                      }
                      @case ('truncate') {
                        @if (shouldTruncate(row, col)) {
                          @if (isCellExpanded(row, col.field)) {
                            <span class="cell-truncate-text">{{ getCleanCellValue(row, col.field) }}</span>
                            <button class="cell-toggle" (click)="toggleCellExpand(row, col.field, $event)">less</button>
                          } @else {
                            <span class="cell-truncate-text" [title]="getCleanCellValue(row, col.field)">{{ truncateText(row, col) }}</span>
                            <button class="cell-toggle" (click)="toggleCellExpand(row, col.field, $event)">more</button>
                          }
                        } @else {
                          {{ getCleanCellValue(row, col.field) }}
                        }
                      }
                      @case ('html') {
                        <span [innerHTML]="getCellValue(row, col.field)"></span>
                      }
                      @case ('ai-vendor-name') {
                        <div class="ai-vn-cell">
                          <div class="ai-vn-name-row">
                            @if (getCellValue(row, 'website')) {
                              <a class="ai-vn-link" [href]="'' + getCellValue(row, 'website')" target="_blank" rel="noopener">{{ getCellValue(row, col.field) || 'Data Missing' }}</a>
                            } @else {
                              <span class="ai-vn-name" title="No website was found">{{ getCellValue(row, col.field) || 'Data Missing' }}</span>
                            }
                            @if (getCellValue(row, 'avg_rating')) {
                              <span class="ai-rating ai-rating--inline">
                                <span class="ai-rating-star">&#9733;</span>
                                {{ getCellValue(row, 'avg_rating') }}
                                @if (getCellValue(row, 'review_count')) {
                                  <span class="ai-review-count">({{ getCellValue(row, 'review_count') }})</span>
                                }
                              </span>
                            }
                          </div>
                          @if (getCellValue(row, 'is_duplicate_of_internal')) {
                            <span class="ai-internal-badge">In System</span>
                          }
                        </div>
                      }
                      @case ('ai-phone') {
                        @if (getAiPhoneDisplay(row, col.field)) {
                          <a class="ai-phone-link" [href]="'tel:1' + ('' + getAiPhoneDisplay(row, col.field)).replace(/[^0-9]/g, '')">{{ getAiPhoneDisplay(row, col.field) }}</a>
                        } @else {
                          <span class="ai-no-data">--</span>
                        }
                      }
                      @case ('ai-email') {
                        <div class="ai-email-cell">
                          @if (getAiEmailDisplay(row, col.field)) {
                            @if (col.emailActionButton) {
                              <button
                                type="button"
                                class="ai-email-link"
                                [title]="col.emailActionButton.tooltip ?? 'Click to send vendor onboarding email'"
                                (click)="onAiEmailDisplayClick($event, row, col)"
                              >
                                {{ getAiEmailDisplay(row, col.field) }}
                              </button>
                            } @else {
                              <span class="ai-email-text">{{ getAiEmailDisplay(row, col.field) }}</span>
                            }
                          } @else if (row['_editingEmail']) {
                            <div class="ai-email-edit">
                              <input class="ai-email-input" type="email" placeholder="Enter email..." [value]="row['_emailDraft'] ?? ''" (input)="row['_emailDraft'] = $any($event.target).value" (keydown.enter)="aiSaveEmail(row, col)" />
                              <button class="btn btn--primary" (click)="aiSaveEmail(row, col)">Save</button>
                              <button class="btn btn--primary" (click)="row['_editingEmail'] = false">X</button>
                            </div>
                          } @else {
                            <button class="btn btn--primary" (click)="row['_editingEmail'] = true; row['_emailDraft'] = ''">+ Add Email</button>
                          }
                          @if (col.emailActionButton && !getAiEmailDisplay(row, col.field)) {
                            <button
                              type="button"
                              class="btn btn--primary"
                              [class]="'action-btn action-btn--' + (col.emailActionButton.variant ?? 'default')"
                              [title]="col.emailActionButton.tooltip ?? col.emailActionButton.label"
                              (click)="col.emailActionButton.handler(row); $event.stopPropagation()"
                            >
                              {{ col.emailActionButton.label }}
                            </button>
                          }
                        </div>
                      }
                      @case ('ai-trade') {
                        <div class="ai-trade-cell">
                          @if (getCellValue(row, col.field)) {
                            <span class="ai-trade-vendor">{{ aiFormatTrades(row, col.field) }}</span>
                          } @else {
                            <span class="ai-no-data">--</span>
                          }
                        </div>
                      }
                      @case ('ai-info') {
                        <button class="btn btn--primary" (click)="col.infoHandler?.(row); $event.stopPropagation()">More Info</button>
                      }
                      @case ('link') {
                        @if (getCellValue(row, col.field)) {
                          <a
                            class="cell-link"
                            [href]="'' + getCellValue(row, col.field)"
                            target="_blank"
                            rel="noopener"
                            (click)="onLinkClick($event, getCellValue(row, col.field), col, row)"
                          >Contact Page</a>
                        } @else {
                          <span class="ai-no-data">--</span>
                        }
                      }
                      @case ('miles') {
                        <span class="cell-miles">{{ formatMilesCell(getCellValue(row, col.field)) }}</span>
                      }
                      @case ('relevance-percent') {
                        <span class="cell-relevance-percent">{{ formatRelevancePercentCell(getCellValue(row, col.field)) }}</span>
                      }
                      @case ('score') {
                        @let scoreTier = col.scoreTierField ? getCellValue(row, col.scoreTierField) : null;
                        @let scoreVal  = asNumber(getCellValue(row, col.field));
                        @let wload     = col.scoreWorkloadField ? getCellValue(row, col.scoreWorkloadField) : null;
                        @let pillars   = col.scorePillarField   ? getCellValue(row, col.scorePillarField)   : null;
                        @let unscored  = col.scoreUnscoredField ? asNumber(getCellValue(row, col.scoreUnscoredField)) : null;
                        @let signals   = col.scoreSignalField   ? getCellValue(row, col.scoreSignalField)   : null;
                        <div
                          class="score-cell"
                          [class.score-cell--na]="scoreTier === 'N/A'"
                          [class.score-cell--clickable]="!!col.scoreClickHandler"
                          [title]="scoreTier === 'N/A' && unscored != null
                            ? getSignalTooltip(unscored, signals, row['signalExplanations'], row['llmReasoning'])
                            : getPillarTooltip(pillars, row['aiExplanation'])"
                          (click)="col.scoreClickHandler?.(row); $event.stopPropagation()"
                        >
                          @if (scoreTier === 'N/A') {
                            @if (unscored != null) {
                              <svg class="score-arc" viewBox="0 0 44 44" width="44" height="44">
                                <circle cx="22" cy="22" r="17" fill="none" stroke="#eef0f3" stroke-width="4"/>
                                <circle
                                  cx="22" cy="22" r="17" fill="none"
                                  [attr.stroke]="getSignalScoreColor(unscored)"
                                  stroke-width="4"
                                  stroke-linecap="round"
                                  [attr.stroke-dasharray]="getScoreDasharray(unscored)"
                                  stroke-dashoffset="0"
                                  transform="rotate(-90 22 22)"
                                />
                              </svg>
                              <span class="score-number" [style.color]="getSignalScoreColor(unscored)">{{ unscored | number:'1.0-0' }}<sup style="font-size: 0.6em; margin-left: 1px;">*</sup></span>
                            } @else {
                              <div class="score-skeleton">
                                <div class="score-skeleton__ring"></div>
                              </div>
                            }
                          } @else if (scoreVal != null) {
                            <svg class="score-arc" viewBox="0 0 44 44" width="44" height="44">
                              <circle cx="22" cy="22" r="17" fill="none" stroke="#eef0f3" stroke-width="4"/>
                              <circle
                                cx="22" cy="22" r="17" fill="none"
                                [attr.stroke]="getSignalScoreColor(scoreVal)"
                                stroke-width="4"
                                stroke-linecap="round"
                                [attr.stroke-dasharray]="getScoreDasharray(scoreVal)"
                                stroke-dashoffset="0"
                                transform="rotate(-90 22 22)"
                              />
                            </svg>
                            <span class="score-number" [style.color]="getSignalScoreColor(scoreVal)">{{ scoreVal }}</span>
                            @if (col.scoreLetterField && getCellValue(row, col.scoreLetterField)) {
                              <span class="score-letter">{{ getCellValue(row, col.scoreLetterField) }}</span>
                            }
                            @if (wload) {
                              <span
                                class="score-workload-dot"
                                [title]="getWorkloadTooltip(wload)"
                              >●</span>
                            }
                          } @else {
                            @if (scoreLoading) {
                              <div class="score-skeleton">
                                <div class="score-skeleton__ring"></div>
                              </div>
                            } @else {
                              <span class="cell-miles">--</span>
                            }
                          }
                        </div>
                      }
                      @case ('fit-score') {
                        @let fitVal = asNumber(getCellValue(row, col.field));
                        @if (fitVal != null) {
                          <div [class]="'fit-score-cell ' + getFitScoreClass(fitVal)">
                            <span class="fit-score__num">{{ fitVal }}</span>
                            <span class="fit-score__lbl">FIT</span>
                          </div>
                        } @else {
                          <span class="cell-miles">--</span>
                        }
                      }
                      @case ('maybe-no') {
                        <div class="maybe-no-cell">
                          <button
                            type="button"
                            class="maybe-no-btn"
                            [class.maybe-no-btn--selected]="isMaybeNoSelected(row, col, 'No')"
                            [class.maybe-no-btn--readonly]="col.maybeNoReadOnly === true"
                            [style.background-color]="isMaybeNoSelected(row, col, 'No') ? '#dbeafe' : '#ffffff'"
                            [style.border-color]="isMaybeNoSelected(row, col, 'No') ? '#60a5fa' : '#e4e7ec'"
                            [style.color]="isMaybeNoSelected(row, col, 'No') ? '#1d4ed8' : '#0f1729'"
                            [style.font-weight]="isMaybeNoSelected(row, col, 'No') ? '700' : '500'"
                            (click)="onMaybeNoClick($event, row, col, 'No')"
                          >No</button>
                          <button
                            type="button"
                            class="maybe-no-btn"
                            [class.maybe-no-btn--selected]="isMaybeNoSelected(row, col, 'Maybe')"
                            [class.maybe-no-btn--readonly]="col.maybeNoReadOnly === true"
                            [style.background-color]="isMaybeNoSelected(row, col, 'Maybe') ? '#dbeafe' : '#ffffff'"
                            [style.border-color]="isMaybeNoSelected(row, col, 'Maybe') ? '#60a5fa' : '#e4e7ec'"
                            [style.color]="isMaybeNoSelected(row, col, 'Maybe') ? '#1d4ed8' : '#0f1729'"
                            [style.font-weight]="isMaybeNoSelected(row, col, 'Maybe') ? '700' : '500'"
                            (click)="onMaybeNoClick($event, row, col, 'Maybe')"
                          >Maybe</button>
                        </div>
                      }
                      @case ('svc-call') {
                        <div class="cell-stacked">
                          @if (getCellValue(row, col.field) != null && getCellValue(row, col.field) !== 0) {
                            <span class="svc-amount">{{ '\$' + getCellValue(row, col.field) }}</span>
                          }
                          <div class="svc-links">
                            @if (col.rateHandler) {
                              <button class="action-btn action-btn--primary svc-link-btn" (click)="col.rateHandler(row); $event.stopPropagation()">Rates</button>
                            }
                            @if (col.rateHandler && col.noteHandler) {
                              <span class="svc-dot">·</span>
                            }
                            @if (col.noteHandler) {
                              <button class="action-btn action-btn--primary svc-link-btn"
                                [title]="row['_noteTooltip'] ?? ''"
                                (mouseenter)="col.noteTooltipLoader?.(row)"
                                (click)="col.noteHandler(row); $event.stopPropagation()">Notes</button>
                            }
                          </div>
                        </div>
                      }
                      @case ('rate-trade') {
                        @let rtTradeRaw   = col.tradeField ? getRawCellString(row, col.tradeField) : null;
                        @let rtTradeCount = getTradeCount(rtTradeRaw);
                        <div class="rt-cell">
                          @if (getCellValue(row, col.field) != null && getCellValue(row, col.field) !== 0) {
                            <span class="rt-amount">{{ '\$' + getCellValue(row, col.field) }}</span>
                          }
                          @if (col.tradeClickHandler && rtTradeCount > 0) {
                            <button
                              class="trade-view-btn"
                              (click)="col.tradeClickHandler(row); $event.stopPropagation()"
                            >
                              <span class="trade-view-btn__label">View Trade(s)</span>
                              <span class="trade-view-btn__count">{{ rtTradeCount }}</span>
                            </button>
                          } @else if (col.tradeField && getCellValue(row, col.tradeField)) {
                            <span class="rt-trade">{{ getCellValue(row, col.tradeField) }}</span>
                          }
                        </div>
                      }
                      @case ('vendor-company') {
                        <div class="vc-cell">
                          <div class="vc-name-row">
                            @if (col.companyLinkHandler) {
                              <a
                                class="vc-name vc-name--link"
                                [href]="col.companyLinkHandler(row)"
                                target="_blank"
                                rel="noopener noreferrer"
                                (click)="$event.stopPropagation()"
                              >{{ getCellValue(row, col.field) }}</a>
                            } @else {
                              <span class="vc-name">{{ getCellValue(row, col.field) }}</span>
                            }
                            @if (getCellValue(row, col.categoryField ?? '')) {
                              <span
                                class="vc-badge"
                                [style.background]="getCellValue(row, col.categoryColorField ?? '') || '#f4f5f7'"
                                [style.color]="'#475467'"
                                [title]="getVendorCategoryTooltip($any(getCellValue(row, col.categoryField ?? '')))"
                              >{{ getCellValue(row, col.categoryField ?? '') }}</span>
                            }
                          </div>
                          @if (consolidatorLabelDisplay(row); as consolLabel) {
                            <span class="vc-consolidator">{{ consolLabel }}</span>
                          }
                          @if (row['isVendorAssigned'] === true) {
                            <span class="vc-badge vc-badge--selected">Already selected</span>
                          }
                          @if (col.emailField && getCellValue(row, col.emailField)) {
                            @let cleanEmailVal = cleanEmail(getCellValue(row, col.emailField));
                            @if (col.emailClickHandler) {
                              <button
                                type="button"
                                class="vc-email vc-email--action"
                                (click)="onVendorCompanyEmailClick($event, row, col)"
                              >{{ cleanEmailVal }}</button>
                            } @else {
                              <a class="vc-email" [href]="'mailto:' + cleanEmailVal" (click)="$event.stopPropagation()">{{ cleanEmailVal }}</a>
                            }
                          }
                          @if (col.vendorLoginHandler && row['contactKey']) {
                            <button
                              type="button"
                              class="vc-vendor-login"
                              (click)="onVendorLoginClick($event, row, col)"
                              title="Login as this vendor to see their portal view"
                            >
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM3 14a5 5 0 0110 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                              </svg>
                              Vendor Login
                            </button>
                          }
                        </div>
                      }
                      @case ('vendor-contact-cell') {
                        <div class="vc-contact-cell">
                          <span class="vc-contact-name">{{ getCellValue(row, col.field) }}</span>
                          @if (col.phoneField && getCellValue(row, col.phoneField)) {
                            <a class="vc-phone" [href]="getCellValue(row, col.phoneField)" (click)="$event.stopPropagation()">{{ formatPhoneDisplay(getCellValue(row, col.phoneField)) }}</a>
                          }
                        </div>
                      }
                      @case ('trade-badge') {
                        @let tradeRaw   = getRawCellString(row, col.field);
                        @let tradeCount = getTradeCount(tradeRaw);
                        <div class="trade-badge-cell">
                          @if (tradeCount > 0) {
                            <button
                              class="trade-view-btn"
                              (click)="col.tradeClickHandler && col.tradeClickHandler(row); $event.stopPropagation()"
                            >
                              <span class="trade-view-btn__label">View Trade(s)</span>
                              <span class="trade-view-btn__count">{{ tradeCount }}</span>
                            </button>
                          } @else {
                            <span class="cell-miles">--</span>
                          }
                        </div>
                      }
                      @default {
                        @if (col.rateHandler || col.noteHandler) {
                          <div class="cell-stacked">
                            @if (!(col.hideZero && getCellValue(row, col.field) === 0)) {
                              <span class="cell-stacked__value">{{ getFormattedCellValue(row, col) }}</span>
                            }
                            @if (col.badgeField && hasBadgeKeyword(row, col)) {
                              <span class="cell-inline-badge" [style.background]="col.badgeColor ?? '#eee'">{{ col.badgeLabel }}</span>
                            }
                            @if (col.rateHandler) {
                              <button class="action-btn action-btn--primary" (click)="col.rateHandler(row); $event.stopPropagation()">Rates</button>
                            }
                            @if (col.noteHandler) {
                              <button class="action-btn action-btn--primary"
                                [title]="row['_noteTooltip'] ?? ''"
                                (mouseenter)="col.noteTooltipLoader?.(row)"
                                (click)="col.noteHandler(row); $event.stopPropagation()">Notes</button>
                            }
                          </div>
                        } @else {
                          @if (!(col.hideZero && getCellValue(row, col.field) === 0)) {
                            <span>{{ getFormattedCellValue(row, col) }}</span>
                          }
                          @if (col.badgeField && hasBadgeKeyword(row, col)) {
                            <span class="cell-inline-badge" [style.background]="col.badgeColor ?? '#eee'">{{ col.badgeLabel }}</span>
                          }
                        }
                      }
                    }
                  </td>
                }
                @if (actions.length > 0) {
                  <td class="actions-td">
                    <div class="actions-cell">
                      @for (action of actions; track action.label) {
                        @if (!action.visibleWhen || action.visibleWhen(row)) {
                          @if (action.variant === 'chip') {
                            <span class="action-chip">{{ action.label }}</span>
                          } @else {
                            <button
                              class="action-btn"
                              [class]="'action-btn action-btn--' + (action.variant ?? 'default') + (action.cssClass ? ' ' + action.cssClass : '')"
                              [title]="action.label"
                              [disabled]="!!action.loadingWhen?.(row)"
                              (click)="action.handler(row)"
                            >
                              @if (action.loadingWhen?.(row)) {
                                <span class="action-btn__spinner" aria-hidden="true"></span>
                              } @else {
                                {{ action.label }}
                              }
                            </button>
                          }
                        }
                      }
                    </div>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (filteredData().length > pageSize) {
        <div class="grid-pagination">
          <button
            class="page-btn"
            [disabled]="currentPage() === 1"
            (click)="goToPage(currentPage() - 1)"
          >
            Prev
          </button>
          <span class="page-info">
            Page {{ currentPage() }} of {{ totalPages() }}
          </span>
          <button
            class="page-btn"
            [disabled]="currentPage() === totalPages()"
            (click)="goToPage(currentPage() + 1)"
          >
            Next
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .grid-container {
      width: 100%;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 10px;
      overflow: clip;
      background: var(--surface-color, #fff);
      max-width: 100%;
    }

    .grid-container--borderless {
      border: none;
      border-radius: 0;
    }

    /* Ensure container doesn't overflow parent */
    :host {
      display: block;
      width: 100%;
      max-width: 100%;
      overflow: clip;
    }

    .grid-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color, #e2e8f0);
      background: var(--surface-alt, #f8fafc);
      gap: 12px;
    }

    .grid-search {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #fff;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 8px;
      padding: 6px 12px;
      color: var(--text-secondary, #64748b);
      flex: 1;
      max-width: 320px;
    }

    .grid-search__input {
      border: none;
      outline: none;
      font-size: 0.875rem;
      width: 100%;
      color: var(--text-primary, #1e293b);
    }

    .grid-count {
      font-size: 0.8rem;
      color: var(--text-secondary, #64748b);
      white-space: nowrap;
    }

    .grid-table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    /* Desktop - prevent horizontal scroll by constraining table */
    @media (min-width: 769px) {
      .grid-table-wrap {
        overflow-x: hidden;
      }
      .grid-table {
        table-layout: auto;
      }
      .grid-table td,
      .grid-table th {
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
    }

    /* Mobile - allow horizontal scroll and optimize display */
    @media (max-width: 768px) {
      .grid-table-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        margin: 0;
        padding: 0;
        border-radius: 0 0 8px 8px;
      }
      .grid-table {
        min-width: 620px;
      }
      .grid-table th,
      .grid-table td {
        padding: 10px 12px;
        font-size: 0.8rem;
      }
      .grid-toolbar {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        background: #fafbfc;
        border-bottom: 1px solid #eef0f3;
      }
      .grid-search {
        flex: 1 1 100%;
        max-width: 100%;
        min-height: 42px;
        border-radius: 10px;
      }
      .grid-search__input {
        font-size: 0.9rem;
      }
      .grid-count {
        flex: 1 1 auto;
        text-align: left;
        font-size: 0.78rem;
      }
      .grid-pagination {
        padding: 12px 14px;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
      }
      .page-btn {
        min-width: 40px;
        min-height: 40px;
        padding: 8px 12px;
        border-radius: 8px;
      }
      .actions-td {
        width: auto;
        min-width: 110px;
      }
      .action-btn {
        min-height: 34px;
        padding: 6px 10px;
        font-size: 0.74rem;
        border-radius: 7px;
      }
      .vn-link {
        font-size: 0.78rem;
      }
      .vn-badge,
      .vn-primary-badge,
      .vn-default-badge {
        font-size: 0.55rem;
        padding: 1px 4px;
      }
      .ai-vn-link,
      .ai-vn-name {
        font-size: 0.78rem;
      }
      .ai-email-cell {
        flex-direction: column;
        align-items: flex-start;
      }
      .ai-email-input {
        width: 100%;
      }
    }

    /* Small mobile - more compact */
    @media (max-width: 480px) {
      .grid-table {
        min-width: 500px;
      }
      .grid-table th,
      .grid-table td {
        padding: 6px 8px;
        font-size: 0.75rem;
      }
      .th-content {
        font-size: 0.7rem;
      }
      .th-line {
        font-size: 0.62rem;
      }
      .badge {
        padding: 2px 6px;
        font-size: 0.7rem;
      }

      :host(.av-vendor-grid) .grid-table {
        min-width: 1320px !important;
      }
    }

    /* Assign Vendor vendor-discovery grids — track-level horizontal scroll on tablet/mobile */
    @media (max-width: 1024px) {
      :host(.av-vendor-grid) {
        overflow: visible !important;
        max-width: none;
        width: max-content;
        min-width: 100%;
      }

      :host(.av-vendor-grid) .grid-container {
        overflow: visible !important;
        max-width: none;
        width: max-content;
        min-width: 100%;
      }

      /* Horizontal scroll lives on .av-vendor-table-scroll__track in assign-vendor */
      :host(.av-vendor-grid) .grid-table-wrap {
        overflow-x: visible !important;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        width: max-content;
        min-width: 100%;
        max-width: none;
        max-height: min(480px, 55vh);
      }

      /* Override inline % widths on th — they shrink the table to the viewport */
      :host(.av-vendor-grid) .grid-table {
        width: max-content !important;
        min-width: 1320px !important;
        table-layout: auto !important;
      }

      :host(.av-vendor-grid) .grid-table th {
        width: auto !important;
        min-width: 72px;
        white-space: nowrap;
      }

      :host(.av-vendor-grid) .grid-table td {
        width: auto !important;
        min-width: 72px;
        vertical-align: middle;
      }

      :host(.av-vendor-grid) .grid-table th:last-child,
      :host(.av-vendor-grid) .grid-table .actions-td {
        min-width: 120px;
        width: 120px !important;
      }

      :host(.av-vendor-grid) .grid-table .vc-cell {
        min-width: 160px;
      }

      :host(.av-vendor-grid) .grid-table .vc-contact-cell {
        min-width: 140px;
      }

      :host(.av-vendor-grid) .grid-table .maybe-no-cell {
        min-width: 64px;
      }

      :host(.av-vendor-grid) .grid-table .score-cell {
        min-width: 52px;
      }
    }

    .grid-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .grid-table thead {
      background: #fafbfc;
      position: sticky;
      top: 0;
      z-index: 1;
    }

    .grid-table th {
      padding: 9px 14px;
      text-align: left;
      font-weight: 700;
      color: #667085;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border-bottom: 1px solid #eef0f3;
      white-space: normal;
      user-select: none;
      line-height: 1.3;
    }

    .grid-table th.sortable {
      cursor: pointer;
      &:hover {
        color: var(--primary-color, #3b82f6);
      }
    }

    .th-content {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .th-content--multiline {
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      line-height: 1.12;
    }

    .th-line {
      display: block;
      font-size: 0.68rem;
      font-weight: 600;
    }

    .sort-icon {
      font-size: 0.65rem;
      line-height: 1;
    }

    .grid-table td {
      padding: 12px 14px;
      border-bottom: 1px solid #eef0f3;
      color: var(--text-primary, #1e293b);
      vertical-align: middle;
    }

    .grid-table tbody tr {
      transition: background 0.12s ease;
      &:hover {
        background: var(--row-hover, #f8fafc);
      }
    }

    .row--highlight {
      background: #fef9c3 !important;
      font-weight: 600;
    }

    .row--deleted {
      background: #f1f5f9 !important;
      border-left: 4px solid #64748b !important;
      td {
        color: #475569 !important;
      }
      .vn-link {
        color: #334155 !important;
      }
    }

    .row--clickable {
      cursor: pointer;
      transition: background-color 0.15s ease, box-shadow 0.15s ease;
      &:hover {
        box-shadow: inset 0 0 0 2px #3b82f6;
      }
    }

    .grid-empty {
      text-align: center;
      padding: 32px 14px !important;
      color: var(--text-secondary, #94a3b8);
      font-style: italic;
    }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge--success { background: #dcfce7; color: #166534; }
    .badge--warning { background: #fef3c7; color: #92400e; }
    .badge--danger  { background: #fee2e2; color: #991b1b; }
    .badge--info    { background: #dbeafe; color: #1e40af; }
    .badge--primary { background: #ede9fe; color: #5b21b6; }
    .badge--muted   { background: #f1f5f9; color: #64748b; }
    .badge--default { background: #f1f5f9; color: #334155; }

    /* Row classes for special vendor states */
    :host ::ng-deep .row--default-vendor {
      background: #e0f2fe !important;
      border-left: 4px solid #3b82f6 !important;
    }
    :host ::ng-deep .row--primary-vendor {
      background: #fee2e2;
    }

    /* Action column — td keeps table-cell display so vertical-align:middle from .grid-table td applies */
    .actions-td {
      width: auto;
      min-width: 100px;
    }

    /* Action buttons flex wrapper inside the td */
    .actions-cell {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-start;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: #fff;
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      color: var(--text-primary, #334155);
      line-height: 1;
      height: auto;
      margin: 0;
      padding-top: 6px;
      padding-bottom: 6px;
      box-sizing: border-box;
      vertical-align: middle;

      &:hover {
        background: var(--surface-alt, #f1f5f9);
        border-color: var(--border-hover, #cbd5e1);
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        pointer-events: none;
      }
    }

    .action-btn__spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid currentColor;
      border-top-color: transparent;
      opacity: 0.7;
      animation: action-btn-spin 0.7s linear infinite;
    }
    @keyframes action-btn-spin {
      to { transform: rotate(360deg); }
    }

    .action-btn--primary {
      background: var(--primary-color, #6366f1);
      color: #fff;
      border-color: var(--primary-color, #6366f1);
      &:hover { 
        background: var(--primary-hover, #4f46e5); 
        border-color: var(--primary-hover, #4f46e5);
      }
    }

    .action-btn--danger {
      color: #dc2626;
      border-color: #fecaca;
      &:hover { background: #fef2f2; border-color: #dc2626; }
    }

    .action-btn--warning {
      color: #d97706;
      border-color: #fde68a;
      &:hover { background: #fffbeb; border-color: #d97706; }
    }

    .cell-stacked {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .cell-stacked__value {
      font-weight: 500;
    }

    /* Styles for Rates/Notes buttons in cell-stacked */
    .cell-stacked .action-btn {
      padding: 4px 10px;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: 6px;
      line-height: 1.2;
      align-self: flex-start;
    }

    .cell-stacked .action-btn--primary {
      background: #eff6ff;
      color: #2563eb;
      border-color: #bfdbfe;
      
      &:hover {
        background: #dbeafe;
        border-color: #93c5fd;
      }
    }

    .action-btn--success {
      color: #16a34a;
      border-color: #bbf7d0;
      &:hover { background: #f0fdf4; border-color: #16a34a; }
    }

    /* Action button width modifiers */
    .action-btn--w-auto { width: auto; }
    .action-btn--w-xs { min-width: 40px; }
    .action-btn--w-sm { min-width: 60px; }
    .action-btn--w-md { min-width: 80px; }
    .action-btn--w-lg { min-width: 100px; }
    .action-btn--w-xl { min-width: 120px; }

    .action-btn--mail {
      background: #eff6ff;
      color: #2563eb;
      border-color: #bfdbfe;
      box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.25), 0 0 12px rgba(59, 130, 246, 0.2);
      &:hover {
        background: #dbeafe;
        border-color: #93c5fd;
        box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.35), 0 0 14px rgba(59, 130, 246, 0.3);
      }
    }

    /* Pagination */
    .grid-pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px 16px;
      gap: 12px;
      border-top: 1px solid var(--border-color, #e2e8f0);
      background: var(--surface-alt, #f8fafc);
    }

    .page-btn {
      padding: 6px 14px;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 6px;
      background: #fff;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      color: var(--text-primary, #334155);
      transition: all 0.15s ease;

      &:hover:not(:disabled) {
        background: var(--primary-color, #3b82f6);
        color: #fff;
        border-color: var(--primary-color, #3b82f6);
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }

    .page-info {
      font-size: 0.8rem;
      color: var(--text-secondary, #64748b);
    }

    /* Jobcount + VendorLabel cell */
    .jcl-cell {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .jcl-count {
      font-weight: 600;
      font-size: 0.85rem;
    }
    .jcl-star {
      max-height: 18px;
      max-width: 60px;
      vertical-align: middle;
    }

    /* Contact-detail rich cell */
    .cd-cell {
      display: flex;
      flex-direction: column;
      gap: 3px;
      line-height: 1.35;
    }
    .cd-name { font-size: 12.5px; font-weight: 500; color: #0f1729; }
    .cd-phone {
      font-family: 'Geist Mono', 'Courier New', monospace;
      font-size: 12px;
      color: #1d4ed8;
      text-decoration: underline;
      text-decoration-color: #1d4ed8;
    }
    .cd-alt a { color: #2563eb; text-decoration: none; &:hover { text-decoration: underline; } }
    .cd-email { font-size: 11px; color: #667085; }
    .cd-email a { color: #1d4ed8; font-size: 11px; text-decoration: underline; }
    .cd-alt { color: #475569; font-size: 0.78rem; }
    .cd-vendor-login {
      color: #7c3aed;
      font-size: 0.75rem;
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }
    .cd-send-msg {
      margin-top: 6px;
      width: 100%;
    }

    /* Vendor-name rich cell */
    .vn-cell {
      display: flex;
      flex-direction: column;
      gap: 3px;
      line-height: 1.3;
    }
    /** Raw Job Ops {@code consolidator} string under company name (vendor-name cell). */
    .vn-consolidator-raw {
      display: block;
      font-size: 0.7rem;
      font-weight: 500;
      line-height: 1.25;
      word-break: break-word;
      color: #475569;
      white-space: pre-wrap;
    }
    .vn-link {
      color: #2563eb;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.82rem;
      word-break: break-word;
      &:hover { text-decoration: underline; }
    }
    .vn-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .vn-meta-row {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .vn-register {
      font-size: 0.72rem;
      color: #16a34a;
      font-weight: 600;
    }
    .vn-register a {
      color: #16a34a;
      text-decoration: none;
    }
    .vn-register a:hover { text-decoration: underline; }
    .vn-primary-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      white-space: nowrap;
      color: #fff;
      background: #2563eb;
      box-shadow: 0 0 6px 2px rgba(37, 99, 235, 0.45);
      line-height: 1.4;
    }
    .vn-default-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      white-space: nowrap;
      color: #fff;
      background: #3b82f6;
      line-height: 1.4;
    }
    .vn-badge {
      display: inline-block;
      padding: 0px 4px;
      border-radius: 3px;
      font-size: 0.6rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      white-space: nowrap;
      color: #333;
      line-height: 1.4;
    }
    .vn-contract-btn {
      padding: 1px 6px;
      border-radius: 3px;
      border: 1px solid #16a34a;
      background: #f0fdf4;
      color: #16a34a;
      font-size: 0.65rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      letter-spacing: 0.03em;
      &:hover { background: #dcfce7; }
    }
    .vn-set-default-btn {
      padding: 3px 10px;
      border-radius: 4px;
      border: 1px solid #f59e0b;
      background: #fffbeb;
      color: #b45309;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      letter-spacing: 0.02em;
      transition: all 0.12s ease;
      &:hover {
        background: #fef3c7;
        border-color: #d97706;
        color: #92400e;
      }
    }
    .vn-reassign-btn {
      padding: 4px 12px;
      border-radius: 4px;
      border: 1px solid #10b981;
      background: #d1fae5;
      color: #047857;
      font-size: 0.72rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      letter-spacing: 0.02em;
      transition: all 0.12s ease;
      &:hover {
        background: #10b981;
        color: #fff;
      }
    }
    .vn-unassign-btn {
      padding: 3px 10px;
      border-radius: 4px;
      border: 1px solid #ef4444;
      background: #fef2f2;
      color: #dc2626;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      letter-spacing: 0.02em;
      transition: all 0.12s ease;
      &:hover {
        background: #ef4444;
        color: #fff;
      }
    }
    .vn-select-btn {
      margin-top: 2px;
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid #3b82f6;
      background: #eff6ff;
      color: #2563eb;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      align-self: flex-start;
      transition: all 0.12s ease;
      &:hover { background: #3b82f6; color: #fff; }
    }
    .vn-assigned-label {
      display: inline-block;
      margin-top: 3px;
      padding: 2px 10px;
      border-radius: 999px;
      background: #f4f5f7;
      color: #475467;
      font-size: 10.5px;
      font-weight: 600;
      font-style: normal;
      white-space: nowrap;
    }

    /* Vendor Status column (Active/Inactive pill + button) */
    .vs-cell {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .vs-pill {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    .vs-pill--active {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #86efac;
    }
    .vs-pill--inactive {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fca5a5;
    }
    .vs-btn {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s ease;
    }
    .btn--success.vs-btn {
      background: #d1fae5;
      color: #047857;
      border: 1px solid #10b981;
      &:hover {
        background: #10b981;
        color: #fff;
      }
    }
    .btn--danger.vs-btn {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #ef4444;
      &:hover {
        background: #ef4444;
        color: #fff;
      }
    }

    .rate-btn {
      display: inline-block;
      margin-left: 4px;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #6366f1;
      background: #eef2ff;
      color: #4338ca;
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      vertical-align: middle;
      transition: all 0.12s ease;
      &:hover { background: #6366f1; color: #fff; }
    }

    .note-btn {
      display: inline-block;
      margin-left: 4px;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #0d9488;
      background: #f0fdfa;
      color: #0f766e;
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      vertical-align: middle;
      transition: all 0.12s ease;
      &:hover { background: #0d9488; color: #fff; }
    }

    .cell-inline-badge {
      display: inline-block;
      margin-left: 4px;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      vertical-align: middle;
    }

    .cell-truncate-text {
      font-size: 0.82rem;
      line-height: 1.3;
    }
    .cell-miles {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .cell-relevance-percent {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-size: 0.82rem;
    }

    /* Score column */
    .score-cell {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      cursor: default;
      &--clickable {
        cursor: pointer;
        border-radius: 50%;
        transition: box-shadow 0.15s;
        &:hover { box-shadow: 0 0 0 3px rgba(37,99,235,0.18); }
      }
    }
    .score-arc { display: block; overflow: visible; }
    .score-number {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -60%);
      font-family: 'Geist Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      color: #0f1729;
      line-height: 1;
    }
    .score-letter {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, 15%);
      font-family: 'Geist Mono', monospace;
      font-size: 8px;
      font-weight: 700;
      color: #667085;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      line-height: 1;
    }
    .score-na {
      font-family: 'Geist Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: 0.04em;
    }

    /* Score skeleton — pulsing blue ring shown while scorecard data loads */
    .score-skeleton {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
    }
    .score-skeleton__ring {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 4px solid #dbeafe;
      border-top-color: #3b82f6;
      animation: score-skeleton-spin 0.9s linear infinite, score-skeleton-pulse 1.6s ease-in-out infinite;
    }
    @keyframes score-skeleton-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes score-skeleton-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.45; }
    }

    .score-workload-dot {
      position: absolute;
      top: 1px;
      right: 0px;
      font-size: 8px;
      color: #ef4444;
      line-height: 1;
      cursor: help;
    }

    /* FIT Score column (matches Sourcing Agent sa-score badge) */
    .fit-score-cell {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      line-height: 1;
    }
    .fit-score__num {
      font-size: 15px;
      font-weight: 800;
      line-height: 1;
    }
    .fit-score__lbl {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.08em;
      margin-top: 2px;
      opacity: 0.75;
    }
    .fit-score-cell.fit-score--high { color: #e91e63; }
    .fit-score-cell.fit-score--mid  { color: #f97316; }
    .fit-score-cell.fit-score--low  { color: #94a3b8; }

    /* Maybe / No column */
    .maybe-no-cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;
    }
    .maybe-no-btn {
      width: 56px;
      height: 25px;
      background: #fff;
      border: 1px solid #e4e7ec;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 500;
      color: #0f1729;
      cursor: pointer;
      &:hover { background: #f4f5f7; }
    }
    .maybe-no-btn--selected {
      background: #dbeafe;
      border-color: #60a5fa;
      color: #1d4ed8;
      font-weight: 700;
      box-shadow: inset 0 0 0 1px #93c5fd;
    }
    .maybe-no-btn--readonly {
      cursor: default;
      &:not(.maybe-no-btn--selected):hover {
        background: #fff;
      }
    }

    /* SVC Call column */
    .svc-amount {
      display: block;
      font-family: 'Geist Mono', monospace;
      font-size: 12px;
      font-weight: 600;
      color: #0f1729;
      letter-spacing: -0.01em;
    }
    .svc-links {
      display: flex;
      align-items: center;
      gap: 3px;
      margin-top: 2px;
    }
    .svc-dot {
      color: #667085;
      font-size: 10px;
    }
    .svc-link-btn {
      font-size: 11.5px !important;
      padding: 4px 10px !important;
      height: auto !important;
      letter-spacing: 0.02em;
      border-radius: 4px !important;
    }

    /* Vendor company cell */
    .vc-cell {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .vc-name-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
    }
    .vc-name {
      font-size: 13px;
      font-weight: 600;
      color: #0f1729;
      letter-spacing: -0.065px;
    }
    .vc-name--link {
      color: #2563eb;
      text-decoration: none;
      cursor: pointer;
      transition: color 0.15s ease;

      &:hover {
        color: #1d4ed8;
        text-decoration: underline;
      }

      &:active {
        color: #1e40af;
      }
    }
    .vc-consolidator {
      display: block;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.25;
      color: #475569;
      word-break: break-word;
    }
    .vc-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 600;
      background: #f4f5f7;
      color: #475467;
      width: fit-content;
      cursor: help;
    }
    .vc-badge--selected {
      background: #f4f5f7;
      color: #475467;
    }
    .vc-email {
      font-size: 11px;
      color: #667085;
    }
    .vc-email--action {
      border: none;
      background: none;
      padding: 0;
      margin: 0;
      cursor: pointer;
      text-align: left;
      font: inherit;
      text-decoration: underline;
      &:hover {
        color: #1d4ed8;
      }
    }
    .vc-vendor-login {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      padding: 2px 8px;
      font-size: 10.5px;
      font-weight: 500;
      color: #2563eb;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      width: fit-content;
      max-width: 100%;

      svg {
        flex-shrink: 0;
      }

      &:hover {
        background: #dbeafe;
        border-color: #93c5fd;
        color: #1d4ed8;
      }

      &:active {
        background: #bfdbfe;
      }
    }

    /* Vendor contact cell */
    .vc-contact-cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .vc-contact-name {
      font-size: 12.5px;
      font-weight: 500;
      color: #0f1729;
    }
    .vc-phone {
      font-family: 'Geist Mono', 'Courier New', monospace;
      font-size: 12px;
      color: #1d4ed8;
      text-decoration: underline;
      text-decoration-color: #1d4ed8;
    }

    /* Trade badge column — "View Trade(s) [9]" button */
    .trade-badge-cell {
      display: flex;
      align-items: center;
      max-width: 100%;
      overflow: hidden;
    }
    .trade-view-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 12px;
      background: var(--primary-color, #6366f1);
      border: 1px solid var(--primary-color, #6366f1);
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      max-width: 100%;
      overflow: hidden;
      transition: background 0.15s, border-color 0.15s;
      &:hover {
        background: var(--primary-hover, #4f46e5);
        border-color: var(--primary-hover, #4f46e5);
      }
    }
    .trade-view-btn__label {
      font-size: 0.80rem;
      font-weight: 500;
      color: #fff;
      line-height: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .trade-view-btn__count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 15px;
      height: 15px;
      padding: 0 3px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.25);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 600;
      line-height: 1;
    }

    /* Rate · Trade combined cell */
    .rt-cell {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .rt-amount {
      font-family: 'Geist Mono', 'Courier New', monospace;
      font-size: 12px;
      font-weight: 600;
      color: #0f1729;
      letter-spacing: -0.12px;
    }
    .rt-trade {
      font-size: 11px;
      color: #475467;
      max-width: 160px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Action chip (non-interactive pill for "Selected" / "Already selected") */
    .action-chip {
      display: inline-flex;
      align-items: center;
      padding: 3px 12px;
      border-radius: 999px;
      background: #f4f5f7;
      color: #475467;
      font-size: 10.5px;
      font-weight: 600;
      white-space: nowrap;
      cursor: default;
    }

    .cell-toggle {
      display: inline;
      background: none;
      border: none;
      color: var(--primary-color, #3b82f6);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0 2px;
      margin-left: 2px;
      text-decoration: underline;
      &:hover { color: var(--primary-hover, #2563eb); }
    }

    /* AI Sourcing — vendor name cell */
    .ai-vn-cell {
      display: flex;
      flex-direction: column;
      gap: 3px;
      line-height: 1.3;
    }
    .ai-vn-name-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .ai-vn-link {
      color: #6366f1;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.82rem;
      word-break: break-word;
      &:hover { text-decoration: underline; }
    }
    .ai-vn-name {
      font-weight: 600;
      font-size: 0.82rem;
      color: #1e293b;
    }
    .ai-rating {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-size: 0.75rem;
      color: #64748b;
    }
    .ai-rating--inline {
      flex-shrink: 0;
      white-space: nowrap;
    }
    .ai-rating-star { color: #f59e0b; font-size: 0.9rem; }
    .ai-review-count { color: #94a3b8; font-size: 0.7rem; }
    .ai-internal-badge {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.6rem;
      font-weight: 700;
      background: #fef3c7;
      color: #92400e;
      align-self: flex-start;
    }

    /* AI phone link */
    .ai-phone-link {
      color: #2563eb;
      text-decoration: none;
      font-size: 0.82rem;
      &:hover { text-decoration: underline; }
    }
    .ai-no-data { color: #94a3b8; font-size: 0.8rem; }
    .cell-link {
      color: #2563eb;
      text-decoration: none;
      font-size: 0.82rem;
      &:hover { text-decoration: underline; }
    }

    /* AI email — editable inline; cell can also show an action button */
    .ai-email-cell {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .ai-email-link {
      color: #2563eb;
      text-decoration: underline;
      text-decoration-style: dashed;
      text-underline-offset: 2px;
      font-size: 0.82rem;
      word-break: break-all;
      border: none;
      background: none;
      padding: 0;
      margin: 0;
      cursor: pointer;
      font-family: inherit;
      text-align: left;
      line-height: 1.4;
      &:hover {
        color: #1d4ed8;
        text-decoration-style: solid;
      }
    }
    .ai-email-text {
      color: #1e293b;
      font-size: 0.82rem;
      word-break: break-all;
    }
    .ai-email-edit {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .ai-email-input {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 0.78rem;
      width: 140px;
      outline: none;
      &:focus { border-color: #6366f1; }
    }
    .ai-email-save-btn {
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #16a34a;
      background: #f0fdf4;
      color: #16a34a;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      &:hover { background: #dcfce7; }
    }
    .ai-email-cancel-btn {
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      background: #fff;
      color: #64748b;
      font-size: 0.7rem;
      cursor: pointer;
      &:hover { background: #f1f5f9; }
    }
    .ai-email-add-btn {
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px dashed #cbd5e1;
      background: #fff;
      color: #6366f1;
      font-size: 0.72rem;
      font-weight: 500;
      cursor: pointer;
      &:hover { border-color: #6366f1; background: #f5f3ff; }
    }

    /* AI trade cell */
    .ai-trade-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 0.8rem;
    }
    .ai-trade-job {
      font-weight: 600;
      color: #1e293b;
    }
    .ai-trade-vendor {
      color: #6366f1;
      font-size: 0.75rem;
    }

    /* AI Info button */
    .ai-info-btn {
      padding: 3px 10px;
      border-radius: 5px;
      border: 1px solid #6366f1;
      background: #f5f3ff;
      color: #6366f1;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s ease;
      &:hover { background: #6366f1; color: #fff; }
    }
  `,
})
export class DataGridComponent implements OnChanges {
  private readonly document = inject(DOCUMENT);

  /** Normalized {@code tel:} href for contact-detail / job grids (API may already prefix {@code tel:}). */
  readonly telHref = telHref;

  /** Column definitions */
  @Input({ required: true }) columns: GridColumn[] = [];

  /** Data array to display (updated in real-time via Observables) */
  @Input() set data(value: Record<string, unknown>[]) {
    this._data.set(value ?? []);
    this.currentPage.set(1);
  }

  /** Width of the actions column when actions are provided (default 180px) */
  @Input() actionsColumnWidth = '180px';

  /** Row action buttons */
  @Input() actions: {
    label: string;
    variant?: 'default' | 'primary' | 'danger' | 'warning' | 'success' | 'chip';
    cssClass?: string;
    handler: (row: Record<string, unknown>) => void;
    visibleWhen?: (row: Record<string, unknown>) => boolean;
    /** When true for a row, the button is disabled and shows a spinner instead of its label. */
    loadingWhen?: (row: Record<string, unknown>) => boolean;
  }[] = [];

  /** Number of rows per page */
  @Input() pageSize = 50;

  /** Whether to show the search/filter toolbar */
  @Input() showSearch = true;

  /** When true, removes the outer border and border-radius so the grid blends into its container section. */
  @Input() borderless = false;

  /** When true, the score column shows a pulsing skeleton instead of empty cells while data loads. */
  @Input() scoreLoading = false;

  /** Message to display when no data */
  @Input() emptyMessage = 'No records found.';

  /** Field to identify unique rows for tracking */
  @Input() trackField = 'pKey';

  /** Function to determine row CSS class based on data */
  @Input() rowClassFn: ((row: Record<string, unknown>) => string) | null = null;

  /** Function to determine if a row should be highlighted */
  @Input() highlightFn: ((row: Record<string, unknown>) => boolean) | null = null;

  /** Handler called when a row is clicked for "assign" action (row is deleted/unassigned) */
  @Input() rowAssignHandler: ((row: Record<string, unknown>) => void) | null = null;

  /** Handler called when a row is clicked for "unassign" action (row is not deleted/assigned) */
  @Input() rowUnassignHandler: ((row: Record<string, unknown>) => void) | null = null;

  /**
   * When set, the grid starts sorted by this column (e.g. distance ascending for AI vendors).
   */
  @Input() initialSort: { field: string; direction: 'asc' | 'desc' } | null = null;

  /** Emitted when a row is clicked */
  @Output() rowClick = new EventEmitter<Record<string, unknown>>();

  /** Internal data signal */
  readonly _data = signal<Record<string, unknown>[]>([]);
  readonly filterText = signal('');
  readonly sortState = signal<SortState>({ field: '', direction: null });
  readonly currentPage = signal(1);

  /** Tracks which truncated cells are expanded (key = trackField + '-' + colField) */
  private readonly expandedCells = new Set<string>();

  /** Filtered and sorted data */
  readonly filteredData = computed(() => {
    let result = [...this._data()];
    const filter = this.filterText().toLowerCase().trim();

    if (filter) {
      result = result.filter((row) =>
        this.columns.some((col) => {
          const val = this.getCellValue(row, col.field);
          return val != null && String(val).toLowerCase().includes(filter);
        })
      );
    }

    const { field, direction } = this.sortState();
    if (field && direction) {
      result.sort((a, b) => {
        const aVal = this.getCellValue(a, field);
        const bVal = this.getCellValue(b, field);
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return direction === 'asc' ? -1 : 1;
        if (bVal == null) return direction === 'asc' ? 1 : -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const comparison = String(aVal).localeCompare(String(bVal));
        return direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  });

  /** Total pages for pagination */
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredData().length / this.pageSize))
  );

  /** Current page data slice */
  readonly paginatedData = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredData().slice(start, start + this.pageSize);
  });

  /** Handle filter input changes */
  onFilterChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filterText.set(value);
    this.currentPage.set(1);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['initialSort']) return;
    const init = changes['initialSort'].currentValue as
      | { field: string; direction: 'asc' | 'desc' }
      | null
      | undefined;
    if (init?.field && init?.direction) {
      this.sortState.set({ field: init.field, direction: init.direction });
    }
  }

  /** Toggle sort on a column */
  sortBy(field: string): void {
    const current = this.sortState();
    if (current.field === field) {
      const next: SortDirection =
        current.direction === 'asc' ? 'desc' : current.direction === 'desc' ? null : 'asc';
      this.sortState.set({ field: next ? field : '', direction: next });
    } else {
      this.sortState.set({ field, direction: 'asc' });
    }
  }

  cleanEmail(emailVal: unknown): string {
    const str = String(emailVal ?? '');
    let result = str;
    if (result.startsWith('mailto:')) {
      result = result.substring(7);
    }
    if (result.includes('<a') && result.includes('href')) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = result;
      const aTag = tempDiv.querySelector('a');
      if (aTag && aTag.textContent) {
        result = aTag.textContent.trim();
      }
    }
    return result;
  }

  /** Navigate to a specific page */
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  /** Get nested cell value by dot-notation field path */
  getCellValue(row: Record<string, unknown>, field: string): unknown {
    return field.split('.').reduce((obj: unknown, key) => {
      return obj != null && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : null;
    }, row);
  }

  /**
   * Raw {@code consolidator} from the row (Job Ops vendor-list JSON). Plain text under the company link
   * in {@code type: 'vendor-name'} cells — escaped by Angular interpolation (not {@code innerHTML}).
   */
  consolidatorPropertyDisplay(row: Record<string, unknown>): string {
    const v = row['consolidator'];
    return v === null || v === undefined ? '' : String(v);
  }

  /** Human-readable consolidator label; hides empty and {@code --}. */
  consolidatorLabelDisplay(row: Record<string, unknown>): string {
    const raw = this.consolidatorPropertyDisplay(row).trim();
    if (!raw || raw === '--') return '';
    return raw;
  }

  /** Get cell value with optional formatter applied */
  getFormattedCellValue(row: Record<string, unknown>, col: GridColumn): string {
    const value = this.getCellValue(row, col.field);
    if (col.formatter) {
      return col.formatter(value, row);
    }
    return String(value ?? '');
  }

  /**
   * Formats a distance/radius value for `type: 'miles'` cells: numeric display plus a space and `mi`.
   * Non-finite or empty values render as `--`.
   */
  formatMilesCell(raw: unknown): string {
    if (raw == null || raw === '') return '--';
    const n =
      typeof raw === 'number'
        ? raw
        : Number(String(raw).trim().replace(/,/g, ''));
    if (!Number.isFinite(n)) return '--';
    const rounded = Math.round(n * 100) / 100;
    const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return `${text} mi`;
  }

  /** Coerce unknown to number | null — used in score templates. */
  asNumber(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Returns the trade count from a grid cell value that may be either:
   * - A number / numeric string  → used directly (e.g. noOfTrade = 5)
   * - A comma-separated string   → counted by splitting on commas (e.g. "Plumbing, Electrical")
   * Returns 0 when the value is null/empty/unparseable.
   */
  /**
   * Strips legacy HTML from a raw trade list string.
   * The old system truncated trade names and hid the remainder inside a
   * <button value="...">Show More</button>. We inline the value attribute so
   * the full trade name is reconstructed, then strip all remaining tags.
   */
  private cleanTradeHtml(raw: string): string {
    let s = raw.replace(
      /<button[^>]*\bvalue="([^"]*)"[^>]*>[\s\S]*?<\/button>/gi,
      (_, val) => val
    );
    s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    s = s.replace(/<[^>]*>/g, '');
    // Only replace "and"/"or" when they sit between newlines (legacy list separator),
    // NOT when they appear inside a trade name like "Painting and Decorating"
    s = s.replace(/\r?\n\s*\band\b\s*\r?\n/gi, ',');
    s = s.replace(/\r?\n\s*\bor\b\s*\r?\n/gi, ',');
    s = s.replace(/\r?\n/g, ',');
    s = s.replace(/,+/g, ',').replace(/^,|,$/g, '').trim();
    return s;
  }

  /**
   * Splits a comma-separated trade list while respecting parentheses,
   * so "Asphalt Maintenance (e.g. Crack Filling, Patching)" stays as one entry.
   * Also strips legacy HTML (Show More buttons) before splitting.
   */
  private splitTradeList(raw: string): string[] {
    const cleaned = this.cleanTradeHtml(raw);
    const result: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of cleaned) {
      if (ch === '(') { depth++; current += ch; }
      else if (ch === ')') { depth = Math.max(0, depth - 1); current += ch; }
      else if (ch === ',' && depth === 0) {
        const trimmed = current.trim();
        if (trimmed && !/^(and|or)$/i.test(trimmed)) result.push(trimmed);
        current = '';
      } else {
        current += ch;
      }
    }
    const trimmed = current.trim();
    if (trimmed && !/^(and|or)$/i.test(trimmed)) result.push(trimmed);
    return result;
  }

  getTradeCount(v: unknown): number {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    const str = String(v).trim();
    if (str === '') return 0;
    // If it's a plain integer string with no commas, return it as-is
    const asNum = Number(str);
    if (Number.isFinite(asNum) && !str.includes(',')) return asNum;
    return this.splitTradeList(str).length;
  }

  /** Returns the arc stroke color based on score value (0-100). */
  getScoreColor(score: number): string {
    if (score >= 80) return '#28cd41';  // bright green
    if (score >= 65) return '#ffc200';  // bright yellow
    if (score >= 50) return '#ff8800';  // bright orange
    return '#ff3b30';                   // bright red
  }

  /**
   * Returns the arc stroke color driven by score_tier when available,
   * falling back to the gradient-based getScoreColor.
   */
  getScoreTierColor(tier: unknown, score: number): string {
    switch (tier) {
      case 'excellent':        return '#28cd41';  // bright green
      case 'good':             return '#ffc200';  // bright yellow
      case 'average':          return '#ff8800';  // bright orange
      case 'needs_improvement':return '#ff3b30';  // bright red
      default:                 return this.getScoreColor(score);
    }
  }

  /** Arc / number color for unscored signal scores based on value ranges. */
  getSignalScoreColor(score: unknown): string {
    const n = typeof score === 'number' ? score : Number(score);
    if (!Number.isFinite(n)) return '#94a3b8';
    if (n >= 91) return '#28cd41';   // bright green  91–100
    if (n >= 75) return '#ff8800';   // bright orange 75–90
    if (n >= 50) return '#ffc200';   // bright yellow 50–74
    return '#ff3b30';                // bright red    0–49
  }

  /**
   * Builds a hover tooltip string listing all 5 pillar scores and optional AI explanations.
   * pillarScores is a Record<string, { score, weight, explanation? }> or null.
   */
  getPillarTooltip(pillars: unknown, aiExplanation?: unknown): string {
    const lines: string[] = [];
    if (typeof aiExplanation === 'string' && aiExplanation.trim()) {
      lines.push(aiExplanation.trim());
    }
    if (!pillars || typeof pillars !== 'object') return lines.join('\n');
    const pillarLabels: Record<string, string> = {
      cost: 'Cost',
      dependability: 'Dependability',
      system_use: 'System Use',
      communication: 'Communication',
      behavior: 'Behavior',
    };
    const entries = Object.entries(pillars as Record<string, { score: number; weight: number; explanation?: string | null }>);
    if (!entries.length) return lines.join('\n');
    const pillarLines = entries
      .map(([key, val]) => {
        const label = pillarLabels[key] ?? key;
        const pct = Math.round((val.weight ?? 0) * 100);
        const scoreLine = `${label}: ${Math.round(val.score ?? 0)}/100 (${pct}% weight)`;
        const explanation = val.explanation?.trim();
        return explanation ? `${scoreLine}\n  ${explanation}` : scoreLine;
      });
    if (lines.length) {
      lines.push('', ...pillarLines);
    } else {
      lines.push(...pillarLines);
    }
    return lines.join('\n');
  }

  /**
   * Returns a multi-line tooltip for unscored vendors showing the 5 lightweight
   * signal scores and, when available, per-signal explanations or LLM fit reasoning.
   */
  getSignalTooltip(
    unscoredScore: unknown,
    signals: unknown,
    signalExplanations?: unknown,
    llm?: unknown,
  ): string {
    const score = typeof unscoredScore === 'number' ? Math.round(unscoredScore) : null;
    const lines: string[] = [];
    lines.push(`Signal fit score: ~${score ?? '?'}`);

    const explanations =
      signalExplanations && typeof signalExplanations === 'object'
        ? signalExplanations as Record<string, string>
        : null;
    const hasExplanations = explanations && Object.keys(explanations).length > 0;

    if (signals && typeof signals === 'object') {
      const signalLabels: Record<string, string> = {
        distance:                  'Distance',
        llm_job_fit:               'Job fit (AI)',
        trade_match:               'Trade match',
        profile_compliance:        'Profile compliance',
        engagement_responsiveness: 'Responsiveness',
      };
      const entries = Object.entries(signals as Record<string, number>);
      if (entries.length) {
        for (const [key, val] of entries) {
          const label = signalLabels[key] ?? key;
          const scoreText = typeof val === 'number' ? val.toFixed(1) : val;
          const explanation = hasExplanations ? explanations[key]?.trim() : '';
          if (explanation) {
            lines.push(`• ${label}: ${scoreText} — ${explanation}`);
          } else {
            lines.push(`• ${label}: ${scoreText}`);
          }
        }
      }
    }

    if (!hasExplanations && llm && typeof llm === 'string' && llm.trim()) {
      lines.push(`LLM: "${llm.trim()}"`);
    }

    return lines.join('\n');
  }

  /** Returns tooltip text for the workload flag badge. */
  getWorkloadTooltip(wload: unknown): string {
    if (!wload || typeof wload !== 'object') return '';
    const w = wload as { tooltip?: string; activeJobs?: number; scorePenalty?: number };
    return w.tooltip ?? `${w.activeJobs ?? '?'} active jobs — score reduced by ${w.scorePenalty ?? '?'} pts`;
  }

  /** Returns SVG stroke-dasharray for a score circle (circumference = 2π×17 ≈ 106.8). */
  getScoreDasharray(score: number): string {
    const circ = 2 * Math.PI * 17;
    const filled = Math.max(0, Math.min(100, score)) / 100 * circ;
    return `${filled.toFixed(1)} ${circ.toFixed(1)}`;
  }

  /** Returns CSS modifier class for the FIT score badge (score is 0–100). */
  getFitScoreClass(score: number): string {
    if (score >= 80) return 'fit-score--high';
    if (score >= 60) return 'fit-score--mid';
    return 'fit-score--low';
  }

  /** Format a tel: href back to a readable phone number for display. */
  formatPhoneDisplay(raw: unknown): string {
    if (!raw) return '';
    const s = String(raw).replace(/^tel:/, '').replace(/\D/g, '');
    if (s.length === 11 && s.startsWith('1')) {
      const d = s.slice(1);
      return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    }
    if (s.length === 10) return `(${s.slice(0,3)}) ${s.slice(3,6)}-${s.slice(6)}`;
    return String(raw).replace(/^tel:/, '');
  }

  /**
   * Formats `relevance_score` for `type: 'relevance-percent'`: values in [0, 1] are shown as a percent of 100;
   * values greater than 1 are shown as the number followed by `%` (already a percent scale).
   */
  formatRelevancePercentCell(raw: unknown): string {
    if (raw == null || raw === '') return '--';
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) return '--';
    const pct = n >= 0 && n <= 1 ? n * 100 : n;
    const rounded = Math.round(pct * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${text}%`;
  }

  /** Track function for @for loop */
  trackByFn(row: Record<string, unknown>): unknown {
    return row[this.trackField] ?? row;
  }

  /** Get badge CSS class based on value mapping */
  getBadgeClass(row: Record<string, unknown>, col: GridColumn): string {
    const val = String(this.getCellValue(row, col.field) ?? '');
    return 'badge ' + (col.badgeMap?.[val] ?? 'badge--default');
  }

  /** Get custom row class */
  getRowClass(row: Record<string, unknown>): string {
    return this.rowClassFn ? this.rowClassFn(row) : '';
  }

  /** Check if row should be highlighted */
  isHighlighted(row: Record<string, unknown>): boolean {
    return this.highlightFn ? this.highlightFn(row) : false;
  }

  /** Check if row is marked as deleted (greyed out) based on any column's deletedField */
  isRowDeleted(row: Record<string, unknown>): boolean {
    for (const col of this.columns) {
      if (col.deletedField && this.getCellValue(row, col.deletedField)) {
        return true;
      }
    }
    return false;
  }

  /** Check if row has a click handler (either assign or unassign) */
  hasRowClickHandler(row: Record<string, unknown>): boolean {
    const isDeleted = this.isRowDeleted(row);
    return (isDeleted && !!this.rowAssignHandler) || (!isDeleted && !!this.rowUnassignHandler);
  }

  /** Get tooltip text for the row */
  getRowTooltip(row: Record<string, unknown>): string {
    if (!this.hasRowClickHandler(row)) return '';
    return this.isRowDeleted(row) ? 'Click to assign' : 'Click to unassign';
  }

  /** Handle row click - call appropriate handler based on row state */
  onRowClick(row: Record<string, unknown>, event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    
    const isDeleted = this.isRowDeleted(row);
    if (isDeleted && this.rowAssignHandler) {
      this.rowAssignHandler(row);
    } else if (!isDeleted && this.rowUnassignHandler) {
      this.rowUnassignHandler(row);
    }
    
    this.rowClick.emit(row);
  }

  /**
   * Strips HTML tags from a string and decodes common HTML entities.
   * Used to clean legacy data that may contain embedded markup.
   */
  private stripHtml(html: string): string {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Returns cell value with HTML stripped and trailing commas removed (for truncate columns) */
  getCleanCellValue(row: Record<string, unknown>, field: string): string {
    const raw = String(this.getCellValue(row, field) ?? '');
    return this.stripHtml(raw).replace(/,\s*$/, '');
  }

  /**
   * Returns the raw string value of a cell WITHOUT stripping HTML.
   * Used for trade columns so that cleanTradeHtml() can inline legacy
   * Show More button values before counting or displaying trades.
   */
  getRawCellString(row: Record<string, unknown>, field: string): string {
    return String(this.getCellValue(row, field) ?? '');
  }

  /** Returns a descriptive tooltip for vendor category/status badges. */
  getVendorCategoryTooltip(category: unknown): string {
    switch ((String(category ?? '')).trim().toLowerCase()) {
      case 'new':        return 'This has not been used before';
      case 'neutral**':    return 'No human scoring yet';
      case 'dnu risk':   return 'Do not use';
      case '1st choice': return 'Preferred vendor for this trade/area';
      case '2nd choice': return 'Acceptable but not preferred';
      case 'last resort':return 'Only use if no other vendor is available';
      default:           return String(category ?? '');
    }
  }

  /** Whether cell text exceeds the truncate threshold */
  shouldTruncate(row: Record<string, unknown>, col: GridColumn): boolean {
    const val = this.getCleanCellValue(row, col.field);
    return val.length > (col.truncateLength ?? 30);
  }

  /** Return truncated text with ellipsis */
  truncateText(row: Record<string, unknown>, col: GridColumn): string {
    const val = this.getCleanCellValue(row, col.field);
    const max = col.truncateLength ?? 30;
    return val.substring(0, max) + '…';
  }

  /** Cell expansion key for the expand/collapse toggle */
  private cellKey(row: Record<string, unknown>, field: string): string {
    return String(row[this.trackField] ?? '') + '|' + field;
  }

  isCellExpanded(row: Record<string, unknown>, field: string): boolean {
    return this.expandedCells.has(this.cellKey(row, field));
  }

  toggleCellExpand(row: Record<string, unknown>, field: string, event: Event): void {
    event.stopPropagation();
    const key = this.cellKey(row, field);
    if (this.expandedCells.has(key)) {
      this.expandedCells.delete(key);
    } else {
      this.expandedCells.add(key);
    }
  }

  /** Checks whether the row's badgeField triggers the badge (exclude mode or keyword mode) */
  hasBadgeKeyword(row: Record<string, unknown>, col: GridColumn): boolean {
    if (!col.badgeField) return false;
    const val = String(this.getCellValue(row, col.badgeField) ?? '').trim();
    if (col.badgeExcludeValue !== undefined) {
      return val !== '' && val !== col.badgeExcludeValue;
    }
    if (!col.badgeKeyword) return false;
    return val.toLowerCase().includes(col.badgeKeyword.toLowerCase());
  }

  /** Known vendor-label image files mapped to local asset paths */
  private readonly vendorLabelImages: Record<string, string> = {
    'bluestar.png': 'assets/images/blueStar.png',
    'redstarrcs.png': 'assets/images/redstarrcs.png',
    'star.png': 'assets/images/star.png',
  };

  /** Tooltip text for each vendor-label star image */
  private readonly vendorLabelTooltips: Record<string, string> = {
    'bluestar.png': 'Within 20 miles of the service location',
    'redstarrcs.png': 'This vendor has successfully completed jobs',
  };

  /**
   * Parses VendorLabel HTML which may contain multiple img tags
   * (e.g. `<img src="/Content/blueStar.png"><img src="/Content/redstarrcs.png">`)
   * and returns an array of { src, tooltip } for every recognised image.
   *
   * <p>Handles UAT vs dev differences: HTML-encoded labels, query strings on {@code src},
   * backslash paths, and unquoted {@code src} values. Image URLs are resolved with
   * the document {@code baseURI} so assets load when the app is hosted under a non-root path.</p>
   */
  getVendorLabelImages(row: Record<string, unknown>, field: string): { src: string; tooltip: string }[] {
    let raw = String(this.getCellValue(row, field) ?? '').trim();
    if (!raw) return [];
    raw = this.decodeVendorLabelHtmlEntities(raw);
    const results: { src: string; tooltip: string }[] = [];
    // Double-quoted, single-quoted, or unquoted src (common in legacy HTML fragments).
    const regex = /src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      const srcUrl = (match[1] ?? match[2] ?? match[3] ?? '').trim();
      if (!srcUrl) continue;
      const fileKey = this.vendorLabelImgSrcToFileKey(srcUrl);
      const localSrc = this.vendorLabelImages[fileKey];
      if (localSrc) {
        results.push({
          src: this.resolveVendorStarAssetUrl(localSrc),
          tooltip: this.vendorLabelTooltips[fileKey] ?? '',
        });
      }
    }
    return results;
  }

  /**
   * Some environments return VendorLabel with escaped markup ({@code &lt;img}).
   * Only decode when those patterns appear so {@code src} URLs with query strings ({@code &amp;} / {@code &}) stay intact.
   */
  private decodeVendorLabelHtmlEntities(raw: string): string {
    if (!raw.includes('&lt;') && !raw.includes('&gt;') && !raw.includes('&amp;')) return raw;
    const el = this.document.createElement('textarea');
    el.innerHTML = raw;
    return el.value;
  }

  /**
   * Last path segment of {@code src}, lowercased, with query/hash stripped and backslashes normalized
   * (matches keys in {@link #vendorLabelImages}).
   */
  private vendorLabelImgSrcToFileKey(srcUrl: string): string {
    const normalized = srcUrl.replace(/\\/g, '/').trim();
    const last = normalized.split('/').pop() ?? '';
    const baseName = last.split('?')[0]?.split('#')[0] ?? last;
    try {
      return decodeURIComponent(baseName.trim()).toLowerCase();
    } catch {
      return baseName.trim().toLowerCase();
    }
  }

  /** Resolves {@code assets/...} against the document base so hosting under a subpath still loads stars. */
  private resolveVendorStarAssetUrl(relativePath: string): string {
    try {
      const base = this.document.baseURI;
      if (base) return new URL(relativePath, base).href;
    } catch {
      /* fall through */
    }
    return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  }

  /** When link has linkCopyOnClick, copies the body to clipboard then opens the URL in a new tab */
  onLinkClick(event: Event, href: unknown, col: GridColumn, row: Record<string, unknown>): void {
    if (col.linkCopyOnClick) {
      event.preventDefault();
      const text = col.linkCopyOnClick(row);
      if (text && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      const url = href != null ? String(href) : '';
      if (url) window.open(url, '_blank', 'noopener');
    }
  }

  /** Effective phone for display: primary field (e.g. phone) or first alternate_phones[0] from website_enrichment; null when neither present */
  getAiPhoneDisplay(row: Record<string, unknown>, field: string): string | null {
    const primary = this.getCellValue(row, field);
    if (primary != null && String(primary).trim().length > 0) return String(primary).trim();
    const alt = this.getCellValue(row, 'website_enrichment.alternate_phones') as string[] | null | undefined;
    if (Array.isArray(alt) && alt[0] != null && String(alt[0]).trim().length > 0) return String(alt[0]).trim();
    return null;
  }

  /** Effective email for display: primary field (e.g. email) or first alternate_emails[0] from website_enrichment; null when neither present */
  getAiEmailDisplay(row: Record<string, unknown>, field: string): string | null {
    const primary = this.getCellValue(row, field);
    if (primary != null && typeof primary === 'string' && primary.trim().length > 0) return primary.trim();
    const alt = this.getCellValue(row, 'website_enrichment.alternate_emails') as string[] | null | undefined;
    if (Array.isArray(alt) && alt[0] != null && typeof alt[0] === 'string' && alt[0].trim().length > 0) return alt[0].trim();
    return null;
  }

  /** True when the row has a non-empty email to display (primary or alternate); otherwise show Add Email */
  hasAiEmail(row: Record<string, unknown>, field: string): boolean {
    return this.getAiEmailDisplay(row, field) != null;
  }

  /** Formats AI vendor trades array into a comma-separated string */
  aiFormatTrades(row: Record<string, unknown>, field: string): string {
    const val = this.getCellValue(row, field);
    if (Array.isArray(val)) return val.join(', ');
    return String(val ?? '');
  }

  /**
   * Click on the displayed address runs the same handler as `emailActionButton` (e.g. open recruitment modal);
   * avoids `mailto:` so the default client does not open.
   */
  onAiEmailDisplayClick(event: Event, row: Record<string, unknown>, col: GridColumn): void {
    event.preventDefault();
    event.stopPropagation();
    col.emailActionButton?.handler(row);
  }

  /** Saves inline-edited email on the AI email column */
  aiSaveEmail(row: Record<string, unknown>, col: GridColumn): void {
    const email = String(row['_emailDraft'] ?? '').trim();
    if (email) {
      row[col.field] = email;
      col.emailSaveHandler?.(row, email);
    }
    row['_editingEmail'] = false;
  }

  /** vendor-company email configured with emailClickHandler (e.g. navigate to notes-activity). */
  onVendorCompanyEmailClick(event: Event, row: Record<string, unknown>, col: GridColumn): void {
    event.preventDefault();
    event.stopPropagation();
    col.emailClickHandler?.(row);
  }

  /** vendor-company "Vendor Login" button click handler. */
  onVendorLoginClick(event: Event, row: Record<string, unknown>, col: GridColumn): void {
    event.preventDefault();
    event.stopPropagation();
    col.vendorLoginHandler?.(row);
  }

  /** Whether a maybe-no button reflects the row's saved pin choice (pinned vendors). */
  isMaybeNoSelected(row: Record<string, unknown>, col: GridColumn, choice: 'No' | 'Maybe'): boolean {
    const selected = this.getMaybeNoChoice(row, col);
    if (!selected) return false;
    return selected.toLowerCase() === choice.toLowerCase();
  }

  /** Resolved pin choice for maybe-no read-only rows (supports API casing variants). */
  private getMaybeNoChoice(row: Record<string, unknown>, col: GridColumn): 'No' | 'Maybe' | null {
    const fields: string[] = [];
    if (col.maybeNoSelectedField) fields.push(col.maybeNoSelectedField);
    fields.push('_pinChoice', 'noMaybe', 'NoMaybe', 'no');
    for (const field of fields) {
      const normalized = this.normalizeMaybeNoChoice(this.getCellValue(row, field));
      if (normalized) return normalized;
    }
    return null;
  }

  /** Normalizes stored pin values ("Maybe", "MAYBE", "No", etc.) to display choices. */
  private normalizeMaybeNoChoice(raw: unknown): 'No' | 'Maybe' | null {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (s.includes('maybe')) return 'Maybe';
    if (s === 'no' || s.startsWith('no ')) return 'No';
    return null;
  }

  /** maybe-no column click — interactive in internal vendors; read-only display in pinned vendors. */
  onMaybeNoClick(event: Event, row: Record<string, unknown>, col: GridColumn, choice: 'No' | 'Maybe'): void {
    event.stopPropagation();
    if (col.maybeNoReadOnly) return;
    if (choice === 'No') col.noHandler?.(row);
    else col.maybeHandler?.(row);
  }

}
