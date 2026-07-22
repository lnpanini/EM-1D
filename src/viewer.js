// Three.js 3D parametric viewer. Consumes the Phase-1 geometry IR via scene.js.
// 'three' resolves through the index.html importmap to src/vendor/three.module.js.
import * as THREE from 'three';
import { OrbitControls } from '/src/vendor/OrbitControls.js';
import { geometryToMeshSpecs, sceneBounds, dimensionSpecs } from './scene.js';

// Canvas-texture text sprite for dimension labels; height is in world units.
function textSprite(label, height) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '500 48px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(label).width) + 20;
  canvas.width = w; canvas.height = 68;
  ctx.font = font; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(14,17,22,0.7)';
  ctx.fillRect(0, 0, w, 68);
  ctx.fillStyle = '#E3E8EE';
  ctx.fillText(label, 10, 36);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(height * (w / 68), height, 1);
  sprite.renderOrder = 1000;
  return sprite;
}

function meshFromSpec(s) {
  if (s.kind === 'box') {
    const g = new THREE.BoxGeometry(Math.max(s.size[0], 1e-3), Math.max(s.size[1], 1e-3), Math.max(s.size[2], 1e-3));
    const m = new THREE.MeshStandardMaterial({ color: s.color, transparent: !!s.transparent, opacity: s.opacity ?? 1, metalness: 0.5, roughness: 0.5 });
    const mesh = new THREE.Mesh(g, m); mesh.position.set(...s.pos); return mesh;
  }
  if (s.kind === 'cylinder') {
    const g = new THREE.CylinderGeometry(s.radius, s.radius, Math.max(s.height, 1e-3), 48);
    const m = new THREE.MeshStandardMaterial({ color: s.color, transparent: !!s.transparent, opacity: s.opacity ?? 1, metalness: 0.7, roughness: 0.35 });
    const mesh = new THREE.Mesh(g, m);
    if (s.axis === 'z') mesh.rotation.x = Math.PI / 2;       // CylinderGeometry is y-up by default
    else if (s.axis === 'x') mesh.rotation.z = Math.PI / 2;
    mesh.position.set(...s.pos); return mesh;
  }
  if (s.kind === 'ring') {
    const g = new THREE.RingGeometry(Math.max(s.rInner, 1e-3), s.rOuter, 64);  // lies in x-y plane (z normal)
    const m = new THREE.MeshStandardMaterial({ color: s.color, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.35, transparent: !!s.transparent, opacity: s.opacity ?? 1 });
    const mesh = new THREE.Mesh(g, m); mesh.position.set(...s.pos); return mesh;
  }
  if (s.kind === 'shape') {
    const shape = new THREE.Shape();
    const o = s.outline;
    if (!o.length) return null;
    shape.moveTo(o[0][0], o[0][1]);
    for (let i = 1; i < o.length; i++) shape.lineTo(o[i][0], o[i][1]);
    shape.closePath();
    // Holes make the shape an annulus (a closed trace loop).
    for (const hole of s.holes || []) {
      if (!hole.length) continue;
      const path = new THREE.Path();
      path.moveTo(hole[0][0], hole[0][1]);
      for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
      path.closePath();
      shape.holes.push(path);
    }
    const g = new THREE.ShapeGeometry(shape);                // x-y plane (z normal)
    const m = new THREE.MeshStandardMaterial({ color: s.color, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.35 });
    const mesh = new THREE.Mesh(g, m); mesh.position.set(...s.pos); return mesh;
  }
  if (s.kind === 'tube') {
    // Embedded channel: sweep a circular section along the 3D centerline. The
    // path is already dense, so a Catmull-Rom through it is effectively exact.
    if (!s.path || s.path.length < 2) return null;
    const pts = s.path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const g = new THREE.TubeGeometry(curve, Math.min(2400, pts.length * 2), s.radius, 12, false);
    // Keep metalness in line with the other conductors: without an environment
    // map a near-1 metalness has nothing to reflect and renders almost black,
    // which is invisible against the dark scene and inside the translucent slab.
    const m = new THREE.MeshStandardMaterial({ color: s.color, metalness: 0.6, roughness: 0.35 });
    return new THREE.Mesh(g, m);
  }
  if (s.kind === 'line') {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...s.p1), new THREE.Vector3(...s.p2)]);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: s.color }));
  }
  return null;
}

export function createViewer(container) {
  if (!container || typeof window === 'undefined') return null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1e6);
  camera.up.set(0, 0, 1);                                    // z is the substrate normal

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x202a3a, 1.15));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(1, -1, 2); scene.add(dir);

  const grid = new THREE.GridHelper(200, 20, 0x3a5170, 0x223247);
  grid.rotation.x = Math.PI / 2;                            // lie in x-y plane
  scene.add(grid);
  const axes = new THREE.AxesHelper(15); scene.add(axes);

  const modelGroup = new THREE.Group(); scene.add(modelGroup);

  function clearGroup() {
    while (modelGroup.children.length) {
      const c = modelGroup.children.pop();
      c.geometry?.dispose?.();
      c.material?.map?.dispose?.();
      c.material?.dispose?.();
    }
  }

  function update(geometry) {
    clearGroup();
    const specs = geometryToMeshSpecs(geometry);
    for (const s of specs) { const mesh = meshFromSpec(s); if (mesh) modelGroup.add(mesh); }

    const b = sceneBounds(specs);
    if (b) {
      // dimension overlay: lines + labels, drawn on top of the solids
      const dimMat = new THREE.LineBasicMaterial({ color: 0x8fa3bd, depthTest: false, transparent: true, opacity: 0.85 });
      for (const d of dimensionSpecs(geometry)) {
        if (!d.views.includes('3d')) continue;
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...d.p1), new THREE.Vector3(...d.p2)]);
        const line = new THREE.Line(g, dimMat.clone());
        line.renderOrder = 999;
        modelGroup.add(line);
        const s = textSprite(d.label, b.size * 0.045);
        s.position.set(
          (d.p1[0] + d.p2[0]) / 2,
          (d.p1[1] + d.p2[1]) / 2,
          (d.p1[2] + d.p2[2]) / 2 + b.size * 0.02
        );
        modelGroup.add(s);
      }
      dimMat.dispose();
    }
    if (b) {
      controls.target.set(...b.center);
      const d = b.size * 1.6;
      camera.position.set(b.center[0] + d, b.center[1] - d, b.center[2] + d * 0.8);
      camera.near = Math.max(b.size / 200, 0.01);
      camera.far = b.size * 200;
      camera.updateProjectionMatrix();
      grid.scale.setScalar(Math.max(b.size / 100, 0.2));
      axes.scale.setScalar(Math.max(b.size / 30, 0.5));
      controls.update();
    }
  }

  function resize() {
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let raf = 0;
  (function animate() { raf = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();

  return {
    update,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      clearGroup();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    },
  };
}
