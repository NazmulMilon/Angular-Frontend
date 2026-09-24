import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BroadcastRadiusService } from '../../../services/broadcast-radius.service';

@Component({
  selector: 'app-common-broadcast-radius',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './common-broadcast-radius.component.html',
  styleUrl: './common-broadcast-radius.component.scss',
})
export class CommonBroadcastRadiusComponent implements OnInit {
  private readonly service = inject(BroadcastRadiusService);

  protected radius = signal<number | null>(null);
  protected loading = signal(false);
  protected saving = signal(false);
  protected saved = signal(false);
  protected error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getRadius().subscribe({
      next: (res) => {
        this.radius.set(res?.radius ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load the broadcast radius. Please try again.');
        this.loading.set(false);
      },
    });
  }

  save(): void {
    const value = this.radius();
    if (value == null || value < 0) return;

    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.service.saveRadius(value).subscribe({
      next: (res) => {
        this.radius.set(res?.radius ?? value);
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: () => {
        this.error.set('Failed to save the broadcast radius. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
