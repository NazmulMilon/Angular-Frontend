/**
 * Default environment for `ng serve` and `ng build --configuration=uatelopment`.
 * `production: false` skips strict referrer checks so local legacy (localhost) works.
 * For Azure uat deployments use `ng build --configuration=azure-uat` (see environment.azure-uat.ts).
 */
export const environment = {
production: false,
  /**
   * Job Ops API — default to cloud uat so `ng serve` works without a local API.
   * For local debugging, uncomment HTTPS localhost and match your launchSettings URL/port
   * (commonly 7028; use the port your API actually listens on — otherwise every Assign Vendor call fails with status 0).
   */
   
   apiBaseUrl: 'https://service-rfi-job-operation-api-prod.retailfixitapp.com',
   //apiBaseUrl: 'https://localhost:7028',


  /** Email Service API base URL for sending emails. */
  //emailServiceApiUrl: 'http://localhost:44319' ,
  emailServiceApiUrl:'https://service-rfi-email-api-prod.retailfixitapp.com',
  //emailServiceApiUrl: 'https://localhost:7184',

  /** Admin Portal V1 — local IIS Express or full URL when testing against cloud legacy. */
  //legacyAdminBaseUrl: 'http://localhost:2063',
  legacyAdminBaseUrl:'https://admin.retailfixitapp.com',

  authToken: '',
  /**
   * Shared service-to-service key for `RFISystemData/SystemSetupData` endpoints
   * (trades, states, priorities, staff, job statuses, etc.). These endpoints authenticate
   * via the `RFIApiKey` header instead of the user JWT — see
   * context/HANDOFF-SystemSetupData-Auth-Change.md. Value is the backend's RFIExternalAuthKey cipher.
   */
  rfiApiKey: 'PsVw2X5WKO/wMelUwD/4ZJgHiADv2dKasUklS/BP3afDmze+UjFWoL9xhws1OdNO',
  vendorPartnerRegistrationUrl:
    'https://admin.retailfixitapp.com/MgtNewVendorRequest/GetRegisteredForJob?JobKey',
  vendorPortalBaseUrl: 'https://vendor.retailfixitapp.com',
  vendorLoginWithTaskOptionsUrl:
    'https://vendor.retailfixitapp.com/VendorLogin/LoginByRCSadminWithTaskOptions?JobKey=',
};



