export const BIATHLON_50M = {
  id: 'biathlon-50m',
  label: 'Biathlon 50 m',
  distanceM: 50,
  holeDiameterMm: 5.6, // .22 LR; used by the touch rule
  caliberHint: '.22 LR',
  clickValueMm: null as number | null, // mm at 50 m per sight click; null = hide correction hint (Q3)
  defaults: {
    precisionRounds: 10,
    sightingRounds: 10,
    competitionBoutRoundsPerPosition: 5,
    bothRoundsProne: 5,
    bothRoundsStanding: 5,
  },
} as const;
