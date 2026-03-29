import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://xhhmxabftbyxrirvvihn.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_NZHoIxqqpSvVBP8MrLHCYA_gmg1AbN-'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export const APP_ID = 'deep-sea-submarine-explorer'
export const BUCKET = 'uNMexs7BYTXQ2_deep-sea-submarine-explorer_submarine_photos'

export const TABLES = {
  APP_USERS: 'uNMexs7BYTXQ2_deep_sea_submarine_explorer_app_users',
  DISCOVERIES: 'uNMexs7BYTXQ2_deep_sea_submarine_explorer_discoveries',
  DIVES: 'uNMexs7BYTXQ2_deep_sea_submarine_explorer_dives',
  MUSEUM_EXHIBITS: 'uNMexs7BYTXQ2_deep_sea_submarine_explorer_museum_exhibits',
  MUSEUM_RATINGS: 'uNMexs7BYTXQ2_deep_sea_submarine_explorer_museum_ratings',
  SPECIES_CATALOG: 'uNMexs7BYTXQ2_deep_sea_submarine_explorer_species_catalog'
}
