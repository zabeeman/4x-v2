export const terrainPalette = {
  // 10 уровней глубины: -1..-10
  water: [
    "#86ddff", "#6ad0ff", "#4ec3ff", "#33b4ff", "#1aa1f5",
    "#0f89df", "#0a6fc6", "#0656a8", "#043d82", "#02285a",
  ],

  sand:  ["#efe0aa", "#e2cf92", "#d6bf7a", "#c9ae66"],
  grass: ["#87d96f", "#79cc62", "#6bbd55", "#5daf49", "#4fa13d", "#449233"],
  dirt:  ["#b18458", "#a1764e", "#916845", "#805a3c", "#6e4d34"],
  forest:["#3f7f3f", "#356f37", "#2c5f2f", "#245127", "#1d4421"],
  mount: ["#a9a59d", "#908d86", "#77756f", "#5f5d58", "#4b4945", "#373532"],

  thresholds: {
    // пляж у моря (по абсолютной высоте)
    beachBand: 0.018,

    // по нормализованной высоте суши
    dirtElev: 0.55,
    mountainElev: 0.78,

    forestMinMoist: 0.62,
    dryMaxMoist: 0.35,
    forestMaxElev: 0.75,
  },
};