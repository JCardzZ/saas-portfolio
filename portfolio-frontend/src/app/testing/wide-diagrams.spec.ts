import { ContainerWidthDirective } from '../shared/ui/container-width.directive';

/**
 * Los diagramas eligen su disposición por el ancho que tienen, y la ventana del navegador de los
 * tests unitarios es la que toque. Para que no dependan de ella, todos los tests parten de un
 * hueco ancho (la disposición de escritorio); el que prueba la estrecha fija otro ancho.
 */
beforeEach(() => (ContainerWidthDirective.fixedWidth = 1280));
afterAll(() => (ContainerWidthDirective.fixedWidth = null));
