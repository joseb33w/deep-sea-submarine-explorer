import { supabase, APP_ID, TABLES } from './supabaseClient.js'
import { currentUser, userProfile } from './auth.js'
import { SPECIES, MUSEUM_THEMES } from './data.js'

export async function seedSpeciesCatalog() {
  try {
    const { data } = await supabase.from(TABLES.SPECIES_CATALOG).select('id').eq('app_id', APP_ID).limit(1)
    if (data && data.length > 0) return
    const rows = SPECIES.map((species) => ({
      app_id: APP_ID,
      species_key: species.species_key,
      species_name: species.species_name,
      rarity: species.rarity,
      min_depth: species.min_depth,
      max_depth: species.max_depth,
      biome: species.biome,
      glow_color: species.glow_color,
      scientific_blurb: species.scientific_blurb
    }))
    await supabase.from(TABLES.SPECIES_CATALOG).insert(rows)
  } catch (error) {
    console.error('Seed species error:', error)
  }
}

export async function fetchDiscoveries() {
  if (!currentUser) return []
  const { data, error } = await supabase
    .from(TABLES.DISCOVERIES)
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('app_id', APP_ID)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Discoveries error:', error)
    return []
  }
  return data || []
}

export async function saveDiscovery(discovery) {
  if (!currentUser) return null
  try {
    const { data: existing } = await supabase
      .from(TABLES.DISCOVERIES)
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('app_id', APP_ID)
      .eq('species_key', discovery.species_key)
      .limit(1)

    if (existing && existing.length > 0) {
      return existing[0]
    }

    const payload = {
      app_id: APP_ID,
      species_key: discovery.species_key,
      species_name: discovery.species_name,
      rarity: discovery.rarity,
      depth_found: Math.round(discovery.depth_found || 0),
      zone_name: discovery.zone_name,
      biome: discovery.biome,
      is_specimen_collected: !!discovery.is_specimen_collected,
      is_photo_captured: !!discovery.is_photo_captured,
      thumbnail_emoji: discovery.thumbnail_emoji || '🐠',
      notes: discovery.notes || ''
    }

    const { data, error } = await supabase.from(TABLES.DISCOVERIES).insert(payload).select().limit(1)
    if (error) throw error
    return data?.[0] || null
  } catch (error) {
    console.error('Save discovery error:', error)
    return null
  }
}

export async function saveDiveSummary(summary) {
  if (!currentUser) return null
  try {
    const payload = {
      app_id: APP_ID,
      title: summary.title || 'Dive Log',
      max_depth: Math.round(summary.max_depth || 0),
      distance_traveled: Number(summary.distance_traveled || 0),
      specimens_collected: Number(summary.specimens_collected || 0),
      photos_taken: Number(summary.photos_taken || 0),
      oxygen_used: Number(summary.oxygen_used || 0),
      battery_used: Number(summary.battery_used || 0),
      duration_seconds: Number(summary.duration_seconds || 0),
      completed_at: new Date().toISOString()
    }
    const { data, error } = await supabase.from(TABLES.DIVES).insert(payload).select().limit(1)
    if (error) throw error
    return data?.[0] || null
  } catch (error) {
    console.error('Save dive error:', error)
    return null
  }
}

export async function fetchDiveHistory() {
  if (!currentUser) return []
  const { data, error } = await supabase
    .from(TABLES.DIVES)
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('app_id', APP_ID)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) {
    console.error('Dive history error:', error)
    return []
  }
  return data || []
}

export async function fetchMuseumExhibits(ownerUserId = null) {
  const targetUserId = ownerUserId || currentUser?.id
  if (!targetUserId) return []
  const { data, error } = await supabase
    .from(TABLES.MUSEUM_EXHIBITS)
    .select('*')
    .eq('user_id', targetUserId)
    .eq('app_id', APP_ID)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Museum exhibits error:', error)
    return []
  }
  return data || []
}

export async function addExhibitFromDiscovery(discovery, position) {
  if (!currentUser || !discovery?.id) return null
  try {
    const { data: existing } = await supabase
      .from(TABLES.MUSEUM_EXHIBITS)
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('app_id', APP_ID)
      .eq('discovery_id', discovery.id)
      .limit(1)

    if (existing && existing.length > 0) return existing[0]

    const payload = {
      app_id: APP_ID,
      discovery_id: discovery.id,
      species_name: discovery.species_name,
      rarity: discovery.rarity,
      zone_name: discovery.zone_name,
      display_note: discovery.notes || `Recovered from ${discovery.zone_name}`,
      position_x: position.x,
      position_y: position.y,
      position_z: position.z,
      rotation_y: position.rotationY,
      is_featured: false
    }
    const { data, error } = await supabase.from(TABLES.MUSEUM_EXHIBITS).insert(payload).select().limit(1)
    if (error) throw error
    return data?.[0] || null
  } catch (error) {
    console.error('Add exhibit error:', error)
    return null
  }
}

export async function rateMuseum(museumOwnerUserId, score, reviewText) {
  if (!currentUser || currentUser.id === museumOwnerUserId) return null
  try {
    const { data: existing } = await supabase
      .from(TABLES.MUSEUM_RATINGS)
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('app_id', APP_ID)
      .eq('museum_owner_user_id', museumOwnerUserId)
      .limit(1)

    if (existing && existing.length > 0) {
      const { data, error } = await supabase
        .from(TABLES.MUSEUM_RATINGS)
        .update({ score, review_text: reviewText || '' })
        .eq('id', existing[0].id)
        .select()
        .limit(1)
      if (error) throw error
      return data?.[0] || null
    }

    const { data, error } = await supabase
      .from(TABLES.MUSEUM_RATINGS)
      .insert({
        app_id: APP_ID,
        museum_owner_user_id: museumOwnerUserId,
        score,
        review_text: reviewText || ''
      })
      .select()
      .limit(1)
    if (error) throw error
    return data?.[0] || null
  } catch (error) {
    console.error('Rate museum error:', error)
    return null
  }
}

export async function fetchMuseumLeaderboard() {
  try {
    const { data: users, error: usersError } = await supabase
      .from(TABLES.APP_USERS)
      .select('*')
      .eq('app_id', APP_ID)
      .limit(40)
    if (usersError) throw usersError

    const { data: exhibits, error: exhibitsError } = await supabase
      .from(TABLES.MUSEUM_EXHIBITS)
      .select('*')
      .eq('app_id', APP_ID)
    if (exhibitsError) throw exhibitsError

    const { data: ratings, error: ratingsError } = await supabase
      .from(TABLES.MUSEUM_RATINGS)
      .select('*')
      .eq('app_id', APP_ID)
    if (ratingsError) throw ratingsError

    return (users || []).map((user, index) => {
      const userExhibits = (exhibits || []).filter((item) => item.user_id === user.user_id)
      const userRatings = (ratings || []).filter((item) => item.museum_owner_user_id === user.user_id)
      const averageRating = userRatings.length
        ? Math.round((userRatings.reduce((sum, item) => sum + Number(item.score || 0), 0) / userRatings.length) * 10) / 10
        : 0
      return {
        user_id: user.user_id,
        display_name: user.display_name || `Explorer ${index + 1}`,
        avatar_emoji: user.avatar_emoji || '🌊',
        museum_name: user.museum_name || MUSEUM_THEMES[index % MUSEUM_THEMES.length],
        exhibit_count: userExhibits.length,
        average_rating: averageRating,
        rating_count: userRatings.length,
        completeness: Math.round((userExhibits.length / SPECIES.length) * 100)
      }
    }).sort((a, b) => {
      if (b.completeness !== a.completeness) return b.completeness - a.completeness
      return b.average_rating - a.average_rating
    })
  } catch (error) {
    console.error('Leaderboard error:', error)
    return []
  }
}

export function buildMuseumLayout(discoveries) {
  return discoveries
    .filter((item) => item.is_specimen_collected)
    .slice(0, 18)
    .map((item, index) => ({
      discovery: item,
      position: {
        x: ((index % 4) - 1.5) * 8,
        y: 1.2,
        z: -Math.floor(index / 4) * 10,
        rotationY: (index % 2) * 0.3
      }
    }))
}
