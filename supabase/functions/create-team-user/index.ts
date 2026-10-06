import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({error:"Not authenticated"}), {status:401,headers:cors});

    const body = await req.json();
    const { school_id, email, password, full_name, assigned_area_slugs=[] } = body;
    if (!school_id || !email || !password) return new Response(JSON.stringify({error:"school_id, email and password are required"}), {status:400,headers:cors});

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: membership } = await adminClient
      .from("school_members")
      .select("role")
      .eq("school_id", school_id)
      .eq("user_id", caller.id)
      .single();

    if (membership?.role !== "admin")
      return new Response(JSON.stringify({error:"Administrator access required"}), {status:403,headers:cors});

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || "" }
    });
    if (createError) throw createError;

    const userId = created.user.id;
    await adminClient.from("profiles").upsert({id:userId, full_name:full_name || ""});
    const { error: memberError } = await adminClient.from("school_members").insert({
      school_id, user_id:userId, role:"assessor", assigned_area_slugs
    });
    if (memberError) throw memberError;

    return new Response(JSON.stringify({ok:true,user_id:userId}), {status:200,headers:cors});
  } catch (e) {
    return new Response(JSON.stringify({error:e.message || String(e)}), {status:500,headers:cors});
  }
});
