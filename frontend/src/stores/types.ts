import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getTypeDefinitions, getTypeDefinition, type TypeDefinition } from 'src/lib/api/client';

export const useTypesStore = defineStore('types', () => {
  const definitions = ref<Map<string, TypeDefinition>>(new Map());
  const loaded = ref(false);
  const loading = ref(false);

  async function loadDefinitions(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    try {
      const defs = await getTypeDefinitions();
      const map = new Map<string, TypeDefinition>();
      for (const def of defs) {
        map.set(def.name, def);
      }
      definitions.value = map;
      loaded.value = true;
      console.log(`[TypesStore] Loaded ${map.size} type definitions`);
    } catch (err) {
      console.warn('[TypesStore] Failed to load type definitions:', err);
    } finally {
      loading.value = false;
    }
  }

  function getDefinition(name: string): TypeDefinition | undefined {
    return definitions.value.get(name);
  }

  function getFieldsForLayout(name: string, layout: string): string[] {
    const def = definitions.value.get(name);
    if (!def?.layouts?.[layout]) return [];
    return def.layouts[layout].fields;
  }

  return {
    definitions,
    loaded,
    loading,
    loadDefinitions,
    getDefinition,
    getFieldsForLayout,
  };
});
