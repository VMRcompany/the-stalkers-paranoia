import { world, system } from "@minecraft/server";
import {
  alive, Bus, dist3, fogDistance, gameDayNumber, groundPos, intensity, isNight, isThickHours, players, realDay,
} from "./realtime_timeline.js";
import { whisper } from "./audio_director.js";

const stalkers = new Map();

function edge(player) {
  const dist = Math.max(16, fogDistance() * 0.92);
  const yaw = ((player.getRotation?.().y || Math.random() * 360) * Math.PI) / 180;
  const side = Math.random() < 0.5 ? 1 : -1;
  const x = player.location.x + Math.cos(yaw) * dist * side;
  const z = player.location.z + Math.sin(yaw) * dist;
  return groundPos(player.dimension, x, z, player.location.y);
}

export function spawnStalker(player, far) {
  if (!alive(player)) return;
  const spot = far || edge(player);
  let ent;
  try { ent = player.dimension.spawnEntity("abyss:stalker", spot); }
  catch (e) { return; }
  try { ent.addTag("edge"); } catch (e) {}
  stalkers.set(ent.id, { id: ent.id, owner: player.id, age: 0 });
  whisper(player);
}

function tickOne(ent, state) {
  state.age += 1;
  const owner = players().find((p) => p.id === state.owner);
  if (!alive(owner) || owner.dimension !== ent.dimension || state.age > 20 * 40) {
    try { ent.remove(); } catch (e) {}
    stalkers.delete(state.id);
    return;
  }
  const spot = edge(owner);
  const d = dist3(ent.location, owner.location);
  const limit = fogDistance();
  if (d < limit * 0.55) {
    try { ent.remove(); } catch (e) {}
    stalkers.delete(state.id);
    return;
  }
  const yaw = (Math.atan2(-(owner.location.x - ent.location.x), owner.location.z - ent.location.z) * 180) / Math.PI;
  try {
    ent.teleport({ x: spot.x, y: spot.y, z: spot.z }, { rotation: { x: 0, y: yaw } });
  } catch (e) {}
}

export function initStalkers() {
  system.runInterval(() => {
    for (const [id, state] of stalkers) {
      let ent;
      try { ent = entFrom(id); } catch (e) { ent = undefined; }
      if (!alive(ent)) { stalkers.delete(id); continue; }
      try { tickOne(ent, state); } catch (e) { console.warn(e); }
    }
  }, 10);
  Bus.on("second", () => {
    const mult = intensity();
    const list = players().filter(alive);
    for (const player of list) {
      const have = [...stalkers.values()].some((s) => s.owner === player.id);
      if (have) continue;
      const night = isNight() || isThickHours();
      let chance = (night ? 0.08 : 0.02) * mult;
      if (gameDayNumber() < 2 && realDay() < 2 && !night) chance = 0;
      if (Math.random() < chance / Math.max(1, list.length)) spawnStalker(player);
    }
  });
}

function entFrom(id) {
  try { return world.getEntity(id); } catch (e) { return undefined; }
}
