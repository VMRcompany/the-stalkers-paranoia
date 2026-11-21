import { Abyss, Bus, alive, anchorFor, blockAt, dist3, gameDayIndex, isGlassId, later, players, putBlock, saveState } from "./realtime_timeline.js";
import { playAt } from "./audio_director.js";
import { sayCold } from "./world_voice.js";

export function forceCrack(player) {
  if (!alive(player)) return false;
  const home = anchorFor(player);
  const dim = player.dimension;
  let best = null;
  let bestD = 1e9;
  for (let y = -3; y <= 8; y++) {
    for (let x = -16; x <= 16; x++) {
      for (let z = -16; z <= 16; z++) {
        const block = blockAt(dim, home.x + x, home.y + y, home.z + z);
        if (!block || !isGlassId(block.typeId)) continue;
        const d = dist3(home, block.location);
        if (d < bestD) { bestD = d; best = block; }
      }
    }
  }
  if (!best) {
    sayCold("Сталкер ищет стекло. В этом доме нет целого окна — пока.");
    return false;
  }
  const loc = best.location;
  putBlock(dim, loc.x, loc.y, loc.z, "abyss:cracked_window");
  playAt(dim, loc, "abyss.window_slam", 1, 1);
  let face;
  try { face = dim.spawnEntity("abyss:window_face", { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 }); } catch (e) {}
  later(40, () => { try { if (face && face.isValid) face.remove(); } catch (e) {} });
  sayCold("Удар. Трещина останется. Стекло больше не разобьётся до конца — и не станет снова целым.");
  Abyss.flags.cracked = true;
  Bus.emit("window_cracked", { name: player.name });
  saveState();
  return true;
}

export function initWindows() {
  Bus.on("game_day", (gd) => {
    if (Abyss.windowDay === gd) return;
    Abyss.windowDay = gd;
    saveState();
    later(20 * 40, () => {
      const p = players().filter(alive)[0];
      if (p) forceCrack(p);
    });
  });
}
