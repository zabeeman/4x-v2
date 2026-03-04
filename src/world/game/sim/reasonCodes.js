export const PlacementReasonCode = Object.freeze({
  FORBIDDEN_SURFACE: 'FORBIDDEN_SURFACE',
  NOT_IN_BUILD_ZONE: 'NOT_IN_BUILD_ZONE',
  TOO_FAR_FROM_BUILD_ZONE: 'TOO_FAR_FROM_BUILD_ZONE',
  NEEDS_RESOURCE_NODE: 'NEEDS_RESOURCE_NODE',
  NEEDS_COAST: 'NEEDS_COAST',
  FOOTPRINT_OCCUPIED: 'FOOTPRINT_OCCUPIED',
  LIMIT_REACHED_CITY: 'LIMIT_REACHED_CITY',
  LIMIT_REACHED_PLAYER: 'LIMIT_REACHED_PLAYER',
});

export const placementReasonI18n = Object.freeze({
  ru: {
    [PlacementReasonCode.FORBIDDEN_SURFACE]: 'Неподходящая поверхность',
    [PlacementReasonCode.NOT_IN_BUILD_ZONE]: 'Вне зоны застройки',
    [PlacementReasonCode.TOO_FAR_FROM_BUILD_ZONE]: 'Слишком далеко от зоны застройки',
    [PlacementReasonCode.NEEDS_RESOURCE_NODE]: 'Нужен подходящий ресурсный узел',
    [PlacementReasonCode.NEEDS_COAST]: 'Нужно побережье',
    [PlacementReasonCode.FOOTPRINT_OCCUPIED]: 'Место занято',
    [PlacementReasonCode.LIMIT_REACHED_CITY]: 'Достигнут лимит на город',
    [PlacementReasonCode.LIMIT_REACHED_PLAYER]: 'Достигнут лимит на игрока',
  },
});

export function localizePlacementReason(reason, locale = 'ru') {
  if (!reason?.code) return '';
  const dict = placementReasonI18n[locale] ?? placementReasonI18n.ru;
  return dict[reason.code] ?? reason.code;
}
