import { world, system } from "@minecraft/server";
import {
  alive, blockAt, Bus, dist3, gameDayIndex, groundPos, isAir, isNight, isSolid,
  later, players, rememberHome, run, timeOfDay,
} from "./realtime_timeline.js";
import { playAt, playFor } from "./audio_director.js";
import { sayHot } from "./world_voice.js";

const hands = new Map();

function isBed(typeId) {
  if (!typeId) return false;
  return typeId === "minecraft:bed" || typeId.endsWith("_bed");
}

function findHands(dim, loc, radius) {
  try {
    return dim.getEntities({ type: "abyss:underbed_hand", location: loc, maxDistance: radius });
  } catch (e) { return []; }
}

function setVar(entity, index) {
  try { entity.triggerEvent(`abyss:var${index}`); } catch (e) {}
}

function dust(dim, loc) {
  try { dim.spawnParticle("minecraft:redstone_wire_dust_particle", loc); } catch (e) {
    try { dim.spawnParticle("minecraft:basic_smoke_particle", loc); } catch (e2) {}
  }
}

export function spawnHand(dim, bed, player) {
  const existing = findHands(dim, bed, 7);
  if (existing.length) return existing[0];
  const spot = groundPos(dim, bed.x + 0.8, bed.z + 0.4, bed.y);
  let entity;
  try { entity = dim.spawnEntity("abyss:underbed_hand", spot); }
  catch (e) {
    console.warn("[abyss hand] " + e);
    return undefined;
  }
  const state = {
    id: entity.id,
    bed: { x: bed.x, y: bed.y, z: bed.z },
    dim: dim.id,
    age: 0,
    mode: "crawl",
    feel: 0,
    lunged: false,
    home: { x: spot.x, y: spot.y, z: spot.z },
    wander: { x: spot.x + 2, y: spot.y, z: spot.z + 1 },
  };
  hands.set(entity.id, state);
  setVar(entity, 0);
  playAt(dim, spot, "abyss.hand_crawl", 0.8, 0.9);
  if (alive(player)) playFor(player, "abyss.whisper_1", 0.6, 0.8);
  return entity;
}

function punish(entity, player, state) {
  if (!state || state.lunged) return;
  state.lunged = true;
  state.mode = "lunge";
  setVar(entity, 2);
  const dim = entity.dimension;
  playAt(dim, entity.location, "abyss.hand_screech", 1, 1);
  if (alive(player)) {
    playFor(player, "abyss.hand_screech", 1, 1);
    try { player.applyDamage(8, { cause: "entityAttack" }); } catch (e) {
      try { player.applyDamage(8); } catch (e2) {}
    }
    try {
      player.addEffect("blindness", 100, { amplifier: 0, showParticles: true });
      player.addEffect("nausea", 160, { amplifier: 1, showParticles: true });
    } catch (e) {}
    try {
      player.onScreenDisplay.setTitle("§4ПОД КРОВАТЬЮ", { stayDuration: 12, fadeInDuration: 0, fadeOutDuration: 8 });
    } catch (e) {}
  }
  Bus.emit("hand_lunged", { name: alive(player) ? player.name : "" });
  later(12, () => {
    if (!alive(entity)) return;
    state.mode = "retreat";
    setVar(entity, 3);
  });
  later(50, () => {
    if (!alive(entity)) return;
    state.mode = "hide";
    setVar(entity, 4);
    const back = state.bed;
    try { entity.teleport({ x: back.x + 0.5, y: back.y, z: back.z + 0.5 }); } catch (e) {}
    later(16, () => {
      try { if (alive(entity)) entity.remove(); } catch (e) {}
      hands.delete(state.id);
    });
  });
}

function nearestPlayer(entity) {
  let best = null;
  let bestD = 1e9;
  for (const player of players()) {
    if (!alive(player) || player.dimension !== entity.dimension) continue;
    const d = dist3(entity.location, player.location);
    if (d < bestD) { bestD = d; best = player; }
  }
  return { player: best, d: bestD };
}

function wallNear(dim, loc) {
  const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]];
  for (const [x, z] of spots) {
    const block = blockAt(dim, loc.x + x, loc.y, loc.z + z);
    if (isSolid(block)) return block.location;
  }
  return null;
}

function moveToward(entity, target, step) {
  const loc = entity.location;
  const dx = target.x - loc.x;
  const dz = target.z - loc.z;
  const d = Math.hypot(dx, dz) || 1;
  if (d < 0.35) return d;
  const nx = loc.x + (dx / d) * step;
  const nz = loc.z + (dz / d) * step;
  const ground = groundPos(entity.dimension, nx, nz, loc.y);
  const yaw = (Math.atan2(-(dx), dz) * 180) / Math.PI;
  try { entity.teleport({ x: nx, y: ground.y, z: nz }, { rotation: { x: 0, y: yaw } }); } catch (e) {}
  return d;
}

function tickHand(entity, state) {
  if (!alive(entity)) { hands.delete(state.id); return; }
  state.age += 1;
  const dim = entity.dimension;
  const { player, d } = nearestPlayer(entity);
  dust(dim, { x: entity.location.x, y: entity.location.y + 0.2, z: entity.location.z });
  if (state.age % 30 === 0 && state.mode !== "lunge") playAt(dim, entity.location, "abyss.hand_crawl", 0.55, 0.85 + Math.random() * 0.2);
  if (state.mode === "lunge") {
    if (alive(player)) moveToward(entity, player.location, 0.55);
    return;
  }
  if (state.mode === "retreat" || state.mode === "hide") {
    moveToward(entity, state.bed, 0.28);
    return;
  }
  if (!state.lunged && state.age > 60 && alive(player) && d < 1.5) {
    punish(entity, player, state);
    return;
  }
  if (alive(player) && d > 7.5) {
    state.mode = "retreat";
    setVar(entity, 3);
    moveToward(entity, state.bed, 0.2);
    return;
  }
  const wall = wallNear(dim, entity.location);
  if (wall && state.feel <= 0 && state.mode === "crawl") {
    state.mode = "feel";
    state.feel = 50;
    setVar(entity, 1);
  }
  if (state.mode === "feel") {
    state.feel -= 1;
    if (wall) dust(dim, { x: wall.x + 0.5, y: wall.y + 0.4, z: wall.z + 0.5 });
    if (state.feel <= 0) {
      state.mode = "crawl";
      setVar(entity, 0);
      state.wander = {
        x: state.bed.x + (Math.random() * 6 - 3),
        y: state.bed.y,
        z: state.bed.z + (Math.random() * 6 - 3),
      };
    }
    return;
  }
  if (state.age % 40 === 0) {
    state.wander = {
      x: state.bed.x + (Math.random() * 7 - 3.5),
      y: state.bed.y,
      z: state.bed.z + (Math.random() * 7 - 3.5),
    };
  }
  moveToward(entity, state.wander, 0.08);
}

export function summonHandNear(player) {
  if (!alive(player)) return;
  const loc = player.location;
  spawnHand(player.dimension, loc, player);
}

function onBed(player, block) {
  const dim = block.dimension;
  const loc = { x: block.location.x, y: block.location.y, z: block.location.z };
  rememberHome(dim.id, loc.x, loc.y, loc.z);
  const near = findHands(dim, loc, 6);
  if (near.length) {
    const state = hands.get(near[0].id) || { id: near[0].id, bed: loc, age: 30, lunged: false, mode: "crawl" };
    hands.set(near[0].id, state);
    if (state.age > 10) punish(near[0], player, state);
    return;
  }
  sayHot("В эту ночь спать нельзя. Кто-то уже под твоей кроватью...");
  spawnHand(dim, loc, player);
  Bus.emit("bed_denied", { name: player.name });
}

try {
  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    try {
      if (event.isFirstEvent === false) return;
      const block = event.block;
      if (!block || !isBed(block.typeId)) return;
      if (gameDayIndex() >= 1) return;
      let night = true;
      try { night = isNight(timeOfDay()); } catch (e) { night = true; }
      if (!night) return;
      event.cancel = true;
      const loc = { x: block.location.x, y: block.location.y, z: block.location.z };
      const dimId = block.dimension.id;
      const pid = event.player.id;
      system.run(() => {
        const player = players().find((p) => p.id === pid);
        const dim = world.getDimension(dimId);
        const bed = blockAt(dim, loc.x, loc.y, loc.z) || { dimension: dim, location: loc, typeId: "minecraft:bed" };
        if (alive(player)) onBed(player, bed.dimension ? bed : { dimension: dim, location: loc });
      });
    } catch (e) { console.warn("[abyss bed] " + e); }
  });
} catch (e) { console.warn("[abyss bed subscribe] " + e); }

try {
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    try {
      const hit = ev.hitEntity;
      if (!hit || hit.typeId !== "abyss:underbed_hand") return;
      const src = ev.damagingEntity;
      if (!src || src.typeId !== "minecraft:player") return;
      const state = hands.get(hit.id);
      if (state) punish(hit, src, state);
    } catch (e) {}
  });
} catch (e) {}

export function initUnderbed() {
  system.runInterval(() => {
    if (!hands.size) return;
    for (const [id, state] of hands) {
      let entity;
      try { entity = world.getEntity(id); } catch (e) { entity = undefined; }
      if (!entity) {
        for (const dimName of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
          try {
            const found = world.getDimension(dimName).getEntities({ type: "abyss:underbed_hand" });
            entity = found.find((e) => e.id === id);
            if (entity) break;
          } catch (e) {}
        }
      }
      if (!alive(entity)) { hands.delete(id); continue; }
      try { tickHand(entity, state); } catch (err) { console.warn("[abyss hand tick] " + err); }
    }
  }, 2);
}

void isAir;
void run;
void later;
