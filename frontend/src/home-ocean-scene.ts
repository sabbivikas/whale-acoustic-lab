import * as THREE from "three";
import { canUseWebGL, cappedDevicePixelRatio, SceneAnimationLoop } from "./home-scene-lifecycle";
import type { HomeOceanHandle } from "./home-ocean-loader";

const TAU = Math.PI * 2;

function seededRandom(seed = 481516): () => number {
  let state = seed >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}

function skinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 384; canvas.height = 192;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#627b7e"; context.fillRect(0, 0, canvas.width, canvas.height);
  const random = seededRandom(9217);
  for (let index = 0; index < 5200; index += 1) {
    const tone = 58 + Math.floor(random() * 36);
    context.fillStyle = `rgba(${tone},${tone + 10},${tone + 12},${0.025 + random() * 0.06})`;
    const size = .4 + random() * 1.7;
    context.fillRect(random() * canvas.width, random() * canvas.height, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1);
  return texture;
}

function softenSphere(geometry: THREE.SphereGeometry, exponent = .66, verticalExponent = 1): THREE.SphereGeometry {
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    position.setX(index, Math.sign(x) * Math.pow(Math.abs(x), exponent));
    position.setY(index, Math.sign(y) * Math.pow(Math.abs(y), verticalExponent));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createScar(points: THREE.Vector3[]): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 18, .012, 4, false),
    new THREE.MeshBasicMaterial({ color: 0x9a9b8e, transparent: true, opacity: .42 }),
  );
}

function createSpermWhale(): { group: THREE.Group; tail: THREE.Group; leftFin: THREE.Mesh; rightFin: THREE.Mesh } {
  const group = new THREE.Group();
  group.name = "ProceduralSpermWhale";
  const texture = skinTexture();
  const skin = new THREE.MeshStandardMaterial({ color: 0xb9c5c4, map: texture, roughness: .88, metalness: 0 });
  const underside = new THREE.MeshStandardMaterial({ color: 0xcbd3d1, map: texture, roughness: .94 });

  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), skin);
  torso.scale.set(3.45, 1.05, 1.03); torso.position.set(.25, .02, 0); group.add(torso);

  const head = new THREE.Mesh(softenSphere(new THREE.SphereGeometry(1, 64, 34), .62, .7), skin);
  head.scale.set(1.63, 1.28, 1.16); head.position.set(-2.45, .1, 0); group.add(head);

  const forehead = new THREE.Mesh(softenSphere(new THREE.SphereGeometry(1, 48, 24), .54, .62), skin);
  forehead.scale.set(.72, .96, 1.03); forehead.position.set(-3.43, .34, 0); group.add(forehead);

  const jaw = new THREE.Mesh(new THREE.CapsuleGeometry(.22, 1.72, 8, 24), underside);
  jaw.rotation.z = Math.PI / 2; jaw.scale.set(1, 1, .74); jaw.position.set(-2.55, -.73, 0); group.add(jaw);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1.85, 8), new THREE.MeshBasicMaterial({ color: 0x263c42 }));
  mouth.rotation.z = Math.PI / 2; mouth.position.set(-2.72, -.58, .82); group.add(mouth);

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x071014, roughness: .35 });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.06, 16, 10), eyeMaterial);
  eye.position.set(-2.18, .25, .98); group.add(eye);
  const eyeGlint = new THREE.Mesh(new THREE.SphereGeometry(.013, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb7d5d3 }));
  eyeGlint.position.set(-2.2, .27, 1.035); group.add(eyeGlint);

  const blowhole = new THREE.Mesh(new THREE.TorusGeometry(.075, .016, 6, 18, Math.PI * 1.35), new THREE.MeshBasicMaterial({ color: 0x263a3e }));
  blowhole.rotation.x = Math.PI / 2; blowhole.position.set(-2.97, 1.22, .08); group.add(blowhole);

  const tail = new THREE.Group(); tail.position.set(3.32, 0, 0); group.add(tail);
  const peduncle = new THREE.Mesh(new THREE.CapsuleGeometry(.27, 1.42, 8, 24), skin);
  peduncle.rotation.z = Math.PI / 2; peduncle.position.x = .69; tail.add(peduncle);
  const flukeGeometry = softenSphere(new THREE.SphereGeometry(1, 40, 18), .78);
  const leftFluke = new THREE.Mesh(flukeGeometry, skin); leftFluke.scale.set(.75, .115, 1.05); leftFluke.position.set(1.48, 0, .83); leftFluke.rotation.y = -.28; tail.add(leftFluke);
  const rightFluke = new THREE.Mesh(flukeGeometry.clone(), skin); rightFluke.scale.set(.75, .115, 1.05); rightFluke.position.set(1.48, 0, -.83); rightFluke.rotation.y = .28; tail.add(rightFluke);

  const finGeometry = softenSphere(new THREE.SphereGeometry(1, 36, 16), .72);
  const leftFin = new THREE.Mesh(finGeometry, underside); leftFin.scale.set(.9, .12, .47); leftFin.position.set(-.75, -.7, 1.02); leftFin.rotation.set(-.3, -.38, -.18); group.add(leftFin);
  const rightFin = new THREE.Mesh(finGeometry.clone(), underside); rightFin.scale.set(.9, .12, .47); rightFin.position.set(-.75, -.67, -1.0); rightFin.rotation.set(.28, .38, -.15); group.add(rightFin);

  [
    { x: 1.45, y: .96, scale: .28 },
    { x: 2.05, y: .78, scale: .19 },
    { x: 2.52, y: .58, scale: .13 },
  ].forEach((hump) => {
    const node = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), skin);
    node.scale.set(hump.scale * 1.5, hump.scale, hump.scale * .75); node.position.set(hump.x, hump.y, 0); group.add(node);
  });

  group.add(
    createScar([new THREE.Vector3(-1.35, .56, 1.035), new THREE.Vector3(-.9, .66, 1.05), new THREE.Vector3(-.45, .57, 1.04)]),
    createScar([new THREE.Vector3(.18, -.18, 1.04), new THREE.Vector3(.58, -.09, 1.05), new THREE.Vector3(.96, -.2, .98)]),
  );
  return { group, tail, leftFin, rightFin };
}

function particleField(count: number): THREE.Points {
  const random = seededRandom(1138);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - .5) * 24;
    positions[index * 3 + 1] = (random() - .5) * 11;
    positions[index * 3 + 2] = -8 + random() * 15;
    sizes[index] = .5 + random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x8ac5c5, size: .022, transparent: true, opacity: .32, depthWrite: false }));
}

function lightRay(x: number, z: number, rotation: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color: 0x72b6b2, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide });
  const ray = new THREE.Mesh(new THREE.ConeGeometry(1.5, 11, 28, 1, true), material);
  ray.position.set(x, 4.7, z); ray.rotation.z = rotation;
  return ray;
}

function disposeMaterial(material: THREE.Material): void {
  Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) value.dispose(); });
  material.dispose();
}

export function disposeThreeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
    else if (mesh.material) disposeMaterial(mesh.material);
  });
}

export function mountHomeOceanScene(container: HTMLElement): HomeOceanHandle {
  const canvas = container.querySelector<HTMLCanvasElement>("canvas");
  if (!canvas || !canUseWebGL(() => canvas)) { container.dataset.sceneState = "fallback"; return { dispose() {} }; }

  const compact = window.matchMedia("(max-width: 700px)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !compact, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .94;
  renderer.setPixelRatio(cappedDevicePixelRatio(window.devicePixelRatio, compact));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03131d, .062);
  const camera = new THREE.PerspectiveCamera(compact ? 48 : 42, 1, .1, 70);
  camera.position.set(compact ? 0 : .3, .25, compact ? 12.6 : 11.3);

  const world = new THREE.Group(); scene.add(world);
  const whale = createSpermWhale();
  whale.group.scale.setScalar(compact ? .98 : .58);
  whale.group.position.set(compact ? .65 : 1.42, compact ? .18 : .25, 0);
  whale.group.rotation.set(compact ? .115 : .07, compact ? -.14 : -.12, -.025);
  world.add(whale.group);

  const ambient = new THREE.HemisphereLight(0x6ca5a2, 0x03131a, 1.65); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xa0ccc5, 2.75); key.position.set(-4, 7, 7); scene.add(key);
  const rim = new THREE.PointLight(0x4b9290, 6, 14, 2); rim.position.set(4, 1, -3); scene.add(rim);

  const particles = particleField(compact ? 230 : 520); world.add(particles);
  const rays = compact ? [lightRay(2.8, -5, -.16)] : [lightRay(-1.2, -6, .12), lightRay(4.1, -4, -.18)];
  rays.forEach((ray) => world.add(ray));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(35, 24), new THREE.MeshStandardMaterial({ color: 0x06171d, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -4.15, -4); world.add(floor);

  const sonar = Array.from({ length: 3 }, (_, index) => {
    const material = new THREE.MeshBasicMaterial({ color: 0x77c4bd, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.35, .009, 6, 64), material);
    ring.rotation.y = Math.PI / 2; ring.position.set(-3.6, .2, .05); ring.visible = false; ring.userData.offset = index * .62; world.add(ring); return ring;
  });

  let pointerX = 0, pointerY = 0, disposed = false;
  let sceneVisible = true;
  const clock = new THREE.Clock();
  const render = (): void => renderer.render(scene, camera);
  const resize = (): void => {
    const bounds = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
  };
  const frame = (): void => {
    const elapsed = clock.getElapsedTime();
    const drift = Math.sin(elapsed * .18);
    whale.group.position.y = (compact ? .18 : .25) + Math.sin(elapsed * .42) * .095;
    whale.group.position.x = (compact ? .65 : 1.42) + drift * .22;
    whale.group.rotation.z = -.025 + Math.sin(elapsed * .34) * .018;
    whale.tail.rotation.z = Math.sin(elapsed * .72) * .105;
    whale.tail.rotation.y = Math.sin(elapsed * .4) * .025;
    whale.leftFin.rotation.z = -.18 + Math.sin(elapsed * .5) * .055;
    whale.rightFin.rotation.z = -.15 - Math.sin(elapsed * .5) * .045;
    particles.rotation.y = elapsed * .0025; particles.position.y = Math.sin(elapsed * .11) * .08;
    camera.position.x += ((compact ? 0 : .3) + pointerX * .22 - camera.position.x) * .025;
    camera.position.y += (.25 + pointerY * .12 - camera.position.y) * .025;
    camera.lookAt(compact ? .35 : .75, .05, 0);
    const sonarTime = elapsed % 17;
    sonar.forEach((ring) => {
      const phase = sonarTime - 12.5 - ring.userData.offset;
      ring.visible = phase >= 0 && phase <= 2.4;
      if (ring.visible) {
        const progress = phase / 2.4;
        ring.scale.setScalar(.5 + progress * 5.2);
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.sin(progress * Math.PI) * .14;
      }
    });
    render();
  };

  const loop = new SceneAnimationLoop({ scheduler: { request: (callback) => window.requestAnimationFrame(callback), cancel: (frameId) => window.cancelAnimationFrame(frameId) }, renderFrame: frame, reducedMotion: reducedMotion.matches, documentHidden: document.hidden });
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
  const onPointer = (event: PointerEvent): void => {
    const bounds = container.getBoundingClientRect();
    pointerX = THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    pointerY = THREE.MathUtils.clamp(-((event.clientY - bounds.top) / bounds.height * 2 - 1), -1, 1);
  };
  const onVisibility = (): void => loop.setDocumentHidden(document.hidden || !sceneVisible);
  const onMotion = (): void => { loop.setReducedMotion(reducedMotion.matches); if (reducedMotion.matches) loop.renderStatic(0); };
  if (!reducedMotion.matches) container.addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  reducedMotion.addEventListener("change", onMotion);
  const visibilityObserver = new IntersectionObserver((entries) => {
    sceneVisible = entries.some((entry) => entry.isIntersecting);
    loop.setDocumentHidden(document.hidden || !sceneVisible);
  }, { rootMargin: "80px" });
  visibilityObserver.observe(container);
  resize();
  if (reducedMotion.matches) loop.renderStatic(0); else loop.start();
  container.dataset.sceneState = "ready";

  return {
    dispose(): void {
      if (disposed) return; disposed = true;
      loop.dispose(); resizeObserver.disconnect(); visibilityObserver.disconnect(); container.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility); reducedMotion.removeEventListener("change", onMotion);
      disposeThreeObject(scene); renderer.dispose(); renderer.forceContextLoss(); container.dataset.sceneState = "disposed";
    },
  };
}
