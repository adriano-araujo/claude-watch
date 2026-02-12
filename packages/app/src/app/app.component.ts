import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="app-shell">
      <header class="app-header">
        <h1>Claude Watch</h1>
      </header>
      <main class="app-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .app-shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .app-header {
      background: var(--bg-secondary);
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
    }
    .app-header h1 {
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--accent-blue);
    }
    .app-content {
      flex: 1;
      padding: 16px;
    }
  `],
})
export class AppComponent {}
