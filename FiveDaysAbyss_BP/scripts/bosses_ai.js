import { world, system } from "@minecraft/server";
import {
  Abyss, Bus, alive, anchorFor, dist3, groundPos, isProtectedSpot, later, players, run, shake,
} from "./realtime_timeline.js";
import { beginLock, endLock, holdLook, refreshLock } from "./player_possession.js";
import { caveScream, playAll, playFor, whisper } from "./audio_director.js";
import { sayCold } from "./world_voice.js";
import { pushSpecial, clearSpecial } from "./fog_director.js";

const bosses = new Map();

function getEnt(id) {
  try { return world.getEntity(id); } catch (e) { return undefined; }
}

function track(ent, data) {
  bosses.set(ent.id, Object.assign({ id: ent.id, age: 0, kind: ent.typeId }, data));
  return bosses.get(ent.id);
}

export function giveShard(player, reason) {
  if (!alive(player)) return;
  try { player.runCommand("give @s abyss:void_shard 1"); } catch (e) {}
  Abyss.flags.shardsGiven = (Abyss.flags.shardsGiven || 0) + 1;
  Bus.emit("shards", { name: player.name, reason });
  try { player.sendMessage(`§5Осколок Бездны §7(${reason}). §f${Abyss.flags.shardsGiven}§7/7`); } catch (e) {}
}

export function spawnWatcher(dim, loc, ownerId) {
  const spot = groundPos(dim, loc.x, loc.z, loc.y);
  let ent;
  try { ent = dim.spawnEntity("abyss:watcher", spot); } catch (e) { return undefined; }
  track(ent, { owner: ownerId || "", life: 80 });
  return ent;
}

export function spawnCrawler(dim, loc) {
  let ent;
  try { ent = dim.spawnEntity("abyss:crawler", { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 }); } catch (e) { return undefined; }
  track(ent, { life: 50 });
  return ent;
}

export function spawnMimic(dim, loc, name) {
  const spot = groundPos(dim, loc.x, loc.z, loc.y);
  let ent;
  try { ent = dim.spawnEntity("abyss:mimic", spot); } catch (e) { return undefined; }
  try { ent.nameTag = name; } catch (e) {}
  track(ent, { mimicName: name, life: 20 * 45 });
  return ent;
}

export function spawnEcho(dim, loc, name) {
  const spot = groundPos(dim, loc.x, loc.z, loc.y);
  let ent;
  try { ent = dim.spawnEntity("abyss:echo", spot); } catch (e) { return undefined; }
  try { ent.nameTag = name + "?"; } catch (e) {}
  track(ent, { mimicName: name, life: 20 * 40, echo: true });
  return ent;
}

export function spawnColossus(player, march) {
  if (!alive(player)) return;
  const home = anchorFor(player);
  const dim = player.dimension;
  const start = groundPos(dim, home.x, home.z - 42, home.y);
  let ent;
  try { ent = dim.spawnEntity("abyss:colossus", start); } catch (e) { return; }
  try {
    ent.nameTag = "Колосс";
    ent.addTag(march ? "march" : "silhouette");
  } catch (e) {}
  track(ent, {
    march: !!march,
    home: { x: home.x, z: home.z },
    life: march ? 20 * 50 : 20 * 12,
  });
  if (march) {
    sayCold("Земля помнит шаги больше домов.");
    playAll("abyss.three_notes_dread", 0.8, 0.7);
  }
}

export function spawnHarvester(player) {
  if (!alive(player)) return;
  const spot = groundPos(player.dimension, player.location.x + 18, player.location.z - 8, player.location.y);
  let ent;
  try { ent = player.dimension.spawnEntity("abyss:harvester", spot); } catch (e) { return; }
  try { ent.nameTag = "Жнец Пустоты"; } catch (e) {}
  track(ent, { life: 20 * 90 });
  sayCold("Он плачет не по вам. Он плачет тем, чем косит.");
}

export function spawnArchitect(player) {
  if (!alive(player)) return;
  const dim = player.dimension;
  const spot = groundPos(dim, player.location.x + 6, player.location.z, player.location.y);
  let ent;
  try { ent = dim.spawnEntity("abyss:architect", spot); } catch (e) { return; }
  try {
    ent.nameTag = "Архитектор Бездны";
    ent.triggerEvent("abyss:phase0");
  } catch (e) {}
  track(ent, { phase: 0, phaseAge: 0, life: 20 * 240, vulnerable: false });
  sayCold("Он не пришёл. Он всегда был чертежом под ногами.");
  pushSpecial("abyss:fog_citadel");
  return ent;
}

function hurtPlayer(ent, player, amount) {
  if (!alive(player)) return;
  if (isProtectedSpot(player.dimension.id, player.location.x, player.location.y, player.location.z, "minecraft:oak_planks") && dist3(player.location, ent.location) > 2) return;
  try { player.applyDamage(amount, { cause: "entityAttack" }); } catch (e) {
    try { player.applyDamage(amount); } catch (e2) {}
  }
}

function moveToward(ent, target, step) {
  const loc = ent.location;
  const dx = target.x - loc.x;
  const dz = target.z - loc.z;
  const d = Math.hypot(dx, dz) || 1;
  const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
  if (d < 1.2) {
    try { ent.teleport(loc, { rotation: { x: 0, y: yaw } }); } catch (e) {}
    return d;
  }
  const nx = loc.x + (dx / d) * step;
  const nz = loc.z + (dz / d) * step;
  const g = groundPos(ent.dimension, nx, nz, loc.y);
  if (isProtectedSpot(ent.dimension.id, Math.floor(nx), Math.floor(g.y), Math.floor(nz), "minecraft:stone_bricks")) {
    try { ent.teleport(loc, { rotation: { x: 0, y: yaw } }); } catch (e) {}
    return d;
  }
  try { ent.teleport({ x: nx, y: g.y, z: nz }, { rotation: { x: 0, y: yaw } }); } catch (e) {}
  return d;
}

function tickBoss(ent, state) {
  state.age += 1;
  state.life -= 1;
  if (state.life <= 0) {
    try { ent.remove(); } catch (e) {}
    bosses.delete(state.id);
    return;
  }
  const list = players().filter((p) => alive(p) && p.dimension === ent.dimension);
  if (!list.length) return;
  const player = list.slice().sort((a, b) => dist3(a.location, ent.location) - dist3(b.location, ent.location))[0];
  const kind = ent.typeId;
  if (kind === "abyss:colossus") {
    const dir = state.march ? 0.55 : 0;
    const home = state.home || { x: player.location.x, z: player.location.z };
    const dest = { x: home.x, y: ent.location.y, z: home.z + 42 };
    if (state.march) moveToward(ent, dest, dir);
    if (state.age % 20 === 0) {
      for (const p of list) if (dist3(p.location, ent.location) < 48) shake(p, 0.45, 0.8);
    }
    if (dist3(player.location, ent.location) < 6) hurtPlayer(ent, player, 6);
    return;
  }
  if (kind === "abyss:harvester") {
    const d = moveToward(ent, player.location, 0.12);
    if (state.age % 40 === 0) playFor(player, "abyss.whisper_3", 0.7, 0.6);
    if (d < 2.6 && state.age % 20 === 0) {
      hurtPlayer(ent, player, 5);
      try { player.addEffect("darkness", 40, { amplifier: 0, showParticles: true }); } catch (e) {}
    }
    return;
  }
  if (kind === "abyss:mimic" || kind === "abyss:echo") {
    moveToward(ent, player.location, kind === "abyss:echo" ? 0.14 : 0.08);
    if (dist3(ent.location, player.location) < 2.4 && state.age % 40 === 0) {
      whisper(player);
      try { player.sendMessage(`§8${state.mimicName || "друг"}: это был не я`); } catch (e) {}
      if (kind === "abyss:echo") hurtPlayer(ent, player, 3);
    }
    return;
  }
  if (kind === "abyss:architect") {
    tickArchitect(ent, state, player, list);
    return;
  }
  if (kind === "abyss:watcher") {
    const yaw = (Math.atan2(-(player.location.x - ent.location.x), player.location.z - ent.location.z) * 180) / Math.PI;
    try { ent.teleport(ent.location, { rotation: { x: 0, y: yaw } }); } catch (e) {}
  }
}

function tickArchitect(ent, state, player, list) {
  state.phaseAge += 1;
  if (!state.vulnerable && state.phase < 3 && state.phaseAge > 20 * 28) {
    state.phase += 1;
    state.phaseAge = 0;
    try { ent.triggerEvent(`abyss:phase${state.phase}`); } catch (e) {}
    Bus.emit("architect_phase", state.phase);
    sayCold(["Чертёж открыл глаза.", "Пол помнит вашу плоть.", "Он поёт вашими ртами.", "Теперь его можно стереть."][state.phase] || "...");
    if (state.phase === 1) {
      Bus.emit("architect_flesh", { x: ent.location.x, z: ent.location.z, dim: ent.dimension.id });
    }
    if (state.phase === 2) {
      list.forEach((p, i) => spawnEcho(ent.dimension, { x: ent.location.x + 4 + i * 2, y: ent.location.y, z: ent.location.z - 3 }, p.name));
    }
    if (state.phase === 3) state.vulnerable = true;
  }
  if (state.phase === 0 && state.phaseAge % 40 === 0) {
    for (const p of list) {
      holdLook(p, ent.getHeadLocation ? ent.getHeadLocation() : ent.location);
      later(15, () => { try { p.camera.clear(); } catch (e) {} });
    }
  }
  moveToward(ent, player.location, state.vulnerable ? 0.16 : 0.05);
  if (state.vulnerable && state.phaseAge % 30 === 0 && dist3(ent.location, player.location) < 8) {
    hurtPlayer(ent, player, 6);
    shake(player, 0.3, 0.4);
    try { player.addEffect("darkness", 30, { amplifier: 0, showParticles: true }); } catch (e) {}
  }
}

export function spawnBoss(kind, player) {
  if (kind === "colossus") spawnColossus(player, true);
  else if (kind === "harvester") spawnHarvester(player);
  else if (kind === "echo") {
    for (const p of players()) spawnEcho(player.dimension, { x: player.location.x + 3, y: player.location.y, z: player.location.z + 3 }, p.name);
    playAll("abyss.ultimate_terror_mashup", 1, 1);
  } else if (kind === "architect") spawnArchitect(player);
  else if (kind === "watcher") spawnWatcher(player.dimension, player.location, player.id);
  else if (kind === "crawler") spawnCrawler(player.dimension, player.location);
  else if (kind === "mimic") spawnMimic(player.dimension, player.location, player.name);
}

export function initBosses() {
  system.runInterval(() => {
    for (const [id, state] of bosses) {
      const ent = getEnt(id);
      if (!alive(ent)) { bosses.delete(id); continue; }
      try { tickBoss(ent, state); } catch (e) { console.warn("[abyss boss] " + e); }
    }
  }, 2);
  try {
    world.afterEvents.entityDie.subscribe((ev) => {
      const ent = ev.deadEntity;
      if (!ent || !ent.typeId.startsWith("abyss:")) return;
      const state = bosses.get(ent.id);
      bosses.delete(ent.id);
      if (ent.typeId === "abyss:architect") {
        clearSpecial();
        Bus.emit("architect_dead", {});
        const killer = ev.damageSource?.damagingEntity;
        if (alive(killer) && killer.typeId === "minecraft:player") giveShard(killer, "архитектор");
      } else if (state && (ent.typeId === "abyss:harvester" || ent.typeId === "abyss:echo" || ent.typeId === "abyss:mimic")) {
        const near = players().filter((p) => alive(p) && p.dimension === ent.dimension).sort((a, b) => dist3(a.location, ent.location) - dist3(b.location, ent.location))[0];
        if (near && !Abyss.flags["shard_" + ent.typeId]) {
          Abyss.flags["shard_" + ent.typeId] = true;
          giveShard(near, ent.typeId.split(":")[1]);
        }
      }
    });
  } catch (e) {}
}

void beginLock;
void endLock;
void refreshLock;
void caveScream;
void run;
