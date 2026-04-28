import { MetadataRoute } from 'next'
import { createClient }  from '@/lib/supabase/server'

export const revalidate = 3600 // regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://biowiki.app'
  const supabase = createClient()

  const { data: articles } = await supabase
    .from('articles')
    .select('slug, updated_at, category')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: appUrl,              lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${appUrl}/articles`, lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${appUrl}/ask`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${appUrl}/request`,  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]

  const articleRoutes: MetadataRoute.Sitemap = (articles ?? []).map(article => ({
    url:             `${appUrl}/articles/${article.slug}`,
    lastModified:    new Date(article.updated_at),
    changeFrequency: 'weekly' as const,
    priority:        0.8,
  }))

  return [...staticRoutes, ...articleRoutes]
}
