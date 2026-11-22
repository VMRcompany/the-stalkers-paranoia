import { world, system, BlockPermutation } from "@minecraft/server";

export const DAY_MS = 86400000;
export const GOAL_MS = 432000000;

export const Bus = {
  map: {},
  on(ev, fn) {
    (this.map[ev] || (this.map[ev] = [])).push(fn);
  },
  emit(ev, payload) {
    const list = this.map[ev] || [];
    for (const fn of list) {
      try { fn(payload); } catch (e) { console.warn("[abyss bus] " + ev + " " + e); }
    }
  },
};

export const Abyss = {
  activeRealMs: 0,
  realDay: 1,
  realDayAnnounced: 1,
  gameDayTracked: -1,
  lastCatastrophe: "",
  catastropheDay: -1,
  catBag: [],
  retroActive: false,
  retroWarned: false,
  fogStage: 1,
  fogForced: 0,
  homes: [],
  flags: {},
  quests: { done: [], announced: "" },
  finaleStage: 0,
  possessionDay: -1,
  windowDay: -1,
  glitches: [],
  returns: {},
  inRealm: {},
};

const PERSIST = [
  "realDay", "realDayAnnounced", "gameDayTracked", "lastCatastrophe", "catastropheDay",
  "catBag", "retroActive", "retroWarned", "fogStage", "fogForced", "homes", "flags",
  "quests", "finaleStage", "possessionDay", "windowDay", "glitches", "returns", "inRealm",
];

let loaded = false;
let lastStamp = 0;
let secondCount = 0;

export function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const blob = world.getDynamicProperty("abyss_blob");
    if (typeof blob === "string" && blob.length) {
      const data = JSON.parse(blob);
      for (const key of PERSIST) {
        if (data[key] !== undefined) Abyss[key] = data[key];
      }
    }
    const ms = world.getDynamicProperty("active_real_ms");
    if (typeof ms === "number" && ms >= 0) Abyss.activeRealMs = ms;
  } catch (e) {
    console.warn("[abyss] load " + e);
  }
  if (!Abyss.flags || typeof Abyss.flags !== "object") Abyss.flags = {};
  if (!Abyss.quests || !Array.isArray(Abyss.quests.done)) Abyss.quests = { done: [], announced: "" };
  if (!Array.isArray(Abyss.homes)) Abyss.homes = [];
  if (!Array.isArray(Abyss.catBag)) Abyss.catBag = [];
  if (!Array.isArray(Abyss.glitches)) Abyss.glitches = [];
  if (!Abyss.returns) Abyss.returns = {};
  if (!Abyss.inRealm) Abyss.inRealm = {};
  Abyss.realDay = realDay();
}

export function saveState() {
  try {
    world.setDynamicProperty("active_real_ms", Abyss.activeRealMs);
    const blob = {};
    for (const key of PERSIST) blob[key] = Abyss[key];
    world.setDynamicProperty("abyss_blob", JSON.stringify(blob));
  } catch (e) {
    console.warn("[abyss] save " + e);
  }
}

export function realDay() {
  return Math.min(5, Math.floor(Abyss.activeRealMs / DAY_MS) + 1);
}

export function intensity() {
  return realDay() >= 3 ? 3 : 1;
}

export function gameDayIndex() {
  try { return world.getDay(); } catch (e) { return Abyss.gameDayTracked < 0 ? 0 : Abyss.gameDayTracked; }
}

export function gameDayNumber() {
  return gameDayIndex() + 1;
}

export function timeOfDay() {
  try { return world.getTimeOfDay(); } catch (e) { return 0; }
}

export function isNight(time) {
  const t = time === undefined ? timeOfDay() : time;
  return t >= 12500 && t <= 23500;
}

export function isThickHours(time) {
  const t = time === undefined ? timeOfDay() : time;
  if (t <= 2000) return true;
  if (t >= 11500 && t <= 23500) return true;
  return false;
}

export function players() {
  try { return world.getAllPlayers(); } catch (e) { return []; }
}

export function alive(entity) {
  try { return !!entity && entity.isValid !== false; } catch (e) { return false; }
}

export function cleanName(name) {
  return String(name || "друг").replace(/§./g, "").slice(0, 32);
}

export function playerById(id) {
  return players().find((p) => p.id === id);
}

export function dimOf(id) {
  try { return world.getDimension(id || "minecraft:overworld"); }
  catch (e) {
    return world.getDimension("minecraft:overworld");
  }
}

export function later(ticks, fn) {
  system.runTimeout(() => {
    try { fn(); } catch (e) { console.warn("[abyss] " + e); }
  }, Math.max(0, ticks | 0));
}

export function every(ticks, fn) {
  system.runInterval(() => {
    try { fn(); } catch (e) { console.warn("[abyss] " + e); }
  }, ticks);
}

export function run(dim, cmd) {
  try { return dim.runCommand(cmd); }
  catch (e) {
    console.warn(cmd + " :: " + e);
    return undefined;
  }
}

export function shake(player, power, seconds) {
  try { player.runCommand(`camerashake add @s ${power} ${seconds} positional`); } catch (e) {}
}

export function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = (a.y || 0) - (b.y || 0);
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function dist2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function angles(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dz) || 0.0001;
  return {
    x: (-Math.atan2(dy, horiz) * 180) / Math.PI,
    y: (Math.atan2(-dx, dz) * 180) / Math.PI,
  };
}

export function blockAt(dim, x, y, z) {
  try { return dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) }); }
  catch (e) { return undefined; }
}

const AIR = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air"]);

export function isAir(block) {
  return !!block && AIR.has(block.typeId);
}

export function isSolid(block) {
  if (!block) return false;
  const id = block.typeId;
  if (AIR.has(id)) return false;
  if (id.includes("water") || id.includes("lava")) return false;
  if (id === "minecraft:short_grass" || id === "minecraft:tall_grass" || id === "minecraft:grass" || id === "minecraft:fern") return false;
  if (id.includes("flower") || id.includes("sapling") || id.includes("torch") || id.includes("sign")) return false;
  if (id.includes("vine") || id.includes("snow_layer") || id.includes("carpet") || id.includes("rail")) return false;
  return true;
}

export function groundPos(dim, x, z, hintY) {
  const top = Math.min(319, Math.floor(hintY) + 8);
  const bot = Math.max(-64, Math.floor(hintY) - 24);
  for (let y = top; y >= bot; y--) {
    const here = blockAt(dim, x, y, z);
    const above = blockAt(dim, x, y + 1, z);
    if (isSolid(here) && above && isAir(above)) {
      return { x: Math.floor(x) + 0.5, y: y + 1, z: Math.floor(z) + 0.5 };
    }
  }
  return { x: Math.floor(x) + 0.5, y: Math.floor(hintY), z: Math.floor(z) + 0.5 };
}

const BUILDING_BITS = [
  "planks", "log", "wood", "door", "fence", "stairs", "slab", "brick", "glass",
  "wool", "concrete", "terracotta", "bed", "lantern", "trapdoor", "wall", "tile",
  "bookshelf", "chest", "barrel", "crafting", "furnace", "smoker", "anvil",
  "ladder", "candle", "carpet", "lectern", "composter", "beehive", "cauldron",
  "deepslate_brick", "stone_brick", "polished_blackstone", "mud_brick", "bamboo_planks",
  "copper", "shulker", "table", "shelf", "torch", "campfire", "chain",
];

export function isBuildingId(typeId) {
  if (!typeId) return false;
  if (typeId === "abyss:cracked_window") return true;
  if (typeId.startsWith("abyss:alpha_")) return true;
  const id = typeId.replace("minecraft:", "");
  for (const bit of BUILDING_BITS) if (id.includes(bit)) return true;
  return false;
}

export function isGlassId(typeId) {
  if (!typeId) return false;
  if (typeId === "abyss:cracked_window") return false;
  if (!typeId.includes("glass")) return false;
  if (typeId.includes("pane")) return false;
  return true;
}

export function rememberHome(dimId, x, y, z) {
  let home = null;
  for (const h of Abyss.homes) {
    if (h.dim === dimId && Math.abs(h.x - x) < 28 && Math.abs(h.z - z) < 28) home = h;
  }
  if (!home) {
    home = { dim: dimId, x, y, z };
    Abyss.homes.push(home);
    if (Abyss.homes.length > 8) Abyss.homes.shift();
  } else {
    home.x = home.x * 0.75 + x * 0.25;
    home.y = y;
    home.z = home.z * 0.75 + z * 0.25;
  }
  return home;
}

export function nearestHome(dimId, x, z) {
  let best = null;
  let bestD = 1e12;
  for (const h of Abyss.homes) {
    if (h.dim !== dimId) continue;
    const d = (h.x - x) * (h.x - x) + (h.z - z) * (h.z - z);
    if (d < bestD) { bestD = d; best = h; }
  }
  return best;
}

export function anchorFor(player) {
  const dim = player.dimension.id;
  const home = nearestHome(dim, player.location.x, player.location.z);
  if (home && dist2(home, player.location) < 160) return home;
  return { dim, x: player.location.x, y: player.location.y, z: player.location.z };
}

export function nearHome(dimId, x, y, z, radius) {
  const h = nearestHome(dimId, x, z);
  if (!h) return false;
  return dist3(h, { x, y, z }) <= radius;
}

export function isProtectedSpot(dimId, x, y, z, typeId) {
  if (isGlassId(typeId)) return false;
  if (!nearHome(dimId, x, y, z, 18)) return false;
  if (isBuildingId(typeId)) return true;
  return nearHome(dimId, x, y, z, 10);
}

export function captureBlock(block) {
  const states = {};
  try {
    const all = block.permutation.getAllStates();
    for (const key of Object.keys(all)) states[key] = all[key];
  } catch (e) {}
  return {
    x: block.location.x,
    y: block.location.y,
    z: block.location.z,
    id: block.typeId,
    states,
  };
}

export function restoreBlock(dim, saved) {
  const block = blockAt(dim, saved.x, saved.y, saved.z);
  if (!block) return false;
  try {
    block.setPermutation(BlockPermutation.resolve(saved.id, saved.states || {}));
    return true;
  } catch (e) {
    try { block.setType(saved.id); return true; } catch (e2) { return false; }
  }
}

export function putBlock(dim, x, y, z, typeId) {
  const block = blockAt(dim, x, y, z);
  if (!block) return false;
  try { block.setType(typeId); return true; }
  catch (e) {
    try {
      run(dim, `setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} ${typeId.replace("minecraft:", "")}`);
      return true;
    } catch (e2) { return false; }
  }
}

export function pget(player, key, fallback) {
  try {
    const v = player.getDynamicProperty(key);
    return v === undefined ? fallback : v;
  } catch (e) { return fallback; }
}

export function pset(player, key, value) {
  try { player.setDynamicProperty(key, value); } catch (e) {}
}

export function setRealDay(n) {
  const day = Math.max(1, Math.min(5, n | 0));
  Abyss.activeRealMs = (day - 1) * DAY_MS;
  Abyss.realDay = day;
  Abyss.realDayAnnounced = day;
  saveState();
  Bus.emit("real_day", day);
  return day;
}

export function statusLines() {
  const ms = Abyss.activeRealMs;
  const hours = ms / 3600000;
  return [
    `§7Реальный день: §f${realDay()}§7 / 5`,
    `§7Онлайн: §f${hours.toFixed(3)} ч §7(${Math.floor(ms)} мс) / 120 ч`,
    `§7Игровой день: §f${gameDayNumber()} §8(getDay ${gameDayIndex()})`,
    `§7Туман: §f${Abyss.fogForced || Abyss.fogStage}`,
    `§7Ретро Alpha: §f${Abyss.retroActive ? "да" : "нет"}`,
    `§7Квест: §f${Abyss.quests.announced || "—"} §7готово §f${(Abyss.quests.done || []).length}`,
    `§7Финал: §f${Abyss.finaleStage}§7 / 5`,
    `§7Катастрофа: §f${Abyss.lastCatastrophe || "—"}`,
    `§7Осколки выдано: §f${Abyss.flags.shardsGiven || 0}`,
    `§7Игроков: §f${players().length}`,
  ];
}

function clockTick() {
  ensureLoaded();
  const now = Date.now();
  if (!lastStamp) lastStamp = now;
  let delta = now - lastStamp;
  lastStamp = now;
  if (delta < 0) delta = 0;
  if (delta > 5000) delta = 5000;
  if (players().length > 0) Abyss.activeRealMs += delta;
  const day = realDay();
  Abyss.realDay = day;
  if (typeof Abyss.realDayAnnounced !== "number") Abyss.realDayAnnounced = day;
  if (day > Abyss.realDayAnnounced) {
    Abyss.realDayAnnounced = day;
    saveState();
    Bus.emit("real_day", day);
  }
  const gd = gameDayIndex();
  if (Abyss.gameDayTracked < 0) Abyss.gameDayTracked = gd;
  else if (gd > Abyss.gameDayTracked) {
    Abyss.gameDayTracked = gd;
    saveState();
    Bus.emit("game_day", gd);
  }
  secondCount += 1;
  if (secondCount % 10 === 0) saveState();
  Bus.emit("second");
}

export function initTimeline() {
  ensureLoaded();
  try {
    world.afterEvents.playerPlaceBlock.subscribe((ev) => {
      try {
        const id = ev.block.typeId;
        if (!isBuildingId(id) && !isGlassId(id)) return;
        const loc = ev.block.location;
        rememberHome(ev.block.dimension.id, loc.x, loc.y, loc.z);
        Abyss.flags.placed = (Abyss.flags.placed || 0) + 1;
        Bus.emit("placed", { player: ev.player, id, loc });
      } catch (e) {}
    });
  } catch (e) { console.warn("[abyss] place " + e); }
  try {
    world.afterEvents.playerBreakBlock.subscribe((ev) => {
      Bus.emit("broke", {
        player: ev.player,
        id: ev.brokenBlockPermutation?.type?.id || ev.brokenBlockPermutation?.typeId || "",
        loc: ev.block.location,
      });
    });
  } catch (e) { console.warn("[abyss] break " + e); }
}

export function startClock() {
  ensureLoaded();
  lastStamp = Date.now();
  system.runInterval(() => {
    try { clockTick(); } catch (e) { console.warn("[abyss clock] " + e); }
  }, 20);
  later(40, () => {
    try { restorePendingGlitches(); } catch (e) {}
  });
}

export function restorePendingGlitches() {
  if (!Abyss.glitches.length) return;
  const left = [];
  for (const entry of Abyss.glitches) {
    const dim = dimOf(entry.dim);
    let pending = false;
    for (const saved of entry.blocks) {
      if (!restoreBlock(dim, saved)) pending = true;
    }
    if (pending) left.push(entry);
  }
  Abyss.glitches = left;
  saveState();
}

export function flag(key, value) {
  if (value === undefined) return !!Abyss.flags[key];
  Abyss.flags[key] = value;
  return value;
}
