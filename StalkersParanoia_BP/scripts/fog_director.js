import { world } from "@minecraft/server";
import { Abyss, Bus, players, alive, isThickHours, realDay, gameDayNumber, gameDayIndex, intensity, run, saveState, timeOfDay } from "./realtime_timeline.js";
import { loopNamed, stopLoop } from "./audio_director.js";

const STAGE_ID = "abyss_stage";
const THICK_ID = "abyss_thick";
const SPECIAL_ID = "abyss_special";
const NIGHT_ID = "abyss_first_night";

export function isFirstBlackNight() {
  const t = timeOfDay();
  return gameDayIndex() === 0 && t >= 13000 && t <= 23000;
}

function pushFog(player, fogId, handle) {
  try { player.runCommand(`fog @s remove ${handle}`); } catch (e) {}
  try { player.runCommand(`fog @s push ${fogId} ${handle}`); } catch (e) {}
}

function popFog(player, handle) {
  try { player.runCommand(`fog @s remove ${handle}`); } catch (e) {}
}

function retireComputers() {
  if (Abyss.flags.computersRetired) return;
  if (gameDayIndex() < 1) return;
  Abyss.flags.computersRetired = true;
  stopLoop("computers");
  saveState();
}

export function applyFog(player) {
  if (!alive(player)) return;
  if (isFirstBlackNight() && !Abyss.flags.computersRetired) {
    popFog(player, STAGE_ID);
    popFog(player, THICK_ID);
    popFog(player, SPECIAL_ID);
    pushFog(player, "abyss:first_night_black_fog", NIGHT_ID);
    loopNamed("computers");
    return;
  }
  popFog(player, NIGHT_ID);
  retireComputers();
  if (Abyss.flags.specialFog) {
    pushFog(player, Abyss.flags.specialFog, SPECIAL_ID);
  } else {
    popFog(player, SPECIAL_ID);
  }
  const stage = Abyss.fogForced || naturalStage();
  Abyss.fogStage = stage;
  pushFog(player, `abyss:fog_stage_${stage}`, STAGE_ID);
  if (!Abyss.flags.specialFog && (isThickHours() || stage >= 8)) pushFog(player, "abyss:fog_thick", THICK_ID);
  else popFog(player, THICK_ID);
}

export function naturalStage() {
  const real = realDay();
  const game = Math.min(5, gameDayNumber());
  let stage = Math.max(real, Math.min(game, 5));
  stage = Math.min(10, stage + (gameDayNumber() > 3 ? 1 : 0));
  if (real >= 5) stage = 10;
  else if (real >= 4) stage = Math.max(stage, 8);
  else if (real >= 3) stage = Math.max(stage, 6);
  if (Abyss.retroActive) stage = Math.max(stage, 4);
  return Math.max(1, Math.min(10, stage));
}

export function fogDistance() {
  const stage = Abyss.fogForced || Abyss.fogStage || naturalStage();
  const table = [140, 140, 124, 108, 94, 78, 66, 54, 46, 40, 34];
  let dist = table[stage] || 80;
  if (isThickHours() || stage >= 8) dist = Math.min(dist, 32);
  return dist;
}

export function setFogStage(n) {
  if (n === 0 || n === "off") {
    Abyss.fogForced = 0;
    Abyss.flags.specialFog = "";
    for (const p of players()) {
      popFog(p, STAGE_ID);
      popFog(p, THICK_ID);
      popFog(p, SPECIAL_ID);
      popFog(p, NIGHT_ID);
    }
    return;
  }
  const stage = Math.max(1, Math.min(10, n | 0));
  Abyss.fogForced = stage;
  for (const p of players()) applyFog(p);
}

export function pushSpecial(fogId) {
  Abyss.flags.specialFog = fogId;
  for (const p of players()) applyFog(p);
}

export function clearSpecial() {
  Abyss.flags.specialFog = Abyss.retroActive ? "abyss:alpha_nostalgia_fog" : "";
  for (const p of players()) applyFog(p);
}

export function initFog() {
  let tick = 0;
  Bus.on("second", () => {
    tick += 1;
    if (tick % Math.max(1, 4 - intensity()) !== 0 && tick > 2) return;
    for (const p of players()) applyFog(p);
  });
  Bus.on("real_day", () => {
    Abyss.fogForced = 0;
    for (const p of players()) applyFog(p);
  });
}

void world;
void run;
