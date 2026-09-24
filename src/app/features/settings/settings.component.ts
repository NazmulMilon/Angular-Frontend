import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface SettingsItem {
  label: string;
  route: string | null;
}

interface SettingsGroup {
  title: string;
  accent: 'green' | 'blue' | 'amber' | 'slate';
  icon: string;
  items: SettingsItem[];
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  protected readonly groups: SettingsGroup[] = [
    {
      title: 'Vendor',
      accent: 'green',
      icon: '🏪',
      items: [
        { label: 'Common Broadcast Radius', route: '/settings/common-broadcast-radius' },
        { label: 'Estimate & Invoice Resubmit Reasons', route: '/settings/vendor-resubmit-reasons' },
        { label: 'Vendor Contract Setup', route: '/settings/vendor-contract' },
        { label: 'Vendor Email Templates', route: '/settings/vendor-email-templates' },
        { label: 'Vendor Email Configuration', route: '/settings/vendor-email-config' },
        { label: 'Vendor Charge Type', route: '/settings/vendor-charge-type' },
        { label: 'Dashboard Grid Setup (Vendor)', route: '/settings/vendor-grid-setup' },
        { label: 'Vendor Payment Status', route: '/settings/vendor-payment-status' },
        { label: 'Automated Email to Complete Vendor Profile', route: '/settings/vendor-profile-emails' },
      ],
    },
    {
      title: 'Customer',
      accent: 'blue',
      icon: '👥',
      items: [
        { label: 'Send Bulk Email to Customer', route: '/settings/customer-bulk-email' },
        { label: 'Invoice Approving Agent', route: '/settings/invoice-approving-agent' },
        { label: 'Terms and Conditions', route: '/settings/customer-terms' },
        { label: 'Trade-based Charge Types Template', route: '/settings/trade-charge-template' },
        { label: 'Customer Email Templates', route: '/settings/customer-email-templates' },
        { label: 'Customer Job Status', route: '/settings/customer-job-status' },
        { label: 'Customer Email Configuration', route: '/settings/customer-email-config' },
        { label: 'Job Request Email Configuration', route: '/settings/job-request-email' },
        { label: 'Region', route: '/settings/customer-region' },
      ],
    },
    {
      title: 'Mailing',
      accent: 'amber',
      icon: '✉️',
      items: [
        { label: 'Common Email Config', route: '/settings/common-email-config' },
        { label: 'Admin Email Configuration', route: '/settings/admin-email-config' },
        { label: 'Email Template for Vendor', route: '/settings/vendor-email-templates' },
        { label: 'Email Template for Admin', route: '/settings/admin-email-templates' },
        { label: 'Email Receivers', route: '/settings/email-receivers' },
      ],
    },
    {
      title: 'General',
      accent: 'slate',
      icon: '⚙️',
      items: [
        { label: 'Notes to Accounting', route: '/settings/notes-to-accounting' },
        { label: 'Document Setup', route: '/settings/document-setup' },
        { label: 'Document Type', route: '/settings/document-type' },
        { label: 'Job Priority', route: '/settings/job-priority' },
        { label: 'Job Status', route: '/settings/job-status' },
        { label: 'Country', route: '/settings/country' },
        { label: 'GIS (State / City / Zip)', route: '/settings/gis' },
        { label: 'Common Region', route: '/settings/common-region' },
        { label: 'Company Info', route: '/settings/company-info' },
        { label: 'Assign Priority to User', route: '/settings/assign-priority' },
      ],
    },
    {
      title: 'Dashboard',
      accent: 'green',
      icon: '📊',
      items: [
        { label: 'Dashboard Grid Setup', route: '/settings/dashboard-grid-setup' },
        { label: 'Dashboard Grid Usergroups', route: '/settings/dashboard-grid-usergroups' },
        { label: 'Manage Grid Title', route: '/settings/manage-grid-title' },
      ],
    },
    {
      title: 'Others',
      accent: 'slate',
      icon: '📋',
      items: [
        { label: 'Common Notes', route: '/settings/common-notes' },
        { label: 'Note Footer', route: '/settings/note-footer' },
        { label: 'Vendor Master Rate', route: '/settings/vendor-master-rate' },
        { label: 'Trade Setup', route: '/settings/trade-setup' },
        { label: 'Accounting Status Setup', route: '/settings/accounting-status' },
        { label: 'Team Setup', route: '/settings/team-setup' },
        { label: 'Sales Charge Type', route: '/settings/sales-charge-type' },
        { label: 'Time Definition', route: '/settings/time-definition' },
        { label: 'Distance Rule Management', route: '/settings/distance-rule' },
        { label: 'Account Manager Feedback Setup', route: '/settings/account-manager-feedback' },
        { label: 'Store Manager Survey Setup', route: '/settings/store-manager-survey' },
        { label: 'Vendor Registration Question Setup', route: '/settings/vendor-question-setup' },
      ],
    },
  ];
}
