import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ====== reduced-motion guard ======
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ====== setup ======
const canvas = document.getElementById('bg-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5.2);

// solid clear color (matching CSS --bg) avoids alpha+bloom flicker
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x050810, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
scene.background = new THREE.Color(0x050810);

// post-processing composer (bloom for premium glow)
// Multisampled render target — fixes aliasing/block artifacts from EffectComposer losing default MSAA
const composerRT = new THREE.WebGLRenderTarget(
  window.innerWidth, window.innerHeight,
  {
    samples: 4,
    type: THREE.HalfFloatType,
  }
);
const composer = new EffectComposer(renderer, composerRT);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5,   // strength
  0.7,   // radius — softer falloff
  0.45   // threshold — only highlights bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ====== centerpiece: distorted icosahedron with iridescent fresnel shader ======
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uAmplitude;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vDistortion;
  varying vec3 vWorldPos;

  // ====== simplex 3D noise (Ashima Arts, public domain) ======
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vec3 pos = position;
    float n1 = snoise(pos * 0.9 + uTime * 0.22);
    float n2 = snoise(pos * 2.1 + uTime * 0.12) * 0.4;
    float distortion = (n1 + n2) * uAmplitude;
    pos += normal * distortion;

    vDistortion = distortion;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPos.xyz;
    vWorldPos = pos;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vDistortion;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 nrm = normalize(vNormal);

    float ndotv = max(0.0, dot(nrm, viewDir));
    float fresnel = pow(1.0 - ndotv, 2.4);

    // light direction (top-front)
    vec3 lightDir = normalize(vec3(0.4, 0.7, 0.6));
    float diff = max(0.0, dot(nrm, lightDir));

    // techy palette: deep core, cyan rim, magenta highlight
    vec3 core      = vec3(0.02, 0.04, 0.08); // near-black
    vec3 mid       = vec3(0.08, 0.18, 0.32); // dark cyan-blue
    vec3 cyan      = vec3(0.0, 0.85, 1.0);   // electric cyan
    vec3 magenta   = vec3(1.0, 0.18, 0.46);  // hot magenta

    vec3 color = mix(core, mid, diff);
    // cyan rim from fresnel
    color += cyan * fresnel * 1.2;
    // magenta accent on extreme grazing angles
    color += magenta * pow(fresnel, 4.0) * 0.6;

    // distortion-driven scan shimmer (very subtle blue strobe)
    float shimmer = sin(vDistortion * 30.0 + uTime * 1.8) * 0.5 + 0.5;
    color += cyan * shimmer * 0.08;

    // depth fade
    float depth = clamp(vWorldPos.z * 0.5 + 0.5, 0.4, 1.0);
    color *= depth;

    // cap brightness to prevent bloom block artifacts on extreme HDR peaks
    color = min(color, vec3(1.8));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const geometry = new THREE.IcosahedronGeometry(1.5, 64);
const material = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uAmplitude: { value: 0.18 },
  },
  vertexShader,
  fragmentShader,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// thin wireframe ghost overlay — cyan structural lattice
// Slightly larger than mesh, subdivision 1 (less geometry = no bloom block artifacts)
const wireGeo = new THREE.IcosahedronGeometry(1.78, 1);
const wireMat = new THREE.LineBasicMaterial({
  color: 0x00e5ff,
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
});
const wireframe = new THREE.LineSegments(new THREE.WireframeGeometry(wireGeo), wireMat);
scene.add(wireframe);

// ====== ambient particles (stars) ======
const PCOUNT = 1400;
const particlesGeo = new THREE.BufferGeometry();
const positions = new Float32Array(PCOUNT * 3);
const colors = new Float32Array(PCOUNT * 3);
for (let i = 0; i < PCOUNT; i++) {
  // spherical distribution, biased to mid distances
  const r = 4 + Math.pow(Math.random(), 0.5) * 14;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  positions[i * 3 + 2] = r * Math.cos(phi);

  // mostly cool white with occasional cyan/magenta sparks
  const roll = Math.random();
  if (roll > 0.92) {
    // magenta spark
    colors[i * 3] = 1.0;
    colors[i * 3 + 1] = 0.18;
    colors[i * 3 + 2] = 0.46;
  } else if (roll > 0.78) {
    // cyan spark
    colors[i * 3] = 0.0;
    colors[i * 3 + 1] = 0.85;
    colors[i * 3 + 2] = 1.0;
  } else {
    const t = 0.7 + Math.random() * 0.3;
    colors[i * 3] = t * 0.85;
    colors[i * 3 + 1] = t * 0.92;
    colors[i * 3 + 2] = t;
  }
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particlesGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const particlesMat = new THREE.PointsMaterial({
  size: 0.024,
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
  depthWrite: false,
});
const particles = new THREE.Points(particlesGeo, particlesMat);
scene.add(particles);

// ====== state + interaction ======
let scrollY = 0;
const targetMouse = { x: 0, y: 0 };
const mouse = { x: 0, y: 0 };

window.addEventListener('mousemove', (e) => {
  targetMouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
  targetMouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (e.touches[0]) {
    targetMouse.x = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
    targetMouse.y = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
  }
}, { passive: true });

window.addEventListener('scroll', () => {
  scrollY = window.scrollY;
}, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(dpr);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});
// match composer pixel ratio at boot
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// ====== animation loop ======
const clock = new THREE.Clock();

function animate() {
  const t = clock.getElapsedTime();

  // ease mouse for buttery interaction
  mouse.x += (targetMouse.x - mouse.x) * 0.04;
  mouse.y += (targetMouse.y - mouse.y) * 0.04;

  material.uniforms.uTime.value = t;

  // hero scroll progress (0..1.5 over first 1.5 viewports)
  const scrollProgress = Math.min(scrollY / window.innerHeight, 2.0);

  // base offset — positioned upper-right of viewport so hero text stays readable
  const baseX = 1.7;
  const baseY = 0.5;
  mesh.position.x = baseX + mouse.x * 0.35 + scrollProgress * 1.4;
  mesh.position.y = baseY - mouse.y * 0.25 - scrollProgress * 0.5;
  wireframe.position.copy(mesh.position);

  // gentle rotation, augmented by mouse
  mesh.rotation.x = t * 0.12 + mouse.y * 0.4;
  mesh.rotation.y = t * 0.18 + mouse.x * 0.4;
  wireframe.rotation.copy(mesh.rotation);

  // amplitude dial responds to scroll (calmer once past hero)
  material.uniforms.uAmplitude.value = 0.18 - scrollProgress * 0.04;

  // particles: slow celestial drift
  particles.rotation.y = t * 0.018;
  particles.rotation.x = t * 0.008;

  // fade scene as user scrolls deep
  const opacity = Math.max(0.15, 1 - scrollProgress * 0.55);
  particlesMat.opacity = 0.6 * opacity;
  wireMat.opacity = 0.16 * opacity;

  composer.render();
  if (!prefersReducedMotion) requestAnimationFrame(animate);
}

if (prefersReducedMotion) {
  composer.render();
} else {
  animate();
}

// ====== scroll-reveal sections ======
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.08, rootMargin: '0px 0px -8% 0px' }
);

document.querySelectorAll('section').forEach((s) => {
  s.classList.add('reveal');
  observer.observe(s);
});

// ====== smooth scroll for anchor clicks (covers cases where CSS smooth-scroll lags) ======
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id && id.length > 1 && document.querySelector(id)) {
      e.preventDefault();
      document.querySelector(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ====== custom cursor (desktop only) ======
const cursorEl = document.querySelector('.cursor');
const cursorDot = document.querySelector('.cursor__dot');
const cursorRing = document.querySelector('.cursor__ring');
const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (isFinePointer && cursorEl) {
  let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  let rx = cx, ry = cy;
  let dx = cx, dy = cy;

  document.addEventListener('mousemove', (e) => {
    cx = e.clientX;
    cy = e.clientY;
  }, { passive: true });
  document.addEventListener('mousedown', () => cursorEl.classList.add('click'));
  document.addEventListener('mouseup', () => cursorEl.classList.remove('click'));

  function cursorTick() {
    // dot follows nearly instantly
    dx += (cx - dx) * 0.55;
    dy += (cy - dy) * 0.55;
    // ring follows with smooth lag
    rx += (cx - rx) * 0.18;
    ry += (cy - ry) * 0.18;
    cursorDot.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    cursorRing.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    requestAnimationFrame(cursorTick);
  }
  cursorTick();

  // hover state on interactive elements
  const hoverables = 'a, button, .project, .nav__cta, .role h3, .contact__links a';
  document.querySelectorAll(hoverables).forEach((el) => {
    el.addEventListener('mouseenter', () => cursorEl.classList.add('hover'));
    el.addEventListener('mouseleave', () => cursorEl.classList.remove('hover'));
  });
}

// ====== project card 3D tilt (desktop only) ======
if (isFinePointer) {
  document.querySelectorAll('.project').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(1200px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg) translateZ(8px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

// ====== magnetic contact links ======
if (isFinePointer) {
  document.querySelectorAll('.contact__links a').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = '';
    });
  });
}

// ====== loader fadeout once everything's ready ======
function dismissLoader() {
  const loader = document.querySelector('.loader');
  if (loader) loader.classList.add('done');
}
if (document.readyState === 'complete') {
  setTimeout(dismissLoader, 1400);
} else {
  window.addEventListener('load', () => setTimeout(dismissLoader, 1400));
}
// safety fallback — never leave loader stuck
setTimeout(dismissLoader, 3500);
