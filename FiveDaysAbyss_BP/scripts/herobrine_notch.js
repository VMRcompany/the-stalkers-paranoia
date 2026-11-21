import { world, system, EntityDamageCause, SignSide } from "@minecraft/server";
import {
  Abyss, Bus, alive, anchorFor, blockAt, dist3, fogDistance, gameDayIndex, groundPos,
  intensity, isAir, isNight, isProtectedSpot, isSolid, later, players, putBlock, run, saveState,
} from "./realtime_timeline.js";
import { beginLock, endLock, holdLook, isLocked, pullStep, refreshLock } from "./player_possession.js";
import { playFor, caveScream, whisper, footsteps } from "./audio_director.js";
import { sayCold } from "./world_voice.js";

const active = { herobrine: null, notch: null };
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
  if (active.herobrine) dismissHerobrine();
  const spot = fogEdge(player);
  const ent = spawn(player.dimension, "abyss:herobrine", spot);
  if (!ent) return;
  try { world.sendMessage("§eHerobrine joined the game"); } catch (e) {}
  active.herobrine = {
    id: ent.id,
    age: 0,
    job: pickJob(player),
    did: false,
    stare: 0,
    victim: "",
  };
  sayCold("Кто-то стоит там, где кончается свет.");
}

function pickJob(player) {
  if (player.location.y < 48) return "tunnel";
  const roll = Math.floor(Math.random() * 4);
  return ["pyramid", "leaves", "fire", "signs"][roll];
}

export function dismissHerobrine() {
  if (!active.herobrine) return;
  removeEnt(active.herobrine.id);
  if (active.herobrine.victim) {
    const p = players().find((pl) => pl.id === active.herobrine.victim);
    if (alive(p)) endLock(p);
  }
  active.herobrine = null;
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

function startHerobrineStare(state, ent, player) {
  if (state.stare > 0 || isLocked(player)) return;
  state.stare = 1;
  state.victim = player.id;
  beginLock(player, 140);
  try {
    player.onScreenDisplay.setTitle("§fНЕ ОТВОДИ ВЗГЛЯД", { stayDuration: 20, fadeInDuration: 0, fadeOutDuration: 5 });
  } catch (e) {}
  whisper(player);
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
  const d = dist3(ent.location, player.location);
  if (!state.stare && state.age > 40 && d < 10) startHerobrineStare(state, ent, player);
  if (state.stare) {
    const victim = players().find((p) => p.id === state.victim) || player;
    if (!alive(victim)) { dismissHerobrine(); return; }
    refreshLock(victim, 40);
    const head = ent.getHeadLocation ? ent.getHeadLocation() : ent.location;
    holdLook(victim, head);
    pullStep(victim, ent.location, 0.04);
    state.stare += 1;
    if (state.stare > 100) {
      endLock(victim);
      try {
        victim.addEffect("blindness", 60, { amplifier: 0, showParticles: true });
      } catch (e) {}
      dismissHerobrine();
    }
  } else if (state.age > 400) {
    dismissHerobrine();
  } else if (state.age % 10 === 0) {
    const edge = fogEdge(player);
    const dx = edge.x - ent.location.x;
    const dz = edge.z - ent.location.z;
    const len = Math.hypot(dx, dz) || 1;
    try {
      ent.teleport({
        x: ent.location.x + (dx / len) * 0.35,
        y: edge.y,
        z: ent.location.z + (dz / len) * 0.35,
      });
    } catch (e) {}
  }
}

export function summonNotch(player) {
  if (!alive(player)) return;
  if (active.notch) dismissNotch(false);
  const view = player.getViewDirection ? player.getViewDirection() : { x: 0, y: 0, z: 1 };
  const dist = 14 + Math.random() * 8;
  const raw = groundPos(player.dimension, player.location.x + view.x * dist, player.location.z + view.z * dist, player.location.y);
  const ent = spawn(player.dimension, "abyss:notch", raw);
  if (!ent) return;
  try { ent.triggerEvent("abyss:stage0"); } catch (e) {}
  try { world.sendMessage("§eNotch joined the game"); } catch (e) {}
  active.notch = { id: ent.id, age: 0, victim: player.id, stage: 0, hit: false };
  beginLock(player, 220);
  playFor(player, "abyss.notch_gaze", 1, 1);
  try {
    player.onScreenDisplay.setTitle("§4ОН СМОТРИТ", { stayDuration: 30, fadeInDuration: 0, fadeOutDuration: 10, subtitle: "§7не отводи взгляд" });
  } catch (e) {}
  sayCold("Не отводи взгляд. Он считает это грубостью.");
}

function setStage(ent, stage) {
  try { ent.triggerEvent(`abyss:stage${stage}`); } catch (e) {}
}

export function dismissNotch(punish) {
  const state = active.notch;
  if (!state) return;
  const player = players().find((p) => p.id === state.victim);
  removeEnt(state.id);
  active.notch = null;
  try { world.sendMessage("§eNotch left the game"); } catch (e) {}
  if (!alive(player)) return;
  endLock(player);
  try { player.runCommand("stopsound @s abyss.notch_gaze"); } catch (e) {}
  if (!punish || state.hit) return;
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

function tickNotch() {
  const state = active.notch;
  if (!state) return;
  let ent;
  try { ent = world.getEntity(state.id); } catch (e) { ent = undefined; }
  if (!alive(ent)) { active.notch = null; return; }
  const player = players().find((p) => p.id === state.victim);
  if (!alive(player) || player.dimension !== ent.dimension) { dismissNotch(false); return; }
  state.age += 1;
  face(ent, player.getHeadLocation ? player.getHeadLocation() : player.location);
  refreshLock(player, 30);
  const stage = state.age < 66 ? 0 : state.age < 132 ? 1 : state.age < 180 ? 2 : 3;
  if (stage !== state.stage) {
    state.stage = stage;
    setStage(ent, stage);
    try {
      ent.dimension.spawnParticle("minecraft:redstone_wire_dust_particle", ent.getHeadLocation());
    } catch (e) {}
  }
  pullStep(player, ent.location, 0.08);
  if (state.age % 40 === 0) footsteps(player);
  if (state.age >= 200) dismissNotch(true);
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
    if (active.herobrine || active.notch) return;
    const list = players().filter(alive);
    if (!list.length) return;
    const night = isNight();
    const chance = (night ? 0.04 : 0.012) * intensity();
    if (Math.random() < chance) summonHerobrine(list[Math.floor(Math.random() * list.length)]);
    else if (Math.random() < chance * 0.45 && gameDayIndex() >= 0) {
      summonNotch(list[Math.floor(Math.random() * list.length)]);
    }
  });
}

export function notchActive() { return !!active.notch; }
export function herobrineActive() { return !!active.herobrine; }

void Abyss;
void saveState;
void system;
