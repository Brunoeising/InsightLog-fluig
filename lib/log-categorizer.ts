import { supabase } from './supabase-client';

interface CategoryRecord {
  id: string;
  name: string;
  terms: string[];
  color?: string;
  isUser: boolean;
}

export interface CategoryCache {
  userCategories: CategoryRecord[];
  defaultCategories: CategoryRecord[];
}

/**
 * Fetches all categories for a user in two queries (user + default),
 * returning a cache object that can be reused across many messages.
 */
export async function getErrorCategoriesCache(userId: string): Promise<CategoryCache> {
  const [{ data: userRows }, { data: defaultRows }] = await Promise.all([
    supabase.from('error_categories').select('id, name, terms, color').eq('user_id', userId),
    supabase.from('default_error_categories').select('id, name, terms, color'),
  ]);

  return {
    userCategories: (userRows ?? []).map(r => ({ ...r, isUser: true })),
    defaultCategories: (defaultRows ?? []).map(r => ({ ...r, isUser: false })),
  };
}

/**
 * Matches an error message against the pre-fetched category cache.
 * User-defined categories take precedence over defaults.
 */
export function matchCategoryFromCache(
  message: string,
  cache: CategoryCache
): { id: string; name: string } | null {
  const lower = message.toLowerCase();

  for (const cat of cache.userCategories) {
    if (cat.terms?.some(term => lower.includes(term.toLowerCase()))) {
      return { id: cat.id, name: cat.name };
    }
  }

  for (const cat of cache.defaultCategories) {
    if (cat.terms?.some(term => lower.includes(term.toLowerCase()))) {
      return { id: cat.id, name: cat.name };
    }
  }

  return null;
}

/**
 * Convenience function for single lookups (e.g. in upload-button.tsx).
 * Performs two DB queries — prefer getErrorCategoriesCache + matchCategoryFromCache
 * when processing many messages.
 */
export async function getErrorCategoryFromMessage(
  message: string,
  userId: string
): Promise<{ id: string; name: string } | null> {
  const cache = await getErrorCategoriesCache(userId);
  return matchCategoryFromCache(message, cache);
}
