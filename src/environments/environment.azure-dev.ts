/**
 * Build: `ng build --configuration=azure-dev`
 * Deployed V2 on Azure (e.g. adminv2-dev.retailfixitapp.com) with DEV APIs.
 * `legacyAdminBaseUrl` MUST be the public URL users use for ProjectRCS — not localhost —
 * or AuthTokenService will reject `?token=` (referrer hostname must match).
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://service-rfi-job-operation-api-dev.retailfixitapp.com',
  emailServiceApiUrl: 'https://service-rfi-email-api-dev.retailfixitapp.com',
  legacyAdminBaseUrl: 'https://admin-dev.retailfixitapp.com',
  authToken: '',
  /** Shared key for RFISystemData/SystemSetupData endpoints (see HANDOFF-SystemSetupData-Auth-Change.md). */
  rfiApiKey: 'PsVw2X5WKO/wMelUwD/4ZJgHiADv2dKasUklS/BP3afDmze+UjFWoL9xhws1OdNO',
  vendorPartnerRegistrationUrl:
    'https://admin-dev.retailfixitapp.com/MgtNewVendorRequest/GetRegisteredForJob?JobKey',
  vendorPortalBaseUrl: 'https://vendor-dev.retailfixitapp.com',
  vendorLoginWithTaskOptionsUrl:
    'https://vendor-dev.retailfixitapp.com/VendorLogin/LoginByRCSadminWithTaskOptions?JobKey=',
};

