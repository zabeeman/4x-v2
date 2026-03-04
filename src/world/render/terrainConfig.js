export const terrainConfig = {
  // ПАЛИТРЫ (каждый цвет = отдельный тайл-variant)
  waterColors: [
    "#7ad7ff", "#55c3ff", "#2faeff", "#1490f0",
    "#0b74d4", "#0859b3", "#043f8c", "#022a5f",
  ],

  sandColors: ["#e7d79a", "#d8c481", "#cbb370"],
  grassColors: ["#7fcf6a", "#6fbe5a", "#5cab4a", "#4f9a3c"],
  dirtColors: ["#a77b4f", "#93643f", "#7e5334"],
  forestColors: ["#3f7f3f", "#2f6c32", "#255827", "#1e4820"],
  mountainColors: ["#7e7a73", "#6a6762", "#565450", "#45423e"],

  // ПРАВИЛА МАППИНГА (нормализованная высота суши e = 0..1)
  thresholds: {
    beachElev: 0.07,       // пляж возле воды
    dirtElev: 0.55,        // начиная отсюда чаще земля (почва)
    mountainElev: 0.84,    // горы
    forestMaxElev: 0.78,   // леса не лезут слишком высоко
  },

  // МОИСТНОСТЬ (m = 0..1)
  moisture: {
    forestMin: 0.62,       // если влажность выше — лес
    dryMax: 0.35,          // если влажность ниже — чаще почва
  },

  // ВОДА
  water: {
    lakeMaxDepthLevel: 2,  // озёра не такие глубокие (ограничим темноту)
    riverDepthLevel: 1,    // реки = “мелководье”
  },
};