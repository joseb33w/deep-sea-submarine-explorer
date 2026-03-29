export const SPECIES = [
  {
    species_key: 'lantern_jelly',
    species_name: 'Lantern Jelly',
    rarity: 'common',
    min_depth: 80,
    max_depth: 420,
    biome: 'glow_fields',
    glow_color: '#62f1ff',
    scientific_blurb: 'A drifting jelly with a pulse-like bioluminescent ring.',
    emoji: '🪼',
    color: '#62f1ff',
    specimenScale: 0.9,
    points: 10
  },
  {
    species_key: 'abyss_angler',
    species_name: 'Abyss Angler',
    rarity: 'rare',
    min_depth: 320,
    max_depth: 980,
    biome: 'abyssal_plain',
    glow_color: '#ff9adf',
    scientific_blurb: 'A patient predator that uses a rose-colored lure to hunt.',
    emoji: '🐟',
    color: '#ff9adf',
    specimenScale: 1.05,
    points: 24
  },
  {
    species_key: 'vent_shrimp',
    species_name: 'Vent Shrimp',
    rarity: 'common',
    min_depth: 500,
    max_depth: 1400,
    biome: 'thermal_vents',
    glow_color: '#ffd166',
    scientific_blurb: 'Heat-tolerant shrimp clustering around mineral chimneys.',
    emoji: '🦐',
    color: '#ffd166',
    specimenScale: 0.75,
    points: 12
  },
  {
    species_key: 'ghost_ray',
    species_name: 'Ghost Ray',
    rarity: 'rare',
    min_depth: 250,
    max_depth: 900,
    biome: 'wreck_corridor',
    glow_color: '#9be7ff',
    scientific_blurb: 'A translucent ray that glides silently through wreckage.',
    emoji: '🛸',
    color: '#9be7ff',
    specimenScale: 1.15,
    points: 28
  },
  {
    species_key: 'crown_squid',
    species_name: 'Crown Squid',
    rarity: 'legendary',
    min_depth: 900,
    max_depth: 1800,
    biome: 'trench_gate',
    glow_color: '#b987ff',
    scientific_blurb: 'An elusive squid with a halo of violet photophores.',
    emoji: '🦑',
    color: '#b987ff',
    specimenScale: 1.25,
    points: 48
  },
  {
    species_key: 'ember_eel',
    species_name: 'Ember Eel',
    rarity: 'rare',
    min_depth: 650,
    max_depth: 1500,
    biome: 'thermal_vents',
    glow_color: '#ff8a5b',
    scientific_blurb: 'An eel with ember-orange bands that flicker near vents.',
    emoji: '🪱',
    color: '#ff8a5b',
    specimenScale: 1.0,
    points: 26
  }
]

export const POINTS_OF_INTEREST = [
  { id: 'wreck_1', type: 'wreck', label: 'Sunken Frigate', x: -180, y: -260, z: -420, depth: 420, color: '#7aa6c2' },
  { id: 'cave_1', type: 'cave', label: 'Echo Cavern', x: 220, y: -360, z: -780, depth: 780, color: '#4ecdc4' },
  { id: 'vent_1', type: 'vent', label: 'Thermal Vent Field', x: -240, y: -620, z: -1200, depth: 1200, color: '#ff8a5b' },
  { id: 'wreck_2', type: 'wreck', label: 'Research Sub Wreck', x: 340, y: -520, z: -980, depth: 980, color: '#9be7ff' },
  { id: 'cave_2', type: 'cave', label: 'Blue Rift', x: 80, y: -840, z: -1520, depth: 1520, color: '#b987ff' }
]

export const MUSEUM_THEMES = [
  'Bioluminescent Wonders',
  'Wrecks and Relics',
  'Vent Life Gallery',
  'Trench Mysteries',
  'Abyssal Hall of Fame'
]
