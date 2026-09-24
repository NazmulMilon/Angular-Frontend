import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { customerGrossProfitAccessGuard } from './guards/customer-gross-profit-access.guard';

/**
 * Job-scoped legacy entry routes (Assign Vendor, Vendor Bills / Estimates, Notes & Activity):
 * identical auth contract. `authGuard` boots `AuthTokenService` — JWT from `?token=` (referrer
 * rules in UAT/prod) or localStorage. When no live JWT is present it redirects to the legacy login
 * with a `returnUrl` back to the requested page (see `authGuard` + `SessionRedirectService`).
 * Distant vendor approval/decline pages are NOT protected - they are accessed via email links.
 */
/** Shared `canActivate` for job-scoped legacy pages (mutable array for Angular `Route` typing). */
const jobLegacyJwtRoute = {
  canActivate: [authGuard],
};

/**
 * Application routes.
 * Job-scoped pages (assign-vendor, estimates, notes-activity, vendor-bills) are lazy-loaded.
 */
export const routes: Routes = [
  {
    path: 'job/:jobKey/assign-vendor',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/job/assign-vendor/assign-vendor.component').then(
        (m) => m.AssignVendorComponent
      ),
    title: 'Assign Vendor',
  },
  {
    path: 'job/:jobKey/estimates',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/job/estimates/estimates.component').then(
        (m) => m.EstimatesComponent
      ),
    title: 'Estimates',
  },
  {
    path: 'job/:jobKey/notes-activity',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/job/notes-activity/notes-activity.component').then(
        (m) => m.NotesActivityComponent
      ),
    title: 'Notes & Activity',
  },
  {
    path: 'job/:jobKey/vendor-bills',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/job/vendor-bills/vendor-bills.component').then(
        (m) => m.VendorBillsComponent
      ),
    title: 'Customer & Vendor Invoicing',
  },
  {
    path: 'accounting/move-to-accounting',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/accounting/move-to-accounting/move-to-accounting.component').then(
        (m) => m.MoveToAccountingComponent
      ),
    title: 'Move to Accounting',
  },
  {
    path: 'accounting/sent-back-to-service',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/accounting/sent-back-to-service/sent-back-to-service.component').then(
        (m) => m.SentBackToServiceComponent
      ),
    title: 'Sent Back to Service',
  },
  {
    path: 'accounting/markup-override-approval',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/accounting/markup-override-approval/markup-override-approval.component').then(
        (m) => m.MarkupOverrideApprovalComponent
      ),
    title: 'Below Minimum Mark-up Approvals',
  },
  {
    path: 'reports/customer-gross-profit',
    canActivate: [customerGrossProfitAccessGuard],
    loadComponent: () =>
      import('./features/reports/customer-gross-profit/customer-gross-profit.component').then(
        (m) => m.CustomerGrossProfitComponent
      ),
    title: 'Customer Gross Profit',
  },
  {
    path: 'distant-vendor-approval/approve/:approvalKey',
    loadComponent: () =>
      import('./features/distant-vendor/distant-vendor-approve.component').then(
        (m) => m.DistantVendorApproveComponent
      ),
    title: 'Approve Distant Vendor',
  },
  {
    path: 'distant-vendor-approval/decline/:approvalKey',
    loadComponent: () =>
      import('./features/distant-vendor/distant-vendor-decline.component').then(
        (m) => m.DistantVendorDeclineComponent
      ),
    title: 'Decline Distant Vendor',
  },
  {
    path: 'settings',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent
      ),
    title: 'Settings',
  },
  {
    path: 'settings/vendor-contract',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/vendor-contract/vendor-contract.component').then(
        (m) => m.VendorContractComponent
      ),
    title: 'Vendor Contract Setup',
  },
  {
    path: 'settings/vendor-resubmit-reasons',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/vendor-resubmit-reasons/vendor-resubmit-reasons.component').then(
        (m) => m.VendorResubmitReasonsComponent
      ),
    title: 'Vendor Resubmit Reasons',
  },
  {
    path: 'settings/common-broadcast-radius',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/common-broadcast-radius/common-broadcast-radius.component').then(
        (m) => m.CommonBroadcastRadiusComponent
      ),
    title: 'Common Broadcast Radius',
  },
  {
    path: 'settings/vendor-email-config',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/vendor-email-config/vendor-email-config.component').then(
        (m) => m.VendorEmailConfigComponent
      ),
    title: 'Vendor Email Configuration',
  },
  {
    path: 'settings/vendor-email-templates',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/vendor-email-templates/vendor-email-templates.component').then(
        (m) => m.VendorEmailTemplatesComponent
      ),
    title: 'Vendor Email Templates',
  },
  {
    path: 'settings/vendor-charge-type',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/vendor-charge-type/vendor-charge-type.component').then(
        (m) => m.VendorChargeTypeComponent
      ),
    title: 'Vendor Charge Type',
  },
  {
    path: 'settings/vendor-grid-setup',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/vendor-grid-setup/vendor-grid-setup.component').then(
        (m) => m.VendorGridSetupComponent
      ),
    title: 'Vendor Grid Setup',
  },
  {
    path: 'settings/vendor-profile-emails',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/vendor-profile-emails/vendor-profile-emails.component').then(
        (m) => m.VendorProfileEmailsComponent
      ),
    title: 'Profile Completion Emails',
  },
  {
    path: 'settings/vendor-payment-status',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/vendor-payment-status/vendor-payment-status.component').then(
        (m) => m.VendorPaymentStatusComponent
      ),
    title: 'Vendor Payment Status',
  },
  {
    path: 'settings/customer-bulk-email',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/customer-bulk-email/customer-bulk-email.component').then(
        (m) => m.CustomerBulkEmailComponent
      ),
    title: 'Send Bulk Email to Customer',
  },
  {
    path: 'settings/invoice-approving-agent',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/invoice-approving-agent/invoice-approving-agent.component').then(
        (m) => m.InvoiceApprovingAgentComponent
      ),
    title: 'Invoice Approving Agent',
  },
  {
    path: 'settings/customer-terms',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/customer-terms/customer-terms.component').then(
        (m) => m.CustomerTermsComponent
      ),
    title: 'Terms and Conditions',
  },
  {
    path: 'settings/trade-charge-template',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/trade-charge-template/trade-charge-template.component').then(
        (m) => m.TradeChargeTemplateComponent
      ),
    title: 'Trade Charge Type Template',
  },
  {
    path: 'settings/customer-email-templates',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/customer-email-templates/customer-email-templates.component').then(
        (m) => m.CustomerEmailTemplatesComponent
      ),
    title: 'Customer Email Templates',
  },
  {
    path: 'settings/customer-job-status',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/customer-job-status/customer-job-status.component').then(
        (m) => m.CustomerJobStatusComponent
      ),
    title: 'Customer Job Status',
  },
  {
    path: 'settings/customer-email-config',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/customer-email-config/customer-email-config.component').then(
        (m) => m.CustomerEmailConfigComponent
      ),
    title: 'Customer Email Configuration',
  },
  {
    path: 'settings/job-request-email',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/job-request-email/job-request-email.component').then(
        (m) => m.JobRequestEmailComponent
      ),
    title: 'Job Request Email Configuration',
  },
  {
    path: 'settings/customer-region',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/customer-region/customer-region.component').then(
        (m) => m.CustomerRegionComponent
      ),
    title: 'Region',
  },
  {
    path: 'settings/common-email-config',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/common-email-config/common-email-config.component').then(
        (m) => m.CommonEmailConfigComponent
      ),
    title: 'Common Email Config',
  },
  {
    path: 'settings/admin-email-templates',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/admin-email-templates/admin-email-templates.component').then(
        (m) => m.AdminEmailTemplatesComponent
      ),
    title: 'Email Template for Admin',
  },
  {
    path: 'settings/admin-email-config',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/admin-email-config/admin-email-config.component').then(
        (m) => m.AdminEmailConfigComponent
      ),
    title: 'Admin Email Configuration',
  },
  {
    path: 'settings/email-receivers',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/email-receivers/email-receivers.component').then(
        (m) => m.EmailReceiversComponent
      ),
    title: 'Email Receivers',
  },
  {
    path: 'settings/notes-to-accounting',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/notes-to-accounting/notes-to-accounting.component').then((m) => m.NotesToAccountingComponent),
    title: 'Notes to Accounting',
  },
  {
    path: 'settings/document-setup',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/document-setup/document-setup.component').then((m) => m.DocumentSetupComponent),
    title: 'Document Setup',
  },
  {
    path: 'settings/document-type',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/document-type/document-type.component').then((m) => m.DocumentTypeComponent),
    title: 'Document Type',
  },
  {
    path: 'settings/job-priority',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/job-priority/job-priority.component').then((m) => m.JobPriorityComponent),
    title: 'Job Priority',
  },
  {
    path: 'settings/job-status',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/job-status/job-status.component').then((m) => m.JobStatusComponent),
    title: 'Job Status',
  },
  {
    path: 'settings/country',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/country/country.component').then((m) => m.CountryComponent),
    title: 'Country',
  },
  {
    path: 'settings/gis',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/gis/gis.component').then((m) => m.GisComponent),
    title: 'GIS',
  },
  {
    path: 'settings/common-region',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/common-region/common-region.component').then((m) => m.CommonRegionComponent),
    title: 'Common Region',
  },
  {
    path: 'settings/company-info',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/company-info/company-info.component').then((m) => m.CompanyInfoComponent),
    title: 'Company Info',
  },
  {
    path: 'settings/assign-priority',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/assign-priority/assign-priority.component').then((m) => m.AssignPriorityComponent),
    title: 'Assign Priority to User',
  },
  {
    path: 'settings/dashboard-grid-setup',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/dashboard-grid-setup/dashboard-grid-setup.component').then((m) => m.DashboardGridSetupComponent),
    title: 'Dashboard Grid Setup',
  },
  {
    path: 'settings/dashboard-grid-usergroups',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/dashboard-grid-usergroups/dashboard-grid-usergroups.component').then((m) => m.DashboardGridUsergroupsComponent),
    title: 'Dashboard Grid Usergroups',
  },
  {
    path: 'settings/manage-grid-title',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/settings/manage-grid-title/manage-grid-title.component').then((m) => m.ManageGridTitleComponent),
    title: 'Manage Grid Title',
  },
  {
    path: 'settings/common-notes',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/common-notes/common-notes.component').then((m) => m.CommonNotesComponent),
    title: 'Common Notes',
  },
  {
    path: 'settings/note-footer',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/note-footer/note-footer.component').then((m) => m.NoteFooterComponent),
    title: 'Note Footer',
  },
  {
    path: 'settings/vendor-master-rate',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/vendor-master-rate/vendor-master-rate.component').then((m) => m.VendorMasterRateComponent),
    title: 'Vendor Master Rate',
  },
  {
    path: 'settings/trade-setup',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/trade-setup/trade-setup.component').then((m) => m.TradeSetupComponent),
    title: 'Trade Setup',
  },
  {
    path: 'settings/accounting-status',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/accounting-status/accounting-status.component').then((m) => m.AccountingStatusComponent),
    title: 'Accounting Status Setup',
  },
  {
    path: 'settings/team-setup',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/team-setup/team-setup.component').then((m) => m.TeamSetupComponent),
    title: 'Team Setup',
  },
  {
    path: 'settings/sales-charge-type',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/sales-charge-type/sales-charge-type.component').then((m) => m.SalesChargeTypeComponent),
    title: 'Sales Charge Type',
  },
  {
    path: 'settings/time-definition',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/time-definition/time-definition.component').then((m) => m.TimeDefinitionComponent),
    title: 'Time Definition',
  },
  {
    path: 'settings/distance-rule',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/distance-rule/distance-rule.component').then((m) => m.DistanceRuleComponent),
    title: 'Distance Rule Management',
  },
  {
    path: 'settings/account-manager-feedback',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/account-manager-feedback/account-manager-feedback.component').then((m) => m.AccountManagerFeedbackComponent),
    title: 'Account Manager Feedback Setup',
  },
  {
    path: 'settings/store-manager-survey',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/store-manager-survey/store-manager-survey.component').then((m) => m.StoreManagerSurveyComponent),
    title: 'Store Manager Survey Setup',
  },
  {
    path: 'settings/vendor-question-setup',
    ...jobLegacyJwtRoute,
    loadComponent: () => import('./features/settings/vendor-question-setup/vendor-question-setup.component').then((m) => m.VendorQuestionSetupComponent),
    title: 'Vendor Registration Question Setup',
  },
  {
    path: 'customers',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/customers/customer-list/customer-list.component').then(
        (m) => m.CustomerListComponent
      ),
    title: 'Customers',
  },
  {
    path: 'customers/new',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/customers/customer-create/customer-create.component').then(
        (m) => m.CustomerCreateComponent
      ),
    title: 'Add New Customer',
  },
  {
    path: 'customers/:id/edit',
    ...jobLegacyJwtRoute,
    loadComponent: () =>
      import('./features/customers/customer-edit/customer-edit.component').then(
        (m) => m.CustomerEditComponent
      ),
    title: 'Edit Customer',
  },
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
    pathMatch: 'full',
    title: 'Home',
  },
];
