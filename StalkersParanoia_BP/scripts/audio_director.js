import { world, system } from "@minecraft/server";
import { players, alive } from "./realtime_timeline.js";

const MUSIC = {
  dread: { id: "abyss.three_notes_dread", seconds: 9 },
  daisy: { id: "abyss.daisy_bell_corrupted", seconds: 30 },
  mashup: { id: "abyss.ultimate_terror_mashup", seconds: 34 },
  crystal: { id: "horror.crystal_faded_child", seconds: 78 },
  lavender: { id: "horror.lavender_town", seconds: 52 },
  computers: { id: "horror.new_computers_slowed", seconds: 82 },
  help: { id: "horror.i_just_cant_help_you", seconds: 72 },
};

const loops = new Map();

export function playAt(dim, loc, id, volume = 1, pitch = 1) {
  try { dim.playSound(id, loc, { volume, pitch }); } catch (e) {}
}

export function playFor(player, id, volume = 1, pitch = 1) {
  if (!alive(player)) return;
  try { player.playSound(id, { volume, pitch }); } catch (e) {}
}

export function playAll(id, volume = 1, pitch = 1) {
  for (const player of players()) playFor(player, id, volume, pitch);
}

export function stopFor(player, id) {
  if (!alive(player)) return;
  try { player.runCommand(`stopsound @s ${id}`); } catch (e) {}
}

export function stopAll(id) {
  for (const player of players()) stopFor(player, id);
}

export function playNamed(player, name) {
  const item = MUSIC[name];
  if (!item) return false;
  if (player) playFor(player, item.id, 1, 1);
  else playAll(item.id, 1, 1);
  return true;
}

export function loopNamed(name) {
  const item = MUSIC[name];
  if (!item || loops.has(name)) return;
  loops.set(name, { id: item.id, left: item.seconds, every: item.seconds });
  playAll(item.id, 0.9, 1);
}

export function stopLoop(name) {
  const item = loops.get(name);
  if (item) stopAll(item.id);
  loops.delete(name);
}

export function whisper(player) {
  const n = 1 + Math.floor(Math.random() * 5);
  playFor(player, `abyss.whisper_${n}`, 0.85, 0.75 + Math.random() * 0.5);
}

export function footsteps(player) {
  const n = 1 + Math.floor(Math.random() * 5);
  playFor(player, `abyss.steps_${n}`, 0.7, 0.8 + Math.random() * 0.4);
}

export function caveScream(player) {
  const n = 1 + Math.floor(Math.random() * 5);
  playFor(player, `abyss.cave_scream_${n}`, 1, 0.9 + Math.random() * 0.2);
  return n;
}

export function initAudio() {
  system.runInterval(() => {
    try {
      const list = players().filter(alive);
      if (!list.length) return;
      const one = list[Math.floor(Math.random() * list.length)];
      playFor(one, "horror.crystal_faded_child", 0.9, 1);
    } catch (e) {
      console.warn("[abyss crystal] " + e);
    }
  }, 12000);
}

export function tickAudio() {
  for (const [name, item] of loops) {
    item.left -= 1;
    if (item.left <= 0) {
      playAll(item.id, 0.9, 1);
      item.left = item.every;
      loops.set(name, item);
    }
  }
}

export function musicLeft() {
  return MUSIC;
}

void world;
