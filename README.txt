Патч: процедурные текстуры для infinite-рендера (чанки)

1) Добавь файл:
   src/world/infinite/terrainTextures.js

2) Замени файл:
   src/world/infinite/chunkManager.js

3) (Опционально) обнови:
   src/world/infinite/infiniteConfig.js
   (добавляет флаги useTextures/textureVariants/enableSlopeShade/dryTextureMoist)

После этого запусти проект — вместо плоской заливки тайлы будут иметь процедурные текстуры (волны/зерно/трещины/кроны и т.д.)
