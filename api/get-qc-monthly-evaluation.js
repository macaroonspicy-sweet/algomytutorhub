import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10'); // Default 10 data per halaman
    const from = (page - 1) * limit;
    const to = page * limit - 1;

    // URUTKAN DESCENDING SEBELUM PAGINASI RANGE
    const { data, count, error } = await supabase
      .from('QCMonthlyEvaluation') // Sesuaikan nama tabel Monthly Evaluation di Supabase
      .select('*', { count: 'exact' })
      .order('created_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data,
      total: count,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}