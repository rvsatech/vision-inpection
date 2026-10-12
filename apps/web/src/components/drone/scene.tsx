'use client';

/**
 * Planta industrial procedural (sem arquivos 3D): tudo é feito de primitivas
 * com material Lambert sombreado "chapado" — leve para celular e com cara de
 * ilustração. Elementos repetidos usam InstancedMesh (1 draw call cada).
 */

import { useFrame, useThree } from '@react-three/fiber';
import { MutableRefObject, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export const PALETTE = {
  sky: '#c9d3d8',
  ground: '#aab4ba',
  lane: '#e8a317',
  laneWhite: '#eef1f2',
  steel: '#6c7a83',
  steelDark: '#46545c',
  petrol: '#0f4c5c',
  machine: '#2f6f7e',
  cardboard: '#b07a45',
  tank: '#dfe4e6',
  pipe: '#b8402f',
  navy: '#22305a',
  vestLime: '#c6f000',
  vestOrange: '#ff7a1a',
  helmetYellow: '#f2c200',
  helmetWhite: '#f4f4f4',
  screen: '#7fe3f0',
};

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5a3c28'];

// Materiais compartilhados por cor: menos objetos na GPU e nenhum material recriado a cada render.
const materials = new Map<string, THREE.MeshLambertMaterial>();
function mat(color: string, emissive?: string) {
  const key = `${color}|${emissive ?? ''}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...(emissive ? { emissive, emissiveIntensity: 0.6 } : {}) });
    materials.set(key, m);
  }
  return m;
}

// ── Piso, faixas e estrutura ────────────────────────────────
function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[160, 120]} />
        <meshLambertMaterial color={PALETTE.ground} />
      </mesh>
      {/* corredores de circulação (faixa amarela) */}
      {[
        [0, 2, 70, 0.35],
        [0, -14, 70, 0.35],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.02, z]}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color={PALETTE.lane} />
        </mesh>
      ))}
      {/* zona demarcada de paletes */}
      <mesh rotation-x={-Math.PI / 2} position={[-25, 0.02, 10]}>
        <ringGeometry args={[7.6, 8, 4, 1]} />
        <meshBasicMaterial color={PALETTE.laneWhite} />
      </mesh>
    </group>
  );
}

function Structure() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const positions = useMemo(() => {
    const p: [number, number, number, number, number, number][] = [];
    // Galpão aberto: só os pilares e a viga do fundo, para o drone ter visada livre.
    for (let x = -36; x <= 36; x += 12) p.push([x, 6, -20, 0.6, 12, 0.6]);
    p.push([0, 12, -20, 72, 0.6, 0.6]);
    return p;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    positions.forEach(([x, y, z, sx, sy, sz], i) => {
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [positions]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, positions.length]} material={mat(PALETTE.steel)}>
      <boxGeometry />
    </instancedMesh>
  );
}

// ── Esteira com caixas em movimento ─────────────────────────
const BOXES = 9;
function Conveyor({ lite }: { lite: boolean }) {
  const boxes = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < BOXES; i++) {
      const x = -22 + (((t * 2.2 + i * 3.2) % 28.8) + 28.8) % 28.8;
      tmp.position.set(x, 1.55, -6);
      tmp.updateMatrix();
      boxes.current!.setMatrixAt(i, tmp.matrix);
    }
    boxes.current!.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh position={[-8, 0.5, -6]} material={mat(PALETTE.steelDark)}>
        <boxGeometry args={[30, 1, 2.6]} />
      </mesh>
      <mesh position={[-8, 1.05, -6]} material={mat('#2a3338')}>
        <boxGeometry args={[30, 0.1, 2.2]} />
      </mesh>
      <instancedMesh ref={boxes} args={[undefined, undefined, BOXES]} material={mat(PALETTE.cardboard)}>
        <boxGeometry args={[1.5, 1, 1.4]} />
      </instancedMesh>
      {!lite && (
        // pórtico com a câmera de inspeção fixa sobre a esteira
        <group position={[-8, 0, -6]}>
          <mesh position={[0, 2.5, -1.6]} material={mat(PALETTE.petrol)}>
            <boxGeometry args={[0.3, 5, 0.3]} />
          </mesh>
          <mesh position={[0, 4.9, 0]} material={mat(PALETTE.petrol)}>
            <boxGeometry args={[0.3, 0.3, 3.4]} />
          </mesh>
          <mesh position={[0, 4.5, 0]} material={mat('#11181c')}>
            <boxGeometry args={[0.7, 0.5, 0.7]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ── Prensa hidráulica ───────────────────────────────────────
function Press() {
  const ram = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const s = Math.sin(clock.getElapsedTime() * 2.4);
    ram.current!.position.y = 4.2 + Math.max(0, s) * 1.2;
  });
  return (
    <group position={[10, 0, -6]}>
      <mesh position={[0, 0.8, 0]} material={mat(PALETTE.machine)}>
        <boxGeometry args={[5, 1.6, 4]} />
      </mesh>
      {[-1.9, 1.9].map((x) => (
        <mesh key={x} position={[x, 3.5, 0]} material={mat(PALETTE.machine)}>
          <boxGeometry args={[0.8, 5.5, 3]} />
        </mesh>
      ))}
      <mesh position={[0, 6.6, 0]} material={mat(PALETTE.machine)}>
        <boxGeometry args={[5, 1.2, 3.4]} />
      </mesh>
      <mesh ref={ram} position={[0, 4.2, 0]} material={mat('#c5ccd0')}>
        <boxGeometry args={[2.6, 1, 2.4]} />
      </mesh>
    </group>
  );
}

// ── Braço robótico ──────────────────────────────────────────
function RobotArm() {
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    shoulder.current!.rotation.y = Math.sin(t * 0.8) * 1.1;
    elbow.current!.rotation.z = -0.9 + Math.sin(t * 1.6) * 0.35;
  });
  return (
    <group position={[-4, 0, -10.5]}>
      <mesh position={[0, 0.5, 0]} material={mat(PALETTE.steelDark)}>
        <cylinderGeometry args={[1.1, 1.3, 1, 10]} />
      </mesh>
      <group ref={shoulder} position={[0, 1, 0]}>
        <mesh position={[0, 1.6, 0]} material={mat(PALETTE.helmetYellow)}>
          <boxGeometry args={[0.7, 3.2, 0.7]} />
        </mesh>
        <group ref={elbow} position={[0, 3.2, 0]}>
          <mesh position={[1.4, 0, 0]} material={mat(PALETTE.helmetYellow)}>
            <boxGeometry args={[2.8, 0.55, 0.55]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ── Tanques e tubulação ─────────────────────────────────────
function Tanks() {
  const tanks: [number, number][] = [
    [22, 10],
    [28, 10],
    [25, 16],
  ];
  return (
    <group>
      {tanks.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 3.5, 0]} material={mat(PALETTE.tank)}>
            <cylinderGeometry args={[2.4, 2.4, 7, 14]} />
          </mesh>
          <mesh position={[0, 7, 0]} material={mat(PALETTE.tank)}>
            <sphereGeometry args={[2.4, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          {i === 1 && (
            // ponto de corrosão no costado do T-2 (o achado sinalizado no HUD)
            <mesh position={[1.72, 4.4, -1.72]} rotation-y={-Math.PI / 4} material={mat('#8a4b1f')}>
              <boxGeometry args={[1.3, 1.6, 0.12]} />
            </mesh>
          )}
          {/* faixa de identificação */}
          <mesh position={[0, 5.2, 0]} material={mat(PALETTE.petrol)}>
            <cylinderGeometry args={[2.43, 2.43, 0.5, 14]} />
          </mesh>
        </group>
      ))}
      {/* rack de tubulação até a prensa */}
      {[5.2, 5.9].map((y) => (
        <mesh key={y} position={[18.5, y, -3]} rotation-z={Math.PI / 2} material={mat(PALETTE.pipe)}>
          <cylinderGeometry args={[0.22, 0.22, 17, 8]} />
        </mesh>
      ))}
      {[12, 18, 24].map((x) => (
        <mesh key={x} position={[x, 3, -3]} material={mat(PALETTE.steel)}>
          <boxGeometry args={[0.3, 6, 0.3]} />
        </mesh>
      ))}
      <mesh position={[22, 5.5, 3.5]} rotation-x={Math.PI / 2} material={mat(PALETTE.pipe)}>
        <cylinderGeometry args={[0.22, 0.22, 13, 8]} />
      </mesh>
    </group>
  );
}

// ── Paletes ─────────────────────────────────────────────────
function Pallets() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const stacks = useMemo(() => {
    const p: [number, number, number][] = [];
    for (let gx = 0; gx < 3; gx++)
      for (let gz = 0; gz < 2; gz++) {
        const levels = 1 + ((gx + gz * 2) % 3);
        for (let l = 0; l < levels; l++) p.push([-29 + gx * 4, 0.9 + l * 1.25, 7 + gz * 4.5]);
      }
    return p;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    stacks.forEach(([x, y, z], i) => {
      o.position.set(x, y, z);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [stacks]);
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, stacks.length]} material={mat(PALETTE.cardboard)}>
        <boxGeometry args={[3, 1.2, 3]} />
      </instancedMesh>
      {[0, 1, 2].flatMap((gx) =>
        [0, 1].map((gz) => (
          <mesh key={`${gx}-${gz}`} position={[-29 + gx * 4, 0.15, 7 + gz * 4.5]} material={mat('#8a6a43')}>
            <boxGeometry args={[3.2, 0.3, 3.2]} />
          </mesh>
        )),
      )}
    </group>
  );
}

// ── Painel de controle ──────────────────────────────────────
function ControlPanel() {
  return (
    <group position={[-15, 0, 5]} rotation-y={0.4}>
      <mesh position={[0, 1.4, 0]} material={mat(PALETTE.steelDark)}>
        <boxGeometry args={[3, 2.8, 1]} />
      </mesh>
      <mesh position={[0, 1.9, 0.51]} material={mat('#0c1418', PALETTE.screen)}>
        <boxGeometry args={[2.2, 1.1, 0.02]} />
      </mesh>
    </group>
  );
}

// ── Colaboradores com EPI ───────────────────────────────────
export interface WorkerSpec {
  id: string;
  position: [number, number, number];
  rotation?: number;
  helmet: string | null;
  vest: string | null;
  skin: number;
  walk?: { from: [number, number]; to: [number, number]; speed: number };
}

export const WORKERS: WorkerSpec[] = [
  { id: 'w1', position: [-11, 0, -3], rotation: Math.PI, helmet: PALETTE.helmetYellow, vest: PALETTE.vestLime, skin: 1 },
  { id: 'w2', position: [13, 0, -2], rotation: -2.6, helmet: PALETTE.helmetWhite, vest: PALETTE.vestOrange, skin: 3 },
  { id: 'w3', position: [-23.5, 0, 3.5], rotation: 0.6, helmet: null, vest: PALETTE.vestOrange, skin: 4 },
  { id: 'w4', position: [0, 0, 2], helmet: PALETTE.helmetYellow, vest: PALETTE.vestLime, skin: 0, walk: { from: [-12, 2], to: [16, 2], speed: 0.07 } },
  { id: 'w5', position: [21, 0, 4.5], rotation: 0.3, helmet: PALETTE.helmetWhite, vest: PALETTE.vestLime, skin: 2 },
];

function Worker({ spec }: { spec: WorkerSpec }) {
  const root = useRef<THREE.Group>(null);
  const legs = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (spec.walk) {
      const { from, to, speed } = spec.walk;
      const u = (Math.sin(t * speed * Math.PI) + 1) / 2;
      root.current!.position.set(from[0] + (to[0] - from[0]) * u, 0, from[1] + (to[1] - from[1]) * u);
      root.current!.rotation.y = Math.cos(t * speed * Math.PI) > 0 ? Math.PI / 2 : -Math.PI / 2;
      legs.current!.children.forEach((leg, i) => (leg.rotation.x = Math.sin(t * 6 + i * Math.PI) * 0.45));
    } else {
      root.current!.position.y = Math.sin(t * 1.5 + spec.position[0]) * 0.03;
    }
  });
  const skin = SKIN[spec.skin];
  return (
    <group ref={root} position={spec.position} rotation-y={spec.rotation ?? 0}>
      <group ref={legs}>
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 0.55, 0]} material={mat(PALETTE.navy)}>
            <boxGeometry args={[0.3, 1.1, 0.34]} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 1.6, 0]} material={mat(PALETTE.navy)}>
        <boxGeometry args={[0.9, 1.1, 0.5]} />
      </mesh>
      {spec.vest && (
        <mesh position={[0, 1.62, 0]} material={mat(spec.vest)}>
          <boxGeometry args={[0.96, 0.8, 0.56]} />
        </mesh>
      )}
      <mesh position={[0, 2.45, 0]} material={mat(skin)}>
        <sphereGeometry args={[0.32, 10, 8]} />
      </mesh>
      {spec.helmet ? (
        <mesh position={[0, 2.55, 0]} material={mat(spec.helmet)}>
          <sphereGeometry args={[0.38, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ) : (
        <mesh position={[0, 2.6, -0.02]} material={mat('#1d1d22')}>
          <sphereGeometry args={[0.33, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
        </mesh>
      )}
    </group>
  );
}

// ── Câmera do drone ─────────────────────────────────────────
/** Trajeto: chegada → paletes → esteira → prensa → tanques → subida final. */
const CAMERA_PATH = new THREE.CatmullRomCurve3(
  [
    [-48, 32, 42],
    [-40, 15, 24],
    [-19, 10, 10],
    [3, 11, 10],
    [38, 14, 0],
    [12, 44, 46],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false,
  'centripetal',
);
const LOOK_PATH = new THREE.CatmullRomCurve3(
  [
    [-6, 0, 0],
    [-24, 1.5, 6],
    [-9, 1.2, -5],
    [11, 2.5, -4],
    [25, 4, 11],
    [0, 0, 0],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false,
  'centripetal',
);

export interface Anchor {
  id: string;
  position: [number, number, number];
}

export function DroneRig({
  progress,
  anchors,
  onProject,
}: {
  progress: MutableRefObject<number>;
  anchors: Anchor[];
  onProject: (screen: Record<string, { x: number; y: number; visible: boolean }>, p: number, altitude: number) => void;
}) {
  const { camera, size } = useThree();
  const smoothed = useRef(0);
  const look = useMemo(() => new THREE.Vector3(), []);
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    // amortece o scroll para o voo não "tremer"
    smoothed.current = THREE.MathUtils.damp(smoothed.current, progress.current, 4, dt);
    const p = THREE.MathUtils.clamp(smoothed.current, 0, 1);
    CAMERA_PATH.getPointAt(p, camera.position);
    LOOK_PATH.getPointAt(p, look);
    // pequena oscilação de pairar
    camera.position.y += Math.sin(performance.now() / 700) * 0.06;
    camera.lookAt(look);

    const out: Record<string, { x: number; y: number; visible: boolean }> = {};
    for (const a of anchors) {
      v.set(...a.position).project(camera);
      out[a.id] = { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, visible: v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.92 };
    }
    onProject(out, p, camera.position.y);
  });
  return null;
}

export function IndustrialScene({ lite }: { lite: boolean }) {
  return (
    <>
      <color attach="background" args={[PALETTE.sky]} />
      <fog attach="fog" args={[PALETTE.sky, 45, 130]} />
      <hemisphereLight args={['#ffffff', '#7d8a90', 1.6]} />
      <directionalLight position={[30, 50, 20]} intensity={1.4} />
      <Ground />
      <Structure />
      <Conveyor lite={lite} />
      <Press />
      <RobotArm />
      <Tanks />
      <Pallets />
      <ControlPanel />
      {WORKERS.map((w) => (
        <Worker key={w.id} spec={w} />
      ))}
    </>
  );
}
