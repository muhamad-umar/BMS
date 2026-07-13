// @ts-ignore - Deno URL imports throw TS errors in VS Code unless the Deno extension is active
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore - Deno URL imports throw TS errors in VS Code unless the Deno extension is active
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Create client to verify caller
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Verify role = 'owner'
    const { data: profile, error: profileError } = await supabaseUserClient
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'Forbidden: Owner role required' }), { status: 403, headers: corsHeaders });
    }

    const { full_name, email, password } = await req.json();

    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
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
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: corsHeaders });
    }

    // Insert into user_profiles
    const { error: insertError } = await supabaseAdminClient
      .from('user_profiles')
      .insert({
        user_id: newUser.user.id,
        role: 'staff',
        full_name: full_name
      });

    if (insertError) {
      return new Response(JSON.stringify({ error: 'User created but profile failed: ' + insertError.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, temporary_password: tempPassword }), { status: 200, headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
