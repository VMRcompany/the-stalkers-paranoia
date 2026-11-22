import { system } from "@minecraft/server";
import {
  Abyss, Bus, alive, blockAt, captureBlock, gameDayNumber, intensity, isSolid, later, players, putBlock, realDay, restoreBlock, saveState,
} from "./realtime_timeline.js";
import { playFor } from "./audio_director.js";

const NATURAL = ["dirt", "grass", "stone", "sand", "gravel", "deepslate", "netherrack", "tuff", "andesite", "diorite", "granite", "podzol", "mycelium", "clay", "mud", "soul"];

function natural(id) {
  if (!id) return false;
  if (id.startsWith("abyss:alpha_")) return true;
  if (id === "abyss:slimy_flesh_block" || id === "abyss:corrupted_glitch_block") return false;
  return NATURAL.some((bit) => id.includes(bit));
}

function running(player) {
  try {
    const v = player.getVelocity();
    return Math.hypot(v.x, v.z) > 0.18;
  } catch (e) { return false; }
}

export function forceGlitch(player) {
  if (!alive(player)) return;
  const dim = player.dimension;
  const cx = Math.floor(player.location.x) - 1;
  const cz = Math.floor(player.location.z) - 1;
  const y = Math.floor(player.location.y) - 1;
  const saved = [];
  const mode = Math.floor(Math.random() * 3);
  for (let dx = 0; dx < 4; dx++) {
    for (let dz = 0; dz < 4; dz++) {
      const block = blockAt(dim, cx + dx, y, cz + dz);
      if (!block || !natural(block.typeId)) continue;
      const below = blockAt(dim, cx + dx, y - 1, cz + dz);
      if (mode === 0 && (!below || !isSolid(below))) continue;
      saved.push(captureBlock(block));
      const next = mode === 0 ? "minecraft:air" : mode === 1 ? "abyss:slimy_flesh_block" : "abyss:corrupted_glitch_block";
      putBlock(dim, cx + dx, y, cz + dz, next);
    }
  }
  if (!saved.length) return;
  if (mode === 1) playFor(player, "abyss.slimy", 1, 1);
  try { player.addEffect("slowness", 40, { amplifier: 2, showParticles: false }); } catch (e) {}
  try { player.runCommand("camerashake add @s 0.2 0.4 positional"); } catch (e) {}
  const entry = { dim: dim.id, blocks: saved };
  Abyss.glitches.push(entry);
  saveState();
  const hold = 40 + Math.floor(Math.random() * 20);
  later(hold, () => {
    for (const s of saved) restoreBlock(dim, s);
    Abyss.glitches = Abyss.glitches.filter((g) => g !== entry);
    saveState();
  });
}

export function initGlitches() {
  Bus.on("architect_flesh", (info) => {
    const dim = players()[0] ? players()[0].dimension : null;
    if (!dim) return;
    const fake = { dimension: dim, location: { x: info.x, y: 0, z: info.z }, isValid: true, getVelocity: () => ({ x: 1, y: 0, z: 1 }) };
    void fake;
    for (const p of players()) if (alive(p)) forceGlitch(p);
  });
  system.runInterval(() => {
    const allowed = gameDayNumber() >= 3 || realDay() >= 3;
    if (!allowed) return;
    const chance = 0.18 * intensity();
    for (const p of players()) {
      if (!alive(p) || !running(p)) continue;
      if (Math.random() < chance) forceGlitch(p);
    }
  }, 80);
}
