import { useEffect, useRef } from "react";
import {
  buildFloorPlanRenderPackage,
  type FloorPlanAnalysis,
  type FloorPlanCommercialRenderStyle,
  type FloorPlanFurniture,
  type FloorPlanRenderCameraPresetId,
  type FloorPlanRenderMaterial,
  type FloorPlanRoom,
} from "@/lib/render/floorPlanAi";

type ThreeModule = typeof import("three");

interface FloorPlanDollhouse3DProps {
  plan: FloorPlanAnalysis;
  renderStyle?: FloorPlanCommercialRenderStyle;
  selectedRoomId?: string;
  cameraPreset?: FloorPlanRenderCameraPresetId;
  className?: string;
}

const roomColors: Record<string, number> = {
  living: 0xf4b860,
  hall: 0xd7e6f5,
  "bedroom-main": 0xa7c7e7,
  "bedroom-kids": 0xb8e1c5,
  bath: 0x9dd9d2,
  utility: 0xd9d2c3,
};

export function FloorPlanDollhouse3D({ plan, renderStyle = "warm_modern", selectedRoomId, cameraPreset = "dollhouse", className }: FloorPlanDollhouse3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let cleanupScene: (() => void) | undefined;

    void import("three").then((THREE) => {
      if (disposed || !hostRef.current) return;
      cleanupScene = mountDollhouseScene(THREE, hostRef.current, plan, {
        renderStyle,
        selectedRoomId,
        cameraPreset,
      });
    });

    return () => {
      disposed = true;
      cleanupScene?.();
    };
  }, [cameraPreset, plan, renderStyle, selectedRoomId]);

  return <div ref={hostRef} className={className} aria-label="Anteprima 3D planimetria navigabile" />;
}

function mountDollhouseScene(
  THREE: ThreeModule,
  host: HTMLDivElement,
  plan: FloorPlanAnalysis,
  options: {
    renderStyle: FloorPlanCommercialRenderStyle;
    selectedRoomId?: string;
    cameraPreset: FloorPlanRenderCameraPresetId;
  },
) {
    const renderPackage = buildFloorPlanRenderPackage(plan, {
      style: options.renderStyle,
      selectedRoomId: options.selectedRoomId,
    });
    const materialByRoom = new Map(renderPackage.materials.map((material) => [material.roomId, material]));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    applyCameraPreset(camera, options.cameraPreset);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.dataset.floorPlan3d = "true";
    renderer.domElement.className = "h-full w-full cursor-grab rounded-xl";
    host.appendChild(renderer.domElement);

    const root = new THREE.Group();
    root.rotation.x = options.cameraPreset === "top_3d" ? 0 : -0.12;
    root.rotation.y = options.cameraPreset === "client_before_after" ? -0.32 : 0;
    scene.add(root);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb5a99a, 1.35));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(5, 11, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0xfff0d0, 1.2, 18);
    fillLight.position.set(-5, 4, -6);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(15, 30, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = -0.03;
    root.add(grid);

    const scale = 0.14;
    const centerX = 50;
    const centerY = 38;

    for (const room of plan.rooms) {
      const renderMaterial = materialByRoom.get(room.id);
      const material = new THREE.MeshStandardMaterial({
        color: renderMaterial?.floorColor ?? roomColors[room.id] ?? 0xcbd5e1,
        roughness: 0.58,
        metalness: 0.02,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(room.width * scale, 0.08, room.height * scale), material);
      mesh.position.set(
        (room.x + room.width / 2 - centerX) * scale,
        0.02,
        (room.y + room.height / 2 - centerY) * scale,
      );
      mesh.receiveShadow = true;
      root.add(mesh);

      const rug = createRug(THREE, room, scale, centerX, centerY);
      if (rug) root.add(rug);
    }

    for (const wall of plan.walls) {
      const dx = wall.to.x - wall.from.x;
      const dy = wall.to.y - wall.from.y;
      const length = Math.sqrt(dx * dx + dy * dy) * scale;
      const thickness = wall.type === "external" ? 0.12 : 0.075;
      const height = wall.type === "external" ? 1.1 : 0.88;
      const material = new THREE.MeshStandardMaterial({
        color: wall.type === "external" ? 0xffffff : 0xe8edf2,
        roughness: 0.72,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), material);
      mesh.position.set(
        ((wall.from.x + wall.to.x) / 2 - centerX) * scale,
        height / 2,
        ((wall.from.y + wall.to.y) / 2 - centerY) * scale,
      );
      mesh.rotation.y = Math.atan2(dy, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.035, thickness + 0.035),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.62 }),
      );
      cap.position.copy(mesh.position);
      cap.position.y = height + 0.025;
      cap.rotation.copy(mesh.rotation);
      cap.castShadow = true;
      root.add(cap);
    }

    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.48 });
    const windowMaterial = new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0.05, transmission: 0.45, transparent: true, opacity: 0.68 });
    for (const opening of plan.openings) {
      const material = opening.type === "door" ? doorMaterial : windowMaterial;
      const marker = new THREE.Mesh(new THREE.BoxGeometry(opening.width * scale, 0.1, 0.08), material);
      marker.position.set((opening.x - centerX) * scale, opening.type === "door" ? 0.12 : 0.5, (opening.y - centerY) * scale);
      marker.castShadow = true;
      root.add(marker);
    }

    for (const item of plan.furniture) {
      root.add(createFurnitureGroup(THREE, item, scale, centerX, centerY));
    }

    for (const room of plan.rooms) {
      const hasFurniture = plan.furniture.some((item) => item.roomId === room.id);
      if (!hasFurniture) root.add(createRoomStagingGroup(THREE, room, scale, centerX, centerY, materialByRoom.get(room.id)));
    }

    let width = 0;
    let height = 0;
    const resize = () => {
      width = Math.max(host.clientWidth, 1);
      height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let animationId = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const render = () => {
      animationId = window.requestAnimationFrame(render);
      renderer.render(scene, camera);
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.classList.add("cursor-grabbing");
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      root.rotation.y += dx * 0.008;
      root.rotation.x = Math.max(-0.5, Math.min(0.45, root.rotation.x + dy * 0.004));
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.classList.remove("cursor-grabbing");
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.position.multiplyScalar(event.deltaY > 0 ? 1.06 : 0.94);
      camera.position.clampLength(5, 16);
      camera.lookAt(0, 0, 0);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    render();

    return () => {
      window.cancelAnimationFrame(animationId);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      renderer.domElement.remove();
    };
}

function applyCameraPreset(camera: import("three").PerspectiveCamera, preset: FloorPlanRenderCameraPresetId) {
  if (preset === "top_3d") camera.position.set(0, 13, 0.2);
  else if (preset === "room_focus") camera.position.set(4.8, 3.8, 5.2);
  else if (preset === "client_before_after") camera.position.set(8.5, 6.2, 8.5);
  else camera.position.set(7, 6.5, 9);
  camera.lookAt(0, 0, 0);
}

function createRug(THREE: ThreeModule, room: FloorPlanRoom, scale: number, centerX: number, centerY: number) {
  const roomText = `${room.name} ${room.usage}`.toLowerCase();
  if (!roomText.includes("soggiorno") && !roomText.includes("camera")) return null;
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(room.width * 0.38, 1.5), 0.025, Math.min(room.height * 0.22, 0.95)),
    new THREE.MeshStandardMaterial({ color: roomText.includes("camera") ? 0xf1e5d4 : 0xd6ccc2, roughness: 0.95 }),
  );
  rug.position.set((room.x + room.width * 0.58 - centerX) * scale, 0.095, (room.y + room.height * 0.58 - centerY) * scale);
  rug.receiveShadow = true;
  return rug;
}

function createFurnitureGroup(THREE: ThreeModule, item: FloorPlanFurniture, scale: number, centerX: number, centerY: number) {
  const group = new THREE.Group();
  group.position.set((item.x + item.width / 2 - centerX) * scale, 0.12, (item.y + item.height / 2 - centerY) * scale);
  group.rotation.y = (item.rotation * Math.PI) / 180;
  const w = item.width * scale;
  const d = item.height * scale;
  const category = item.category ?? "living";

  const baseColor = category === "bedroom" ? 0xe5e7eb : category === "kitchen" ? 0xf8fafc : category === "bathroom" ? 0xdbeafe : category === "storage" ? 0xd6b58a : 0x94a3b8;
  addBox(THREE, group, w, category === "storage" ? 0.55 : 0.18, d, 0, category === "storage" ? 0.27 : 0.09, 0, baseColor, 0.58);

  if (category === "living") {
    addBox(THREE, group, w, 0.2, d * 0.18, 0, 0.25, -d * 0.42, 0x475569, 0.7);
    addBox(THREE, group, w * 0.34, 0.11, d * 0.62, -w * 0.22, 0.25, 0.04, 0xf1f5f9, 0.8);
    addBox(THREE, group, w * 0.34, 0.11, d * 0.62, w * 0.22, 0.25, 0.04, 0xe2e8f0, 0.8);
  } else if (category === "bedroom") {
    addBox(THREE, group, w * 0.86, 0.11, d * 0.68, 0, 0.24, 0.06, 0xf8fafc, 0.82);
    addBox(THREE, group, w * 0.32, 0.07, d * 0.16, -w * 0.2, 0.32, -d * 0.28, 0xffffff, 0.74);
    addBox(THREE, group, w * 0.32, 0.07, d * 0.16, w * 0.2, 0.32, -d * 0.28, 0xffffff, 0.74);
  } else if (category === "kitchen") {
    addBox(THREE, group, w * 0.88, 0.045, d * 0.88, 0, 0.31, 0, 0xe2e8f0, 0.35);
    addBox(THREE, group, w * 0.18, 0.055, d * 0.18, -w * 0.22, 0.36, 0, 0x111827, 0.45);
  } else if (category === "bathroom") {
    addBox(THREE, group, w * 0.36, 0.055, d * 0.5, 0, 0.31, 0, 0xffffff, 0.35);
  }

  return group;
}

function createRoomStagingGroup(
  THREE: ThreeModule,
  room: FloorPlanRoom,
  scale: number,
  centerX: number,
  centerY: number,
  material?: FloorPlanRenderMaterial,
) {
  const group = new THREE.Group();
  const roomText = `${room.name} ${room.usage}`.toLowerCase();
  const x = (room.x + room.width / 2 - centerX) * scale;
  const z = (room.y + room.height / 2 - centerY) * scale;
  group.position.set(x, 0.12, z);

  if (roomText.includes("bagno")) {
    addBox(THREE, group, 0.55, 0.18, 0.26, -0.25, 0.12, -0.18, 0xf8fafc, 0.4);
    addBox(THREE, group, 0.42, 0.05, 0.42, 0.28, 0.08, 0.18, 0xdbeafe, 0.3);
    addBox(THREE, group, 0.12, 0.18, 0.12, 0.28, 0.19, 0.18, 0xffffff, 0.25);
  } else if (roomText.includes("camera")) {
    addBox(THREE, group, 0.95, 0.18, 0.78, 0, 0.12, 0, 0xe5e7eb, 0.6);
    addBox(THREE, group, 0.72, 0.08, 0.46, 0, 0.27, 0.08, 0xf8fafc, 0.85);
  } else if (roomText.includes("soggiorno")) {
    addBox(THREE, group, 1.2, 0.16, 0.42, -0.35, 0.12, -0.15, 0x64748b, 0.75);
    addBox(THREE, group, 0.52, 0.08, 0.52, 0.42, 0.1, 0.22, 0xc08457, 0.52);
  } else {
    addBox(THREE, group, 0.58, 0.12, 0.28, 0, 0.1, 0, material?.floorColor ? Number.parseInt(material.floorColor.replace("#", ""), 16) : 0xcbd5e1, 0.72);
  }

  return group;
}

function addBox(
  THREE: ThreeModule,
  group: import("three").Group,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  color: number,
  roughness: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(width, 0.04), Math.max(height, 0.035), Math.max(depth, 0.04)),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}
