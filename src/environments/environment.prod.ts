export const environment = {
  production: true,  
  apiBaseUrl: 'https://service-rfi-job-operation-api-prod.retailfixitapp.com',
  emailServiceApiUrl: 'https://service-rfi-email-api-prod.retailfixitapp.com',
  legacyAdminBaseUrl: 'https://admin.retailfixitapp.com',
  authToken: '',
  /** Shared key for RFISystemData/SystemSetupData endpoints (see HANDOFF-SystemSetupData-Auth-Change.md). */
  rfiApiKey: 'PsVw2X5WKO/wMelUwD/4ZJgHiADv2dKasUklS/BP3afDmze+UjFWoL9xhws1OdNO',
  vendorPartnerRegistrationUrl: 'https://admin.retailfixitapp.com/MgtNewVendorRequest/GetRegisteredForJob?JobKey',
  /** Vendor Portal Base URL for vendor login links. */
  vendorPortalBaseUrl: 'https://vendor.retailfixitapp.com',
  vendorLoginWithTaskOptionsUrl:
    'https://vendor.retailfixitapp.com/VendorLogin/LoginByRCSadminWithTaskOptions?JobKey=',
};
