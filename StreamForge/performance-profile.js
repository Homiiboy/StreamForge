// Bounded transfer profiles: preserve adaptive throttling and the existing RAM limits.
export const PERFORMANCE_PROFILES = Object.freeze({
  gentle: Object.freeze({ start: 2, max: 4, label: 'Schonend' }),
  balanced: Object.freeze({ start: 4, max: 8, label: 'Ausgewogen' }),
  fast: Object.freeze({ start: 6, max: 12, label: 'Schnell' })
});
export function performanceProfile(value) {
  return PERFORMANCE_PROFILES[value] || PERFORMANCE_PROFILES.balanced;
}
