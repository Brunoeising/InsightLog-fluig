import { supabase } from './supabase-client';

export interface ErrorCategoryDefinition {
  id: string;
  name: string;
  terms: string[] | null;
  color?: string | null;
}

export async function loadErrorCategories(
  userId: string,
  client = supabase
): Promise<ErrorCategoryDefinition[]> {
  const [{ data: userCategories }, { data: defaultCategories }] = await Promise.all([
    client
      .from('error_categories')
      .select('id, name, terms, color')
      .eq('user_id', userId),
    client
      .from('default_error_categories')
      .select('id, name, terms, color'),
  ]);

  return [...(userCategories || []), ...(defaultCategories || [])];
}

export function categorizeMessage(
  message: string,
  categories: ErrorCategoryDefinition[]
): { id: string; name: string } | null {
  const lowerMessage = message.toLowerCase();

  for (const category of categories) {
    if (category.terms?.some((term) => lowerMessage.includes(term.toLowerCase()))) {
      return { id: category.id, name: category.name };
    }
  }

  return null;
}

export async function getErrorCategoryFromMessage(message: string, userId: string): Promise<{ id: string, name: string } | null> {
  const categories = await loadErrorCategories(userId);
  return categorizeMessage(message, categories);
}