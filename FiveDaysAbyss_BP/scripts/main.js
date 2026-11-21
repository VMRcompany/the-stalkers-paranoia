import { system } from "@minecraft/server";
import { Bus, initTimeline, startClock } from "./realtime_timeline.js";
import { initAudio, tickAudio } from "./audio_director.js";
import { initVoice } from "./world_voice.js";
import { initFog } from "./fog_director.js";
import { initPsych } from "./psychological_chat.js";
import { initUnderbed } from "./underbed_hand.js";
import { initPossession } from "./player_possession.js";
import { initHerobrine } from "./herobrine_notch.js";
import { initStalkers } from "./stalkers_ai.js";
import { initBosses } from "./bosses_ai.js";
import { initCatastrophes } from "./daily_catastrophes.js";
import { initGlitches } from "./world_glitches.js";
import { initSkyEyes } from "./sky_eyes.js";
import { initCave } from "./cave_vengeance.js";
import { initWindows } from "./window_cracks.js";
import { initRetro } from "./retro_textures.js";
import { initRifts } from "./void_rifts.js";
import { initQuests } from "./quests_engine.js";
import { initEnding } from "./ending_ritual.js";
import { initDebug } from "./debug_commands.js";

system.run(() => {
  try {
    initTimeline();
    initAudio();
    initVoice();
    initFog();
    initPsych();
    initUnderbed();
    initPossession();
    initHerobrine();
    initStalkers();
    initBosses();
    initRifts();
    initCatastrophes();
    initGlitches();
    initSkyEyes();
    initCave();
    initWindows();
    initRetro();
    initQuests();
    initEnding();
    initDebug();
    Bus.on("second", () => tickAudio());
    startClock();
    console.warn("[abyss] THE STALKERS: Paranoia loaded for 1.26.31");
  } catch (e) {
    console.warn("[abyss boot] " + String(e));
  }
});
