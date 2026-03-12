// Admin Data API – Zentraler GET-Endpoint für alle Dashboard-Daten
//
// Alle Queries nutzen den Service Role Key (umgeht RLS).
// Auth-Check: Bearer Token aus dem Admin-Frontend.

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth Check ──
  const authError = await verifyAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  const supabase = getServiceClient();
  const { type, limit, group_id } = req.query;

  try {
    switch (type) {

      // ─── KPIs ─────────────────────────────────────────────────────
      case 'kpi_trainers': {
        const { count, error } = await supabase
          .from('trainer_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('is_active', true);
        if (error) throw error;
        return res.json({ count });
      }

      case 'kpi_pending': {
        const { count, error } = await supabase
          .from('trainer_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (error) throw error;
        return res.json({ count });
      }

      case 'kpi_bookings_week': {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const { count, error } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', weekAgo.toISOString());
        if (error) throw error;
        return res.json({ count });
      }

      case 'kpi_revenue_month': {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
          .from('bookings')
          .select('price_cents')
          .gte('created_at', monthStart.toISOString())
          .in('status', ['CONFIRMED', 'COMPLETED']);
        if (error) throw error;
        const total = (data || []).reduce((sum, b) => sum + (b.price_cents || 0), 0);
        return res.json({ total_cents: total });
      }

      // ─── Trainers ────────────────────────────────────────────────
      case 'all_trainers': {
        const { data, error } = await supabase
          .from('trainer_profiles')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.json({ data });
      }

      case 'active_trainers': {
        const { data, error } = await supabase
          .from('trainer_profiles')
          .select('id, full_name')
          .eq('status', 'active')
          .eq('is_active', true)
          .order('full_name');
        if (error) throw error;
        return res.json({ data });
      }

      case 'recent_trainers': {
        const n = parseInt(limit) || 5;
        const { data, error } = await supabase
          .from('trainer_profiles')
          .select('id, full_name, email, city, status, created_at')
          .order('created_at', { ascending: false })
          .limit(n);
        if (error) throw error;
        return res.json({ data });
      }

      // ─── Bookings ────────────────────────────────────────────────
      case 'all_bookings': {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .order('scheduled_date', { ascending: false });
        if (error) throw error;

        // Enrich with trainer names
        const enriched = await enrichBookings(supabase, data || []);
        return res.json({ data: enriched });
      }

      case 'recent_bookings': {
        const n = parseInt(limit) || 5;
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(n);
        if (error) throw error;
        const enriched = await enrichBookings(supabase, data || []);
        return res.json({ data: enriched });
      }

      // ─── Finances ────────────────────────────────────────────────
      case 'finances': {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .order('scheduled_date', { ascending: false });
        if (error) throw error;
        const enriched = await enrichBookings(supabase, data || []);
        return res.json({ data: enriched });
      }

      case 'credits': {
        const { data, error } = await supabase
          .from('gutschriften')
          .select('*')
          .order('ausgestellt_am', { ascending: false });
        if (error) {
          // Table might not exist yet
          if (error.code === '42P01') return res.json({ data: [] });
          throw error;
        }
        return res.json({ data: data || [] });
      }

      // ─── Service Locations ───────────────────────────────────────
      case 'active_locations': {
        const { data, error } = await supabase
          .from('service_locations')
          .select('*')
          .eq('is_active', true)
          .order('city');
        if (error) {
          if (error.code === '42P01') return res.json({ data: [] });
          throw error;
        }
        return res.json({ data: data || [] });
      }

      case 'service_locations': {
        const { data, error } = await supabase
          .from('service_locations')
          .select('*')
          .order('city');
        if (error) {
          if (error.code === '42P01') return res.json({ data: [] });
          throw error;
        }
        return res.json({ data: data || [] });
      }

      // ─── Groups ──────────────────────────────────────────────────
      case 'all_groups': {
        const { data, error } = await supabase
          .from('group_classes')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) {
          if (error.code === '42P01') return res.json({ data: [] });
          throw error;
        }
        return res.json({ data: data || [] });
      }

      case 'group_participants': {
        if (!group_id) return res.status(400).json({ error: 'group_id fehlt' });
        const { data, error } = await supabase
          .from('group_participants')
          .select('*')
          .eq('group_class_id', group_id)
          .order('created_at', { ascending: false });
        if (error) {
          if (error.code === '42P01') return res.json({ data: [] });
          throw error;
        }
        return res.json({ data: data || [] });
      }

      default:
        return res.status(400).json({ error: `Unbekannter Datentyp: ${type}` });
    }
  } catch (err) {
    console.error('Admin Data API Error:', err);
    return res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return 'Token fehlt';
  }

  const token = authHeader.split(' ')[1];
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return 'Ungültiger Token';
  if (!user.user_metadata?.role?.includes('admin')) return 'Kein Admin-Zugang';

  return null; // OK
}

async function enrichBookings(supabase, bookings) {
  if (bookings.length === 0) return [];

  // Get unique trainer IDs
  const trainerIds = [...new Set(bookings.map(b => b.trainer_id).filter(Boolean))];
  let trainerMap = {};

  if (trainerIds.length > 0) {
    const { data: trainers } = await supabase
      .from('trainer_profiles')
      .select('id, full_name, payout_cents')
      .in('id', trainerIds);

    if (trainers) {
      trainers.forEach(t => { trainerMap[t.id] = t; });
    }
  }

  return bookings.map(b => ({
    ...b,
    trainer_name: trainerMap[b.trainer_id]?.full_name || null,
    payout_cents: trainerMap[b.trainer_id]?.payout_cents || null,
  }));
}
