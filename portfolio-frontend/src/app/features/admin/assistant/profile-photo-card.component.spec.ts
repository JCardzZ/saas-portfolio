import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ProfileService } from '../../../core/api';
import { PHOTO_MAX_BYTES, ProfilePhotoCardComponent } from './profile-photo-card.component';

describe('ProfilePhotoCardComponent', () => {
  function create(api: Partial<Record<'adminProfilePhotoPut' | 'adminProfilePhotoDelete', jasmine.Spy>> = {}) {
    const service = {
      adminProfilePhotoPut: api.adminProfilePhotoPut ?? jasmine.createSpy('put').and.returnValue(of(null)),
      adminProfilePhotoDelete: api.adminProfilePhotoDelete ?? jasmine.createSpy('delete').and.returnValue(of(null)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ProfileService, useValue: service }] });
    const fixture = TestBed.createComponent(ProfilePhotoCardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const choose = (file: File) => {
      const input = element.querySelector<HTMLInputElement>('input[type="file"]')!;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    return { fixture, element, service, choose };
  }
  const photo = (type = 'image/png', size = 10) => new File([new Uint8Array(size)], 'yo.png', { type });

  it('starts without a photo in demo mode and accepts only JPEG or PNG files', () => {
    const { element } = create();
    expect(element.textContent).toContain('Sin foto');
    expect(element.textContent).toContain('Subir foto');
    expect(element.querySelector('input')!.getAttribute('accept')).toBe('image/jpeg,image/png');
    expect(element.querySelector('img')).toBeNull();
  });

  it('uploads the chosen file, previews it and explains when the CV picks it up', () => {
    const { element, service, choose } = create();
    const file = photo();
    choose(file);

    expect(service.adminProfilePhotoPut).toHaveBeenCalledOnceWith(file);
    expect(element.querySelector('img')!.getAttribute('src')).toMatch(/^blob:/);
    expect(element.textContent).toContain('Cambiar foto');
    expect(element.querySelector('[role="status"]')!.textContent).toContain('Modo demo: la foto no se guarda');
  });

  it('rejects other formats and files over 2 MB without calling the API', () => {
    const { element, service, choose } = create();

    choose(photo('image/svg+xml'));
    expect(element.querySelector('[role="alert"]')!.textContent).toContain('JPEG o PNG');
    choose(photo('image/jpeg', PHOTO_MAX_BYTES + 1));
    expect(element.querySelector('[role="alert"]')!.textContent).toContain('supera el máximo de 2 MB');
    expect(service.adminProfilePhotoPut).not.toHaveBeenCalled();
  });

  it('shows the reason when the server rejects the file', () => {
    const rejection = new HttpErrorResponse({ status: 400, error: { detail: 'La foto debe ser una imagen JPEG o PNG' } });
    const { element, choose } = create({ adminProfilePhotoPut: jasmine.createSpy().and.returnValue(throwError(() => rejection)) });
    choose(photo());

    expect(element.querySelector('[role="alert"]')!.textContent).toContain('La foto debe ser una imagen JPEG o PNG');
    expect(element.querySelector('img')).toBeNull();
  });

  it('removes the photo, going back to the initials', () => {
    const { fixture, element, service, choose } = create();
    choose(photo());
    Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes('Quitar foto'))!.click();
    fixture.detectChanges();

    expect(service.adminProfilePhotoDelete).toHaveBeenCalledTimes(1);
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('[role="status"]')!.textContent).toContain('vuelve a mostrar las iniciales');
  });
});
