/**
 * Template-related hooks
 */

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../../lib/adminApi.js';
import type { TemplateRow, TemplateDetail } from '../../types/admin.js';

export function useTemplates() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ templates: TemplateRow[] }>('/templates');
      setTemplates(data.templates);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  return { templates, loading, error, refetch: loadTemplates };
}

export function useTemplateDetail(id: string | null) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setTemplate(null);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<{ template: TemplateDetail }>(`/templates/${id}`)
      .then((data) => setTemplate(data.template))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  return { template, loading, error };
}

export function useSaveTemplate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (data: Partial<TemplateDetail>, id?: string) => {
      setLoading(true);
      setError(null);
      try {
        if (id) {
          return await apiFetch<{ template: TemplateRow }>(`/templates/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
          });
        }
        return await apiFetch<{ template: TemplateRow }>('/templates', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { save, loading, error };
}
