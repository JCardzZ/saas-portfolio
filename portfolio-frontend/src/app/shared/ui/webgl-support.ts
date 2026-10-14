/**
 * ¿Merece la pena pintar 3D aquí? Hace falta WebGL y que lo haga una GPU de verdad: con un
 * renderizador por software (SwiftShader, llvmpipe…, típico de máquinas virtuales, navegadores sin
 * aceleración y la CI) cada fotograma cuesta lo que una GPU tarda en cientos, y la página entera se
 * vuelve lenta. En ese caso las escenas 3D no se cargan y queda la página normal.
 * `?webgl=force` en la URL lo fuerza (para revisar capturas en local).
 */
export function hasFastWebGL(): boolean {
  try {
    if (new URLSearchParams(location.search).get('webgl') === 'force') return true;
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}
