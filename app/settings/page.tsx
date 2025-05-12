"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase-client';
import {
  Settings,
  Plus,
  X,
  Save,
  Loader2,
  ChevronLeft,
  Tag,
  Trash2,
  Palette,
  BarChart2, Zap, Shield,
  Layers
} from 'lucide-react';
import NavBar from '@/components/NavBar';

interface ErrorCategory {
  id: string;
  name: string;
  description: string;
  terms: string[];
  color: string;
}

const DEFAULT_COLORS = [
  'hsl(220, 70%, 50%)',
  'hsl(210, 80%, 45%)',
  'hsl(200, 75%, 40%)',
  'hsl(160, 60%, 45%)',
  'hsl(150, 65%, 40%)',
  'hsl(140, 70%, 35%)',
  'hsl(350, 70%, 50%)',
  'hsl(340, 75%, 45%)',
  'hsl(330, 80%, 40%)',
  'hsl(280, 65%, 60%)',
  'hsl(270, 70%, 55%)',
  'hsl(260, 75%, 50%)',
  'hsl(30, 80%, 55%)',
  'hsl(40, 85%, 50%)',
  'hsl(50, 90%, 45%)',
  'hsl(0, 0%, 45%)',
  'hsl(200, 15%, 40%)',
  'hsl(220, 10%, 35%)'
];

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [categories, setCategories] = useState<ErrorCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [editingCategory, setEditingCategory] = useState<ErrorCategory | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setIsLoading(true);

      const cachedData = localStorage.getItem('categories');
      const cachedTimestamp = localStorage.getItem('categoriesTimestamp');

      if (cachedData && cachedTimestamp) {
        const timestamp = parseInt(cachedTimestamp);
        const isValid = Date.now() - timestamp < 60000;

        if (isValid) {
          setCategories(JSON.parse(cachedData));
          setIsLoading(false);

          fetchFreshData();
          return;
        }
      }

      await fetchFreshData();
    } catch (error: any) {
      toast({
        title: "Erro ao carregar categorias",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFreshData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const { data, error } = await supabase
      .from('error_categories')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    setCategories(data || []);
    localStorage.setItem('categories', JSON.stringify(data));
    localStorage.setItem('categoriesTimestamp', Date.now().toString());
    
    } catch (error: any) {
      console.error('Error fetching categories:', error);

      const { data, error: supabaseError } = await supabase
        .from('error_categories')
        .select('*')
        .order('created_at', { ascending: true });

      if (supabaseError) throw supabaseError;

      setCategories(data || []);
      localStorage.setItem('categories', JSON.stringify(data));
      localStorage.setItem('categoriesTimestamp', Date.now().toString());
    }
  };

  const handleCategoryChange = async () => {
    localStorage.removeItem('categories');
    localStorage.removeItem('categoriesTimestamp');
    await loadCategories();
  };

  const handleAddCategory = () => {
    setEditingCategory({
      id: '',
      name: '',
      description: '',
      terms: [],
      color: DEFAULT_COLORS[0]
    });
  };

  const handleSaveCategory = async () => {
    if (!editingCategory?.name) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, insira um nome para a categoria.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      if (editingCategory.id) {
        // Atualização de categoria existente
        const { error } = await supabase
          .from('error_categories')
          .update({
            name: editingCategory.name,
            description: editingCategory.description,
            terms: editingCategory.terms,
            color: editingCategory.color
          })
          .eq('id', editingCategory.id);

        if (error) throw error;

        toast({
          title: "Categoria atualizada",
          description: "As alterações foram salvas com sucesso.",
        });
      } else {
        // Criação de nova categoria
        const { error } = await supabase
          .from('error_categories')
          .insert({
            name: editingCategory.name,
            description: editingCategory.description,
            terms: editingCategory.terms,
            color: editingCategory.color,
            user_id: user.id, // Adicionando o user_id do usuário autenticado
            is_custom: true // Marcando como categoria personalizada
          });

        if (error) throw error;

        toast({
          title: "Categoria criada",
          description: "Nova categoria adicionada com sucesso.",
        });
      }

      await handleCategoryChange();
      setEditingCategory(null);
    } catch (error: any) {
      toast({
        title: "Erro ao salvar categoria",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;

    try {
      const { error } = await supabase
        .from('error_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      toast({
        title: "Categoria excluída",
        description: "A categoria foi removida com sucesso.",
      });

      await handleCategoryChange();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir categoria",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAddTerm = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTerm.trim() && editingCategory) {
      setEditingCategory({
        ...editingCategory,
        terms: [...editingCategory.terms, newTerm.trim()]
      });
      setNewTerm('');
    }
  };

  const handleRemoveTerm = (termToRemove: string) => {
    if (editingCategory) {
      setEditingCategory({
        ...editingCategory,
        terms: editingCategory.terms.filter(term => term !== termToRemove)
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
        <NavBar />

      <div className="max-w-7xl text-muted-foreground mt-14 mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Configurações</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                <CardTitle className="text-xl  text-foreground">Categorias de Erro</CardTitle>
              </div>              <CardDescription>
                Gerencie as categorias usadas para classificar erros
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button
                  onClick={handleAddCategory}
                  className="w-full gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Nova Categoria
                </Button>

                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {categories.map(category => (
                      <Card key={category.id} className="relative">
                        <CardContent className="pt-6">
                          <div className="absolute top-2 right-2 flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingCategory(category)}
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteCategory(category.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            <h3 className="font-medium">{category.name}</h3>
                          </div>

                          {category.description && (
                            <p className="text-sm text-muted-foreground mb-3">
                              {category.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {category.terms.map(term => (
                              <Badge
                                key={term}
                                variant="secondary"
                                style={{
                                  backgroundColor: `${category.color}10`,
                                  borderColor: `${category.color}30`
                                }}
                              >
                                {term}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>

          {editingCategory && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {editingCategory.id ? 'Editar Categoria' : 'Nova Categoria'}
                </CardTitle>
                <CardDescription>
                  Configure os detalhes e termos da categoria
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome da categoria"
                      value={editingCategory.name}
                      onChange={(e) => setEditingCategory({
                        ...editingCategory,
                        name: e.target.value
                      })}
                      className="flex-1"
                    />
                    <div className="relative">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        style={{
                          backgroundColor: editingCategory.color + '10',
                          borderColor: editingCategory.color + '30'
                        }}
                      >
                        <Palette className="h-4 w-4" style={{ color: editingCategory.color }} />
                      </Button>

                      {showColorPicker && (
                        <Card className="absolute right-0 top-full mt-2 z-50">
                          <CardContent className="p-2">
                            <div className="grid grid-cols-6 gap-2">
                              {DEFAULT_COLORS.map((color, index) => (
                                <Button
                                  key={index}
                                  variant="outline"
                                  size="icon"
                                  className="w-8 h-8"
                                  style={{ backgroundColor: color }}
                                  onClick={() => {
                                    setEditingCategory({
                                      ...editingCategory,
                                      color
                                    });
                                    setShowColorPicker(false);
                                  }}
                                />
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>

                  <div>
                    <Textarea
                      placeholder="Descrição (opcional)"
                      value={editingCategory.description}
                      onChange={(e) => setEditingCategory({
                        ...editingCategory,
                        description: e.target.value
                      })}
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Termos de Identificação
                    </label>
                    <div className="flex gap-2 mb-2">
                      <div className="relative flex-1">
                        <Tag className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Adicione termos e pressione Enter"
                          value={newTerm}
                          onChange={(e) => setNewTerm(e.target.value)}
                          onKeyDown={handleAddTerm}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {editingCategory.terms.map(term => (
                        <Badge
                          key={term}
                          variant="secondary"
                          className="gap-1"
                          style={{
                            backgroundColor: `${editingCategory.color}10`,
                            borderColor: `${editingCategory.color}30`
                          }}
                        >
                          {term}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => handleRemoveTerm(term)}
                          />
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleSaveCategory}
                      disabled={isSaving}
                      className="flex-1 gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Salvar Categoria
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditingCategory(null)}
                      disabled={isSaving}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}