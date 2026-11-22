import { world, system } from "@minecraft/server";
import { Bus, cleanName, players, alive } from "./realtime_timeline.js";

const cool = {};

function ready(key, seconds) {
  const now = Date.now();
  if ((cool[key] || 0) > now) return false;
  cool[key] = now + seconds * 1000;
  return true;
}

export function say(text) {
  try { world.sendMessage(text); } catch (e) {}
}

export function sayWorld(text) {
  say(`§7[МИР]: ${text}`);
}

export function sayCold(text) {
  say(`§8[МИР]: ${text}`);
}

export function sayHot(text) {
  say(`§c[МИР]: ${text}`);
}

export function mock(kind) {
  const lines = {
    eclipse: [
      "Красиво, правда? Это ваша кровь красится о небо.",
      "Не прячьтесь в доме. Я и там красный.",
    ],
    rifts: [
      "Пять дверей. Ни одна не ведёт обратно той же дорогой.",
      "Вы сами оставили в стенах щели. Я только раздвинул их.",
    ],
    colossus: [
      "Не смотрите ему в ступни. Смотрите, как дрожит ваш дом.",
      "Он не ломает стены. Ему достаточно, что вы это представили.",
    ],
    mimics: [
      "Посчитайте друзей. Теперь посчитайте ещё раз.",
      "Один из них улыбается моим ртом.",
    ],
    choir: [
      "Я развёл вас, чтобы слышать каждого отдельно.",
      "Музыка старая. Вы в ней — новый куплет.",
    ],
    retro: [
      "Узнаёте? Так выглядел мир, когда у него ещё не было вас.",
      "Завтра уже наступило вчера.",
    ],
    hand: [
      "Она жила здесь раньше кровати.",
    ],
    notch: [
      "Не отводи взгляд. Он считает это грубостью.",
    ],
    herobrine: [
      "Кто-то стоит там, где кончается свет. Он не моб.",
    ],
  };
  const pool = lines[kind] || ["Я всё ещё здесь."];
  sayCold(pool[Math.floor(Math.random() * pool.length)]);
}

const BUILD = [
  "Дом. Хорошо. У домов тоже есть углы, и в углах темно.",
  "Стучите громче. Мне так проще считать ваши руки.",
  "Крыша не спасёт от того, что уже внутри.",
  "Вы строите убежище. Я запоминаю, где дверь.",
];

const MINE = [
  "Ты спускаешься. Здесь я слышу тебя лучше.",
  "Руда никуда не денется. Ты — денешься.",
  "Факелы внизу живут меньше, чем наверху. Ты заметишь.",
  "Не оборачивайся, пока кирка ещё поёт. Я прошу из вежливости.",
];

const ALONE = [
  "Остальные ушли. Ты ведь не против компании?",
  "Тишина — это тоже мой голос.",
  "Один в темноте. Так честнее.",
  "Если окликнешь друга и ответит не он — не переспрашивай.",
];

const QUESTIONS = [
  "Ты уверен, что это твой друг пишет?",
  "Сколько вас было, когда вы заходили?",
  "Почему ты оглянулся?",
  "Ты помнишь, кто лёг спать первым?",
  "Чей ник ты прочёл только что — и был ли он онлайн?",
  "Если я повторю твоё имя чужим голосом, ты обернёшься?",
  "Что ты оставишь, когда таймер дойдёт до пятого дня?",
  "Тебе уже казалось, что в доме на одного больше?",
];

export function commentBuild(name) {
  if (!ready("build", 50)) return;
  sayCold(`${cleanName(name)}. ${BUILD[Math.floor(Math.random() * BUILD.length)]}`);
}

export function commentMine(name) {
  if (!ready("mine", 40)) return;
  sayCold(`${cleanName(name)}. ${MINE[Math.floor(Math.random() * MINE.length)]}`);
}

export function commentAlone(name) {
  if (!ready("alone", 70)) return;
  sayCold(`${cleanName(name)}... ${ALONE[Math.floor(Math.random() * ALONE.length)]}`);
}

export function ask(name) {
  const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  sayCold(name ? `${cleanName(name)}. ${q}` : q);
}

export function warnRetro() {
  if (!ready("retro-warn", 10)) return;
  sayCold("Завтра утром мир покажется тебе знакомым. Слишком знакомым. Не ищи старые текстуры в сундуке — они придут сами.");
}

function greet(name, initial) {
  const sent = world.getDynamicProperty("welcome_sent") === true;
  if (!sent) {
    world.setDynamicProperty("welcome_sent", true);
    say(`§7[МИР]: Привет, ${cleanName(name)}... Это самое обычное выживание. Стройте дом, добывайте ресурсы, отдыхайте. Но знайте — в итоге всё здесь станет совсем необычным...`);
    return;
  }
  if (initial) {
    sayCold(`Ещё один. Здравствуй, ${cleanName(name)}. Я вас уже считал.`);
  }
}

export function initVoice() {
  Bus.on("placed", (ev) => {
    if (!alive(ev.player)) return;
    const n = (ev.player.__abyssPlaced || 0) + 1;
    ev.player.__abyssPlaced = n;
    if (n === 12) commentBuild(ev.player.name);
  });
  Bus.on("broke", (ev) => {
    if (!alive(ev.player)) return;
    if (ev.player.location.y < 45) commentMine(ev.player.name);
  });
  Bus.on("real_day", (day) => {
    sayCold(day >= 5
      ? "Пятый настоящий день. Я больше не притворяюсь картой."
      : `Прошёл ещё один настоящий день. Это день ${day}. Оффлайн я вас не считаю. Я умею ждать.`);
  });
  Bus.on("second", () => {
    const list = players();
    if (list.length !== 1) return;
    const p = list[0];
    if (!alive(p)) return;
    const night = (() => { try { return world.getTimeOfDay() > 12500; } catch (e) { return false; } })();
    if ((night || p.location.y < 42) && ready("alone-scan", 80)) commentAlone(p.name);
  });
}

try {
  world.afterEvents.playerSpawn.subscribe((event) => {
    const name = event.player?.name || "друг";
    const initial = !!event.initialSpawn;
    system.run(() => greet(name, initial));
  });
} catch (e) {
  console.warn("[abyss voice] " + e);
}
