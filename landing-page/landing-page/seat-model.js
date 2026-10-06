/* ==========================================================================
   seat-model.js — 공용 GLB 로더
   히어로(hero-3d.js)와 3D 뷰어(seat3d-v2.js)가 같은 seat.glb를 한 번만 받도록
   로더 인스턴스와 로드 Promise를 모듈 단위로 공유합니다.
   ========================================================================== */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const SEAT_URL = 'assets/models/seat.glb';

let loader = null;
let promise = null;

/** seat.glb를 로드합니다. 여러 번 호출해도 네트워크 요청은 한 번뿐입니다. */
export function loadSeat() {
  if (!promise) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    promise = loader.loadAsync(SEAT_URL);
    promise.catch(() => { promise = null; }); // 실패 시 다음 호출에서 재시도 가능
  }
  return promise;
}

/** 로드된 glTF 씬에서 첫 번째 메시를 찾습니다 (Tripo 모델은 단일 메시). */
export function findMesh(root) {
  let mesh = null;
  root.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
  return mesh;
}
