/* ==========================================================================
   seat3d-v2.js — #seat3dCard 3D 뷰어 (360° 회전 + 등받이 6단계 + 부품 분리)
   히어로와 같은 seat.glb(공용 로더)를 사용합니다. Tripo 모델은 단일 메시라서,
   로드 후 삼각형 높이로 시트 / 베이스 / 서포트 레그를 나눕니다.
   ========================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadSeat, findMesh } from './seat-model.js';

/* --------------------------------------------------------------------------
   CONFIG — 분할 높이(모델 원본 단위: 높이 1.0), 동작 수치
   -------------------------------------------------------------------------- */
const CONFIG = {
  scale: 8,              // 화면 단위로 확대 (모델 높이 1.0 → 8)
  split: {
    leg: 0.242,          // 이 높이 아래 삼각형 = 서포트 레그 (0.242부터 베이스 바닥이 시작)
    base: 0.31,          // 이 높이 아래 삼각형 = 회전 베이스 (앞쪽 돌출부 윗면이 0.31에서 끝남, 그 위는 시트)
    pivotBand: 0.025,    // 회전축 계산용: base 바로 위 이 두께 띠(시트 바닥 원형 테두리)의 외곽 중심
  },
  reclineStepDeg: 2.6,   // 단계당 각도 (설명용 임의값, 공식 수치 아님)
  autoRotateDegPerSec: 28,
  explode: { seatLift: 0.3, legDrop: 0, legForward: 0.2, sink: 0.12 },
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const BG = 0x121110;

/* ---------- 공통 장면 구성 ---------- */
function makeRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 2));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}
function makeScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xf2ece3, 0x1a1816, 0.35));
  const key = new THREE.DirectionalLight(0xfff6ea, 2.2);
  key.position.set(8, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc2a574, 1.3);
  rim.position.set(-10, 6, -8);
  scene.add(rim);
  return scene;
}
// 차량 시트 윤곽 (반투명 가이드)
function vehicleSeat(cushionTop) {
  const car = new THREE.Group();
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xf2ece3, transparent: true, opacity: 0.035, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xf2ece3, transparent: true, opacity: 0.16 });
  const add = (geo, x, y, z, rx = 0) => {
    const g = new THREE.Mesh(geo, ghostMat);
    g.position.set(x, y, z); g.rotation.x = rx;
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat));
    car.add(g);
  };
  add(new RoundedBoxGeometry(8, 1.9, 6.4, 3, 0.5), 0, cushionTop - 0.95, -1.0);
  add(new RoundedBoxGeometry(8, 7, 1.6, 3, 0.5), 0, cushionTop + 3.4, -5.0, -0.2);
  return car;
}
function shadowFloor() {
  const f = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.ShadowMaterial({ opacity: 0.45 }));
  f.rotation.x = -Math.PI / 2; f.receiveShadow = true;
  return f;
}

/* --------------------------------------------------------------------------
   단일 메시 → 시트 / 베이스 / 레그 분할
   속성 버퍼는 공유하고 인덱스만 새로 만듭니다 (추가 메모리 최소).
   -------------------------------------------------------------------------- */
function splitSeat(src) {
  src.updateWorldMatrix(true, false);
  const geo = src.geometry;
  const pos = geo.attributes.position;
  const index = geo.index ? geo.index.array : Uint32Array.from({ length: pos.count }, (_, i) => i);
  const v = new THREE.Vector3();
  const wy = new Float32Array(pos.count), wx = new Float32Array(pos.count), wz = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(src.matrixWorld);
    wx[i] = v.x; wy[i] = v.y; wz[i] = v.z;
  }
  const parts = { leg: [], base: [], seat: [] };
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const cy = (wy[a] + wy[b] + wy[c]) / 3;
    const key = cy < CONFIG.split.leg ? 'leg' : cy < CONFIG.split.base ? 'base' : 'seat';
    parts[key].push(a, b, c);
  }
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const make = (arr) => {
    const g = new THREE.BufferGeometry();
    for (const name in geo.attributes) g.setAttribute(name, geo.attributes[name]);
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(arr), 1));
    g.boundingSphere = geo.boundingSphere.clone();
    const m = new THREE.Mesh(g, src.material);
    m.applyMatrix4(src.matrixWorld);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  // 회전축: 시트 바닥 원형 테두리 띠의 외곽(최소~최대) 중심 (x, z)
  //   평균값을 쓰면 정점이 몰린 앞쪽 쿠션 때문에 축이 앞으로 쏠려 회전 시 흔들립니다.
  // 등받이 경첩: 시트 아래쪽(0.1 두께)에서 가장 뒤쪽
  const B = CONFIG.split.base;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, zMin = Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (wy[i] >= B && wy[i] < B + CONFIG.split.pivotBand) {
      x0 = Math.min(x0, wx[i]); x1 = Math.max(x1, wx[i]); z0 = Math.min(z0, wz[i]); z1 = Math.max(z1, wz[i]);
    }
    if (wy[i] >= B && wy[i] < B + 0.1) zMin = Math.min(zMin, wz[i]);
  }
  const ok = Number.isFinite(x0);
  const swivelPivot = new THREE.Vector3(ok ? (x0 + x1) / 2 : 0, B, ok ? (z0 + z1) / 2 : 0);
  const reclinePivot = new THREE.Vector3(swivelPivot.x, B, Number.isFinite(zMin) ? zMin : -0.2);

  return { leg: make(parts.leg), base: make(parts.base), seat: make(parts.seat), swivelPivot, reclinePivot };
}

/* --------------------------------------------------------------------------
   뷰어
   -------------------------------------------------------------------------- */
async function initViewer() {
  const card = document.getElementById('seat3dCard');
  const stage = document.getElementById('seat3dStage');
  if (!card || !stage) return;
  const $ = (sel) => card.querySelector(sel);

  const renderer = makeRenderer();
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.prepend(renderer.domElement);
  const scene = makeScene(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false; // 페이지 스크롤은 페이지가 갖도록
  controls.maxPolarAngle = Math.PI * 0.53;

  /* 모델 (히어로와 같은 파일, 이미 받았다면 같은 Promise 재사용) */
  const gltf = await loadSeat();
  const parts = splitSeat(findMesh(gltf.scene));

  // 계층: product(확대) → base / leg (고정), lift(분리 시 위로) → swivel(세로축) → recline(경첩) → seat
  const product = new THREE.Group();
  product.scale.setScalar(CONFIG.scale);
  scene.add(product);
  const baseGroup = new THREE.Group(); baseGroup.add(parts.base); product.add(baseGroup);
  const legGroup = new THREE.Group(); legGroup.add(parts.leg); product.add(legGroup);
  const liftGroup = new THREE.Group(); product.add(liftGroup); // 회전하지 않음 → 시트 라벨 기준
  const swivelGroup = new THREE.Group();
  swivelGroup.position.copy(parts.swivelPivot);
  liftGroup.add(swivelGroup);
  const reclineGroup = new THREE.Group();
  reclineGroup.position.copy(parts.reclinePivot).sub(parts.swivelPivot);
  swivelGroup.add(reclineGroup);
  const seatHolder = new THREE.Group();
  seatHolder.position.copy(parts.reclinePivot).multiplyScalar(-1);
  seatHolder.add(parts.seat);
  reclineGroup.add(seatHolder);

  const car = vehicleSeat(CONFIG.split.leg * CONFIG.scale);
  scene.add(car);
  const floor = shadowFloor();
  scene.add(floor);

  /* 상태 */
  const state = { swivel: 0, swivelT: 0, recline: 0, reclineT: 0, explode: 0, explodeT: 0, auto: false };
  const norm = (a) => ((a % 360) + 360) % 360;
  const toward = (dest) => { let d = dest - norm(state.swivelT); if (d > 180) d -= 360; if (d < -180) d += 360; state.swivelT += d; if (reduceMotion) state.swivel = state.swivelT; };

  /* UI */
  const swivelInput = $('#s3dSwivel'), swivelOut = $('#s3dSwivelOut'), reclineOut = $('#s3dReclineOut'), autoBox = $('#s3dAuto');
  const press = (wrap, btn) => wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  const stopAuto = () => { state.auto = false; autoBox.checked = false; };
  swivelInput.addEventListener('input', () => { stopAuto(); toward(+swivelInput.value); });
  $('#s3dSwivelBtns').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; stopAuto(); toward(+b.dataset.angle); });
  autoBox.addEventListener('change', () => { state.auto = autoBox.checked; });
  const setRecline = (step) => {
    press($('#s3dReclineBtns'), $(`#s3dReclineBtns button[data-step="${step}"]`));
    state.reclineT = (step - 1) * CONFIG.reclineStepDeg;
    reclineOut.textContent = step + '단계';
    if (reduceMotion) state.recline = state.reclineT;
  };
  $('#s3dReclineBtns').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setRecline(+b.dataset.step); });
  $('#s3dViewBtns').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    press($('#s3dViewBtns'), b);
    state.explodeT = b.dataset.view === 'exploded' ? 1 : 0;
    if (reduceMotion) state.explode = state.explodeT;
  });
  $('#s3dCar').addEventListener('change', (e) => { car.visible = e.target.checked; });
  document.querySelectorAll('.seat3d-jump').forEach((a) => a.addEventListener('click', () => {
    if (a.dataset.recline) setRecline(+a.dataset.recline);
  }));

  /* 부품 분리 라벨 (모델 원본 단위 기준 위치, 각 부품과 함께 움직이는 그룹에 붙임) */
  const labels = [
    { el: $('[data-label="seat"]'), obj: liftGroup, local: new THREE.Vector3(0.33, 0.5, 0) },
    { el: $('[data-label="base"]'), obj: baseGroup, local: new THREE.Vector3(0.24, 0.27, 0.05) },
    { el: $('[data-label="leg"]'), obj: legGroup, local: new THREE.Vector3(0.06, 0.1, 0.33) },
  ];
  const tmp = new THREE.Vector3();

  let W = 0, H = 0;
  const resize = () => {
    W = stage.clientWidth; H = stage.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H);
    const mob = W < 600;
    camera.aspect = W / H;
    // 분리 보기(시트 위로 + 전체 하강)까지 한 화면에 들어오는 거리
    // 모바일은 오른쪽 라벨이 잘리지 않도록 화면 기준 오른쪽으로 평행 이동(제품이 왼쪽으로 감)
    const px = mob ? 1.1 : 0, pz = mob ? -0.85 : 0;
    camera.position.set((mob ? 20 : 14.5) + px, mob ? 10.5 : 8, (mob ? 26 : 19) + pz);
    controls.target.set(px, 3.9, pz);
    controls.enableRotate = !mob; // 모바일은 버튼으로만 (페이지 스크롤 유지)
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  /* 화면에 보일 때만 렌더 */
  let visible = false;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { rootMargin: '100px' }).observe(stage);

  const clock = new THREE.Clock();
  const ease = (c, t, k, dt) => c + (t - c) * (1 - Math.exp(-k * dt));
  const E = CONFIG.explode;
  const tick = () => {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    if (state.auto) state.swivelT += CONFIG.autoRotateDegPerSec * dt;
    state.swivel = ease(state.swivel, state.swivelT, 5, dt);
    state.recline = ease(state.recline, state.reclineT, 6, dt);
    state.explode = ease(state.explode, state.explodeT, 4.5, dt);

    swivelGroup.rotation.y = THREE.MathUtils.degToRad(state.swivel);       // 세로축 회전만
    reclineGroup.rotation.x = -THREE.MathUtils.degToRad(state.recline);    // 뒤쪽 경첩 기준 눕힘
    const e = state.explode;
    liftGroup.position.y = e * E.seatLift;
    legGroup.position.set(0, -e * E.legDrop, e * E.legForward);
    const sink = -e * E.sink * CONFIG.scale;
    product.position.y = sink; car.position.y = sink; floor.position.y = sink;

    const a = Math.round(norm(state.swivel));
    swivelOut.textContent = a + '°';
    if (document.activeElement !== swivelInput) swivelInput.value = a % 360;
    $('#s3dSwivelBtns').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Math.round(norm(state.swivelT)) === +b.dataset.angle)));

    controls.update();
    renderer.render(scene, camera);

    labels.forEach(({ el, obj, local }) => {
      obj.localToWorld(tmp.copy(local)).project(camera);
      el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * W}px, ${(-tmp.y * 0.5 + 0.5) * H}px) translate(0, -50%)`;
      el.style.opacity = e > 0.6 ? String((e - 0.6) / 0.4) : '0';
    });
  };
  tick();

  window.addEventListener('pagehide', () => renderer.dispose(), { once: true });
}

initViewer().catch((err) => console.warn('[seat3d] viewer unavailable:', err?.message || err));
