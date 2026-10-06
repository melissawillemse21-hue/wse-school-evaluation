import { createClient } from '@supabase/supabase-js';
import data from './assessment-data.json';

const cfg = window.WSE_CONFIG || {};
if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  document.body.innerHTML = '<div style="padding:30px;font-family:system-ui"><h2>Configuration required</h2><p>Create <code>config.js</code> from <code>config.example.js</code> and add your Supabase URL and anon key.</p></div>';
  throw new Error('Missing Supabase configuration');
}
const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
let session = null, school = null, member = null, areas = data.areas, items = data.items;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function loadContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return showLogin();
  session = user;
  const { data: memberships, error } = await supabase.from('school_members')
    .select('*, schools(*)').eq('user_id', user.id);
  if (error || !memberships?.length) return showError(error?.message || 'No school access assigned.');
  member = memberships[0]; school = member.schools;
  renderShell();
  await dashboard();
}

function showLogin() {
  $('app').innerHTML = `<div class="login"><h1>Whole School Evaluation</h1>
  <p>Secure multi-school assessment platform</p>
  <input id="email" type="email" placeholder="Email">
  <input id="password" type="password" placeholder="Password">
  <button id="signIn">Sign in</button>
  <button class="secondary" id="signUp">Create school administrator</button>
  <div id="authMsg"></div></div>`;
  $('signIn').onclick = signIn;
  $('signUp').onclick = createSchool;
}
async function signIn() {
  const {error} = await supabase.auth.signInWithPassword({email:$('email').value,password:$('password').value});
  if(error) return $('authMsg').textContent=error.message;
  await loadContext();
}
async function createSchool() {
  const email=prompt('Administrator email'); if(!email)return;
  const password=prompt('Administrator password (minimum 8 characters)'); if(!password)return;
  const name=prompt('School name'); if(!name)return;
  const code=prompt('School code (unique, e.g. SCHOOL001)'); if(!code)return;
  const fullName=prompt('Administrator name')||'';
  const {data,error}=await supabase.functions.invoke('create-school',{body:{
    email,password,school_name:name,school_code:code,full_name:fullName
  }});
  if(error)return alert(error.message);
  if(data?.error)return alert(data.error);
  alert('School administrator created. You can now sign in.');
}
async function logout(){await supabase.auth.signOut();location.reload();}
function renderShell(){
  $('app').innerHTML=`<div class="shell"><aside><h2>WSE Platform</h2>
  <div class="nav">
   <button data-page="dashboard">Dashboard</button><button data-page="assessments">Assessments</button>
   <button data-page="plans">Improvement Plans</button><button data-page="team">School Users</button><button data-page="history">History</button>
   <button id="logout">Sign out</button>
  </div></aside><main><header><div><h1 id="title">Dashboard</h1><p id="subtitle">${esc(school.name)}</p></div><span>${esc(session.email)}</span></header><section id="content"></section></main></div>`;
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
  $('logout').onclick=logout;
}
function canAccess(areaSlug){ return member.role==='admin' || (member.assigned_area_slugs||[]).includes(areaSlug); }
async function dashboard(){
  setHeader('Dashboard','Your school evaluation overview');
  const {data:assessments}=await supabase.from('assessments').select('*, assessment_responses(rating)').eq('school_id',school.id);
  const completed=(assessments||[]).filter(a=>a.status==='completed').length;
  const openPlans=(assessments||[]).flatMap(a=>a.assessment_responses||[]).filter(r=>r.rating<=3).length;
  $('content').innerHTML=`<div class="cards"><div><b>${completed}</b><span>completed assessment areas</span></div><div><b>${openPlans}</b><span>items needing improvement</span></div><div><b>${areas.filter(a=>canAccess(a.slug)).length}</b><span>areas you can access</span></div></div>
  <div class="panel"><h3>Assessment progress</h3>${areas.filter(a=>canAccess(a.slug)).map(a=>`<button class="area" data-area="${a.slug}">${esc(a.name)} <span>Open →</span></button>`).join('')}</div>`;
  document.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>openAssessment(b.dataset.area));
}
async function openAssessment(areaSlug){
  if(!canAccess(areaSlug))return alert('You do not have access to this assessment area.');
  const area=areas.find(a=>a.slug===areaSlug);
  const {data:its,error:itemError}=await supabase.from('assessment_items').select('*').eq('area_slug',areaSlug).order('sort_order');
  if(itemError)return alert(itemError.message);
  let {data:assessment}=await supabase.from('assessments').select('*').eq('school_id',school.id).eq('area_slug',areaSlug).maybeSingle();
  if(!assessment){
    const ins=await supabase.from('assessments').insert({school_id:school.id,area_slug:areaSlug}).select().single();
    if(ins.error)return alert(ins.error.message); assessment=ins.data;
  }
  const {data:responses}=await supabase.from('assessment_responses').select('*').eq('assessment_id',assessment.id);
  const byItem=Object.fromEntries((responses||[]).map(r=>[r.item_id,r]));
  setHeader(area.name,'Rate each item from 1–5. Ratings 1–3 open the improvement workspace.');
  $('content').innerHTML=`<div class="progress"><strong id="pct">0%</strong><div><div id="fill"></div></div><span id="count"></span></div>
  <div id="items"></div><button class="save" id="save">Save assessment</button><span id="saved"></span>`;
  const render=()=>{
    let scored=0;
    $('items').innerHTML=its.map((it,n)=>{
      const r=byItem[it.id]||{}, rating=r.rating||0; if(rating)scored++;
      const suggestions=it.suggestions||[];
      const displayName = (it.name||'').startsWith(`${it.number} `) ? (it.name||'').slice((it.number||'').length+1) : (it.name||'');
      const displayStatement = (it.statement||'').startsWith(`${it.number} `) ? (it.statement||'').slice((it.number||'').length+1) : (it.statement||'');
      return `<article class="item"><small>${esc(it.section_name||'')}</small><h3>${esc(it.number)} ${esc(displayName)}</h3><p>${esc(displayStatement)}</p>
       <div class="ratings">${[1,2,3,4,5].map(v=>`<button class="${rating===v?'sel':''}" data-rate="${it.id}:${v}">${v}</button>`).join('')}</div>
       <div class="improve ${rating>0&&rating<=3?'':'hide'}" id="imp-${it.id}">
       <label>Finding / Current Situation<textarea data-field="finding:${it.id}">${esc(r.finding||'')}</textarea></label>
       <h4>Choose suggested improvements</h4>
       ${suggestions.map((s,j)=>`<label class="suggest"><input type="checkbox" data-suggestion="${it.id}:${j}" ${(r.selected_suggestions||[]).includes(j)?'checked':''}><span><b>${esc(s.title)}</b><small>${esc(s.recommendation)}</small></span></label>`).join('')}
       <label><b>My own improvement</b>
       <textarea data-field="own:${it.id}" placeholder="Describe your own improvement">${esc(r.own_improvement||'')}</textarea></label>
       <div class="two"><label>Recommendation<textarea data-field="recommendation:${it.id}">${esc(r.recommendation||'')}</textarea></label><label>Action Required<textarea data-field="action:${it.id}">${esc(r.action_required||'')}</textarea></label>
       <label>Responsible Person<input data-field="responsible:${it.id}" value="${esc(r.responsible_person||'')}"></label>
       <label>Priority<select data-field="priority:${it.id}"><option></option>${['High','Medium','Low'].map(x=>`<option ${r.priority===x?'selected':''}>${x}</option>`).join('')}</select></label>
       <label>Target Date<input type="date" data-field="target:${it.id}" value="${esc(r.target_date||'')}"></label>
       <label>Estimated Budget<input type="number" data-field="budget:${it.id}" value="${esc(r.estimated_budget??'')}"></label>
       <label>Status<select data-field="status:${it.id}">${['Not Started','In Progress','Completed','Deferred','Not Applicable'].map(x=>`<option ${r.status===x?'selected':''}>${x}</option>`).join('')}</select></label>
       <label>Progress / Follow-up<textarea data-field="progress:${it.id}">${esc(r.progress||'')}</textarea></label></div>
       </div></article>`;
    }).join('');
    const pct=Math.round(scored/its.length*100); $('pct').textContent=pct+'%'; $('fill').style.width=pct+'%'; $('count').textContent=`${scored} of ${its.length} items rated`;
  };
  render();
  $('items').addEventListener('click',e=>{
    const b=e.target.closest('[data-rate]'); if(!b)return;
    const [id,v]=b.dataset.rate.split(':'); byItem[id]=byItem[id]||{item_id:id}; byItem[id].rating=+v; render();
  });
  $('items').addEventListener('input',e=>collectField(e.target,byItem));
  $('items').addEventListener('change',e=>collectField(e.target,byItem));
  $('save').onclick=async()=>{
    const rows=Object.values(byItem).map(r=>({...r,assessment_id:assessment.id}));
    const {error}=await supabase.from('assessment_responses').upsert(rows,{onConflict:'assessment_id,item_id'});
    if(error)return alert(error.message);
    const complete=its.every(it=>byItem[it.id]?.rating);
    await supabase.from('assessments').update({status:complete?'completed':'in_progress',completed_by:complete?session.id:null,completed_at:complete?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',assessment.id);
    $('saved').textContent=complete?'✓ Assessment saved and completed.':'✓ Assessment saved.';
    $('saved').className='saved';
    render();
  };
}
function collectField(el, byItem){
  const [field,id]=String(el.dataset.field||'').split(':'); if(!field)return;
  byItem[id]=byItem[id]||{item_id:id};
  const r=byItem[id];
  if(field==='finding')r.finding=el.value;
  if(field==='own')r.own_improvement=el.value;
  if(field==='recommendation')r.recommendation=el.value;
  if(field==='action')r.action_required=el.value;
  if(field==='responsible')r.responsible_person=el.value;
  if(field==='priority')r.priority=el.value||null;
  if(field==='target')r.target_date=el.value||null;
  if(field==='budget')r.estimated_budget=el.value?+el.value:null;
  if(field==='status')r.status=el.value;
  if(field==='progress')r.progress=el.value;
  const s=el.dataset.suggestion; if(s){const [item,j]=s.split(':');byItem[item].selected_suggestions=Array.from(document.querySelectorAll(`[data-suggestion^="${item}:"]`)).map((x,i)=>x.checked?i:null).filter(x=>x!==null);}
}
async function team(){
  if(member.role!=='admin')return $('content').innerHTML='<div class="panel">Administrator access required.</div>';
  setHeader('School Users','Add team members and assign assessment areas.');
  const {data:members}=await supabase.from('school_members').select('*, profiles(full_name)').eq('school_id',school.id);
  $('content').innerHTML=`<div class="panel"><h3>Add assessment user</h3><div class="two"><input id="newName" placeholder="Full name"><input id="newEmail" type="email" placeholder="Email"><input id="newPassword" type="password" placeholder="Temporary password"></div>
  <div class="checks">${areas.map(a=>`<label><input type="checkbox" value="${a.slug}" class="areaCheck"> ${esc(a.name)}</label>`).join('')}</div><button class="save" id="addUser">Create user</button></div>
  <div class="panel"><h3>Current users</h3><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Areas</th></tr>${(members||[]).map(m=>`<tr><td>${esc(m.profiles?.full_name||'')}</td><td>${esc(m.user_id===session.id?session.email:'')}</td><td>${esc(m.role)}</td><td>${m.role==='admin'?'All areas':(m.assigned_area_slugs||[]).map(s=>esc(areas.find(a=>a.slug===s)?.name||s)).join('<br>')}</td></tr>`).join('')}</table></div>`;
  $('addUser').onclick=async()=>{
    const assigned=[...document.querySelectorAll('.areaCheck:checked')].map(x=>x.value);
    const {data,error}=await supabase.functions.invoke('create-team-user',{body:{school_id:school.id,email:$('newEmail').value,password:$('newPassword').value,full_name:$('newName').value,assigned_area_slugs:assigned}});
    if(error)return alert(error.message); if(data?.error)return alert(data.error); alert('User created.'); team();
  };
}
async function plans(){
  setHeader('Improvement Plans','School-wide improvement actions.');
  const {data:assessments}=await supabase.from('assessments').select('id,area_slug,assessment_responses(*)').eq('school_id',school.id);
  const rows=(assessments||[]).flatMap(a=>(a.assessment_responses||[]).filter(r=>r.rating<=3).map(r=>({...r,area:a.area_slug})));
  $('content').innerHTML=`<div class="panel"><table><tr><th>Area</th><th>Item</th><th>Rating</th><th>Finding</th><th>Priority</th><th>Status</th></tr>${rows.map(r=>{const it=items.find(i=>i.id===r.item_id);return `<tr><td>${esc(areas.find(a=>a.slug===r.area)?.name||r.area)}</td><td>${esc(it?.number+' '+it?.name||r.item_id)}</td><td>${r.rating}/5</td><td>${esc(r.finding||'')}</td><td>${esc(r.priority||'')}</td><td>${esc(r.status||'')}</td></tr>`}).join('')}</table></div>`;
}
async function history(){setHeader('History','Completed and in-progress assessments.');const {data}=await supabase.from('assessments').select('*').eq('school_id',school.id).order('updated_at',{ascending:false});$('content').innerHTML=`<div class="panel"><table><tr><th>Area</th><th>Status</th><th>Updated</th><th>Completed</th></tr>${(data||[]).map(a=>`<tr><td>${esc(areas.find(x=>x.slug===a.area_slug)?.name||a.area_slug)}</td><td>${esc(a.status)}</td><td>${new Date(a.updated_at).toLocaleString()}</td><td>${a.completed_at?new Date(a.completed_at).toLocaleString():'—'}</td></tr>`).join('')}</table></div>`}
function setHeader(t,s){$('title').textContent=t;$('subtitle').textContent=s}
function showError(msg){document.body.innerHTML=`<div style="padding:30px;font-family:system-ui"><h2>WSE error</h2><p>${esc(msg)}</p></div>`}
async function navigate(p){if(p==='dashboard')return dashboard();if(p==='assessments')return dashboard();if(p==='team')return team();if(p==='plans')return plans();if(p==='history')return history();}
supabase.auth.onAuthStateChange(()=>loadContext());
loadContext();
