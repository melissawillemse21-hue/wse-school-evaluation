import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);
    const { email, password, school_name, school_code, full_name } = await req.json();

    if (!email || !password || !school_name || !school_code)
      return new Response(JSON.stringify({error:"email, password, school_name and school_code are required"}), {status:400,headers:cors});

    const { data: school, error: schoolError } = await admin
      .from("schools").insert({name:school_name,code:String(school_code).trim().toUpperCase()}).select().single();
    if (schoolError) throw schoolError;

    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email, password, email_confirm:true, user_metadata:{full_name:full_name || ""}
    });
    if (userError) {
      await admin.from("schools").delete().eq("id",school.id);
      throw userError;
    }

    await admin.from("profiles").upsert({id:created.user.id,full_name:full_name || ""});
    const { data: areaRows } = await admin.from("assessment_areas").select("slug");
    const { error: memberError } = await admin.from("school_members").insert({
      school_id:school.id,user_id:created.user.id,role:"admin",
      assigned_area_slugs:(areaRows||[]).map((x:any)=>x.slug)
    });
    if(memberError) throw memberError;

    return new Response(JSON.stringify({ok:true}), {status:200,headers:cors});
  } catch(e) {
    return new Response(JSON.stringify({error:e.message || String(e)}), {status:500,headers:cors});
  }
});
