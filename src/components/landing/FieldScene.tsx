"use client";

import { useEffect, useMemo, useRef } from "react";
import { Component, Suspense, type ReactNode } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import type { Shape } from "@/lib/fields";

const YELLOW = "#f9b407";
const MUTED = "#5663a3";
/** Half the object height, so each one rests on the floor. */
const REST: Record<Shape, number> = { cube: 0.4, sphere: 0.5, cylinder: 0.45, dodeca: 0.55, phone: 0.475, bars: 0.5 };

function geometryFor(shape: Shape) {
  switch (shape) {
    case "sphere": return <sphereGeometry args={[0.5, 40, 40]} />;
    case "cylinder": return <cylinderGeometry args={[0.42, 0.42, 0.9, 40]} />;
    case "dodeca": return <dodecahedronGeometry args={[0.55]} />;
    case "phone": return <boxGeometry args={[0.5, 0.95, 0.09]} />;
    case "bars": return <boxGeometry args={[0.6, 1, 0.6]} />;
    default: return <boxGeometry args={[0.8, 0.8, 0.8]} />;
  }
}

/** A 3x3 pool of identical objects. One is yellow, lifted forward, and leaves the card. */
function Pool({ shape, still }: { shape: Shape; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  const hero = useRef<THREE.Mesh>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const items = useMemo(() => {
    const out: { key: string; x: number; z: number; sy: number; ry: number; hero: boolean }[] = [];
    let n = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      n++;
      const isHero = i === 1 && j === 1;
      out.push({ key: `${i}${j}`, x: i * 1.25, z: j * 1.25, sy: shape === "bars" ? 0.5 + ((n * 37) % 10) / 9 : 1, ry: (n % 3) * 0.2, hero: isHero });
    }
    return out;
  }, [shape]);

  useEffect(() => {
    const on = (e: PointerEvent) => { pointer.current.x = (e.clientX / innerWidth) * 2 - 1; pointer.current.y = (e.clientY / innerHeight) * 2 - 1; };
    window.addEventListener("pointermove", on);
    return () => window.removeEventListener("pointermove", on);
  }, []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const k = 1 - Math.exp(-dt * 3);
    g.rotation.y += (-0.55 + pointer.current.x * 0.22 + window.scrollY * 0.0012 - g.rotation.y) * k;
    g.rotation.x += (0.12 + pointer.current.y * 0.06 - g.rotation.x) * k;
    if (hero.current) {
      hero.current.position.y = REST[shape] * 1.55 + 0.35 + (still ? 0 : Math.sin(state.clock.elapsedTime * 1.3) * 0.09);
      if (!still) hero.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <group ref={group} position={[0.1, -0.5, 0]} scale={0.8}>
      {items.map((it) => {
        const h = it.sy;
        return (
          <mesh
            key={it.key} ref={it.hero ? hero : undefined}
            position={[it.hero ? it.x + 0.55 : it.x, it.hero ? REST[shape] * 1.55 + 0.35 : REST[shape] * h, it.hero ? it.z + 0.7 : it.z]}
            scale={it.hero ? 1.55 : [1, h, 1]} rotation={[0, it.ry, 0]}
          >
            {geometryFor(shape)}
            <meshStandardMaterial color={it.hero ? YELLOW : MUTED} roughness={it.hero ? 0.42 : 0.6} metalness={0.05} emissive={it.hero ? YELLOW : "#000"} emissiveIntensity={it.hero ? 0.1 : 0} />
          </mesh>
        );
      })}
    </group>
  );
}

/** A real model, scaled to a common height and stood on the floor. It is the one object that leaves the card. */
function Model({ url, rotate, still }: { url: string; rotate?: [number, number, number]; still: boolean }) {
  const gltf = useLoader(GLTFLoader, url);
  const spin = useRef<THREE.Group>(null);
  const float = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const { object, scale, offset } = useMemo(() => {
    const object = gltf.scene.clone(true);
    if (rotate) object.rotation.set(...rotate);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object, true);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    // Fit by height and by footprint, so wide models (containers) still clear the card edge while spinning.
    const scale = Math.min(3.7 / size.y, 1.75 / (Math.hypot(size.x, size.z) / 2));
    return { object, scale, offset: new THREE.Vector3(-center.x, -box.min.y, -center.z) };
  }, [gltf, rotate]);

  useEffect(() => {
    const on = (e: PointerEvent) => { pointer.current.x = (e.clientX / innerWidth) * 2 - 1; pointer.current.y = (e.clientY / innerHeight) * 2 - 1; };
    window.addEventListener("pointermove", on);
    return () => window.removeEventListener("pointermove", on);
  }, []);

  useFrame((state, dt) => {
    const k = 1 - Math.exp(-dt * 3);
    if (spin.current) {
      const idle = still ? 0 : state.clock.elapsedTime * 0.35;
      spin.current.rotation.y += (-0.5 + idle + pointer.current.x * 0.35 + window.scrollY * 0.0015 - spin.current.rotation.y) * k;
      spin.current.rotation.x += (pointer.current.y * 0.08 - spin.current.rotation.x) * k;
    }
    if (float.current) float.current.position.y = -1.45 + (still ? 0 : Math.sin(state.clock.elapsedTime * 1.3) * 0.07);
  });

  return (
    <group ref={float} position={[0.2, -1.45, 0]}>
      <group ref={spin}>
        <group scale={scale}><group position={offset}><primitive object={object} /></group></group>
      </group>
    </group>
  );
}

/** Soft studio reflections so metal and plastic read properly. */
function Studio() {
  const gl = useThree((state) => state.gl);
  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return texture;
  }, [gl]);
  return <primitive object={env} attach="environment" />;
}

/** If a model file is missing or fails to parse, show the procedural pool instead of an empty card. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function FieldScene({ shape, still, model, rotate }: { shape: Shape; still: boolean; model?: string; rotate?: [number, number, number] }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 34, position: [0, 3.2, 9] }} gl={{ alpha: true }} scene={{ environmentIntensity: 0.75 }} aria-hidden>
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 7, 5]} intensity={2.1} />
      <pointLight position={[1, 5, 1]} intensity={40} color="#ffd35c" />
      <Studio />
      {model ? (
        <ModelBoundary fallback={<Pool shape={shape} still={still} />}>
          <Suspense fallback={<Pool shape={shape} still={still} />}><Model url={model} rotate={rotate} still={still} /></Suspense>
        </ModelBoundary>
      ) : <Pool shape={shape} still={still} />}
    </Canvas>
  );
}
