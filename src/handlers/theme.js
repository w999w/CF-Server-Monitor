import {
  THEME_STORE_CACHE_TTL_SECONDS,
  THEME_STORE_URL
} from '../utils/config.js'

const THEME_STORE_API_URL = 'https://api.github.com/repos/huilang-me/CFSM-Theme-Store/contents/themes.json?ref=main'

let cachedThemeStore = null
let cacheTime = 0

const createEmptyThemeStore = () => ({ schema: 1, themes: [] })

const normalizeThemeStore = (data) => {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return {
      ...data,
      schema: data.schema || 1,
      themes: Array.isArray(data.themes) ? data.themes : []
    }
  }

  return createEmptyThemeStore()
}

const fetchThemeStore = async (url, accept = 'application/json') => {
  const res = await fetch(url, {
    headers: {
      'Accept': accept,
      'User-Agent': 'CFSM-Theme-Store'
    }
  })

  if (!res.ok) throw new Error(`Theme store request failed: ${res.status}`)
  return res.json()
}

export async function handleTheme() {
  const now = Math.floor(Date.now() / 1000)
  if (cachedThemeStore && (now - cacheTime) < THEME_STORE_CACHE_TTL_SECONDS) {
    return { ok: true, themeStore: cachedThemeStore, cached: true }
  }

  try {
    let data
    try {
      data = await fetchThemeStore(THEME_STORE_URL)
    } catch (_) {
      data = await fetchThemeStore(THEME_STORE_API_URL, 'application/vnd.github.raw+json')
    }
    const themeStore = normalizeThemeStore(data)

    cachedThemeStore = themeStore
    cacheTime = now
    return { ok: true, themeStore, cached: false }
  } catch (e) {
    return { ok: false, status: 0, error: 'themeStoreProxyFailed' }
  }
}
