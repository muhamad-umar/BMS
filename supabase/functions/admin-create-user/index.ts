// @ts-ignore - Deno URL imports throw TS errors in VS Code unless the Deno extension is active
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore - Deno URL imports throw TS errors in VS Code unless the Deno extension is active
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number, resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10; // max 10 users per hour per owner

serve(async (req: Request) => {
  // Dynamically accept any origin to prevent CORS failures on different deployments
  const reqOrigin = req.headers.get('Origin') || '*';

  const corsHeaders = {
    'Access-Control-Allow-Origin': reqOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  };

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Helper to return 200 OK with error payload so frontend doesn't throw generic non-2xx error
  const sendError = (msg: string) => {
      return new Response(JSON.stringify({ error: msg }), { status: 200, headers: corsHeaders });
  };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return sendError('Missing Authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Create client to verify caller
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(jwt);
    
    if (userError || !user) {
      return sendError(`Unauthorized: Invalid or expired token. Details: ${userError?.message || 'No user found'}`);
    }

    // Verify role = 'owner'
    const { data: profile, error: profileError } = await supabaseUserClient
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'owner') {
      return sendError('Forbidden: Owner role required to create staff accounts.');
    }

    // Rate Limiting Logic
    const now = Date.now();
    const userLimit = rateLimitMap.get(user.id);

    if (userLimit && now < userLimit.resetAt) {
        if (userLimit.count >= RATE_LIMIT_MAX) {
            return sendError('Rate limit exceeded: Please wait before creating more users.');
        }
        userLimit.count += 1;
    } else {
        rateLimitMap.set(user.id, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }

    const { full_name, email, password } = await req.json();

    if (!email || !full_name) {
      return sendError('Missing required fields: Name and Email are required.');
    }

    // Generate password if not provided
    const tempPassword = password || Math.random().toString(36).slice(-10) + 'A1!';

    // Create admin client to bypass RLS and create user
    const supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: newUser, error: createError } = await supabaseAdminClient.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm for staff
      user_metadata: { must_change_password: true }
    });

    if (createError) {
      return sendError('Failed to create authentication user: ' + createError.message);
    }

    // Upsert into user_profiles in case a database trigger already created a default row
    const { error: insertError } = await supabaseAdminClient
      .from('user_profiles')
      .upsert({
        user_id: newUser.user.id,
        role: 'staff',
        full_name: full_name
      });

    if (insertError) {
      return sendError('User created but profile failed: ' + insertError.message);
    }

    return new Response(JSON.stringify({ success: true, temporary_password: tempPassword }), { status: 200, headers: corsHeaders });

  } catch (err: any) {
    return sendError('Server exception: ' + err.message);
  }
});
