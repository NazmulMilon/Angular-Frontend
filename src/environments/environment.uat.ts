/**
 * UAT build. JWT in `?token=` is only accepted when navigation comes from legacy Admin
 * (Referer hostname matches `legacyAdminBaseUrl`). Legacy links to V2 must send Referer:
 * e.g. `<a ... referrerpolicy="origin">` and must not use `rel="noreferrer"`.
 * See AuthTokenService.
 */
export const environment = {
  production: true,
  //apiBaseUrl: 'https://localhost:7028',
  apiBaseUrl: 'https://service-rfi-job-operation-api-uat.retailfixitapp.com',
  /** Email Service API base URL for sending emails. */
  emailServiceApiUrl: 'https://service-rfi-email-api-uat.retailfixitapp.com',
  /** Must match the legacy Admin Portal host that redirects here with ?token= (see AuthTokenService). */
  legacyAdminBaseUrl: 'https://admin-uat.retailfixitapp.com',
  authToken: '',
  /** Shared key for RFISystemData/SystemSetupData endpoints (see HANDOFF-SystemSetupData-Auth-Change.md). */
  rfiApiKey: 'PsVw2X5WKO/wMelUwD/4ZJgHiADv2dKasUklS/BP3afDmze+UjFWoL9xhws1OdNO',
  vendorPartnerRegistrationUrl:
    'https://admin-uat.retailfixitapp.com/MgtNewVendorRequest/GetRegisteredForJob?JobKey',
  vendorPortalBaseUrl: 'https://vendor-uat.retailfixitapp.com',
  vendorLoginWithTaskOptionsUrl:
    'https://vendor-uat.retailfixitapp.com/VendorLogin/LoginByRCSadminWithTaskOptions?JobKey=',
};
