import { supabase } from '@/lib/supabaseClient';

export const db = {
  auth: {
    isAuthenticated: async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) return true;
      const localUser = localStorage.getItem('tutorhu_user');
      return !!localUser;
    },
    me: async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) return data.user;
      const localUser = localStorage.getItem('tutorhu_user');
      return localUser ? JSON.parse(localUser) : null;
    },
    logout: async () => {
      await supabase.auth.signOut();
      localStorage.removeItem('tutorhu_user');
    }
  },
  // Adapter fungsi serverless/backend Base44
  functions: {
    invoke: async (functionName, payload) => {
      console.warn(`[Supabase Mock] Invoked function '${functionName}' with payload:`, payload);
      // Mengembalikan array kosong/data aman agar widget tidak crash
      return { data: [] };
    }
  },
  entities: new Proxy({}, {
    get: (target, tableName) => ({
      list: async (query = {}) => {
        let builder = supabase.from(tableName).select('*');
        if (query && typeof query === 'object') {
          Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              builder = builder.eq(key, value);
            }
          });
        }
        const { data, error } = await builder;
        if (error) {
          console.error(`[Supabase Error] List ${tableName}:`, error.message);
          return [];
        }
        return data || [];
      },
      filter: async (query = {}) => {
        let builder = supabase.from(tableName).select('*');
        if (query && typeof query === 'object') {
          Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              builder = builder.eq(key, value);
            }
          });
        }
        const { data, error } = await builder;
        if (error) {
          console.error(`[Supabase Error] Fetch ${tableName}:`, error.message);
          return [];
        }
        return data || [];
      },
      get: async (id) => {
        const { data, error } = await supabase.from(tableName).select('*').eq('id', id).maybeSingle();
        if (error) console.error(`[Supabase Error] Get ${tableName}:`, error.message);
        return data || null;
      },
      create: async (payload) => {
        const { data, error } = await supabase.from(tableName).insert([payload]).select().single();
        if (error) {
          console.error(`[Supabase Error] Create ${tableName}:`, error.message);
          throw error;
        }
        return data || {};
      },
      update: async (id, payload) => {
        const { data, error } = await supabase.from(tableName).update(payload).eq('id', id).select().single();
        if (error) {
          console.error(`[Supabase Error] Update ${tableName}:`, error.message);
          throw error;
        }
        return data || {};
      },
      delete: async (id) => {
        const { error } = await supabase.from(tableName).delete().eq('id', id);
        if (error) console.error(`[Supabase Error] Delete ${tableName}:`, error.message);
        return true;
      },
      subscribe: (callback) => {
        const channel = supabase
          .channel(`public:${tableName}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (payload) => {
            if (callback) callback(payload);
          })
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    })
  }),
  integrations: {
    Core: {
      UploadFile: async (file) => {
        const fileName = `${Date.now()}_${file.name || 'file'}`;
        const { data, error } = await supabase.storage.from('uploads').upload(fileName, file);
        if (error) {
          console.error('[Supabase Storage Error]:', error.message);
          return { file_url: '' };
        }
        const { data: publicUrlData } = supabase.storage.from('uploads').getPublicUrl(fileName);
        return { file_url: publicUrlData.file_url || publicUrlData.publicUrl };
      }
    }
  }
};

globalThis.__B44_DB__ = db;
export const base44 = db;
export default db;