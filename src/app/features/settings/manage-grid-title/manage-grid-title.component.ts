import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GridTitle, ManageGridTitleService } from '../../../services/manage-grid-title.service';

@Component({
  selector: 'app-manage-grid-title',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './manage-grid-title.component.html',
  styleUrl: './manage-grid-title.component.scss',
})
export class ManageGridTitleComponent implements OnInit {
  private readonly service = inject(ManageGridTitleService);

  protected readonly grids = signal<GridTitle[]>([]);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (list) => {
        this.grids.set(list ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load grid titles. Please try again.');
        this.loading.set(false);
      },
    });
  }

  updateName(gridKey: number, value: string): void {
    this.grids.update((list) => list.map((g) => (g.gridKey === gridKey ? { ...g, gridName: value } : g)));
  }

  save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.service.save(this.grids()).subscribe({
      next: (list) => {
        this.grids.set(list ?? []);
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
