import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { JobDetailsAccordionComponent } from '../../../shared/components/job-details-accordion/job-details-accordion.component';
import { JobEstimatesSectionComponent } from './job-estimates-section.component';

/**
 * Estimates page (RBR-463) — job-scoped page hosting the Estimating / On-Site Approval UI
 * that used to live inside Customer & Vendor Invoicing. Mirrors the Customer & Vendor Invoicing / Notes & Activity page
 * shell (app-tabs + app-job-details-accordion) and delegates all estimate rendering/logic
 * to {@link JobEstimatesSectionComponent}.
 */
@Component({
  selector: 'app-estimates',
  standalone: true,
  imports: [RouterLink, JobDetailsAccordionComponent, JobEstimatesSectionComponent],
  templateUrl: './estimates.component.html',
  styleUrl: './estimates.component.scss',
})
export class EstimatesComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  jobKey = signal('');

  ngOnInit(): void {
    const key = this.route.snapshot.paramMap.get('jobKey') ?? '';
    this.jobKey.set(key);
  }
}
