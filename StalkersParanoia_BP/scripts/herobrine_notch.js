import { world, system, EntityDamageCause, SignSide } from "@minecraft/server";
import {
  Abyss, Bus, alive, anchorFor, blockAt, dist3, fogDistance, gameDayIndex, groundPos,
  intensity, isAir, isNight, isProtectedSpot, isSolid, later, players, putBlock, run, saveState,
} from "./realtime_timeline.js";
import { beginLock, endLock, holdLook, isLocked, pullStep, refreshLock } from "./player_possession.js";
import { playFor, playAll, caveScream, whisper, footsteps } from "./audio_director.js";
import { sayCold } from "./world_voice.js";

const active = { herobrine: null, notches: [] };
const curses = new Map();
const SIGNS = ["STOP", "I SEE YOU", "WAKE UP"];

function spawn(dim, type, loc) {
  try { return dim.spawnEntity(type, loc); } catch (e) { console.warn(e); return undefined; }
}

function removeEnt(id) {
  if (!id) return;
  try {
    const ent = world.getEntity(id);
    if (alive(ent)) ent.remove();
  } catch (e) {}
}

function face(entity, target) {
  const loc = entity.location;
  const yaw = (Math.atan2(-(target.x - loc.x), target.z - loc.z) * 180) / Math.PI;
  const pitch = 0;
  try { entity.teleport(loc, { rotation: { x: pitch, y: yaw } }); } catch (e) {}
}

function fogEdge(player) {
  const dist = Math.max(18, fogDistance() * 0.85);
  const yaw = (player.getRotation?.().y || 0) * Math.PI / 180;
  const x = player.location.x - Math.sin(yaw) * dist;
  const z = player.location.z + Math.cos(yaw) * dist;
  return groundPos(player.dimension, x, z, player.location.y);
}

export function summonHerobrine(player) {
  if (!alive(player)) return;
  if (active.herobrine) dismissHerobrine(false);
  const spot = fogEdge(player);
  const ent = spawn(player.dimension, "abyss:herobrine", spot);
  if (!ent) return;
  const help = Math.random() < 0.75;
  try { world.sendMessage("§eHerobrine joined the game"); } catch (e) {}
  active.herobrine = {
    id: ent.id,
    age: 0,
    job: pickJob(player),
    did: false,
    help,
    look: 0,
    told: false,
    victim: player.id,
  };
  if (help) {
    playAll("horror.i_just_cant_help_you", 0.85, 1);
    sayCold("Он стоит за деревьями. Если смотреть долго, он уйдёт.");
  } else {
    sayCold("В этот раз он не хочет помогать.");
  }
}

function pickJob(player) {
  if (player.location.y < 48) return "tunnel";
  const roll = Math.floor(Math.random() * 4);
  return ["pyramid", "leaves", "fire", "signs"][roll];
}

export function dismissHerobrine(silent) {
  if (!active.herobrine) return;
  removeEnt(active.herobrine.id);
  active.herobrine = null;
  if (silent) return;
  try { world.sendMessage("§eHerobrine left the game"); } catch (e) {}
}

function pyramid(dim, x, y, z) {
  for (let layer = 0; layer < 2; layer++) {
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        const block = blockAt(dim, x + dx, y + layer, z + dz);
        if (!block || isProtectedSpot(dim.id, x + dx, y + layer, z + dz, block.typeId)) continue;
        if (!isAir(block) && isSolid(block) && layer === 0) continue;
        putBlock(dim, x + dx, y + layer, z + dz, "minecraft:sand");
      }
    }
  }
  const signPos = blockAt(dim, x, y + 2, z);
  if (signPos && isAir(signPos)) writeSign(dim, x, y + 2, z, SIGNS[Math.floor(Math.random() * SIGNS.length)]);
}

function writeSign(dim, x, y, z, text) {
  putBlock(dim, x, y, z, "minecraft:oak_sign");
  later(2, () => {
    const block = blockAt(dim, x, y, z);
    if (!block) return;
    try {
      const sign = block.getComponent("minecraft:sign");
      if (sign && typeof sign.getSignSide === "function") sign.getSignSide(SignSide.Front).setText(text);
      else if (sign && typeof sign.setText === "function") sign.setText(text);
    } catch (e) {}
  });
}

function stripLeaves(dim, home) {
  let n = 0;
  for (let i = 0; i < 40 && n < 8; i++) {
    const x = home.x + Math.floor(Math.random() * 30 - 15);
    const y = home.y + Math.floor(Math.random() * 10);
    const z = home.z + Math.floor(Math.random() * 30 - 15);
    const block = blockAt(dim, x, y, z);
    if (!block) continue;
    if (!(block.typeId.includes("leaves") || block.typeId === "abyss:alpha_leaves")) continue;
    if (isProtectedSpot(dim.id, x, y, z, "minecraft:oak_planks")) continue;
    putBlock(dim, x, y, z, "minecraft:air");
    n += 1;
  }
}

function loneFire(dim, home) {
  for (let i = 0; i < 24; i++) {
    const x = Math.floor(home.x + Math.random() * 36 - 18);
    const z = Math.floor(home.z + Math.random() * 36 - 18);
    const y = Math.floor(home.y);
    const log = blockAt(dim, x, y, z);
    if (!log || !log.typeId.includes("log")) continue;
    if (isProtectedSpot(dim.id, x, y, z, log.typeId)) continue;
    let neighbors = 0;
    let leaves = 0;
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const n = blockAt(dim, x + dx, y, z + dz);
      if (n && n.typeId.includes("log")) neighbors += 1;
    }
    const up = blockAt(dim, x, y + 2, z);
    if (up && (up.typeId.includes("leaves") || up.typeId === "abyss:alpha_leaves")) leaves += 1;
    if (neighbors === 0 && leaves) {
      const above = blockAt(dim, x, y + 1, z);
      if (above && isAir(above)) putBlock(dim, x, y + 1, z, "minecraft:fire");
      return;
    }
  }
}

function signsAndTorches(dim, home) {
  const x = Math.floor(home.x + 6);
  const z = Math.floor(home.z + 2);
  const y = Math.floor(home.y);
  writeSign(dim, x, y, z, SIGNS[Math.floor(Math.random() * SIGNS.length)]);
  const t = blockAt(dim, x + 1, y, z);
  if (t && isAir(t)) putBlock(dim, x + 1, y, z, "minecraft:redstone_torch");
}

function digTunnel(dim, player) {
  const x = Math.floor(player.location.x + 4);
  const z = Math.floor(player.location.z);
  let y = Math.floor(player.location.y);
  for (let i = 0; i < 6; i++) {
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const block = blockAt(dim, x + i, y + dy, z + dx);
        if (!block) continue;
        if (isProtectedSpot(dim.id, x + i, y + dy, z + dx, block.typeId)) continue;
        const id = block.typeId;
        if (!(id.includes("stone") || id.includes("deepslate") || id.includes("dirt") || id.includes("tuff") || id.includes("andesite") || id.includes("diorite") || id.includes("granite"))) continue;
        run(dim, `setblock ${x + i} ${y + dy} ${z + dx} air destroy`);
      }
    }
  }
}

function doJob(ent, state, player) {
  if (state.did) return;
  state.did = true;
  const dim = ent.dimension;
  const home = anchorFor(player);
  if (state.job === "pyramid") pyramid(dim, Math.floor(ent.location.x), Math.floor(ent.location.y), Math.floor(ent.location.z));
  else if (state.job === "leaves") stripLeaves(dim, home);
  else if (state.job === "fire") loneFire(dim, home);
  else if (state.job === "signs") signsAndTorches(dim, home);
  else digTunnel(dim, player);
}

function lookingAt(player, ent) {
  try {
    const hits = player.getEntitiesFromViewDirection({ maxDistance: 40 });
    for (const hit of hits) {
      if (hit.entity && hit.entity.id === ent.id) return true;
    }
  } catch (e) {}
  return false;
}

function helpLines(player) {
  try {
    player.onScreenDisplay.setTitle("§fI want to help you", {
      stayDuration: 50,
      fadeInDuration: 5,
      fadeOutDuration: 15,
    });
    player.onScreenDisplay.setActionBar("§7I just can't help you...");
  } catch (e) {}
  try { player.sendMessage("§fI want to help you"); } catch (e) {}
  later(40, () => {
    if (alive(player)) {
      try { player.sendMessage("§7I just can't help you..."); } catch (e) {}
    }
  });
}

function attackBurst(ent, player) {
  const dim = ent.dimension;
  const loc = player.location;
  try { dim.runCommand(`summon lightning_bolt ${loc.x} ${loc.y} ${loc.z}`); } catch (e) {}
  const ahead = blockAt(dim, loc.x, loc.y, loc.z);
  if (ahead && isAir(ahead) && !isProtectedSpot(dim.id, loc.x, loc.y, loc.z, ahead.typeId)) {
    putBlock(dim, Math.floor(loc.x), Math.floor(loc.y), Math.floor(loc.z), "minecraft:web");
  }
  loneFire(dim, anchorFor(player));
  caveScream(player);
  try { player.applyDamage(6, { cause: EntityDamageCause.entityAttack, damagingEntity: ent }); } catch (e) {
    try { player.applyDamage(6); } catch (e2) {}
  }
  try { player.addEffect("blindness", 40, { amplifier: 0, showParticles: false }); } catch (e) {}
  const dx = loc.x - ent.location.x;
  const dz = loc.z - ent.location.z;
  const len = Math.hypot(dx, dz) || 1;
  try {
    ent.teleport({
      x: ent.location.x + (dx / len) * 0.6,
      y: loc.y,
      z: ent.location.z + (dz / len) * 0.6,
    });
  } catch (e) {}
}

function tickHerobrine() {
  const state = active.herobrine;
  if (!state) return;
  let ent;
  try { ent = world.getEntity(state.id); } catch (e) { ent = undefined; }
  if (!alive(ent)) { active.herobrine = null; return; }
  state.age += 1;
  const list = players().filter((p) => alive(p) && p.dimension === ent.dimension);
  if (!list.length) return;
  const player = list.slice().sort((a, b) => dist3(a.location, ent.location) - dist3(b.location, ent.location))[0];
  face(ent, player.location);
  if (state.age === 20) doJob(ent, state, player);
  if (state.help) {
    const watcher = list.find((p) => lookingAt(p, ent));
    if (watcher) {
      state.look += 1;
      if (!state.told) {
        state.told = true;
        state.victim = watcher.id;
        helpLines(watcher);
      }
      if (state.look >= 600) {
        dismissHerobrine(true);
        return;
      }
    } else {
      state.look = 0;
    }
    if (state.age > 900) dismissHerobrine(false);
    return;
  }
  if (state.age === 30 || state.age % 80 === 0) attackBurst(ent, player);
  if (state.age > 240) dismissHerobrine(false);
}

function notchSpot(player) {
  const view = player.getViewDirection ? player.getViewDirection() : { x: 0, y: 0, z: 1 };
  let vx = view.x;
  let vz = view.z;
  const h = Math.hypot(vx, vz) || 1;
  vx /= h;
  vz /= h;
  const x = player.location.x + vx * 15;
  const z = player.location.z + vz * 15;
  const y = groundPos(player.dimension, x, z, player.location.y).y;
  return { x, y, z };
}

export function summonNotch() {
  const list = players().filter(alive);
  if (!list.length) return;
  if (active.notches.length) dismissNotch(false);
  try { world.sendMessage("§eNotch joined the game"); } catch (e) {}
  playAll("horror.lavender_town", 1, 1);
  active.notchTicks = 0;
  for (const player of list) {
    const spot = notchSpot(player);
    const ent = spawn(player.dimension, "abyss:notch", spot);
    if (!ent) continue;
    try { ent.triggerEvent("abyss:stage0"); } catch (e) {}
    beginLock(player, 220);
    active.notches.push({ id: ent.id, age: 0, victim: player.id, stage: 0, hit: false });
  }
  sayCold("Не отводи взгляд. Он считает это грубостью.");
}

function setStage(ent, stage) {
  try { ent.triggerEvent(`abyss:stage${stage}`); } catch (e) {}
}

export function dismissNotch(punish) {
  const states = active.notches.splice(0, active.notches.length);
  active.notchTicks = 0;
  if (!states.length) return;
  try { world.sendMessage("§eNotch left the game"); } catch (e) {}
  for (const state of states) {
    const player = players().find((p) => p.id === state.victim);
    removeEnt(state.id);
    if (!alive(player)) continue;
    endLock(player);
    try { player.runCommand("stopsound @s horror.lavender_town"); } catch (e) {}
    if (!punish || state.hit) continue;
    state.hit = true;
    let amount = 10;
    try {
      const hp = player.getComponent("minecraft:health");
      if (hp) amount = Math.max(1, (hp.effectiveMax || hp.defaultValue || 20) / 2);
    } catch (e) {}
    try { player.applyDamage(amount, { cause: EntityDamageCause.magic }); } catch (e) {
      try { player.applyDamage(amount); } catch (e2) {}
    }
    try { player.addEffect("darkness", 400, { amplifier: 0, showParticles: true }); } catch (e) {}
    later(1, () => {
      if (!alive(player)) return;
      let current = 1;
      try { current = player.getComponent("minecraft:health").currentValue; } catch (e) {}
      if (current > 0) {
        curses.set(player.id, { day: gameDayIndex(), next: 20 * (20 + Math.floor(Math.random() * 20)) });
        try { player.setDynamicProperty("abyss_curse_day", gameDayIndex()); } catch (e) {}
        Bus.emit("notch_survived", { name: player.name });
        sayCold(`${player.name} ещё дышит. До конца этих суток я буду напоминать.`);
      }
    });
  }
}

function tickNotch() {
  if (!active.notches.length) return;
  active.notchTicks = (active.notchTicks || 0) + 1;
  let oldest = 0;
  for (const state of active.notches) {
    let ent;
    try { ent = world.getEntity(state.id); } catch (e) { ent = undefined; }
    const player = players().find((p) => p.id === state.victim);
    if (!alive(ent) || !alive(player) || player.dimension !== ent.dimension) continue;
    state.age += 1;
    oldest = Math.max(oldest, state.age);
    face(ent, player.getHeadLocation ? player.getHeadLocation() : player.location);
    refreshLock(player, 30);
    const stage = state.age < 66 ? 0 : state.age < 132 ? 1 : state.age < 180 ? 2 : 3;
    if (stage !== state.stage) {
      state.stage = stage;
      setStage(ent, stage);
      try { ent.dimension.spawnParticle("minecraft:redstone_wire_dust_particle", ent.getHeadLocation()); } catch (e) {}
    }
    const head = ent.getHeadLocation ? ent.getHeadLocation() : ent.location;
    holdLook(player, head);
    pullStep(player, ent.location, 0.08);
    if (state.age % 40 === 0) footsteps(player);
  }
  if (active.notchTicks >= 200) dismissNotch(true);
}

function screamer(player) {
  const roll = Math.floor(Math.random() * 5);
  caveScream(player);
  whisper(player);
  try { player.runCommand("camerashake add @s 0.35 0.6 rotational"); } catch (e) {}
  if (roll === 0) {
    try { player.addEffect("blindness", 25, { amplifier: 1, showParticles: false }); } catch (e) {}
    try { player.onScreenDisplay.setTitle("§f ", { stayDuration: 4, fadeInDuration: 0, fadeOutDuration: 2, subtitle: "§cсзади" }); } catch (e) {}
  } else if (roll === 1) {
    const view = player.getViewDirection ? player.getViewDirection() : { x: 0, y: 0, z: 1 };
    const loc = {
      x: player.location.x + view.x * 2.2,
      y: player.location.y,
      z: player.location.z + view.z * 2.2,
    };
    try {
      const faceEnt = player.dimension.spawnEntity("abyss:window_face", loc);
      later(14, () => { try { if (alive(faceEnt)) faceEnt.remove(); } catch (e) {} });
    } catch (e) {}
  } else if (roll === 2) {
    try { world.sendMessage("§eHerobrine joined the game"); } catch (e) {}
    later(30, () => { try { world.sendMessage("§eHerobrine left the game"); } catch (e) {} });
  } else if (roll === 3) {
    try { player.addEffect("darkness", 40, { amplifier: 0, showParticles: true }); } catch (e) {}
  } else {
    footsteps(player);
  }
}

function tickCurses() {
  const day = gameDayIndex();
  for (const player of players()) {
    if (!alive(player)) continue;
    let curse = curses.get(player.id);
    if (!curse) {
      let stored = -1;
      try { stored = player.getDynamicProperty("abyss_curse_day"); } catch (e) {}
      if (typeof stored === "number" && stored === day) curse = { day, next: 40 };
    }
    if (!curse) continue;
    if (curse.day !== day) {
      curses.delete(player.id);
      try { player.setDynamicProperty("abyss_curse_day", -1); } catch (e) {}
      continue;
    }
    curse.next -= 5;
    curses.set(player.id, curse);
    if (curse.next <= 0) {
      screamer(player);
      curse.next = 20 * (20 + Math.floor(Math.random() * 21));
    }
  }
}

export function initHerobrine() {
  system.runInterval(() => {
    try { tickHerobrine(); tickNotch(); } catch (e) { console.warn("[abyss gaze] " + e); }
  }, 1);
  system.runInterval(() => {
    try { tickCurses(); } catch (e) {}
  }, 5);
  Bus.on("second", () => {
    if (active.herobrine || active.notches.length) return;
    const list = players().filter(alive);
    if (!list.length) return;
    const night = isNight();
    const chance = (night ? 0.06 : 0.03) * intensity();
    if (Math.random() < chance) summonHerobrine(list[Math.floor(Math.random() * list.length)]);
    else if (Math.random() < chance * 0.35) summonNotch();
  });
}

export function notchActive() { return active.notches.length > 0; }
export function herobrineActive() { return !!active.herobrine; }

void Abyss;
void saveState;
void system;
