import { world, system } from "@minecraft/server";
import {
  Abyss, Bus, alive, dist3, groundPos, later, players, run, saveState,
} from "./realtime_timeline.js";
import { beginLock, endLock, holdLook, isLocked } from "./player_possession.js";
import { playFor } from "./audio_director.js";
import { pushSpecial, clearSpecial } from "./fog_director.js";
import { sayCold } from "./world_voice.js";

export const REALMS = {
  forest: { x: 30000, y: 250, z: 30000, fog: "abyss:fog_forest", title: "Бесконечный Мёртвый Лес" },
  backrooms: { x: 32000, y: 250, z: 30000, fog: "abyss:fog_backrooms", title: "Бесконечное Закулисье" },
  mirror: { x: 34000, y: 250, z: 30000, fog: "abyss:fog_mirror", title: "Зеркальный Дом" },
  mine: { x: 36000, y: 40, z: 30000, fog: "abyss:fog_bloodmine", title: "Кровавая Шахта" },
  citadel: { x: 38000, y: 250, z: 30000, fog: "abyss:fog_citadel", title: "Цитадель Архитектора" },
};

const KEYS = Object.keys(REALMS);
const portals = new Map();
const queue = [];
const lockout = new Map();

function qfill(dimId, a, b, block) {
  queue.push({ dimId, cmd: `fill ${a[0]} ${a[1]} ${a[2]} ${b[0]} ${b[1]} ${b[2]} ${block}` });
}

function buildForest(dimId, o) {
  qfill(dimId, [o.x - 18, o.y - 1, o.z - 18], [o.x + 18, o.y - 1, o.z + 18], "podzol");
  qfill(dimId, [o.x - 18, o.y, o.z - 18], [o.x + 18, o.y + 8, o.z + 18], "air");
  for (let i = -14; i <= 14; i += 7) {
    for (let j = -14; j <= 14; j += 7) {
      qfill(dimId, [o.x + i, o.y, o.z + j], [o.x + i, o.y + 5, o.z + j], "dark_oak_log");
    }
  }
}

function buildBackrooms(dimId, o) {
  qfill(dimId, [o.x - 16, o.y - 1, o.z - 16], [o.x + 16, o.y - 1, o.z + 16], "yellow_concrete");
  qfill(dimId, [o.x - 16, o.y + 4, o.z - 16], [o.x + 16, o.y + 4, o.z + 16], "yellow_concrete");
  qfill(dimId, [o.x - 16, o.y, o.z - 16], [o.x + 16, o.y + 3, o.z + 16], "air");
  qfill(dimId, [o.x - 16, o.y, o.z - 16], [o.x - 16, o.y + 3, o.z + 16], "yellow_concrete");
  qfill(dimId, [o.x + 16, o.y, o.z - 16], [o.x + 16, o.y + 3, o.z + 16], "yellow_concrete");
  qfill(dimId, [o.x - 16, o.y, o.z - 16], [o.x + 16, o.y + 3, o.z - 16], "yellow_concrete");
  qfill(dimId, [o.x - 16, o.y, o.z + 16], [o.x + 16, o.y + 3, o.z + 16], "yellow_concrete");
  qfill(dimId, [o.x - 16, o.y, o.z - 16], [o.x + 16, o.y, o.z + 16], "light_gray_carpet");
  for (let i = -12; i <= 12; i += 6) {
    qfill(dimId, [o.x + i, o.y + 4, o.z], [o.x + i, o.y + 4, o.z], "sea_lantern");
    qfill(dimId, [o.x, o.y + 1, o.z + i], [o.x, o.y + 3, o.z + i], "yellow_concrete");
  }
}

function buildMirror(dimId, o) {
  qfill(dimId, [o.x - 8, o.y - 1, o.z - 8], [o.x + 8, o.y - 1, o.z + 8], "quartz_block");
  qfill(dimId, [o.x - 8, o.y, o.z - 8], [o.x + 8, o.y + 5, o.z + 8], "air");
  qfill(dimId, [o.x - 8, o.y, o.z - 8], [o.x - 8, o.y + 5, o.z + 8], "quartz_block");
  qfill(dimId, [o.x + 8, o.y, o.z - 8], [o.x + 8, o.y + 5, o.z + 8], "quartz_block");
  qfill(dimId, [o.x - 8, o.y, o.z - 8], [o.x + 8, o.y + 5, o.z - 8], "glass");
  qfill(dimId, [o.x - 8, o.y, o.z + 8], [o.x + 8, o.y + 5, o.z + 8], "glass");
  qfill(dimId, [o.x - 8, o.y + 5, o.z - 8], [o.x + 8, o.y + 5, o.z + 8], "quartz_block");
  qfill(dimId, [o.x - 1, o.y, o.z + 6], [o.x + 1, o.y, o.z + 6], "white_carpet");
}

function buildMine(dimId, o) {
  qfill(dimId, [o.x - 14, o.y - 1, o.z - 6], [o.x + 22, o.y - 1, o.z + 6], "netherrack");
  qfill(dimId, [o.x - 14, o.y + 4, o.z - 6], [o.x + 22, o.y + 4, o.z + 6], "netherrack");
  qfill(dimId, [o.x - 14, o.y, o.z - 6], [o.x + 22, o.y + 3, o.z + 6], "air");
  qfill(dimId, [o.x - 14, o.y, o.z - 6], [o.x + 22, o.y + 3, o.z - 6], "netherrack");
  qfill(dimId, [o.x - 14, o.y, o.z + 6], [o.x + 22, o.y + 3, o.z + 6], "netherrack");
  qfill(dimId, [o.x, o.y, o.z - 1], [o.x + 8, o.y, o.z + 1], "abyss:slimy_flesh_block");
  qfill(dimId, [o.x + 4, o.y + 1, o.z], [o.x + 4, o.y + 1, o.z], "redstone_torch");
}

function buildCitadel(dimId, o) {
  qfill(dimId, [o.x - 14, o.y - 1, o.z - 14], [o.x + 14, o.y - 1, o.z + 14], "obsidian");
  qfill(dimId, [o.x - 14, o.y, o.z - 14], [o.x + 14, o.y + 10, o.z + 14], "air");
  qfill(dimId, [o.x - 12, o.y, o.z - 12], [o.x - 12, o.y + 8, o.z - 12], "crying_obsidian");
  qfill(dimId, [o.x + 12, o.y, o.z - 12], [o.x + 12, o.y + 8, o.z - 12], "crying_obsidian");
  qfill(dimId, [o.x - 12, o.y, o.z + 12], [o.x - 12, o.y + 8, o.z + 12], "blackstone");
  qfill(dimId, [o.x + 12, o.y, o.z + 12], [o.x + 12, o.y + 8, o.z + 12], "blackstone");
  qfill(dimId, [o.x - 2, o.y, o.z - 2], [o.x + 2, o.y, o.z + 2], "crying_obsidian");
}

const BUILDERS = {
  forest: buildForest,
  backrooms: buildBackrooms,
  mirror: buildMirror,
  mine: buildMine,
  citadel: buildCitadel,
};

export function ensureRealm(key) {
  if (Abyss.flags["built_" + key]) return;
  Abyss.flags["built_" + key] = true;
  const o = REALMS[key];
  BUILDERS[key]("minecraft:overworld", o);
  saveState();
  later(30, () => {
    const dim = world.getDimension("minecraft:overworld");
    openRift(dim, { x: o.x + 10, y: o.y, z: o.z + 2 }, "return:" + key, 20 * 60 * 60 * 24);
  });
}

export function openRift(dim, loc, realm, life) {
  const spot = groundPos(dim, loc.x, loc.z, loc.y);
  let ent;
  try { ent = dim.spawnEntity("abyss:rift", spot); } catch (e) { return undefined; }
  portals.set(ent.id, { realm, life: life || 20 * 150, age: 0 });
  return ent;
}

function realmOfKey(token) {
  if (!token) return null;
  if (token.startsWith("return:")) return { back: true, key: token.slice(7) };
  return REALMS[token] ? { back: false, key: token, data: REALMS[token] } : null;
}

export function enterRealm(player, key) {
  const data = REALMS[key];
  if (!data || !alive(player) || isLocked(player)) return;
  ensureRealm(key);
  Abyss.returns[player.name] = {
    x: player.location.x, y: player.location.y, z: player.location.z, dim: player.dimension.id,
  };
  Abyss.inRealm[player.name] = key;
  saveState();
  beginLock(player, 120);
  playFor(player, "abyss.daisy_bell_corrupted", 0.5, 0.7);
  try {
    player.camera.fade({ fadeTime: { fadeInTime: 0.6, holdTime: 3.6, fadeOutTime: 0.8 }, fadeColor: { red: 0, green: 0, blue: 0 } });
  } catch (e) {}
  const rise = { x: player.location.x, y: player.location.y + 6, z: player.location.z };
  holdLook(player, rise);
  sayCold(`${player.name} проваливается. ${data.title}.`);
  later(100, () => {
    if (!alive(player)) return;
    try {
      player.teleport({ x: data.x + 1.5, y: data.y + 1, z: data.z + 1.5 }, { dimension: world.getDimension("minecraft:overworld") });
    } catch (e) {
      try { player.teleport({ x: data.x + 1.5, y: data.y + 1, z: data.z + 1.5 }); } catch (e2) {}
    }
    endLock(player);
    pushSpecial(data.fog);
    lockout.set(player.id, 80);
    try { player.onScreenDisplay.setTitle(`§5${data.title}`, { stayDuration: 40, fadeInDuration: 5, fadeOutDuration: 10 }); } catch (e) {}
    Bus.emit("rift_enter", { name: player.name, key });
  });
}

export function leaveRealm(player) {
  if (!alive(player)) return;
  const back = Abyss.returns[player.name];
  const key = Abyss.inRealm[player.name];
  beginLock(player, 80);
  try {
    player.camera.fade({ fadeTime: { fadeInTime: 0.4, holdTime: 2.2, fadeOutTime: 0.6 }, fadeColor: { red: 0, green: 0, blue: 0 } });
  } catch (e) {}
  later(70, () => {
    if (!alive(player)) return;
    if (back) {
      try { player.teleport({ x: back.x, y: back.y, z: back.z }, { dimension: world.getDimension(back.dim || "minecraft:overworld") }); }
      catch (e) { try { player.teleport(back); } catch (e2) {} }
    }
    endLock(player);
    clearSpecial();
    delete Abyss.inRealm[player.name];
    saveState();
    lockout.set(player.id, 80);
    sayCold(`${player.name} выбрался. Карта делает вид, что ничего не открывалось.`);
    Bus.emit("rift_return", { name: player.name, key });
  });
}

export function forceRift(player) {
  if (!alive(player)) return;
  const key = KEYS[Math.floor(Math.random() * KEYS.length)];
  const spot = groundPos(player.dimension, player.location.x + 2, player.location.z + 1, player.location.y);
  openRift(player.dimension, spot, key, 20 * 180);
  sayCold(`Разлом «${REALMS[key].title}» открыт у ног.`);
}

function tickPortals() {
  for (const [id, info] of portals) {
    let ent;
    try { ent = world.getEntity(id); } catch (e) { ent = undefined; }
    if (!alive(ent)) { portals.delete(id); continue; }
    info.age += 10;
    if (info.life > 0 && info.age > info.life && !String(info.realm).startsWith("return:")) {
      try { ent.remove(); } catch (e) {}
      portals.delete(id);
      continue;
    }
    for (const player of players()) {
      if (!alive(player) || player.dimension !== ent.dimension) continue;
      if ((lockout.get(player.id) || 0) > 0) continue;
      if (dist3(player.location, ent.location) > 1.7) continue;
      if (isLocked(player)) continue;
      const parsed = realmOfKey(info.realm);
      if (!parsed) continue;
      if (parsed.back) leaveRealm(player);
      else enterRealm(player, parsed.key);
    }
  }
  for (const [id, left] of lockout) lockout.set(id, left - 10);
}

function ambient() {
  if ((Abyss.flags.ambientRifts || 0) > 2) return;
  const p = players().filter(alive)[0];
  if (!p) return;
  const roll = Math.floor(Math.random() * 3);
  let spot;
  if (roll === 0) spot = groundPos(p.dimension, p.location.x + 8, p.location.z + 4, p.location.y + 4);
  else if (roll === 1) spot = groundPos(p.dimension, p.location.x + 2, p.location.z - 6, p.location.y);
  else spot = { x: p.location.x + 3, y: p.location.y, z: p.location.z };
  const key = KEYS[Math.floor(Math.random() * KEYS.length)];
  if (openRift(p.dimension, spot, key, 20 * 90)) {
    Abyss.flags.ambientRifts = (Abyss.flags.ambientRifts || 0) + 1;
    sayCold("Щель в " + ["кроне", "стене", "полу"][roll] + ". Она узкая ровно на одного.");
  }
}

export function initRifts() {
  system.runInterval(() => {
    const job = queue.shift();
    if (!job) return;
    try { world.getDimension(job.dimId).runCommand(job.cmd); } catch (e) {}
  }, 1);
  system.runInterval(() => {
    try { tickPortals(); } catch (e) { console.warn("[abyss rift] " + e); }
  }, 10);
  Bus.on("second", () => {
    if (Math.random() < 0.02 * (players().length ? 1 : 0)) ambient();
  });
  try {
    world.afterEvents.playerSpawn.subscribe((ev) => {
      if (ev.initialSpawn) return;
      const name = ev.player.name;
      system.run(() => {
        if (!Abyss.inRealm[name]) return;
        const back = Abyss.returns[name];
        if (!back) return;
        try { ev.player.teleport(back, { dimension: world.getDimension(back.dim || "minecraft:overworld") }); } catch (e) {}
        delete Abyss.inRealm[name];
        clearSpecial();
        saveState();
      });
    });
  } catch (e) {}
}

void run;
void dist3;
