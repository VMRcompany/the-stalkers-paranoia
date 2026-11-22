import { world, system, InputPermissionCategory } from "@minecraft/server";
import {
  Abyss, Bus, alive, players, cleanName, later, dist3, angles, blockAt, isAir,
  groundPos, isProtectedSpot, saveState, gameDayIndex, anchorFor, run, pset,
} from "./realtime_timeline.js";
import { sayCold } from "./world_voice.js";
import { whisper, footsteps } from "./audio_director.js";

const PERMS = ["Movement", "Camera", "LateralMovement", "Jump", "Sneak", "MoveForward", "MoveBackward", "MoveLeft", "MoveRight"];
const locks = new Set();
const sessions = new Map();

function setPerms(player, enabled) {
  if (!player.inputPermissions) return;
  for (const name of PERMS) {
    const cat = InputPermissionCategory[name];
    if (cat === undefined) continue;
    try { player.inputPermissions.setPermissionCategory(cat, enabled); } catch (e) {}
  }
}

export function isLocked(player) {
  return !!player && locks.has(player.id);
}

export function beginLock(player, ticks = 200) {
  if (!alive(player)) return;
  locks.add(player.id);
  setPerms(player, false);
  try { player.addEffect("slowness", ticks, { amplifier: 255, showParticles: false }); } catch (e) {}
}

export function refreshLock(player, ticks = 40) {
  if (!locks.has(player.id)) beginLock(player, ticks);
  else {
    try { player.addEffect("slowness", ticks, { amplifier: 255, showParticles: false }); } catch (e) {}
  }
}

export function endLock(player) {
  if (!player) return;
  locks.delete(player.id);
  if (!alive(player)) return;
  setPerms(player, true);
  try { player.removeEffect("slowness"); } catch (e) {}
  try { player.camera.clear(); } catch (e) {}
}

export function holdLook(player, target) {
  if (!alive(player)) return { x: 0, y: 0 };
  let eye = player.location;
  try { eye = player.getHeadLocation(); } catch (e) {}
  const rot = angles(eye, target);
  const opts = { location: eye, facingLocation: target, easeOptions: { easeTime: 0.05, easeType: "linear" } };
  try { player.camera.setCamera("minecraft:free", opts); }
  catch (e) {
    try { player.camera.setCamera("minecraft:free", { location: eye, facingLocation: target }); } catch (e2) {}
  }
  return rot;
}

export function pullStep(player, target, step) {
  if (!alive(player)) return 0;
  const loc = player.location;
  const dx = target.x - loc.x;
  const dz = target.z - loc.z;
  const d = Math.hypot(dx, dz) || 1;
  const eye = { x: target.x, y: (target.y || loc.y) + 1.62, z: target.z };
  const rot = holdLook(player, eye);
  if (d < 1.35) {
    try { player.teleport(loc, { rotation: rot }); } catch (e) {}
    return d;
  }
  const nx = loc.x + (dx / d) * step;
  const nz = loc.z + (dz / d) * step;
  try { player.applyKnockback({ x: (dx / d) * step, z: (dz / d) * step }, 0); } catch (e) {
    try { player.applyKnockback(dx / d, dz / d, step, 0); } catch (e2) {}
  }
  try { player.teleport({ x: nx, y: loc.y, z: nz }, { rotation: rot }); } catch (e) {}
  return d;
}

function swing(player) {
  try { player.runCommand("playanimation @s animation.player.attack.rotations"); } catch (e) {}
  try {
    if (typeof player.playAnimation === "function") player.playAnimation("animation.player.attack.rotations");
  } catch (e) {}
}

function eyes(player, red) {
  if (!alive(player)) return;
  const head = player.getHeadLocation ? player.getHeadLocation() : player.location;
  const pos = { x: head.x, y: head.y - 0.15, z: head.z };
  const id = red ? "minecraft:redstone_wire_dust_particle" : "minecraft:basic_crit_particle";
  try { player.dimension.spawnParticle(id, pos); } catch (e) {
    try { player.dimension.spawnParticle("minecraft:basic_smoke_particle", pos); } catch (e2) {}
  }
}

function findTree(player) {
  const dim = player.dimension;
  const origin = player.location;
  let best = null;
  let bestD = 1e9;
  for (let y = -2; y <= 8; y++) {
    for (let x = -18; x <= 18; x += 2) {
      for (let z = -18; z <= 18; z += 2) {
        const block = blockAt(dim, origin.x + x, origin.y + y, origin.z + z);
        if (!block || !block.typeId.includes("log")) continue;
        if (isProtectedSpot(dim.id, block.location.x, block.location.y, block.location.z, block.typeId)) continue;
        let leafy = false;
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) {
          const n = blockAt(dim, block.location.x + dx, block.location.y + dy, block.location.z + dz);
          if (n && (n.typeId.includes("leaves") || n.typeId === "abyss:alpha_leaves")) leafy = true;
        }
        if (!leafy) continue;
        const d = dist3(origin, block.location);
        if (d < bestD) { bestD = d; best = block.location; }
      }
    }
  }
  return best;
}

function topLog(dim, loc) {
  let y = loc.y;
  let top = loc;
  for (let i = 0; i < 10; i++) {
    const b = blockAt(dim, loc.x, y + 1, loc.z);
    if (!b || !b.typeId.includes("log")) break;
    y += 1;
    top = { x: loc.x, y, z: loc.z };
  }
  return top;
}

function findGlass(player) {
  const dim = player.dimension;
  const home = anchorFor(player);
  let best = null;
  let bestD = 1e9;
  for (let y = -2; y <= 6; y++) {
    for (let x = -14; x <= 14; x += 1) {
      for (let z = -14; z <= 14; z += 1) {
        const block = blockAt(dim, home.x + x, home.y + y, home.z + z);
        if (!block) continue;
        if (!(block.typeId.includes("glass") || block.typeId === "abyss:cracked_window")) continue;
        if (block.typeId.includes("pane")) continue;
        const d = dist3(player.location, block.location);
        if (d < bestD) { bestD = d; best = block.location; }
      }
    }
  }
  return best;
}

function nearestFriend(player) {
  let best = null;
  let bestD = 1e9;
  for (const other of players()) {
    if (other.id === player.id || !alive(other)) continue;
    const d = dist3(player.location, other.location);
    if (d < bestD && d < 48) { bestD = d; best = other; }
  }
  return best;
}

function stepTowards(player, target, step) {
  const loc = player.location;
  const dx = target.x + 0.5 - loc.x;
  const dz = target.z + 0.5 - loc.z;
  const d = Math.hypot(dx, dz) || 1;
  if (d < 1.6) return d;
  const nx = loc.x + (dx / d) * step;
  const nz = loc.z + (dz / d) * step;
  const feet = blockAt(player.dimension, nx, loc.y, nz);
  const head = blockAt(player.dimension, nx, loc.y + 1, nz);
  if (feet && !isAir(feet) && head && !isAir(head)) return d;
  const look = holdLook(player, { x: target.x + 0.5, y: target.y + 1.4, z: target.z + 0.5 });
  try { player.teleport({ x: nx, y: loc.y, z: nz }, { rotation: look }); } catch (e) {}
  return d;
}

function chop(player, session) {
  const dim = player.dimension;
  if (!session.log) return;
  const log = topLog(dim, session.log);
  session.log = log;
  const block = blockAt(dim, log.x, log.y, log.z);
  if (!block || !block.typeId.includes("log")) { session.log = null; return; }
  if (isProtectedSpot(dim.id, log.x, log.y, log.z, block.typeId)) { session.log = null; return; }
  swing(player);
  run(dim, `setblock ${log.x} ${log.y} ${log.z} air destroy`);
  try { dim.spawnParticle("minecraft:basic_smoke_particle", { x: log.x + 0.5, y: log.y + 0.5, z: log.z + 0.5 }); } catch (e) {}
}

function placeTorch(player, session) {
  if (session.torched) return;
  const dim = player.dimension;
  const spot = session.glass || player.location;
  const x = Math.floor(spot.x) + 1;
  const y = Math.floor(spot.y);
  const z = Math.floor(spot.z);
  const there = blockAt(dim, x, y, z);
  if (there && isAir(there)) {
    try {
      there.setType("minecraft:redstone_torch");
    } catch (e) {
      run(dim, `setblock ${x} ${y} ${z} redstone_torch`);
    }
    session.torched = true;
  }
}

export function possess(player, seconds = 14) {
  if (!alive(player) || isLocked(player)) return false;
  const roll = Math.floor(Math.random() * 3);
  let mode = "tree";
  if (roll === 1 && players().length > 1) mode = "stare";
  else if (roll === 2) mode = "window";
  if (mode === "tree") {
    const tree = findTree(player);
    if (!tree) mode = findGlass(player) ? "window" : "window";
  }
  const friend = mode === "stare" ? nearestFriend(player) : null;
  if (mode === "stare" && !friend) mode = "window";
  const session = {
    id: player.id,
    name: player.name,
    mode,
    ticks: Math.floor(seconds * 20),
    age: 0,
    log: mode === "tree" ? findTree(player) : null,
    glass: mode === "window" ? findGlass(player) : null,
    friendId: friend ? friend.id : "",
    stared: 0,
    torched: false,
    whispered: false,
  };
  sessions.set(player.id, session);
  beginLock(player, session.ticks + 40);
  const msg = `<<${cleanName(player.name)}>>: это не я... я не могу остановиться...`;
  try { world.sendMessage(msg); } catch (e) {}
  sayCold(`${cleanName(player.name)} больше не выбирает, куда смотреть.`);
  whisper(player);
  return true;
}

export function possessRandom(seconds = 15) {
  const list = players().filter((p) => alive(p) && !isLocked(p));
  if (!list.length) return false;
  return possess(list[Math.floor(Math.random() * list.length)], seconds);
}

function release(player, session) {
  sessions.delete(player.id);
  endLock(player);
  if (!alive(player)) return;
  try {
    player.addEffect("nausea", 160, { amplifier: 0, showParticles: true });
    player.addEffect("weakness", 160, { amplifier: 1, showParticles: false });
  } catch (e) {}
  sayCold(`${cleanName(session.name)} моргнул. Прошло несколько секунд, которых для него не было.`);
  try { player.sendMessage("§8[МИР]: Ты не помнишь, что делал. И это правда."); } catch (e) {}
  pset(player, "abyss_possessed", 1);
  Bus.emit("possession_end", { name: session.name, mode: session.mode });
}

function tickSession(session) {
  const player = players().find((p) => p.id === session.id);
  if (!alive(player)) { sessions.delete(session.id); return; }
  session.age += 1;
  if (session.age > session.ticks) { release(player, session); return; }
  refreshLock(player, 40);
  eyes(player, session.age % 10 < 5);
  if (session.age % 20 === 0) footsteps(player);
  if (session.mode === "tree") {
    if (!session.log) session.log = findTree(player);
    if (session.log) {
      const d = stepTowards(player, session.log, 0.22);
      holdLook(player, { x: session.log.x + 0.5, y: session.log.y + 1, z: session.log.z + 0.5 });
      if (d < 2.4 && session.age % 8 === 0) chop(player, session);
    }
  } else if (session.mode === "stare") {
    const friend = players().find((p) => p.id === session.friendId);
    if (!alive(friend)) { session.mode = "window"; return; }
    const d = stepTowards(player, friend.location, 0.16);
    holdLook(player, friend.getHeadLocation ? friend.getHeadLocation() : friend.location);
    if (d < 2.2) {
      session.stared += 1;
      if (!session.whispered && session.stared > 20) {
        session.whispered = true;
        try { friend.sendMessage(`§7${cleanName(player.name)} шепчет: Он сказал, что ты следующий...`); } catch (e) {}
        whisper(friend);
      }
    }
  } else {
    const glass = session.glass || findGlass(player) || groundPos(player.dimension, player.location.x + 3, player.location.z, player.location.y);
    session.glass = glass;
    const d = stepTowards(player, glass, 0.18);
    holdLook(player, { x: glass.x + 0.5, y: glass.y + 1.2, z: glass.z + 0.5 });
    if (d < 2.2) placeTorch(player, session);
  }
}

export function initPossession() {
  Bus.on("game_day", () => {
    const gd = gameDayIndex();
    if (Abyss.possessionDay === gd) return;
    Abyss.possessionDay = gd;
    saveState();
    const wait = 2400 + Math.floor(Math.random() * 3600);
    later(wait, () => possessRandom(12 + Math.floor(Math.random() * 4)));
  });
  system.runInterval(() => {
    if (!sessions.size) return;
    for (const session of sessions.values()) {
      try { tickSession(session); } catch (e) { console.warn("[abyss possess] " + e); }
    }
  }, 1);
}

export function possessionActive() {
  return sessions.size > 0;
}
