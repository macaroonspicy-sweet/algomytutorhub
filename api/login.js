import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Membaca VITE_SUPABASE_URL atau SUPABASE_URL
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export default async function handler(req, res) {
  // Hanya terima method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Cek apakah Environment Variables terbaca di server Vercel
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase Environment Variables in Vercel Serverless');
    return res.status(500).json({ error: 'Server config error: Missing Supabase Env Variables' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifier and password are required' });
  }

  try {
    const identifierClean = identifier.trim().toLowerCase();

    // Query dari server Vercel ke Supabase
    const { data: users, error } = await supabase
      .from('CustomUser')
      .select('*')
      .or(`email.ilike.${identifierClean},username.ilike.${identifierClean}`);

    if (error) {
      console.error('[API Auth Error]:', error.message);
      return res.status(500).json({ error: `Database Error: ${error.message}` });
    }

    const user = (users && users[0]) || null;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.is_active === false) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    const hashedPassword = hashPassword(password);
    const storedHash = user.password_hash || '';

    // Verifikasi password
    if (storedHash.startsWith('sha256:')) {
      if (storedHash !== `sha256:${hashedPassword}`) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    } else if (storedHash.length === 64 && /^[0-9a-f]+$/.test(storedHash)) {
      if (storedHash !== hashedPassword) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      await supabase.from('CustomUser').update({ password_hash: `sha256:${hashedPassword}` }).eq('id', user.id);
    } else {
      if (storedHash !== password) {
        const legacyHash = hashPassword(storedHash);
        if (legacyHash !== hashedPassword) {
          return res.status(401).json({ error: 'Invalid password' });
        }
      }
      await supabase.from('CustomUser').update({ password_hash: `sha256:${hashedPassword}` }).eq('id', user.id);
    }

    // Generate session token
    const sessionToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
    await supabase.from('CustomUser').update({ session_token: sessionToken }).eq('id', user.id);

    return res.status(200).json({ ...user, session_token: sessionToken });
  } catch (err) {
    console.error('[Server Error]:', err);
    return res.status(500).json({ error: err.message || 'Gagal terhubung ke server database' });
  }
}