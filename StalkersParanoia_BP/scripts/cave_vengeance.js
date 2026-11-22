import { system } from "@minecraft/server";
import {
  Abyss, Bus, alive, angles, blockAt, intensity, isAir, later, pget, pset, players, putBlock,
} from "./realtime_timeline.js";
import { caveScream, footsteps, whisper } from "./audio_director.js";
import { holdLook, beginLock, endLock } from "./player_possession.js";
import { spawnCrawler, spawnWatcher, giveShard } from "./bosses_ai.js";
import { sayCold } from "./world_voice.js";

const miners = new Map();
const ORE = ["ore", "ancient_debris"];

function isOre(id) {
  if (!id) return false;
  return ORE.some((bit) => id.includes(bit));
}

export function forceCaveSequence(player, loc) {
  if (!alive(player)) return;
  const dim = player.dimension;
  const at = loc || player.location;
  caveScream(player);
  const crawler = spawnCrawler(dim, at);
  try {
    player.onScreenDisplay.setTitle("§c ", { stayDuration: 8, fadeInDuration: 0, fadeOutDuration: 4, subtitle: "§4из камня" });
  } catch (e) {}
  later(16, () => {
    if (!alive(player)) return;
    const back = behind(player, 4);
    spawnWatcher(dim, back, player.id);
    footsteps(player);
  });
  later(28, () => {
    if (!alive(player)) return;
    extinguish(dim, player.location, 7);
    whisper(player);
  });
  later(46, () => {
    if (!alive(player)) return;
    snap(player);
  });
  later(90, () => {
    if (crawler && alive(crawler)) try { crawler.remove(); } catch (e) {}
  });
  if (!Abyss.flags.caveShard) {
    Abyss.flags.caveShard = true;
    later(100, () => { if (alive(player)) giveShard(player, "шахта"); });
  }
  Bus.emit("cave_screamed", { name: player.name });
}

function behind(player, blocks) {
  let yaw = 0;
  try { yaw = player.getRotation().y; } catch (e) {}
  const rad = ((yaw + 180) * Math.PI) / 180;
  return {
    x: player.location.x - Math.sin(rad) * blocks,
    y: player.location.y,
    z: player.location.z + Math.cos(rad) * blocks,
  };
}

function extinguish(dim, loc, radius) {
  for (let x = -radius; x <= radius; x++) {
    for (let y = -2; y <= 3; y++) {
      for (let z = -radius; z <= radius; z++) {
        if (x * x + z * z > radius * radius) continue;
        const block = blockAt(dim, loc.x + x, loc.y + y, loc.z + z);
        if (!block) continue;
        if (block.typeId.includes("torch")) putBlock(dim, block.location.x, block.location.y, block.location.z, "minecraft:air");
      }
    }
  }
}

function snap(player) {
  let yaw = 0;
  try { yaw = player.getRotation().y; } catch (e) {}
  const turned = { x: 0, y: yaw + 180 };
  try { player.teleport(player.location, { rotation: turned }); } catch (e) {}
  const facePos = behind(player, -2);
  // behind() uses current rotation, which we just changed; place watcher 2 blocks along the new look
  const rad = (turned.y * Math.PI) / 180;
  const spot = {
    x: player.location.x - Math.sin(rad) * 2.2,
    y: player.location.y,
    z: player.location.z + Math.cos(rad) * 2.2,
  };
  const watcher = spawnWatcher(player.dimension, spot, player.id);
  beginLock(player, 40);
  if (watcher) {
    const head = watcher.getHeadLocation ? watcher.getHeadLocation() : watcher.location;
    holdLook(player, head);
  }
  caveScream(player);
  sayCold("Наблюдатель уже стоял в том туннеле. Ты сам к нему повернулся.");
  try { player.addEffect("darkness", 80, { amplifier: 0, showParticles: true }); } catch (e) {}
  later(30, () => {
    endLock(player);
    if (watcher && alive(watcher)) try { watcher.remove(); } catch (e) {}
  });
  void facePos;
  void angles;
}

export function initCave() {
  Bus.on("broke", (ev) => {
    const player = ev.player;
    if (!alive(player) || player.location.y >= 45) return;
    if (!isOre(ev.id)) return;
    const st = miners.get(player.id) || { oreTicks: 0, quiet: 0, need: 40 + Math.floor(Math.random() * 21), cool: 0 };
    st.oreTicks += 2;
    st.quiet = 0;
    miners.set(player.id, st);
  });
  system.runInterval(() => {
    for (const player of players()) {
      if (!alive(player)) continue;
      const st = miners.get(player.id);
      if (!st) continue;
      if (st.cool > 0) st.cool -= 1;
      if (player.location.y >= 45) { st.oreTicks = 0; continue; }
      let speed = 0;
      try { const v = player.getVelocity(); speed = Math.hypot(v.x, v.z); } catch (e) {}
      if (speed > 0.22) st.oreTicks = Math.max(0, st.oreTicks - 2);
      st.quiet += 1;
      if (st.quiet > 8) st.oreTicks = Math.max(0, st.oreTicks - 1);
      const need = Math.max(20, st.need / (intensity() > 1 ? 1.4 : 1));
      if (st.oreTicks > need && st.cool <= 0 && pget(player, "abyss_cave_lock", 0) !== system.currentTick) {
        st.oreTicks = 0;
        st.cool = 20 * 180;
        st.need = 40 + Math.floor(Math.random() * 21);
        pset(player, "abyss_cave_lock", 1);
        forceCaveSequence(player, player.location);
      }
    }
  }, 20);
}

void isAir;
