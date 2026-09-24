import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { LiveChatWidgetComponent } from './features/live-chat/live-chat-widget.component';
import { environment } from '../environments/environment';
import { AddJobComponent } from './features/add-job/add-job.component';
import { StaffService } from './services/staff.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, AddJobComponent, LiveChatWidgetComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly router = inject(Router);
  private readonly staffService = inject(StaffService);

  protected readonly title = signal('rfi-admin-portal-v2');

  /** Temporary gate: the "Settings and Setup" button shows only for the allowed usergroup (checked
   *  server-side from the JWT) until the full V2 user-access module lands. Defaults to hidden. */
  readonly canAccessSettings = signal(false);

  /** Set true on first click of "Add Job"; keeps the `@defer` block's component code out of the
   *  eager bundle until an admin actually wants to create a job.
   *
   *  `addJobModal` is queried by the `#addJobRef` template reference variable rather than
   *  `viewChild(AddJobComponent)` — passing the class itself as the locator would be a runtime
   *  reference to `AddJobComponent` from this eagerly-loaded component, which defeats Angular's
   *  automatic `@defer`-import optimization (it only lazy-loads a component when the only
   *  reference to its class is the `imports` array feeding the `@defer` block in the template). */
  readonly addJobDeferred = signal(false);
  private readonly addJobModal = viewChild<AddJobComponent>('addJobRef');
  private readonly addJobOpenRequests = signal(0);

  openAddJob(): void {
    this.addJobDeferred.set(true);
    this.addJobOpenRequests.update((n) => n + 1);
  }

  /** Notes & Activity is embedded from legacy admin — hide global chrome for a full-page experience.
   *  Also hide for distant-vendor-approval pages (accessed via email link), and for Accounting V2
   *  screens, which ship their own topbar/tab-bar matching complete-screen-v2.html exactly. */
  readonly hideAppChrome = signal(this.shouldHideChrome(this.router.url));

  private readonly currentRoute = signal(this.router.url);
  private readonly currentJobKey = signal(this.extractJobKey(this.router.url));

  /** Legacy admin portal home — environment-specific (dev/uat/prod). */
  readonly legacyAdminHomeUrl = `${environment.legacyAdminBaseUrl.replace(/\/$/, '')}/UserHome/Index`;

  /** Legacy Main Job Page tab (MgtJob/EditJob) for the current job. */
  readonly legacyAssignVendorV1Url = computed(() => {
    const jobKey = this.currentJobKey();
    if (!jobKey) return null;
    const base = environment.legacyAdminBaseUrl.replace(/\/$/, '');
    return `${base}/MgtJob/EditJob/${jobKey}`;
  });

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.hideAppChrome.set(this.shouldHideChrome(event.urlAfterRedirects));
        this.currentRoute.set(event.urlAfterRedirects);
        this.currentJobKey.set(this.extractJobKey(event.urlAfterRedirects));
      });

    effect(() => {
      const modal = this.addJobModal();
      if (modal && this.addJobOpenRequests() > 0) {
        modal.open();
      }
    });

    this.staffService
      .hasSettingsAccess()
      .pipe(takeUntilDestroyed())
      .subscribe((allowed) => this.canAccessSettings.set(allowed));
  }

  private shouldHideChrome(url: string): boolean {
    return (
      url.includes('/distant-vendor-approval') ||
      url.includes('/notes-activity') ||
      url.includes('/accounting/')
    );
  }

  private extractJobKey(url: string): string {
    const match = url.match(/\/job\/([^/?#]+)/);
    const jobKey = match?.[1]?.trim() ?? '';
    return jobKey && jobKey !== '0' ? jobKey : '';
  }
}
