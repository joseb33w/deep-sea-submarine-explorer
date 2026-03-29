import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js'
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js'
import { supabase } from './supabaseClient.js'
import { signUp, signIn, signOut, getSession, onAuthChange, currentUser, userProfile, updateMuseumName } from './auth.js'
import {
  seedSpeciesCatalog,
  fetchDiscoveries,
  saveDiscovery,
  saveDiveSummary,
  fetchDiveHistory,
  fetchMuseumExhibits,
  addExhibitFromDiscovery,
  fetchMuseumLeaderboard,
  rateMuseum,
  buildMuseumLayout
} from './api.js'
import { SPECIES, POINTS_OF_INTEREST } from './data.js'

const state = {
  currentView: 'dive',
  authMode: 'login',
  dive: {
    oxygen: 100,
    battery: 100,
    depth: 0,
    distance: 0,
    maxDepth: 0,
    photosTaken: 0,
    specimensCollected: 0,
    startTime: Date.now(),
    activeScan: null,
    cargo: [],
    discoveries: [],
    lastSurfaceAt: Date.now(),
    objective: 'Descend into the glow fields and scan rare lifeforms.',
    hudCollapsed: false,
    cinematicMode: false
  },
  museum: {
    exhibits: [],
    leaderboard: [],
    selectedMuseumOwner: null,
    tourMode: false
  },
  history: [],
  touch: {
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
    targetYawDelta: 0,
    targetPitchDelta: 0,
    yawVelocity: 0,
    pitchVelocity: 0
  },
  movement: {
    forward: false,
    backward: false,
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false
  },
  sceneReady: false,
  museumSceneReady: false,
  error: '',
  shellBound: false,
  sidebarDirty: true
}

const ui = {}
const world = {
  renderer: null,
  scene: null,
  camera: null,
  submarine: null,
  oceanFloor: null,
  ambient: null,
  dirLight: null,
  particles: null,
  creatures: [],
  pois: [],
  clock: new THREE.Clock(),
  lastFrame: performance.now(),
  animationFrameId: null,
  museumRenderer: null,
  museumScene: null,
  museumCamera: null,
  museumControls: null,
  museumExhibitMeshes: [],
  museumAnimationFrameId: null,
  diveCanvasHandlersBound: false,
  diveCanvas: null,
  resizeBound: false,
  lastNearestSignalKey: '',
  lastSidebarSignature: ''
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = message
  toast.style.borderColor = isError ? 'rgba(255,107,107,0.3)' : 'rgba(143,199,230,0.18)'
  toast.style.color = isError ? '#ffd7d7' : '#e8f7ff'
  toast.classList.add('show')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400)
}

function setError(message) {
  state.error = message
  const banner = document.getElementById('error-banner')
  if (banner) {
    banner.textContent = message
    banner.classList.toggle('hidden', !message)
  }
}

function markSidebarDirty() {
  state.sidebarDirty = true
}

function rarityBadge(rarity) {
  return `<span class="badge ${rarity}">${rarity.toUpperCase()}</span>`
}

function renderAuth() {
  cleanupDiveScene()
  cleanupMuseumScene()
  document.getElementById('app').innerHTML = `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="brand-kicker">🌊 Deep Sea Expedition Network</div>
        <h1 class="auth-title">Deep Sea Submarine Explorer</h1>
        <p class="auth-sub">Pilot a 3D submarine through glowing trenches, salvage wrecks, collect specimens, photograph rare creatures, and build a museum other explorers can tour.</p>
        <div class="auth-tabs">
          <button class="tab-btn ${state.authMode === 'login' ? 'active' : ''}" data-auth-tab="login">Login</button>
          <button class="tab-btn ${state.authMode === 'signup' ? 'active' : ''}" data-auth-tab="signup">Sign Up</button>
        </div>
        <form id="auth-form">
          <div class="input-group ${state.authMode === 'signup' ? '' : 'hidden'}" id="display-name-group">
            <label class="input-label" for="display-name">Explorer Name</label>
            <input class="input" id="display-name" placeholder="Captain Mira" />
          </div>
          <div class="input-group">
            <label class="input-label" for="email">Email</label>
            <input class="input" id="email" type="email" placeholder="captain@abyss.io" required />
          </div>
          <div class="input-group">
            <label class="input-label" for="password">Password</label>
            <input class="input" id="password" type="password" placeholder="••••••••" required />
          </div>
          <button class="primary-btn" type="submit">${state.authMode === 'login' ? 'Enter the Submarine' : 'Create Explorer Account'}</button>
        </form>
        <div id="auth-message" class="message"></div>
      </div>
    </div>
  `

  try {
    document.querySelectorAll('[data-auth-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.authMode = button.dataset.authTab
        renderAuth()
      })
    })

    document.getElementById('auth-form').addEventListener('submit', async (event) => {
      event.preventDefault()
      const message = document.getElementById('auth-message')
      message.textContent = ''
      message.className = 'message'
      const email = document.getElementById('email').value.trim()
      const password = document.getElementById('password').value.trim()
      const displayName = document.getElementById('display-name')?.value.trim()
      try {
        if (state.authMode === 'signup') {
          await signUp(email, password, displayName)
          message.className = 'message success'
          message.textContent = 'Account created. Check your email confirmation link, then log in.'
        } else {
          await signIn(email, password)
          await bootstrapApp()
        }
      } catch (error) {
        console.error('Auth submit error:', error)
        message.className = 'message error'
        message.textContent = error.message || 'Unable to authenticate.'
      }
    })
  } catch (error) {
    console.error('Render auth error:', error)
  }
}

function appShell() {
  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="logo-wrap">
          <div class="logo-badge">🚢</div>
          <div>
            <h1 class="logo-title">Deep Sea Submarine Explorer</h1>
            <p class="logo-sub">Dive, discover, collect, and curate your 3D museum</p>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="ghost-btn" id="surface-btn">Surface & Refuel</button>
          <button class="ghost-btn" id="logout-btn">Logout</button>
        </div>
      </header>
      <div class="layout">
        <aside class="sidebar" id="sidebar"></aside>
        <main class="main-view" id="main-view"></main>
      </div>
      <nav class="navbar">
        <div class="nav-grid">
          <button class="nav-btn" data-nav="dive">Dive</button>
          <button class="nav-btn" data-nav="collection">Collection</button>
          <button class="nav-btn" data-nav="museum">Museum</button>
          <button class="nav-btn" data-nav="leaderboard">Museums</button>
        </div>
      </nav>
      <div class="toast" id="toast"></div>
      <div class="modal" id="rate-modal">
        <div class="modal-card">
          <h3>Rate Museum</h3>
          <p class="muted small">Leave a score and optional note for this curator.</p>
          <div class="input-group">
            <label class="input-label" for="museum-score">Score (1-5)</label>
            <input class="input" id="museum-score" type="number" min="1" max="5" value="5" />
          </div>
          <div class="input-group">
            <label class="input-label" for="museum-review">Review</label>
            <textarea class="textarea" id="museum-review" rows="4" placeholder="Beautiful bioluminescent layout..."></textarea>
          </div>
          <div class="modal-actions">
            <button class="ghost-btn" id="close-rate-modal">Cancel</button>
            <button class="primary-btn" id="submit-rate-modal">Submit Rating</button>
          </div>
        </div>
      </div>
    </div>
  `
  state.shellBound = false
}

function getSidebarSignature() {
  return JSON.stringify({
    displayName: userProfile?.display_name || 'Explorer',
    museumName: userProfile?.museum_name || 'My Deep Sea Museum',
    email: currentUser?.email || '',
    oxygen: Math.round(state.dive.oxygen),
    battery: Math.round(state.dive.battery),
    depth: Math.round(state.dive.depth),
    maxDepth: Math.round(state.dive.maxDepth),
    photosTaken: state.dive.photosTaken,
    specimensCollected: state.dive.specimensCollected,
    cargo: state.dive.cargo.map((item) => `${item.species_key}:${item.depth_found}`).join('|'),
    discoveries: state.dive.discoveries.slice(0, 5).map((item) => `${item.species_key}:${item.is_photo_captured ? 1 : 0}:${item.is_specimen_collected ? 1 : 0}`).join('|'),
    leaderboard: (state.museum.leaderboard || []).slice(0, 4).map((entry) => `${entry.user_id}:${entry.completeness}:${entry.average_rating || 0}`).join('|')
  })
}

function renderSidebar(force = false) {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return
  const signature = getSidebarSignature()
  if (!force && !state.sidebarDirty && world.lastSidebarSignature === signature) return

  const discoveryCount = state.dive.discoveries.length
  const cargoCount = state.dive.cargo.length
  sidebar.innerHTML = `
    <section class="panel user-card">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Explorer Profile</h2>
          <div class="panel-sub">Your expedition identity</div>
        </div>
      </div>
      <div class="user-row">
        <div class="avatar-pill">
          <div class="avatar-circle">${userProfile?.avatar_emoji || '🌊'}</div>
          <div>
            <strong>${userProfile?.display_name || 'Explorer'}</strong>
            <div class="muted small">${currentUser?.email || ''}</div>
          </div>
        </div>
      </div>
      <div class="input-group" style="margin-top:14px;">
        <label class="input-label" for="museum-name-input">Museum Name</label>
        <input class="input" id="museum-name-input" value="${userProfile?.museum_name || 'My Deep Sea Museum'}" />
      </div>
      <button class="ghost-btn" id="save-museum-name">Save Museum Name</button>
    </section>
    <section class="panel stats-card">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Dive Systems</h2>
          <div class="panel-sub">Monitor your vessel in real time</div>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><span class="muted small">Depth</span><strong>${Math.round(state.dive.depth)} m</strong></div>
        <div class="stat-box"><span class="muted small">Max Depth</span><strong>${Math.round(state.dive.maxDepth)} m</strong></div>
        <div class="stat-box"><span class="muted small">Photos</span><strong>${state.dive.photosTaken}</strong></div>
        <div class="stat-box"><span class="muted small">Specimens</span><strong>${state.dive.specimensCollected}</strong></div>
      </div>
      <div class="meter-wrap">
        <div>
          <div class="meter-label"><span>Oxygen</span><span>${Math.round(state.dive.oxygen)}%</span></div>
          <div class="meter"><div class="meter-fill oxygen" style="width:${state.dive.oxygen}%"></div></div>
        </div>
        <div>
          <div class="meter-label"><span>Battery</span><span>${Math.round(state.dive.battery)}%</span></div>
          <div class="meter"><div class="meter-fill battery" style="width:${state.dive.battery}%"></div></div>
        </div>
        <div>
          <div class="meter-label"><span>Hull Pressure Margin</span><span>${Math.max(0, Math.round(100 - state.dive.depth / 20))}%</span></div>
          <div class="meter"><div class="meter-fill depth" style="width:${Math.max(5, 100 - state.dive.depth / 20)}%"></div></div>
        </div>
      </div>
    </section>
    <section class="panel cargo-card">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Cargo Hold</h2>
          <div class="panel-sub">Specimens ready for museum placement</div>
        </div>
      </div>
      <div class="cargo-list">
        ${cargoCount ? state.dive.cargo.map((item) => `
          <div class="cargo-item">
            <strong>${item.thumbnail_emoji || '🧪'} ${item.species_name}</strong>
            <div class="muted small">Found at ${item.depth_found} m in ${item.zone_name}</div>
            <div class="badge-row">
              ${rarityBadge(item.rarity)}
              <span class="badge">Ready for museum</span>
            </div>
          </div>
        `).join('') : '<div class="cargo-item"><strong>Empty hold</strong><div class="muted small">Collect specimens during your dive to fill this space.</div></div>'}
      </div>
    </section>
    <section class="panel collection-card">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Discovery Log</h2>
          <div class="panel-sub">Your rare species archive</div>
        </div>
      </div>
      <div class="collection-list">
        ${discoveryCount ? state.dive.discoveries.slice(0, 5).map((item) => `
          <div class="collection-item">
            <strong>${item.thumbnail_emoji || '🐠'} ${item.species_name}</strong>
            <div class="muted small">${item.biome} · ${item.depth_found} m</div>
            <div class="badge-row">
              ${rarityBadge(item.rarity)}
              ${item.is_photo_captured ? '<span class="badge">📷 Photo</span>' : ''}
              ${item.is_specimen_collected ? '<span class="badge">🧪 Specimen</span>' : ''}
            </div>
          </div>
        `).join('') : '<div class="collection-item"><strong>No discoveries yet</strong><div class="muted small">Scan glowing creatures and points of interest on your first dive.</div></div>'}
      </div>
      <div class="inline-actions">
        <button class="ghost-btn" data-nav-trigger="collection">View Full Collection</button>
        <button class="ghost-btn" data-nav-trigger="museum">Open Museum</button>
      </div>
    </section>
    <section class="panel leader-card">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Museum Race</h2>
          <div class="panel-sub">Compete for the most complete collection</div>
        </div>
      </div>
      <div class="leader-list">
        ${(state.museum.leaderboard || []).slice(0, 4).map((entry, index) => `
          <div class="leader-item">
            <strong>#${index + 1} ${entry.avatar_emoji} ${entry.display_name}</strong>
            <div class="muted small">${entry.museum_name}</div>
            <div class="badge-row">
              <span class="badge">${entry.completeness}% complete</span>
              <span class="badge">⭐ ${entry.average_rating || 0}</span>
            </div>
          </div>
        `).join('') || '<div class="leader-item"><strong>No museums yet</strong><div class="muted small">Be the first to curate a collection.</div></div>'}
      </div>
    </section>
  `

  try {
    document.getElementById('save-museum-name')?.addEventListener('click', async () => {
      try {
        const nextName = document.getElementById('museum-name-input').value.trim()
        if (!nextName) return showToast('Museum name cannot be empty.', true)
        await updateMuseumName(nextName)
        markSidebarDirty()
        showToast('Museum name updated.')
        renderSidebar(true)
        renderScreen()
      } catch (error) {
        console.error('Museum name error:', error)
        showToast('Unable to save museum name.', true)
      }
    })

    sidebar.querySelectorAll('[data-nav-trigger]').forEach((button) => {
      button.addEventListener('click', () => {
        state.currentView = button.dataset.navTrigger
        renderScreen()
      })
    })
  } catch (error) {
    console.error('Sidebar bind error:', error)
  }

  world.lastSidebarSignature = signature
  state.sidebarDirty = false
}

function renderDiveScreen() {
  const hudCollapsedClass = state.dive.hudCollapsed ? 'compact' : ''
  const cinematicClass = state.dive.cinematicMode ? 'cinematic' : ''
  return `
    <section class="screen ${state.currentView === 'dive' ? 'active' : ''}" id="screen-dive">
      <div class="gameplay-shell ${cinematicClass}" id="gameplay-shell">
        <div class="canvas-wrap"><canvas id="scene"></canvas></div>
        <div class="hud">
          <div class="hud-top">
            <div class="glass objective-box ${hudCollapsedClass}">
              <div class="hud-header-row">
                <div class="hud-copy">
                  <div class="objective-title">Current Mission</div>
                  <div class="objective-text">${state.dive.objective}</div>
                </div>
                <button class="hud-toggle" id="toggle-hud-btn" aria-label="Toggle HUD">${state.dive.hudCollapsed ? '＋' : '－'}</button>
              </div>
              <div class="scan-meta">
                <span class="badge">O₂ ${Math.round(state.dive.oxygen)}%</span>
                <span class="badge">Battery ${Math.round(state.dive.battery)}%</span>
                <span class="badge">Depth ${Math.round(state.dive.depth)} m</span>
              </div>
            </div>
            <div class="glass scan-box ${hudCollapsedClass}">
              <div class="hud-header-row">
                <div class="hud-copy">
                  <div class="scan-title">Nearest Signal</div>
                  <div id="scan-details">Sweep the waters to locate creatures, vents, wrecks, and caves.</div>
                </div>
                <button class="hud-toggle" id="toggle-cinematic-btn" aria-label="Toggle cinematic mode">${state.dive.cinematicMode ? '⤢' : '⤡'}</button>
              </div>
            </div>
          </div>
          <div class="hud-bottom">
            <div class="glass minimap"><canvas id="minimap"></canvas></div>
            <div class="glass controls-box ${hudCollapsedClass}">
              <strong>Touch & Pilot</strong>
              <p>Drag on open water to look around. Use the thumb cluster for movement, depth control, boost, and scanning. Long-press suppression is limited to the control buttons so copy and paste still work in forms and other UI.</p>
            </div>
          </div>
        </div>
        <div class="floating-controls">
          <div class="control-utility-row">
            <button class="chip-btn utility" id="photo-btn">📷</button>
          </div>
          <div class="joystick-cluster" aria-label="Submarine controls">
            <button class="chip-btn up" data-move="up">⬆</button>
            <button class="chip-btn forward" data-move="forward">▲</button>
            <button class="chip-btn down" data-move="down">⬇</button>
            <button class="chip-btn left" data-move="left">◀</button>
            <button class="chip-btn center" id="scan-btn">🔎</button>
            <button class="chip-btn right" data-move="right">▶</button>
            <button class="chip-btn boost" data-move="boost">⚡</button>
            <button class="chip-btn backward" data-move="backward">▼</button>
            <button class="chip-btn scan" data-move="none" style="visibility:hidden; pointer-events:none;">•</button>
          </div>
        </div>
        <div class="error-banner hidden" id="error-banner"></div>
      </div>
    </section>
  `
}

function renderCollectionScreen() {
  const discoveries = state.dive.discoveries
  return `
    <section class="screen ${state.currentView === 'collection' ? 'active' : ''}" id="screen-collection">
      <div class="screen-scroll">
        <div class="screen-hero">
          <div class="hero-card panel">
            <h2 class="screen-title">Collection Log</h2>
            <p>Every scan, specimen pickup, and photo is logged here. Build toward a complete abyssal archive and unlock museum prestige.</p>
          </div>
          <div class="hero-card panel">
            <h2 class="screen-title">Dive History</h2>
            <p>${state.history.length ? `You have logged ${state.history.length} dives so far.` : 'Your dive summaries will appear here after you surface.'}</p>
          </div>
        </div>
        <div class="hero-metrics">
          <div class="metric-card panel"><span class="muted small">Unique Species</span><strong>${discoveries.length}</strong></div>
          <div class="metric-card panel"><span class="muted small">Specimens in Cargo</span><strong>${state.dive.cargo.length}</strong></div>
          <div class="metric-card panel"><span class="muted small">Photos Taken</span><strong>${state.dive.photosTaken}</strong></div>
          <div class="metric-card panel"><span class="muted small">Completion</span><strong>${Math.round((discoveries.length / SPECIES.length) * 100)}%</strong></div>
        </div>
        <div class="grid-two">
          <div class="panel collection-card">
            <div class="panel-header"><div><h3 class="panel-title">Species Archive</h3><div class="panel-sub">Bioluminescent life and rare finds</div></div></div>
            <div class="collection-list">
              ${discoveries.length ? discoveries.map((item) => `
                <div class="collection-item">
                  <strong>${item.thumbnail_emoji || '🐠'} ${item.species_name}</strong>
                  <div class="muted small">${item.zone_name} · ${item.depth_found} m · ${item.biome}</div>
                  <div class="badge-row">
                    ${rarityBadge(item.rarity)}
                    ${item.is_photo_captured ? '<span class="badge">📷 Photographed</span>' : ''}
                    ${item.is_specimen_collected ? '<span class="badge">🧪 Collected</span>' : ''}
                  </div>
                  <div class="muted small" style="margin-top:8px;">${item.notes || 'No curator notes yet.'}</div>
                </div>
              `).join('') : '<div class="collection-item"><strong>Nothing logged</strong><div class="muted small">Use scan mode in the dive view to discover your first lifeform.</div></div>'}
            </div>
          </div>
          <div class="panel collection-card">
            <div class="panel-header"><div><h3 class="panel-title">Recent Dives</h3><div class="panel-sub">Surface summaries and expedition stats</div></div></div>
            <div class="collection-list">
              ${state.history.length ? state.history.map((dive) => `
                <div class="collection-item">
                  <strong>${dive.title || 'Dive Log'}</strong>
                  <div class="muted small">Max depth ${Math.round(dive.max_depth || 0)} m · ${Math.round(dive.distance_traveled || 0)} m traveled</div>
                  <div class="badge-row">
                    <span class="badge">🧪 ${dive.specimens_collected || 0}</span>
                    <span class="badge">📷 ${dive.photos_taken || 0}</span>
                    <span class="badge">⏱ ${Math.round((dive.duration_seconds || 0) / 60)} min</span>
                  </div>
                </div>
              `).join('') : '<div class="collection-item"><strong>No dive history yet</strong><div class="muted small">Surface after exploring to save your expedition summary.</div></div>'}
            </div>
          </div>
        </div>
      </div>
    </section>
  `
}

function renderMuseumScreen() {
  return `
    <section class="screen ${state.currentView === 'museum' ? 'active' : ''}" id="screen-museum">
      <div class="screen-scroll">
        <div class="screen-hero">
          <div class="hero-card panel">
            <h2 class="screen-title">${userProfile?.museum_name || 'My Deep Sea Museum'}</h2>
            <p>Arrange your collected specimens into a 3D exhibit hall. Other players can tour your museum and rate its completeness and atmosphere.</p>
          </div>
          <div class="hero-card panel">
            <h2 class="screen-title">Exhibit Progress</h2>
            <p>${state.museum.exhibits.length} exhibit pieces currently placed. Use the auto-curate button to transform your cargo into a guided gallery.</p>
          </div>
        </div>
        <div class="inline-actions" style="margin-bottom:16px;">
          <button class="primary-btn" id="auto-curate-btn" style="width:auto;">Auto Curate Museum</button>
          <button class="ghost-btn" id="refresh-museum-btn">Refresh Gallery</button>
        </div>
        <div class="grid-two">
          <div class="panel museum-card">
            <div class="panel-header"><div><h3 class="panel-title">3D Museum Tour</h3><div class="panel-sub">Orbit to inspect exhibits</div></div></div>
            <div style="position:relative; min-height:420px; border-radius:20px; overflow:hidden; background:rgba(255,255,255,0.03);">
              <canvas id="museum-scene" style="width:100%; height:420px; display:block;"></canvas>
            </div>
          </div>
          <div class="panel museum-card">
            <div class="panel-header"><div><h3 class="panel-title">Placed Exhibits</h3><div class="panel-sub">Specimens currently on display</div></div></div>
            <div class="museum-list">
              ${state.museum.exhibits.length ? state.museum.exhibits.map((item) => `
                <div class="museum-item">
                  <strong>${item.species_name}</strong>
                  <div class="muted small">${item.zone_name} · ${item.rarity}</div>
                  <div class="muted small" style="margin-top:8px;">${item.display_note || 'Recovered from a recent dive.'}</div>
                </div>
              `).join('') : '<div class="museum-item"><strong>No exhibits yet</strong><div class="muted small">Collect specimens, then auto-curate them into your museum.</div></div>'}
            </div>
          </div>
        </div>
      </div>
    </section>
  `
}

function renderLeaderboardScreen() {
  return `
    <section class="screen ${state.currentView === 'leaderboard' ? 'active' : ''}" id="screen-leaderboard">
      <div class="screen-scroll">
        <div class="screen-hero">
          <div class="hero-card panel">
            <h2 class="screen-title">Museum Tours</h2>
            <p>Browse other explorers’ museums, compare completeness, and rate the best curated underwater collections.</p>
          </div>
        </div>
        <div class="panel leader-card">
          <div class="panel-header"><div><h3 class="panel-title">Global Curator Board</h3><div class="panel-sub">Sorted by completeness, then by ratings</div></div></div>
          <div class="leader-list">
            ${state.museum.leaderboard.length ? state.museum.leaderboard.map((entry, index) => `
              <div class="leader-item">
                <strong>#${index + 1} ${entry.avatar_emoji} ${entry.display_name}</strong>
                <div class="muted small">${entry.museum_name}</div>
                <div class="badge-row">
                  <span class="badge">${entry.exhibit_count} exhibits</span>
                  <span class="badge">${entry.completeness}% complete</span>
                  <span class="badge">⭐ ${entry.average_rating || 0} (${entry.rating_count || 0})</span>
                </div>
                <div class="inline-actions">
                  <button class="ghost-btn" data-tour-owner="${entry.user_id}">Tour Museum</button>
                  ${currentUser && currentUser.id !== entry.user_id ? `<button class="ghost-btn" data-rate-owner="${entry.user_id}">Rate Museum</button>` : ''}
                </div>
              </div>
            `).join('') : '<div class="leader-item"><strong>No museums yet</strong><div class="muted small">Once players start curating, the leaderboard will populate here.</div></div>'}
          </div>
        </div>
      </div>
    </section>
  `
}

function renderScreen() {
  const main = document.getElementById('main-view')
  if (!main) return
  main.innerHTML = `${renderDiveScreen()}${renderCollectionScreen()}${renderMuseumScreen()}${renderLeaderboardScreen()}`
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.classList.toggle('active', button.dataset.nav === state.currentView)
  })
  bindShellEvents()
  if (state.currentView === 'dive') {
    cleanupMuseumScene()
    initDiveScene()
  } else {
    cleanupDiveScene(false)
  }
  if (state.currentView === 'museum') {
    initMuseumScene()
  } else {
    cleanupMuseumScene()
  }
  const mainView = document.getElementById('main-view')
  if (mainView) mainView.scrollTop = 0
  markSidebarDirty()
  renderSidebar()
}

function bindHoldButton(button, key) {
  if (!button || button.dataset.boundHold === 'true' || key === 'none') return
  button.dataset.boundHold = 'true'

  const activate = (event) => {
    event.preventDefault()
    event.stopPropagation()
    state.movement[key] = true
    button.classList.add('active')
  }

  const deactivate = (event) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    state.movement[key] = false
    button.classList.remove('active')
  }

  button.addEventListener('pointerdown', activate)
  button.addEventListener('pointerup', deactivate)
  button.addEventListener('pointercancel', deactivate)
  button.addEventListener('pointerleave', deactivate)
  button.addEventListener('lostpointercapture', deactivate)
  button.addEventListener('contextmenu', (event) => event.preventDefault())
}

function clearAllMovement() {
  Object.keys(state.movement).forEach((key) => {
    state.movement[key] = false
  })
  document.querySelectorAll('[data-move].active').forEach((button) => button.classList.remove('active'))
}

function bindShellEvents() {
  if (state.shellBound) return
  try {
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      await signOut()
      renderAuth()
    })
    document.getElementById('surface-btn')?.addEventListener('click', surfaceAndRefuel)

    document.querySelectorAll('[data-nav]').forEach((button) => {
      button.addEventListener('click', () => {
        state.currentView = button.dataset.nav
        renderScreen()
      })
    })

    document.querySelectorAll('[data-move]').forEach((button) => {
      bindHoldButton(button, button.dataset.move)
    })

    window.addEventListener('pointerup', clearAllMovement)
    window.addEventListener('blur', clearAllMovement)

    document.getElementById('main-view')?.addEventListener('click', async (event) => {
      const scanButton = event.target.closest('#scan-btn')
      if (scanButton) return scanNearby()

      const photoButton = event.target.closest('#photo-btn')
      if (photoButton) return capturePhoto()

      const toggleHudButton = event.target.closest('#toggle-hud-btn')
      if (toggleHudButton) {
        state.dive.hudCollapsed = !state.dive.hudCollapsed
        renderScreen()
        return
      }

      const toggleCinematicButton = event.target.closest('#toggle-cinematic-btn')
      if (toggleCinematicButton) {
        state.dive.cinematicMode = !state.dive.cinematicMode
        renderScreen()
        return
      }

      const autoCurateButton = event.target.closest('#auto-curate-btn')
      if (autoCurateButton) return autoCurateMuseum()

      const refreshMuseumButton = event.target.closest('#refresh-museum-btn')
      if (refreshMuseumButton) {
        await loadMuseumData()
        markSidebarDirty()
        renderSidebar(true)
        renderScreen()
        return
      }

      const tourButton = event.target.closest('[data-tour-owner]')
      if (tourButton) {
        state.museum.selectedMuseumOwner = tourButton.dataset.tourOwner
        state.currentView = 'museum'
        await loadMuseumData(tourButton.dataset.tourOwner)
        markSidebarDirty()
        renderSidebar(true)
        renderScreen()
        return
      }

      const rateButton = event.target.closest('[data-rate-owner]')
      if (rateButton) {
        state.museum.selectedMuseumOwner = rateButton.dataset.rateOwner
        document.getElementById('rate-modal')?.classList.add('active')
      }
    })

    document.getElementById('close-rate-modal')?.addEventListener('click', () => {
      document.getElementById('rate-modal')?.classList.remove('active')
    })
    document.getElementById('submit-rate-modal')?.addEventListener('click', submitMuseumRating)
    state.shellBound = true
  } catch (error) {
    console.error('Bind shell events error:', error)
  }
}

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth || canvas.offsetWidth || canvas.parentElement.clientWidth, canvas.clientHeight || canvas.offsetHeight || canvas.parentElement.clientHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  return renderer
}

function disposeMaterial(material) {
  if (!material) return
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial)
    return
  }
  material.dispose?.()
}

function disposeObject3D(object) {
  if (!object) return
  object.traverse((child) => {
    child.geometry?.dispose?.()
    disposeMaterial(child.material)
    if (child.isLight && child.shadow?.map) {
      child.shadow.map.dispose?.()
    }
  })
}

function cleanupDiveScene(resetReady = true) {
  if (world.animationFrameId) {
    cancelAnimationFrame(world.animationFrameId)
    world.animationFrameId = null
  }
  if (world.renderer) {
    world.renderer.dispose()
    world.renderer.forceContextLoss?.()
    world.renderer = null
  }
  if (world.scene) {
    disposeObject3D(world.scene)
    world.scene.clear()
    world.scene = null
  }
  world.camera = null
  world.submarine = null
  world.oceanFloor = null
  world.ambient = null
  world.dirLight = null
  world.particles = null
  world.creatures = []
  world.pois = []
  world.diveCanvas = null
  world.diveCanvasHandlersBound = false
  world.lastNearestSignalKey = ''
  state.touch.active = false
  state.touch.pointerId = null
  state.touch.targetYawDelta = 0
  state.touch.targetPitchDelta = 0
  state.touch.yawVelocity = 0
  state.touch.pitchVelocity = 0
  clearAllMovement()
  if (resetReady) state.sceneReady = false
}

function cleanupMuseumScene() {
  if (world.museumAnimationFrameId) {
    cancelAnimationFrame(world.museumAnimationFrameId)
    world.museumAnimationFrameId = null
  }
  if (world.museumControls) {
    world.museumControls.dispose()
    world.museumControls = null
  }
  if (world.museumRenderer) {
    world.museumRenderer.dispose()
    world.museumRenderer.forceContextLoss?.()
    world.museumRenderer = null
  }
  if (world.museumScene) {
    disposeObject3D(world.museumScene)
    world.museumScene.clear()
    world.museumScene = null
  }
  world.museumCamera = null
  world.museumExhibitMeshes = []
  state.museumSceneReady = false
}

function initDiveScene() {
  try {
    const canvas = document.getElementById('scene')
    if (!canvas) return
    if (state.sceneReady && world.renderer && world.diveCanvas === canvas) return

    cleanupDiveScene()
    setError('')
    world.scene = new THREE.Scene()
    world.scene.fog = new THREE.FogExp2('#02101d', 0.0028)
    world.camera = new THREE.PerspectiveCamera(68, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1, 6000)
    world.camera.position.set(0, 4, 18)
    world.renderer = createRenderer(canvas)
    world.diveCanvas = canvas
    world.lastFrame = performance.now()

    const hemi = new THREE.HemisphereLight('#6fd6ff', '#02101d', 0.7)
    world.scene.add(hemi)
    world.ambient = new THREE.AmbientLight('#6bc8ff', 0.5)
    world.scene.add(world.ambient)
    world.dirLight = new THREE.DirectionalLight('#8ef3ff', 1.2)
    world.dirLight.position.set(25, 40, 10)
    world.scene.add(world.dirLight)

    const waterGeometry = new THREE.SphereGeometry(2200, 32, 32)
    const waterMaterial = new THREE.MeshBasicMaterial({ color: '#04111f', side: THREE.BackSide })
    const waterSphere = new THREE.Mesh(waterGeometry, waterMaterial)
    world.scene.add(waterSphere)

    const floorGeometry = new THREE.PlaneGeometry(5000, 5000, 120, 120)
    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#0b2237', roughness: 1, metalness: 0 })
    world.oceanFloor = new THREE.Mesh(floorGeometry, floorMaterial)
    world.oceanFloor.rotation.x = -Math.PI / 2
    world.oceanFloor.position.y = -120
    const positions = world.oceanFloor.geometry.attributes.position
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i)
      const z = positions.getZ(i)
      const y = Math.sin(x * 0.01) * 6 + Math.cos(z * 0.012) * 5 + Math.sin((x + z) * 0.008) * 7
      positions.setY(i, y)
    }
    world.oceanFloor.geometry.computeVertexNormals()
    world.scene.add(world.oceanFloor)

    const subGroup = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(2.2, 7, 10, 18),
      new THREE.MeshStandardMaterial({ color: '#f9c74f', metalness: 0.35, roughness: 0.45 })
    )
    body.rotation.z = Math.PI / 2
    subGroup.add(body)
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 18, 18),
      new THREE.MeshStandardMaterial({ color: '#7ae7ff', transparent: true, opacity: 0.55, metalness: 0.15, roughness: 0.1 })
    )
    canopy.position.set(1.1, 0.8, 0)
    subGroup.add(canopy)
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 2.6, 1.2),
      new THREE.MeshStandardMaterial({ color: '#1f3b4d' })
    )
    fin.position.set(-3.6, 0.2, 0)
    subGroup.add(fin)
    const lightLeft = new THREE.PointLight('#62f1ff', 1.8, 80)
    lightLeft.position.set(3.4, 0.2, 1.2)
    const lightRight = new THREE.PointLight('#62f1ff', 1.8, 80)
    lightRight.position.set(3.4, 0.2, -1.2)
    subGroup.add(lightLeft, lightRight)
    subGroup.position.set(0, -6, 0)
    world.submarine = subGroup
    world.scene.add(subGroup)

    createParticles()
    createCreaturesAndPOI()
    bindCanvasLook(canvas)
    if (!world.resizeBound) {
      window.addEventListener('resize', handleResize)
      world.resizeBound = true
    }
    state.sceneReady = true
    animateDiveScene()
  } catch (error) {
    console.error('Init dive scene error:', error)
    setError(`3D dive scene failed: ${error.message}`)
  }
}

function createParticles() {
  const count = 1800
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 1800
    positions[i * 3 + 1] = -Math.random() * 1800
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1800
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({ color: '#b9ecff', size: 1.6, transparent: true, opacity: 0.45 })
  world.particles = new THREE.Points(geometry, material)
  world.scene.add(world.particles)
}

function creatureMesh(species) {
  const group = new THREE.Group()
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1.2 * species.specimenScale, 16, 16),
    new THREE.MeshStandardMaterial({ color: species.color, emissive: species.color, emissiveIntensity: 0.8, roughness: 0.35 })
  )
  group.add(core)
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.5 * species.specimenScale, 1.8 * species.specimenScale, 12),
    new THREE.MeshStandardMaterial({ color: species.color, emissive: species.color, emissiveIntensity: 0.45 })
  )
  tail.position.set(-1.6 * species.specimenScale, 0, 0)
  tail.rotation.z = -Math.PI / 2
  group.add(tail)
  const glow = new THREE.PointLight(species.color, species.rarity === 'legendary' ? 2.4 : 1.2, 36)
  glow.position.set(0, 0, 0)
  group.add(glow)
  return group
}

function createCreaturesAndPOI() {
  world.creatures = []
  world.pois = []
  SPECIES.forEach((species) => {
    for (let i = 0; i < 3; i += 1) {
      const mesh = creatureMesh(species)
      const depth = THREE.MathUtils.randFloat(species.min_depth, species.max_depth)
      mesh.position.set(
        THREE.MathUtils.randFloatSpread(700),
        -depth / 4,
        THREE.MathUtils.randFloatSpread(1000)
      )
      mesh.userData = {
        type: 'species',
        species,
        baseY: mesh.position.y,
        driftOffset: Math.random() * Math.PI * 2,
        discovered: false,
        specimenCollected: false,
        photoCaptured: false,
        zone_name: biomeLabel(species.biome)
      }
      world.scene.add(mesh)
      world.creatures.push(mesh)
    }
  })

  POINTS_OF_INTEREST.forEach((poi) => {
    let mesh
    if (poi.type === 'wreck') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(18, 6, 42),
        new THREE.MeshStandardMaterial({ color: '#3d5a73', roughness: 0.9, metalness: 0.15 })
      )
      mesh.rotation.z = -0.18
      mesh.rotation.y = 0.45
    } else if (poi.type === 'cave') {
      mesh = new THREE.Mesh(
        new THREE.TorusKnotGeometry(10, 4, 80, 12),
        new THREE.MeshStandardMaterial({ color: '#17334f', roughness: 1, metalness: 0.05 })
      )
      mesh.rotation.x = Math.PI / 2
    } else {
      mesh = new THREE.Group()
      for (let i = 0; i < 5; i += 1) {
        const vent = new THREE.Mesh(
          new THREE.CylinderGeometry(1.4, 3.2, 18 + i * 3, 10),
          new THREE.MeshStandardMaterial({ color: '#2f2f34', roughness: 1 })
        )
        vent.position.set((i - 2) * 5, 0, Math.sin(i) * 3)
        mesh.add(vent)
        const glow = new THREE.PointLight('#ff8a5b', 1.4, 60)
        glow.position.set((i - 2) * 5, 12 + i * 2, Math.sin(i) * 3)
        mesh.add(glow)
      }
    }
    mesh.position.set(poi.x, poi.y / 4, poi.z)
    mesh.userData = { ...poi, type: poi.type, zone_name: poi.label }
    world.scene.add(mesh)
    world.pois.push(mesh)
  })
}

function biomeLabel(biome) {
  const labels = {
    glow_fields: 'Glow Fields',
    abyssal_plain: 'Abyssal Plain',
    thermal_vents: 'Thermal Vent Field',
    wreck_corridor: 'Wreck Corridor',
    trench_gate: 'Trench Gate'
  }
  return labels[biome] || biome
}

function bindCanvasLook(canvas) {
  if (world.diveCanvasHandlersBound && world.diveCanvas === canvas) return
  try {
    canvas.addEventListener('pointerdown', (event) => {
      if (event.target.closest('[data-move], #scan-btn, #photo-btn, #toggle-hud-btn, #toggle-cinematic-btn')) return
      state.touch.active = true
      state.touch.pointerId = event.pointerId
      state.touch.x = event.clientX
      state.touch.y = event.clientY
      state.touch.targetYawDelta = 0
      state.touch.targetPitchDelta = 0
      canvas.setPointerCapture(event.pointerId)
    })
    canvas.addEventListener('pointermove', (event) => {
      if (!state.touch.active || state.touch.pointerId !== event.pointerId || !world.submarine) return
      const dx = event.clientX - state.touch.x
      const dy = event.clientY - state.touch.y
      state.touch.x = event.clientX
      state.touch.y = event.clientY
      state.touch.targetYawDelta += -dx * 0.0042
      state.touch.targetPitchDelta += -dy * 0.0022
    })
    const endTouch = (event) => {
      if (state.touch.pointerId === event.pointerId) {
        state.touch.active = false
        state.touch.pointerId = null
      }
    }
    canvas.addEventListener('pointerup', endTouch)
    canvas.addEventListener('pointercancel', endTouch)
    world.diveCanvasHandlersBound = true
  } catch (error) {
    console.error('Bind canvas look error:', error)
  }
}

function applyTouchLook(dt) {
  if (!world.submarine || !world.camera) return
  const smoothing = Math.min(1, dt * 10)
  state.touch.yawVelocity += (state.touch.targetYawDelta - state.touch.yawVelocity) * smoothing
  state.touch.pitchVelocity += (state.touch.targetPitchDelta - state.touch.pitchVelocity) * smoothing

  world.submarine.rotation.y += state.touch.yawVelocity
  world.camera.rotation.x = THREE.MathUtils.clamp(world.camera.rotation.x + state.touch.pitchVelocity, -0.6, 0.45)

  state.touch.targetYawDelta *= 0.72
  state.touch.targetPitchDelta *= 0.72
  state.touch.yawVelocity *= 0.84
  state.touch.pitchVelocity *= 0.84
}

function handleResize() {
  try {
    if (world.renderer && world.camera) {
      const canvas = world.renderer.domElement
      const width = canvas.clientWidth || canvas.parentElement.clientWidth
      const height = canvas.clientHeight || canvas.parentElement.clientHeight
      world.camera.aspect = width / Math.max(height, 1)
      world.camera.updateProjectionMatrix()
      world.renderer.setSize(width, height, false)
    }
    if (world.museumRenderer && world.museumCamera) {
      const canvas = world.museumRenderer.domElement
      const width = canvas.clientWidth || canvas.parentElement.clientWidth
      const height = canvas.clientHeight || canvas.parentElement.clientHeight
      world.museumCamera.aspect = width / Math.max(height, 1)
      world.museumCamera.updateProjectionMatrix()
      world.museumRenderer.setSize(width, height, false)
    }
  } catch (error) {
    console.error('Resize error:', error)
  }
}

function animateDiveScene() {
  if (!state.sceneReady || state.currentView !== 'dive' || !world.renderer || !world.scene || !world.camera) return
  try {
    const now = performance.now()
    const dt = Math.min((now - world.lastFrame) / 1000, 0.05)
    world.lastFrame = now

    applyTouchLook(dt)
    updateMovement(dt)
    updateCreatures(now * 0.001)
    updateHUD()
    drawMiniMap()

    const offset = new THREE.Vector3(-18, 7, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), world.submarine.rotation.y)
    world.camera.position.lerp(world.submarine.position.clone().add(offset), 0.08)
    world.camera.lookAt(world.submarine.position.clone().add(new THREE.Vector3(10, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), world.submarine.rotation.y)))

    world.renderer.render(world.scene, world.camera)
    world.animationFrameId = requestAnimationFrame(animateDiveScene)
  } catch (error) {
    console.error('Animate dive error:', error)
    setError(`Dive render error: ${error.message}`)
  }
}

function updateMovement(dt) {
  if (!world.submarine) return
  const speed = state.movement.boost ? 42 : 24
  const direction = new THREE.Vector3()
  if (state.movement.forward) direction.x += 1
  if (state.movement.backward) direction.x -= 1
  if (state.movement.left) world.submarine.rotation.y += dt * 1.3
  if (state.movement.right) world.submarine.rotation.y -= dt * 1.3
  if (state.movement.down) direction.y -= 0.8
  if (state.movement.up) direction.y += 0.8

  if (direction.lengthSq() > 0) {
    direction.normalize().multiplyScalar(speed * dt)
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), world.submarine.rotation.y)
    world.submarine.position.add(direction)
    state.dive.distance += direction.length() * 10
    const consumption = dt * (state.movement.boost ? 4.4 : 2.2) * (1 + Math.max(0, state.dive.depth / 1200))
    state.dive.oxygen = Math.max(0, state.dive.oxygen - consumption * 0.55)
    state.dive.battery = Math.max(0, state.dive.battery - consumption * 0.72)
  } else {
    state.dive.oxygen = Math.max(0, state.dive.oxygen - dt * 0.08)
    state.dive.battery = Math.max(0, state.dive.battery - dt * 0.04)
  }

  state.dive.depth = Math.max(0, Math.round(-world.submarine.position.y * 4))
  state.dive.maxDepth = Math.max(state.dive.maxDepth, state.dive.depth)

  if (state.dive.oxygen <= 0 || state.dive.battery <= 0) {
    surfaceAndRefuel(true)
  }

  const nearest = findNearestSignal()
  const scan = document.getElementById('scan-details')
  if (scan) {
    const nextKey = nearest ? `${nearest.label}:${nearest.distance}:${nearest.meta}` : 'none'
    if (nextKey !== world.lastNearestSignalKey) {
      scan.innerHTML = nearest
        ? `<strong>${nearest.label}</strong><div class="muted small">${nearest.distance} m away · ${nearest.meta}</div>`
        : 'No strong signal detected nearby.'
      world.lastNearestSignalKey = nextKey
    }
  }
}

function updateCreatures(time) {
  world.creatures.forEach((mesh, index) => {
    mesh.position.x += Math.sin(time * 0.6 + index) * 0.08
    mesh.position.y = mesh.userData.baseY + Math.sin(time * 1.2 + mesh.userData.driftOffset) * 2.2
    mesh.position.z += Math.cos(time * 0.5 + index) * 0.06
    mesh.rotation.y += 0.01
  })
}

function updateHUD() {
  markSidebarDirty()
  renderSidebar()
}

function findNearestSignal() {
  if (!world.submarine) return null
  const subPos = world.submarine.position
  const targets = [
    ...world.creatures.map((mesh) => ({
      mesh,
      label: mesh.userData.species.species_name,
      meta: `${mesh.userData.zone_name} · ${mesh.userData.species.rarity}`
    })),
    ...world.pois.map((mesh) => ({
      mesh,
      label: mesh.userData.label,
      meta: mesh.userData.type
    }))
  ]
  let nearest = null
  targets.forEach((target) => {
    const distance = Math.round(subPos.distanceTo(target.mesh.position) * 4)
    if (!nearest || distance < nearest.distance) {
      nearest = { ...target, distance }
    }
  })
  return nearest
}

function drawMiniMap() {
  try {
    const canvas = document.getElementById('minimap')
    if (!canvas || !world.submarine) return
    const ctx = canvas.getContext('2d')
    const size = canvas.width = 220
    canvas.height = 220
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = 'rgba(4,17,31,0.92)'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(143,199,230,0.18)'
    ctx.lineWidth = 1
    for (let i = 0; i < 6; i += 1) {
      const p = (i / 5) * size
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke()
    }
    const scale = 0.12
    const centerX = size / 2
    const centerY = size / 2
    ctx.fillStyle = '#4ecdc4'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2)
    ctx.fill()

    world.pois.forEach((poi) => {
      const x = centerX + (poi.position.x - world.submarine.position.x) * scale
      const y = centerY + (poi.position.z - world.submarine.position.z) * scale
      if (x > 0 && x < size && y > 0 && y < size) {
        ctx.fillStyle = poi.userData.color || '#9be7ff'
        ctx.fillRect(x - 3, y - 3, 6, 6)
      }
    })
    world.creatures.slice(0, 20).forEach((creature) => {
      const x = centerX + (creature.position.x - world.submarine.position.x) * scale
      const y = centerY + (creature.position.z - world.submarine.position.z) * scale
      if (x > 0 && x < size && y > 0 && y < size) {
        ctx.fillStyle = creature.userData.species.color
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    })
  } catch (error) {
    console.error('Minimap error:', error)
  }
}

async function scanNearby() {
  try {
    const nearest = findNearestSignal()
    if (!nearest || nearest.distance > 120) {
      return showToast('No scan target in range. Move closer.', true)
    }

    if (nearest.mesh.userData.type === 'species') {
      const data = nearest.mesh.userData
      const discovery = {
        species_key: data.species.species_key,
        species_name: data.species.species_name,
        rarity: data.species.rarity,
        depth_found: state.dive.depth,
        zone_name: data.zone_name,
        biome: data.species.biome,
        is_specimen_collected: true,
        is_photo_captured: data.photoCaptured,
        thumbnail_emoji: data.species.emoji,
        notes: data.species.scientific_blurb
      }
      const saved = await saveDiscovery(discovery)
      if (saved) {
        const exists = state.dive.discoveries.some((item) => item.species_key === saved.species_key)
        if (!exists) state.dive.discoveries.unshift(saved)
        if (!state.dive.cargo.some((item) => item.species_key === saved.species_key)) {
          state.dive.cargo.unshift(saved)
          state.dive.specimensCollected += 1
        }
        data.discovered = true
        data.specimenCollected = true
        state.dive.objective = `Recovered ${saved.species_name}. Search deeper for rarer life.`
        markSidebarDirty()
        showToast(`Specimen collected: ${saved.species_name}`)
      }
    } else {
      const poi = nearest.mesh.userData
      state.dive.objective = `Logged point of interest: ${poi.label}. Photograph the area or search for nearby species.`
      showToast(`Logged ${poi.label}`)
    }
    renderSidebar(true)
    renderScreen()
  } catch (error) {
    console.error('Scan error:', error)
    showToast('Scan failed.', true)
  }
}

async function capturePhoto() {
  try {
    const nearest = findNearestSignal()
    state.dive.photosTaken += 1
    if (nearest && nearest.distance <= 180 && nearest.mesh.userData.type === 'species') {
      nearest.mesh.userData.photoCaptured = true
      const data = nearest.mesh.userData
      const saved = await saveDiscovery({
        species_key: data.species.species_key,
        species_name: data.species.species_name,
        rarity: data.species.rarity,
        depth_found: state.dive.depth,
        zone_name: data.zone_name,
        biome: data.species.biome,
        is_specimen_collected: data.specimenCollected,
        is_photo_captured: true,
        thumbnail_emoji: data.species.emoji,
        notes: `Photographed in ${data.zone_name}. ${data.species.scientific_blurb}`
      })
      if (saved && !state.dive.discoveries.some((item) => item.species_key === saved.species_key)) {
        state.dive.discoveries.unshift(saved)
      }
      showToast(`Photo captured: ${data.species.species_name}`)
    } else {
      showToast('Wide-angle ocean photo captured.')
    }
    markSidebarDirty()
    renderSidebar(true)
    renderScreen()
  } catch (error) {
    console.error('Photo error:', error)
    showToast('Camera failed.', true)
  }
}

async function surfaceAndRefuel(forced = false) {
  try {
    const durationSeconds = Math.round((Date.now() - state.dive.startTime) / 1000)
    await saveDiveSummary({
      title: forced ? 'Emergency Surface' : 'Dive Log',
      max_depth: state.dive.maxDepth,
      distance_traveled: state.dive.distance,
      specimens_collected: state.dive.specimensCollected,
      photos_taken: state.dive.photosTaken,
      oxygen_used: 100 - state.dive.oxygen,
      battery_used: 100 - state.dive.battery,
      duration_seconds: durationSeconds
    })
    state.dive.oxygen = 100
    state.dive.battery = 100
    state.dive.depth = 0
    state.dive.distance = 0
    state.dive.maxDepth = 0
    state.dive.photosTaken = 0
    state.dive.specimensCollected = 0
    state.dive.startTime = Date.now()
    state.dive.lastSurfaceAt = Date.now()
    state.dive.objective = 'Systems refueled. Return to the depths and continue the expedition.'
    if (world.submarine) {
      world.submarine.position.set(0, -6, 0)
    }
    state.history = await fetchDiveHistory()
    markSidebarDirty()
    renderSidebar(true)
    renderScreen()
    showToast(forced ? 'Emergency surface complete. Systems restored.' : 'Surfaced and refueled.')
  } catch (error) {
    console.error('Surface error:', error)
    showToast('Unable to surface cleanly.', true)
  }
}

async function loadMuseumData(ownerUserId = null) {
  try {
    state.museum.exhibits = await fetchMuseumExhibits(ownerUserId)
    state.museum.leaderboard = await fetchMuseumLeaderboard()
    markSidebarDirty()
  } catch (error) {
    console.error('Load museum data error:', error)
  }
}

async function autoCurateMuseum() {
  try {
    const discoveries = state.dive.discoveries.filter((item) => item.is_specimen_collected)
    if (!discoveries.length) {
      return showToast('Collect specimens first.', true)
    }
    const layout = buildMuseumLayout(discoveries)
    for (const entry of layout) {
      await addExhibitFromDiscovery(entry.discovery, entry.position)
    }
    await loadMuseumData()
    renderSidebar(true)
    renderScreen()
    showToast('Museum auto-curated.')
  } catch (error) {
    console.error('Auto curate error:', error)
    showToast('Unable to curate museum.', true)
  }
}

async function submitMuseumRating() {
  try {
    const owner = state.museum.selectedMuseumOwner
    if (!owner) return
    const score = Number(document.getElementById('museum-score').value || 5)
    const review = document.getElementById('museum-review').value.trim()
    await rateMuseum(owner, Math.min(5, Math.max(1, score)), review)
    document.getElementById('rate-modal')?.classList.remove('active')
    state.museum.leaderboard = await fetchMuseumLeaderboard()
    markSidebarDirty()
    renderSidebar(true)
    renderScreen()
    showToast('Museum rated.')
  } catch (error) {
    console.error('Rate museum submit error:', error)
    showToast('Unable to submit rating.', true)
  }
}

function initMuseumScene() {
  try {
    const canvas = document.getElementById('museum-scene')
    if (!canvas) return
    if (state.museumSceneReady && world.museumRenderer?.domElement === canvas) return

    cleanupMuseumScene()
    world.museumScene = new THREE.Scene()
    world.museumScene.background = new THREE.Color('#071b30')
    world.museumCamera = new THREE.PerspectiveCamera(60, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1, 2000)
    world.museumCamera.position.set(0, 10, 22)
    world.museumRenderer = createRenderer(canvas)

    const ambient = new THREE.AmbientLight('#d7f7ff', 0.8)
    world.museumScene.add(ambient)
    const spot = new THREE.SpotLight('#8ef3ff', 1.6, 180, 0.7, 0.4)
    spot.position.set(0, 40, 20)
    world.museumScene.add(spot)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: '#0d2740', roughness: 0.95, metalness: 0.08 })
    )
    floor.rotation.x = -Math.PI / 2
    world.museumScene.add(floor)

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(90, 24, 1),
      new THREE.MeshStandardMaterial({ color: '#102d49' })
    )
    backWall.position.set(0, 12, -24)
    world.museumScene.add(backWall)

    const sideWallLeft = new THREE.Mesh(
      new THREE.BoxGeometry(1, 24, 50),
      new THREE.MeshStandardMaterial({ color: '#0c2238' })
    )
    sideWallLeft.position.set(-45, 12, 0)
    const sideWallRight = sideWallLeft.clone()
    sideWallRight.position.x = 45
    world.museumScene.add(sideWallLeft, sideWallRight)

    world.museumExhibitMeshes = []
    state.museum.exhibits.forEach((item, index) => {
      const species = SPECIES.find((entry) => entry.species_name === item.species_name) || SPECIES[index % SPECIES.length]
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.8, 1.8, 20),
        new THREE.MeshStandardMaterial({ color: '#d8e6f2', roughness: 0.6 })
      )
      pedestal.position.set(item.position_x, 0.9, item.position_z)
      world.museumScene.add(pedestal)

      const specimen = creatureMesh(species)
      specimen.position.set(item.position_x, 3, item.position_z)
      specimen.rotation.y = item.rotation_y || 0
      world.museumScene.add(specimen)
      world.museumExhibitMeshes.push(specimen)
    })

    world.museumControls = new OrbitControls(world.museumCamera, canvas)
    world.museumControls.enableDamping = true
    world.museumControls.minDistance = 10
    world.museumControls.maxDistance = 60
    world.museumControls.maxPolarAngle = Math.PI / 2.1
    state.museumSceneReady = true
    animateMuseumScene()
  } catch (error) {
    console.error('Init museum scene error:', error)
    showToast('Museum scene failed to load.', true)
  }
}

function animateMuseumScene() {
  if (state.currentView !== 'museum' || !world.museumRenderer || !world.museumScene || !world.museumCamera) return
  try {
    world.museumExhibitMeshes.forEach((mesh, index) => {
      mesh.rotation.y += 0.005
      mesh.position.y = 3 + Math.sin(performance.now() * 0.001 + index) * 0.15
    })
    world.museumControls?.update()
    world.museumRenderer.render(world.museumScene, world.museumCamera)
    world.museumAnimationFrameId = requestAnimationFrame(animateMuseumScene)
  } catch (error) {
    console.error('Animate museum error:', error)
  }
}

async function bootstrapApp() {
  try {
    await seedSpeciesCatalog()
    state.dive.discoveries = await fetchDiscoveries()
    state.history = await fetchDiveHistory()
    await loadMuseumData()
    appShell()
    markSidebarDirty()
    renderSidebar(true)
    renderScreen()
  } catch (error) {
    console.error('Bootstrap error:', error)
    showToast('Failed to load expedition data.', true)
  }
}

async function init() {
  try {
    await getSession()
    onAuthChange(async (event) => {
      try {
        if (event === 'SIGNED_OUT') {
          renderAuth()
          return
        }
        if (currentUser) {
          await bootstrapApp()
        }
      } catch (error) {
        console.error('Auth callback error:', error)
      }
    })

    if (currentUser) {
      await bootstrapApp()
    } else {
      renderAuth()
    }
  } catch (error) {
    console.error('Init error:', error)
    renderAuth()
  }
}

init()
