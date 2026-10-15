import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { AppliedAIRAGService } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ProfilePhotoCardComponent } from './profile-photo-card.component';
import { CV_OPTIONS, cvUrl } from '../../../shared/ui/cv-download.component';

@Component({
    selector: 'app-assistant-admin-page',
    imports: [AlertComponent, ProfilePhotoCardComponent],
    templateUrl: './assistant-admin-page.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssistantAdminPageComponent {
  private readonly api = inject(AppliedAIRAGService);

  readonly cvOptions = CV_OPTIONS;
  readonly cvUrl = cvUrl;

  readonly starting = signal(false);
  readonly started = signal(false);
  readonly error = signal<string | null>(null);

  reindex(): void {
    this.starting.set(true);
    this.started.set(false);
    this.error.set(null);
    this.api
      .adminAiRagReindexPost()
      .pipe(finalize(() => this.starting.set(false)))
      .subscribe({
        next: () => this.started.set(true),
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }
}
