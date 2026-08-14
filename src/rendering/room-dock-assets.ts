import * as THREE from 'three';

export type RoomDockAction = 'lobby' | 'rooms' | 'shop' | 'items' | 'profile';

const metal = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 });

export function createRoomDockAsset(action: RoomDockAction): THREE.Group {
  const group = new THREE.Group();
  group.name = `dock:${action}`;
  if (action === 'lobby') addLobby(group);
  else if (action === 'rooms') addRooms(group);
  else if (action === 'shop') addShop(group);
  else if (action === 'items') addItems(group);
  else addProfile(group);
  group.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = false; });
  return group;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(x, y, z);
  return result;
}

function box(size: [number, number, number], color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...size), metal(color), x, y, z);
}

function addLobby(group: THREE.Group): void {
  const stone = 0xc7a15b, dark = 0x724b2b, light = 0xf1d487;
  group.add(box([1.05, 0.17, 0.78], dark, 0, 0.08, 0));
  group.add(box([0.82, 0.72, 0.56], stone, 0, 0.51, 0));
  group.add(box([0.20, 0.44, 0.08], dark, 0, 0.39, 0.33));
  for (const x of [-0.25, 0.25]) for (const y of [0.46, 0.70]) group.add(box([0.13, 0.13, 0.06], light, x, y, 0.31));
  const roof = mesh(new THREE.ConeGeometry(0.68, 0.30, 4), metal(0xd68b37), 0, 1.01, 0);
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
}

function addRooms(group: THREE.Group): void {
  const slab = metal(0xd3dedb), edge = metal(0x58747a), wall = metal(0x8aa9ad);
  const floor = mesh(new THREE.BoxGeometry(1.12, 0.12, 0.86), slab, 0, 0.10, 0);
  group.add(floor);
  group.add(mesh(new THREE.BoxGeometry(0.12, 0.66, 0.86), wall, -0.50, 0.43, 0));
  group.add(mesh(new THREE.BoxGeometry(1.12, 0.66, 0.12), wall, 0, 0.43, -0.37));
  group.add(mesh(new THREE.BoxGeometry(0.44, 0.34, 0.08), edge, 0.20, 0.29, 0.10));
  group.add(mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), metal(0xf3c85a), 0.17, 0.57, 0.10));
}

function addShop(group: THREE.Group): void {
  const body = metal(0x5da6b6), trim = metal(0xf1c65e), dark = metal(0x36535a);
  group.add(mesh(new THREE.BoxGeometry(1.05, 0.66, 0.58), body, 0, 0.42, 0));
  group.add(mesh(new THREE.BoxGeometry(1.18, 0.14, 0.68), trim, 0, 0.82, 0));
  group.add(mesh(new THREE.BoxGeometry(0.36, 0.42, 0.08), dark, 0, 0.35, 0.33));
  for (const x of [-0.38, -0.13, 0.13, 0.38]) {
    const awning = mesh(new THREE.BoxGeometry(0.19, 0.17, 0.70), x % 0.26 === 0 ? body : trim, x, 0.93, 0);
    awning.rotation.z = -0.08;
    group.add(awning);
  }
}

function addItems(group: THREE.Group): void {
  const wood = metal(0x9a6738), trim = metal(0xe0b05d), latch = metal(0x485a59);
  group.add(mesh(new THREE.BoxGeometry(1.05, 0.56, 0.72), wood, 0, 0.35, 0));
  const lid = mesh(new THREE.BoxGeometry(1.10, 0.20, 0.76), trim, 0, 0.74, -0.04);
  lid.rotation.x = -0.18;
  group.add(lid);
  group.add(mesh(new THREE.BoxGeometry(0.20, 0.27, 0.08), latch, 0, 0.39, 0.40));
  group.add(mesh(new THREE.BoxGeometry(0.08, 0.54, 0.77), trim, -0.38, 0.37, 0));
  group.add(mesh(new THREE.BoxGeometry(0.08, 0.54, 0.77), trim, 0.38, 0.37, 0));
}

function addProfile(group: THREE.Group): void {
  const skin = metal(0xe4b48b), shirt = metal(0x467b8f), hair = metal(0x3b302d);
  group.add(mesh(new THREE.CylinderGeometry(0.43, 0.56, 0.54, 8), shirt, 0, 0.30, 0));
  const head = mesh(new THREE.BoxGeometry(0.58, 0.62, 0.50), skin, 0, 0.83, 0);
  group.add(head);
  const cap = mesh(new THREE.BoxGeometry(0.66, 0.20, 0.56), hair, 0, 1.15, -0.01);
  cap.rotation.z = -0.05;
  group.add(cap);
  group.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.04), metal(0x20353b), -0.15, 0.87, 0.27));
  group.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.04), metal(0x20353b), 0.15, 0.87, 0.27));
}

export function disposeRoomDockAsset(group: THREE.Group): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}
