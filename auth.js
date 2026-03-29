import { supabase, APP_ID, TABLES } from './supabaseClient.js'

export let currentUser = null
export let userProfile = null

async function ensureProfile(user, displayName) {
  try {
    const { data: existing } = await supabase
      .from(TABLES.APP_USERS)
      .select('*')
      .eq('user_id', user.id)
      .eq('app_id', APP_ID)
      .limit(1)

    if (existing && existing.length > 0) {
      userProfile = existing[0]
      return existing[0]
    }

    const payload = {
      app_id: APP_ID,
      email: user.email,
      display_name: displayName || user.email?.split('@')[0] || 'Explorer',
      avatar_emoji: '🌊',
      museum_name: 'My Deep Sea Museum',
      home_base_depth: 0
    }

    const { data, error } = await supabase.from(TABLES.APP_USERS).insert(payload).select().limit(1)
    if (error) throw error
    userProfile = data?.[0] || payload
    return userProfile
  } catch (error) {
    console.error('Profile error:', error)
    throw error
  }
}

export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'https://sling-gogiapp.web.app/email-confirmed.html'
    }
  })
  if (error) throw error
  if (data.user) {
    currentUser = data.user
    await ensureProfile(data.user, displayName)
  }
  return data
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (data.user) {
    currentUser = data.user
    await ensureProfile(data.user)
  }
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
  currentUser = null
  userProfile = null
}

export async function getSession() {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    currentUser = user
    await ensureProfile(user)
  }
  return currentUser
}

export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      if (session?.user) {
        currentUser = session.user
        await ensureProfile(session.user)
      } else {
        currentUser = null
        userProfile = null
      }
      callback(event, session)
    } catch (error) {
      console.error('Auth change error:', error)
      callback(event, session)
    }
  })
}

export async function updateMuseumName(museumName) {
  if (!currentUser) return null
  const { data, error } = await supabase
    .from(TABLES.APP_USERS)
    .update({ museum_name: museumName })
    .eq('user_id', currentUser.id)
    .eq('app_id', APP_ID)
    .select()
    .limit(1)
  if (error) throw error
  userProfile = data?.[0] || userProfile
  return userProfile
}
