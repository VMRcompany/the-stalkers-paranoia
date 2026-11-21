import { world } from "@minecraft/server";
import {
  Abyss, Bus, alive, anchorFor, gameDayIndex, groundPos, later, players, saveState, shake,
} from "./realtime_timeline.js";
import { loopNamed, playAll, stopLoop } from "./audio_director.js";
import { clearSpecial, pushSpecial } from "./fog_director.js";
import { mock, sayCold } from "./world_voice.js";
import { spawnColossus, spawnEcho, spawnMimic } from "./bosses_ai.js";
import { spawnStalker } from "./stalkers_ai.js";
import { openRift } from "./void_rifts.js";

const ORDER = ["eclipse", "rifts", "colossus", "mimics", "choir"];

function nextKind() {
  if (!Abyss.catBag.length) {
    const bag = ORDER.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
    }
    if (bag[0] === Abyss.lastCatastrophe) bag.push(bag.shift());
    Abyss.catBag = bag;
  }
  const kind = Abyss.catBag.shift();
  Abyss.lastCatastrophe = kind;
  return kind;
}

function eclipse() {
  pushSpecial("abyss:blood_eclipse");
  try { world.setTimeOfDay(18000); } catch (e) {}
  loopNamed("dread");
  sayCold("Солнце село не туда. Оно село в вас.");
  mock("eclipse");
  for (const p of players()) {
    spawnStalker(p);
    try { p.addEffect("weakness", 200, { amplifier: 0, showParticles: false }); } catch (e) {}
  }
  let left = 90;
  const id = "eclipse";
  const timer = () => {
    left -= 1;
    for (const p of players().filter(alive)) {
      try { p.dimension.spawnParticle("minecraft:redstone_wire_dust_particle", { x: p.location.x, y: p.location.y + 2, z: p.location.z }); } catch (e) {}
    }
    if (left <= 0) {
      clearSpecial();
      stopLoop("dread");
      sayCold("Красное отпустило. След остался на руках, даже если руки чистые.");
      Bus.emit("catastrophe_end", id);
      return;
    }
    later(20, timer);
  };
  later(20, timer);
}

function rifts() {
  const list = players().filter(alive);
  const origin = list[0] ? anchorFor(list[0]) : { x: 0, y: 80, z: 0 };
  const dim = list[0] ? list[0].dimension : world.getDimension("minecraft:overworld");
  const keys = ["forest", "backrooms", "mirror", "mine", "citadel"];
  for (let i = 0; i < 5; i++) {
    const ang = (Math.PI * 2 * i) / 5;
    const spot = groundPos(dim, origin.x + Math.cos(ang) * 16, origin.z + Math.sin(ang) * 16, origin.y);
    openRift(dim, spot, keys[i], 20 * 180);
  }
  sayCold("Пять щелей вокруг дома. Они дышат в такт.");
  mock("rifts");
  playAll("abyss.daisy_bell_corrupted", 0.7, 0.8);
  Bus.emit("catastrophe_end", "rifts");
}

function colossus() {
  const p = players().filter(alive)[0];
  if (!p) return;
  spawnColossus(p, true);
  mock("colossus");
  for (const pl of players()) shake(pl, 0.55, 2);
  later(20 * 50, () => Bus.emit("catastrophe_end", "colossus"));
}

function mimics() {
  const list = players().filter(alive);
  if (!list.length) return;
  const home = anchorFor(list[0]);
  list.forEach((p, i) => {
    const spot = { x: home.x + i * 1.5, y: home.y, z: home.z + 1 };
    spawnMimic(p.dimension, spot, p.name);
  });
  spawnMimic(list[0].dimension, { x: home.x - 1, y: home.y, z: home.z }, list[0].name);
  sayCold("В доме стало теснее. Никто не входил через дверь.");
  mock("mimics");
  Bus.emit("catastrophe_end", "mimics");
}

function choir() {
  const list = players().filter(alive);
  pushSpecial("abyss:fog_stage_10");
  loopNamed("mashup");
  sayCold("Я развожу вас по разным карманам одного тумана.");
  mock("choir");
  list.forEach((p, i) => {
    const ang = (Math.PI * 2 * i) / Math.max(1, list.length);
    const spot = groundPos(p.dimension, p.location.x + Math.cos(ang) * 55, p.location.z + Math.sin(ang) * 55, p.location.y);
    try { p.teleport(spot); } catch (e) {}
    try { p.addEffect("darkness", 200, { amplifier: 0, showParticles: true }); } catch (e) {}
    spawnEcho(p.dimension, { x: spot.x + 3, y: spot.y, z: spot.z }, p.name);
    shake(p, 0.25, 1);
  });
  later(20 * 50, () => {
    stopLoop("mashup");
    clearSpecial();
    sayCold("Хор смолк. Вы всё ещё не вместе. Это уже ваша забота.");
    Bus.emit("catastrophe_end", "choir");
  });
}

const RUN = { eclipse, rifts, colossus, mimics, choir };

export function forceCatastrophe(kind) {
  const use = RUN[kind] ? kind : nextKind();
  Abyss.lastCatastrophe = use;
  Abyss.catastropheDay = gameDayIndex();
  saveState();
  sayCold(`Катастрофа дня: ${label(use)}.`);
  Bus.emit("catastrophe", use);
  try { RUN[use](); } catch (e) { console.warn("[abyss cat] " + e); }
  return use;
}

function label(kind) {
  return {
    eclipse: "Кровавое затмение",
    rifts: "Прорыв Разломов",
    colossus: "Марш Колосса",
    mimics: "Нашествие Мимиков",
    choir: "Искажённый Хор",
  }[kind] || kind;
}

function arm(day, delay) {
  if (Abyss.catastropheDay === day) return;
  later(delay, () => {
    if (Abyss.catastropheDay === gameDayIndex()) return;
    if (players().filter(alive).length === 0) return;
    forceCatastrophe(nextKind());
  });
}

export function initCatastrophes() {
  Bus.on("game_day", (gd) => arm(gd, 20 * 20));
  later(20 * 30, () => {
    if (Abyss.catastropheDay !== gameDayIndex()) arm(gameDayIndex(), 20 * 300);
  });
}
