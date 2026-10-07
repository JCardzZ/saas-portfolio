import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-alert',
  standalone: true,
  template: `
    <div role="alert" class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {{ message() }}
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertComponent {
  readonly message = input.required<string>();
}
