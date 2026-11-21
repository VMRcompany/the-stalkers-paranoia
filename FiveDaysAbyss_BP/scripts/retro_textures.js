import { system } from "@minecraft/server";
import {
  Abyss, Bus, alive, blockAt, gameDayIndex, isNight, players, putBlock, saveState, timeOfDay,
} from "./realtime_timeline.js";
import { pushSpecial } from "./fog_director.js";
import { sayCold, warnRetro } from "./world_voice.js";

const MAP = {
  "minecraft:grass_block": "abyss:alpha_grass",
  "minecraft:cobblestone": "abyss:alpha_cobblestone",
  "minecraft:mossy_cobblestone": "abyss:alpha_cobblestone",
  "minecraft:oak_planks": "abyss:alpha_planks",
  "minecraft:spruce_planks": "abyss:alpha_planks",
  "minecraft:birch_planks": "abyss:alpha_planks",
  "minecraft:jungle_planks": "abyss:alpha_planks",
  "minecraft:dark_oak_planks": "abyss:alpha_planks",
  "minecraft:acacia_planks": "abyss:alpha_planks",
  "minecraft:oak_leaves": "abyss:alpha_leaves",
  "minecraft:spruce_leaves": "abyss:alpha_leaves",
  "minecraft:birch_leaves": "abyss:alpha_leaves",
  "minecraft:jungle_leaves": "abyss:alpha_leaves",
  "minecraft:dark_oak_leaves": "abyss:alpha_leaves",
};

const cursors = new Map();

export function convertAround(player, budget) {
  if (!alive(player)) return 0;
  const state = cursors.get(player.id) || { i: 0 };
  let done = 0;
  const radius = 18;
  const total = (radius * 2 + 1) ** 2;
  const y0 = Math.floor(player.location.y);
  while (done < budget && state.i < total * 6) {
    const n = state.i;
    const layer = Math.floor(n / ((radius * 2 + 1) ** 2));
    const rest = n % ((radius * 2 + 1) ** 2);
    const span = radius * 2 + 1;
    const dx = (rest % span) - radius;
    const dz = Math.floor(rest / span) - radius;
    const y = y0 + (layer % 6) - 2;
    const block = blockAt(player.dimension, player.location.x + dx, y, player.location.z + dz);
    if (block && MAP[block.typeId]) {
      putBlock(player.dimension, block.location.x, block.location.y, block.location.z, MAP[block.typeId]);
      done += 1;
    }
    state.i += 1;
    if (state.i >= total * 6) state.i = 0;
  }
  cursors.set(player.id, state);
  return done;
}

export function forceRetro() {
  const already = !!Abyss.retroActive;
  Abyss.retroActive = true;
  Abyss.retroWarned = true;
  saveState();
  pushSpecial("abyss:alpha_nostalgia_fog");
  if (!already) {
    sayCold("Утро пахнет старым миром. Трава слишком зелёная. Булыжник слишком простой. Вы это уже видели, когда ещё не было имён.");
    Bus.emit("retro_on", {});
  }
  for (const p of players()) convertAround(p, 80);
}

export function initRetro() {
  Bus.on("second", () => {
    if (!Abyss.retroWarned && gameDayIndex() === 0 && isNight(timeOfDay()) && timeOfDay() >= 21000) {
      Abyss.retroWarned = true;
      saveState();
      warnRetro();
    }
    if (!Abyss.retroActive && gameDayIndex() >= 1) forceRetro();
  });
  Bus.on("game_day", (gd) => {
    if (gd >= 1) forceRetro();
  });
  system.runInterval(() => {
    if (!Abyss.retroActive) return;
    for (const p of players().filter(alive)) convertAround(p, 10);
  }, 5);
}
