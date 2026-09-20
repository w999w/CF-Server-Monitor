import {
  THEME_STORE_CACHE_TTL_SECONDS,
  THEME_STORE_URL
} from '../utils/config.js'

const THEME_STORE_API_URL = 'https://api.github.com/repos/huilang-me/CFSM-Theme-Store/contents/themes.json?ref=main'

let cachedThemeStore = null
let cacheTime = 0
const SAFE_GITHUB_PART = /^[A-Za-z0-9._-]+$/
const SAFE_GITHUB_BRANCH = /^[A-Za-z0-9._/-]+$/

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

const decodeXml = (value) => String(value || '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&amp;/g, '&')

const parseAtomCommits = (xml, limit) => {
  const commits = []
  for (const match of String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = match[1]
    const sha = entry.match(/Grit::Commit\/([a-f0-9]{40})<\/id>/i)?.[1] || ''
    const title = decodeXml(entry.match(/<title>\s*([\s\S]*?)\s*<\/title>/i)?.[1]).trim()
    const date = entry.match(/<updated>([^<]+)<\/updated>/i)?.[1] || ''
    if (!sha) continue

    commits.push({
      sha,
      commit: {
        author: { date },
        committer: { date },
        message: title
      }
    })
    if (commits.length >= limit) break
  }
  return commits
}

const fetchThemeCommitsFromAtom = async (owner, repo, branch, limit) => {
  const branchPath = branch.split('/').map(encodeURIComponent).join('/')
  const atomUrl = `https://github.com/${owner}/${repo}/commits/${branchPath}.atom`
  const res = await fetch(atomUrl, { headers: { 'User-Agent': 'CFSM-Theme-Store' } })
  if (!res.ok) throw new Error(`Theme commits feed failed: ${res.status}`)
  return parseAtomCommits(await res.text(), limit)
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

export async function handleThemeVersions(owner, repo, branch, limit = 20) {
  if (
    !SAFE_GITHUB_PART.test(owner || '') ||
    !SAFE_GITHUB_PART.test(repo || '') ||
    typeof branch !== 'string' ||
    !SAFE_GITHUB_BRANCH.test(branch.trim()) ||
    branch.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    return { ok: false, status: 400, error: 'invalidThemeRepository' }
  }

  const perPage = Math.min(Math.max(Number(limit) || 20, 1), 30)
  const apiUrl = new URL(`https://api.github.com/repos/${owner}/${repo}/commits`)
  apiUrl.searchParams.set('sha', branch.trim())
  apiUrl.searchParams.set('per_page', String(perPage))

  try {
    let commits
    try {
      commits = await fetchThemeStore(apiUrl.href)
    } catch (_) {
      commits = await fetchThemeCommitsFromAtom(owner, repo, branch.trim(), perPage)
    }
    if (!Array.isArray(commits)) throw new Error('Invalid GitHub response')
    return { ok: true, commits }
  } catch (_) {
    return { ok: false, status: 502, error: 'themeVersionsProxyFailed' }
  }
}
