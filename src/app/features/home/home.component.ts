import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  template: `
    <div class="home">
      <div class="home-card">
                <img
            class="home-icon"
            src="assets/RFI Logo--3.png"
            alt="retailfixit"
          />
        <h1 class="home-title">Welcome to RFI Admin Portal V2</h1>
        <p class="home-subtitle">Select a page from the navigation menu above to get started.</p>
      </div>
    </div>
  `,
  styles: [`
    .home {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 70vh;
    }
    .home-card {
      text-align: center;
      padding: 48px 40px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .home-icon {
      height: 180px;
      width: auto;
      margin-bottom: -10px;
    }
    .home-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 8px;
    }
    .home-subtitle {
      font-size: 0.9rem;
      color: #64748b;
      margin: 0;
    }
  `],
})
export class HomeComponent {}
