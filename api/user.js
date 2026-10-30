import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, id, action, session_token } = req.body;

  try {
    if (action === 'ensure_token') {
      const token = session_token || `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
      await supabase.from('CustomUser').update({ session_token: token }).eq('id', id);
      return res.status(200).json({ session_token: token });
    }

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const { data: user, error } = await supabase
      .from('CustomUser')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    return res.status(200).json({ user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}