/* ==========================================================================
   hero-3d.js — #hero 프리미엄 미니멀 3D 인트로
   - seat.glb(공용 로더) 한 개로 카메라·조명·트랜스폼만 써서 연출합니다.
   - 인트로(약 6~7초) 후 아이들 루프. 스크롤 연동 없음.
   - 수치는 아래 CONFIG에서 조정하세요.
   ========================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadSeat, findMesh } from './seat-model.js';

/* --------------------------------------------------------------------------
   CONFIG — 시간(초), 각도(도), 색상, 강도
   -------------------------------------------------------------------------- */
export const CONFIG = {
  colors: {
    champagne: 0xC2A574,   // 림라이트 (포인트 컬러는 이것 하나)
    key: 0xFFF4E6,         // 키라이트 (따뜻한 화이트)
  },
  timeline: {
    canvasFade: 0.9,       // 포스터 → 캔버스 크로스페이드 (CSS transition과 맞춤)
    rimStart: 0.3,  rimDur: 1.5,
    keyStart: 1.0,  keyDur: 1.6,
    camStart: 1.0,  camDur: 3.0,
    spinStart: 1.8, spinDur: 2.8,
    floorStart: 2.5, floorDur: 1.2,
    textAt: 3.2,           // 헤드라인·서브카피 마스크 리빌 (stagger는 CSS 120ms)
    ctaAt: 4.0,            // 지표 + CTA 페이드인
    idleAt: 4.6,           // 이 시점부터 아이들 루프 (spinStart + spinDur)
  },
  camera: {
    fov: 28,
    target: [0, 0.45, 0],  // 모델 높이 1.0, 원점은 바닥 중앙 (반사 공간 확보로 살짝 아래)
    finalAzimuth: 32,      // 최종 구도: 정면(+z)에서 오른쪽으로 32°
    orbit: 35,             // 인트로에서 돌아오는 각도 (3/4 측면 → 정면 쪽)
    elevation: 9,
    startDistanceMul: 1.3, // 시작 시 거리 배율 (원거리 → 접근)
    margin: 1.14,          // 화면 대비 여백 (클수록 모델이 작아짐)
  },
  lights: {
    key: 2.6,
    rim: 4.2,
    env: 0.55,             // RoomEnvironment 반사 세기 (약하게)
    keyPos: [3.0, 3.2, 1.4],   // 오른쪽 위 (카메라 축에서 비켜 둬서 면이 평평해 보이지 않게)
    // 왼쪽 뒤 (최종 카메라 기준). 카메라 정반대에 두면 윤곽이 거의 안 보여서 왼쪽으로 더 돌림
    rimPos: [-3.4, 1.6, -0.8],
  },
  idle: {
    rotateSpeed: 0.08,     // rad/s
    floatAmp: 0.01,        // ±상하 플로팅
    floatPeriod: 5.5,      // 초
    parallaxDeg: 4,        // PC 마우스 패럴랙스 최대 각도
    parallaxLerp: 0.06,
  },
  floor: {
    shadowOpacity: 0.6,
    reflectionOpacity: 0.07,
    reflectionOnMobile: false,
  },
  quality: {
    maxPixelRatio: 2,
    mobilePixelRatio: 1.25,  // 중급 모바일 30fps 이상 확보용
    deferOnMobile: true,     // 모바일은 페이지 load 이후 유휴 시간에 모델을 받음 (LCP·TBT 보호)
    mobileBreakpoint: 768,
  },
  textFallbackMs: 1500,    // 모델이 이 시간 안에 안 뜨면 텍스트를 먼저 보여 줌
};

/* --------------------------------------------------------------------------
   이징
   -------------------------------------------------------------------------- */
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const prog = (time, start, dur) => clamp01((time - start) / dur);
const deg = THREE.MathUtils.degToRad;

/* --------------------------------------------------------------------------
   텍스트 리빌 (CSS 클래스 토글). JS가 실패해도 head의 안전장치가 텍스트를 엽니다.
   -------------------------------------------------------------------------- */
const root = document.documentElement;
const revealText = () => root.classList.add('hero-text-in');
const revealCta = () => root.classList.add('hero-cta-in');
window.__hero3d = true;

const stage = document.getElementById('hero3dStage');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const capture = /[?&]hero-capture\b/.test(location.search); // 포스터 제작용 (개발 전용)

function fallback() {
  stage?.classList.add('is-fallback');
  revealText(); revealCta();
}

if (stage) init().catch((err) => { console.warn('[hero-3d] fallback to poster:', err?.message || err); fallback(); });

async function init() {
  /* ---------- 렌더러 (WebGL 미지원이면 포스터 폴백) ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: capture, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGL unavailable');
  }
  const isMobile = () => window.innerWidth < CONFIG.quality.mobileBreakpoint;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile() ? CONFIG.quality.mobilePixelRatio : CONFIG.quality.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'hero-canvas';
  stage.appendChild(renderer.domElement);

  /* 모델이 늦게 오면 텍스트부터 */
  let introStarted = false;
  const textTimer = setTimeout(() => { if (!introStarted) { revealText(); revealCta(); } }, reduceMotion ? 0 : CONFIG.textFallbackMs);

  /* ---------- 씬 · 조명 ---------- */
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(CONFIG.colors.key, 0);
  key.position.set(...CONFIG.lights.keyPos);
  const rim = new THREE.DirectionalLight(CONFIG.colors.champagne, 0);
  rim.position.set(...CONFIG.lights.rimPos);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.01, 50);
  const target = new THREE.Vector3(...CONFIG.camera.target);

  /* ---------- 모델 (공용 로더) ---------- */
  // 모바일: 첫 화면(포스터·텍스트)이 먼저 그려지도록 load 이벤트 + 유휴 시간까지 모델 로드를 미룸
  if (CONFIG.quality.deferOnMobile && isMobile() && !capture) {
    if (document.readyState !== 'complete') await new Promise((r) => window.addEventListener('load', r, { once: true }));
    await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1500 }) : setTimeout(r, 300)));
  }
  const gltf = await loadSeat();
  const srcMesh = findMesh(gltf.scene);
  if (!srcMesh) throw new Error('mesh not found');
  srcMesh.updateWorldMatrix(true, false);

  // 히어로 전용 재질 (조명 페이드를 위해 envMapIntensity를 따로 제어)
  const mat = srcMesh.material.clone();
  mat.envMapIntensity = 0;
  const makeMesh = (m) => {
    const o = new THREE.Mesh(srcMesh.geometry, m);   // 지오메트리는 공유 (메모리 절약)
    o.applyMatrix4(srcMesh.matrixWorld);             // 양자화 노드 변환 포함
    return o;
  };

  // tilt(패럴랙스) → spin(Y축 회전) → 모델
  const tiltGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  const model = new THREE.Group();
  model.add(makeMesh(mat));
  spinGroup.add(model);
  tiltGroup.add(spinGroup);
  scene.add(tiltGroup);

  /* ---------- 바닥: 컨택트 섀도 + 미세 반사 ---------- */
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)');
    grd.addColorStop(0.45, 'rgba(0,0,0,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.3), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);

  let reflMat = null;
  const useReflection = !isMobile() || CONFIG.floor.reflectionOnMobile;
  if (useReflection) {
    reflMat = mat.clone();
    reflMat.transparent = true;
    reflMat.opacity = 0;
    reflMat.depthWrite = false;
    // 바닥에서 멀어질수록 반사가 사라지도록 알파 페이드
    reflMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'varying float vReflY;\nvoid main() {')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvReflY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'varying float vReflY;\nvoid main() {')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(-0.22, 0.0, vReflY);');
    };
    const refl = new THREE.Group();
    refl.scale.y = -1;
    refl.add(makeMesh(reflMat));
    spinGroup.add(refl);
  }

  /* ---------- 카메라 구도 ---------- */
  let finalDistance = 2.5;
  const fitDistance = (aspect) => {
    // 높이 1.0과, 회전 시 최대 폭(대각선 약 0.95)이 모두 들어오도록
    const vHalf = deg(CONFIG.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const dv = (0.5 * CONFIG.camera.margin) / Math.tan(vHalf) + 0.4;
    const dh = (0.48 * CONFIG.camera.margin) / Math.tan(hHalf) + 0.4;
    return Math.max(dv, dh);
  };
  const placeCamera = (azDeg, dist) => {
    const az = deg(azDeg), el = deg(CONFIG.camera.elevation);
    camera.position.set(
      target.x + dist * Math.sin(az) * Math.cos(el),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(az) * Math.cos(el)
    );
    camera.lookAt(target);
  };

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile() ? CONFIG.quality.mobilePixelRatio : CONFIG.quality.maxPixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    finalDistance = fitDistance(camera.aspect);
    if (!running) renderFrame(); // 정지 상태여도 구도는 갱신
  };

  /* ---------- 상태 적용 (타임라인 시각 → 장면) ---------- */
  const T = CONFIG.timeline;
  let time = reduceMotion ? 999 : 0; // 인트로 진행 시간(초). 화면 밖/탭 비활성 동안은 멈춤
  let idleAngle = 0;
  let floatClock = 0;
  const mouse = { x: 0, y: 0 }, tilt = { x: 0, y: 0 };

  const applyTimeline = () => {
    // 조명
    rim.intensity = CONFIG.lights.rim * easeInOutSine(prog(time, T.rimStart, T.rimDur));
    const k = easeInOutSine(prog(time, T.keyStart, T.keyDur));
    key.intensity = CONFIG.lights.key * k;
    mat.envMapIntensity = CONFIG.lights.env * k;
    // 카메라: 3/4 측면 원거리 → 정면 쪽 35° 오빗 + 접근 (easeOutExpo)
    const c = easeOutExpo(prog(time, T.camStart, T.camDur));
    placeCamera(CONFIG.camera.finalAzimuth + CONFIG.camera.orbit * (1 - c), finalDistance * (1 + (CONFIG.camera.startDistanceMul - 1) * (1 - c)));
    // 360° 스핀 (제품명 '360' 상징 장면)
    const spin = reduceMotion ? 0 : Math.PI * 2 * easeInOutCubic(prog(time, T.spinStart, T.spinDur));
    spinGroup.rotation.y = spin + idleAngle;
    // 바닥
    const f = easeInOutSine(prog(time, T.floorStart, T.floorDur));
    shadowMat.opacity = CONFIG.floor.shadowOpacity * f;
    if (reflMat) reflMat.opacity = CONFIG.floor.reflectionOpacity * f;
  };

  const renderFrame = () => { applyTimeline(); renderer.render(scene, camera); };

  /* ---------- 루프 (화면 안 + 탭 활성일 때만) ---------- */
  const clock = new THREE.Clock(false);
  let running = false, rafId = 0, inView = true, textDone = false, ctaDone = false;
  const pcParallax = window.matchMedia('(pointer: fine)').matches;

  const loop = () => {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;

    if (!textDone && time >= T.textAt) { textDone = true; revealText(); }
    if (!ctaDone && time >= T.ctaAt) { ctaDone = true; revealCta(); }

    if (!reduceMotion && time >= T.idleAt) {
      // 아이들: 아주 느린 회전 + 숨쉬는 플로팅
      idleAngle += CONFIG.idle.rotateSpeed * dt;
      floatClock += dt;
      const fy = Math.sin((floatClock / CONFIG.idle.floatPeriod) * Math.PI * 2) * CONFIG.idle.floatAmp;
      model.position.y = fy;
      if (spinGroup.children[1]) spinGroup.children[1].position.y = -fy; // 반사는 바닥 기준 반대로
    }
    if (pcParallax && !reduceMotion) {
      // 마우스 패럴랙스 틸트 (lerp)
      tilt.x += (mouse.y * deg(CONFIG.idle.parallaxDeg) - tilt.x) * CONFIG.idle.parallaxLerp;
      tilt.y += (mouse.x * deg(CONFIG.idle.parallaxDeg) - tilt.y) * CONFIG.idle.parallaxLerp;
      tiltGroup.rotation.set(tilt.x, tilt.y, 0);
    }
    renderFrame();
  };
  const start = () => {
    if (running || reduceMotion || capture) return;
    running = true; clock.start(); clock.getDelta(); loop();
  };
  const stop = () => {
    if (!running) return;
    running = false; cancelAnimationFrame(rafId); clock.stop();
  };
  const sync = () => (inView && !document.hidden ? start() : stop());

  new ResizeObserver(resize).observe(stage);
  resize();

  if (pcParallax) {
    document.getElementById('hero')?.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      mouse.x = clamp01((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = clamp01((e.clientY - r.top) / r.height) * 2 - 1;
    });
  }

  /* ---------- 시작: 포스터 → 캔버스 크로스페이드 ---------- */
  introStarted = true;
  clearTimeout(textTimer);
  if (reduceMotion) { revealText(); revealCta(); }
  renderFrame();
  requestAnimationFrame(() => stage.classList.add('is-live'));

  new IntersectionObserver((es) => { inView = es[0].isIntersecting; sync(); }, { threshold: 0.01 }).observe(stage);
  document.addEventListener('visibilitychange', sync);
  sync();

  /* ---------- 포스터 제작용 캡처 훅 (?hero-capture) ---------- */
  if (capture) {
    window.__heroCapture = (w, h) => {
      time = 999; renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix(); finalDistance = fitDistance(camera.aspect);
      renderFrame();
      return renderer.domElement.toDataURL('image/png');
    };
  }

  /* ---------- 정리 (메모리 누수 방지) ---------- */
  window.addEventListener('pagehide', () => {
    stop();
    mat.dispose(); reflMat?.dispose(); shadowMat.dispose(); shadowTex.dispose();
    shadow.geometry.dispose(); envTex.dispose();
    renderer.dispose();
  }, { once: true });
}
