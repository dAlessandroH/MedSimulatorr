import { useEffect, useState } from 'react'

/** Router mínimo basado en hash: funciona en GitHub Pages sin configuración. */
export interface Route {
  path: string
  params: URLSearchParams
}

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, qs] = raw.split('?')
  return { path: path || '/', params: new URLSearchParams(qs ?? '') }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const h = () => {
      setRoute(read())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  return route
}

export function navigate(path: string, params?: Record<string, string | null | undefined>) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v)
  const s = qs.toString()
  window.location.hash = s ? `${path}?${s}` : path
}
