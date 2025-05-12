import { supabase } from './supabase-client';

export async function getErrorCategoryFromMessage(message: string, userId: string): Promise<{ id: string, name: string } | null> {
  const lowerMessage = message.toLowerCase();

  // First try user's custom categories
  const { data: userCategories } = await supabase
    .from('error_categories')
    .select('id, name, terms, color')
    .eq('user_id', userId);

  for (const category of userCategories || []) {
    if (category.terms?.some((term: string) => lowerMessage.includes(term.toLowerCase()))) {
      return { id: category.id, name: category.name };
    }
  }

  // Then try default categories
  const { data: defaultCategories } = await supabase
    .from('default_error_categories')
    .select('id, name, terms, color');

  for (const category of defaultCategories || []) {
    if (category.terms?.some((term: string) => lowerMessage.includes(term.toLowerCase()))) {
      return { id: category.id, name: category.name };
    }
  }



  return null;
}