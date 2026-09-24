import { VendorBillsService } from '../../services/vendor-bills.service';

/**
 * Whether the Estimates tab click should show the chat-interstitial instead of navigating
 * straight to the Estimates page: job is Tech On-Site and has at least one non-deleted vendor
 * estimate submitted. Resolves the vendor for the chat thread from the newest such estimate.
 */
export function resolveEstimateChatInterstitial(
  vendorBillsSvc: VendorBillsService,
  jobKey: string,
  onResult: (result: { shouldIntercept: boolean; vendorKey: string | null }) => void,
): void {
  vendorBillsSvc.getJobEstimatesPage(jobKey, { start: 0, length: 500 }).subscribe((res) => {
    if (!res.status || !res.data) {
      onResult({ shouldIntercept: false, vendorKey: null });
      return;
    }
    const cards = res.data.estimates?.data ?? [];
    const submitted = cards.find((card) => !card.isDeleted && !card.isVendorDeleted);
    onResult({
      shouldIntercept: !!res.data.isJobTechOnSite && !!submitted,
      vendorKey: submitted?.vendorKey ?? null,
    });
  });
}
