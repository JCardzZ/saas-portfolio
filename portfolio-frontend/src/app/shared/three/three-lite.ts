// Solo las piezas de Three.js que usan las escenas de la portada. `import('three')` entero no deja
// que el empaquetador quite nada (las escenas reciben el espacio de nombres como objeto); con esta
// lista sí. Si una escena necesita otra clase, añadirla aquí: el tipo `Three` no compila sin ella.
export {
  ACESFilmicToneMapping, AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry,
  CanvasTexture, CapsuleGeometry, CatmullRomCurve3, CircleGeometry, Color, CylinderGeometry, DirectionalLight,
  DoubleSide, ExtrudeGeometry, Group, HemisphereLight, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, NormalBlending, PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight, Points,
  PointsMaterial, Quaternion, Raycaster, Scene, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry,
  TubeGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
export type { MeshPhysicalMaterialParameters, MeshStandardMaterialParameters, Object3D, Texture, Material } from 'three';
