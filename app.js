import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit, doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, where, getDocs, runTransaction, writeBatch, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cliente de Supabase: SOLO se usa para las sensibilidades publicadas al feed
// (chat de texto y hud del feed siguen en Firestore, sin cambios).
const SB_URL = "https://ffbtdvaevcphpuxiojte.supabase.co";
const SB_KEY = "sb_publishable_jbf9UKY-3FndEYA9APWWjw_i_tZ4dxA";
const sb = createClient(SB_URL, SB_KEY);
// Escrituras del feed: pasan por la Edge Function "feed", que verifica tu sesión de Firebase
async function _feedCall(action,nick,body){
  try{
    const u=await ensureAuth(); if(!u) return false;
    const tok=await u.getIdToken();
    const r=await fetch(SB_URL+"/functions/v1/feed",{method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+tok,"apikey":SB_KEY},
      body:JSON.stringify({action,nickname:nick,...(body||{})})});
    if(!r.ok){ console.error("feed:",action,r.status,await r.text().catch(()=>"")); return false; }
    return true;
  }catch(e){ console.error("feed:",action,e); return false; }
}

const FB = {
  apiKey:"AIzaSyBbQYpPdRH_rVeZmMLwU8vBvIX_9-EBnO8",
  authDomain:"sensis-good-ff-217fd.firebaseapp.com",
  projectId:"sensis-good-ff-217fd",
  storageBucket:"sensis-good-ff-217fd.firebasestorage.app",
  messagingSenderId:"708862120786",
  appId:"1:708862120786:web:a374242f39ec464408608b"
};
const _fbApp = initializeApp(FB);
const db = getFirestore(_fbApp);
const auth = getAuth(_fbApp);
// ── SEGURIDAD: toda petición lleva una sesión de Firebase (anónima o Google) ──
const ADMIN_EMAIL="carlossaebzx@gmail.com"; // <- cámbialo por TU Gmail (el mismo que en firestore.rules)
let _authReadyP=null;
function ensureAuth(){
  if(_authReadyP) return _authReadyP;
  _authReadyP=new Promise((resolve)=>{
    const un=onAuthStateChanged(auth,async u=>{
      if(u){ un(); resolve(u); return; }
      try{ await signInAnonymously(auth); }
      catch(e){ console.error("No se pudo iniciar sesión anónima (¿activaste 'Anónimo' en Firebase Auth?):",e); un(); resolve(null); }
    });
  });
  return _authReadyP;
}
// Todo lo que sigue (listeners, feed, etc.) espera a tener sesión
try{ await Promise.race([ensureAuth(),new Promise(r=>setTimeout(r,10000))]); }catch(e){ console.error(e); }
const _gProvider = new GoogleAuthProvider();
_gProvider.addScope("email");
_gProvider.addScope("profile");
_gProvider.setCustomParameters({ prompt: "select_account" }); // Siempre muestra selector de cuenta

// ── CONSTANTS ─────────────────────────────────────────
// ── CRYPTO UTILS ──────────────────────────────────────
const _xd=(b,k)=>atob(b).split(",").map(Number).map((n,i)=>String.fromCharCode(n^(k+i))).join("");

// Decisión INMEDIATA (antes de que Firebase inicialice) de qué pantalla mostrar:
// si hay una sesión guardada, mostramos el splash (spinner) en vez del login,
// para que el usuario nunca vea el login "parpadear" antes de entrar solo.
(function(){
  const _si=document.getElementById("spImg"),_li=document.querySelector("#loginScreen .login-logo img"); if(_si&&_li) _si.src=_li.src; // mismo logo que el login
  const _earlyNick=localStorage.getItem(_xd("ODEsODQ=",0x36));
  const loginEl=document.getElementById("loginScreen");
  const splashEl=document.getElementById("splashScreen");
  if(_earlyNick){
    if(splashEl) splashEl.style.display="flex";
  } else {
    if(loginEl) loginEl.classList.add("show");
  }
})();

// ── FILTRO DE PALABRAS (chat libre) ──────────────────────────────────
const _badWords=["puto","puta","mierda","pendejo","pendeja","idiota","imbecil","imbécil","estupido","estúpido","cabron","cabrón","verga","chinga","chingar","culero","culera","marica","maricon","maricón","perra","zorra","hijueputa","hdp","gilipollas","carajo","coño","pinche","mames","ojete","violador","cocaina","cocaína","puttana","fuck","shit","bitch","asshole","whore","slut"];
function censurarTexto(txt){
  let out=txt;
  _badWords.forEach(w=>{
    const re=new RegExp("\\b"+w+"\\w*","gi");
    out=out.replace(re,m=>m[0]+"*".repeat(Math.max(1,m.length-1)));
  });
  return out;
}
const _xe=(s,k)=>btoa(s.split("").map((c,i)=>(c.charCodeAt(0)^(k+i)).toString()).join(","));
const _C={f:()=>_xd("ODEsOTMsOTIsOTQ=",0x37),u:()=>_xd("NjYsNzUsNzYsOTEsNzMsODUsODIsNzc=",0x37),l:()=>_xd("OTEsODEsODQsODMsNzksODksNzg=",0x37),p:()=>_xd("NzEsNzQsODAsNzYsOTAsODgsODIsNzc=",0x37)};
function _hsh(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h*0x01000193)>>>0;}return h.toString(36);}
function _signUID(u){return _xe(_hsh(u)+"_"+u.slice(-4),0x2A);}
function _verifyUID(s,u){try{const d=_xd(s,0x2A);return d.endsWith("_"+u.slice(-4));}catch{return false;}}
const EMOJIS=["☠️","⚡","⚙️","📂","🎁","🤫","📲","🔥","😱","🫡","👹","👺","👋","👍"];
const NL={baja:"🟢 BAJA",media:"🔵 MEDIA",alta:"🔴 ALTA"};

const MAX_DEF=5;

// ── CÓDIGOS DE CANJE (6 dígitos, un solo uso, validado en servidor) ──────
// El estado de "usado" vive SOLO en Firestore (colección redeemCodes,
// doc id = el código) y en el doc de boost por owner-key (uid/fingerprint).
// Nunca se guarda en localStorage: así no se puede "reciclar" un código
// borrando datos del navegador ni reusarlo desde otro dispositivo.
const REDEEM_CODES={
  "482913":{type:"premium",  label:"✨ SENSI PREMIUM"},
  "119284":{type:"boost10_2d",label:"🔓 LÍMITE 10/5H · 2 DÍAS"},
  "556071":{type:"boost10_1d",label:"🔓 LÍMITE 10/5H · 1 DÍA"},
  "930447":{type:"unlimited_1h",label:"♾️ SENSIS ILIMITADAS · 1H"}
};
const _DAY_MS=24*60*60*1000;
let _boostsList=[]; // lista cruda cacheada de Firestore; se evalúa EN VIVO contra Date.now() en cada llamada
let _premiumPending=false; // reflejo en RAM del flag persistido en Firestore

function _ownerKey(){ return auth.currentUser?auth.currentUser.uid:("fp_"+DEVICE_ID); }
// Evalúa en vivo, cada vez que se llama, cuáles boosts siguen vigentes -> así
// cada uno se "aplica" mientras dure y se "desaplica" solo al vencer, sin
// importar si otro boost más fuerte (o más débil) vence antes o después.
function _effectiveMax(){
  const now=Date.now();
  const alive=_boostsList.filter(b=>b.until>now);
  if(alive.some(b=>b.unlimited)) return Infinity;
  const bestMax=alive.reduce((m,b)=>Math.max(m,b.max||0),0);
  return Math.max(myMax,bestMax);
}
function _activeBoostUntil(){ // para mostrar "vence en..." si hace falta, y saber si hay algo vigente
  const now=Date.now();
  const alive=_boostsList.filter(b=>b.until>now);
  return alive.length?Math.max(...alive.map(b=>b.until)):0;
}
function _isUnlimitedNow(){ const now=Date.now(); return _boostsList.some(b=>b.unlimited&&b.until>now); }
// Formatea un ms restante como "2d 4h", "5h 12m", "8m 30s" o "12s" (siempre el
// par de unidades más relevante, nunca todas juntas para no saturar la UI).
function _fmtRemaining(ms){
  if(ms<=0) return "0s";
  const s=Math.floor(ms/1000)%60, m=Math.floor(ms/60000)%60, h=Math.floor(ms/3600000)%24, d=Math.floor(ms/86400000);
  if(d>0) return d+"d "+h+"h";
  if(h>0) return h+"h "+m+"m";
  if(m>0) return m+"m "+s+"s";
  return s+"s";
}
async function _loadBoost(){
  try{
    const snap=await getDoc(doc(db,_C.l(),_ownerKey()+"_boost"));
    const b=snap.exists()?snap.data():null;
    const until=b&&b.until&&b.until.toMillis?b.until.toMillis():0;
    _boostsList=(b&&until>Date.now())?[{max:b.max||0,until,unlimited:!!b.unlimited}]:[];
  }catch(e){ console.error("No se pudo cargar el boost:",e); _boostsList=[]; }
  updateCounter();
  if(!window._boostTicker) window._boostTicker=setInterval(updateCounter,20000);
  try{
    const pSnap=await getDoc(doc(db,_C.l(),_ownerKey()+"_premium"));
    _premiumPending=pSnap.exists()&&pSnap.data().pending===true;
  }catch(e){ console.error("No se pudo cargar el premium pendiente:",e); }
}
async function _setPremiumPending(val){
  _premiumPending=val;
  if(val) return; // activarlo solo es posible canjeando el código (ver redeemCode)
  try{ await setDoc(doc(db,_C.l(),_ownerKey()+"_premium"),{pending:false,ts:serverTimestamp()}); }
  catch(e){ console.error("No se pudo guardar el estado premium:",e); }
}
const CODE_RESET_MS=3*24*60*60*1000; // los códigos se pueden volver a canjear cada 3 días (por persona)
async function redeemCode(code){
  const info=REDEEM_CODES[code];
  if(!info){ addMsg("bot","❌ Código inválido."); return; }
  const nowCheck=Date.now();
  const aliveBoost=_boostsList.some(b=>b.until>nowCheck);
  if(aliveBoost||_premiumPending){
    const until=_activeBoostUntil();
    const remainTxt=(until>nowCheck)?" (queda "+_fmtRemaining(until-nowCheck)+")":"";
    addMsg("bot","⏳ Ya tenés un código en uso"+remainTxt+". Esperá a que termine (o generes tu sensi, si es Premium) para canjear otro.");
    return;
  }
  const uid=auth.currentUser.uid;
  const useRef=doc(db,"redeemCodeUses",code+"_"+uid);
  try{
    const prev=await getDoc(useRef);
    if(prev.exists()){
      const prevMs=prev.data().ts?.toMillis?prev.data().ts.toMillis():0;
      if(Date.now()-prevMs<CODE_RESET_MS){
        addMsg("bot","❌ Ya canjeaste este código. Vuelve a estar disponible en "+_fmtRemaining(CODE_RESET_MS-(Date.now()-prevMs))+".");
        return;
      }
    }
  }catch(e){ console.error(e); }
  // Un solo lote: marca de canje + beneficio. Las reglas de Firestore validan TODO en el servidor.
  const durMs={boost10_2d:2*_DAY_MS,boost10_1d:1*_DAY_MS,unlimited_1h:60*60*1000}[info.type];
  const b=writeBatch(db);
  b.set(useRef,{code,uid,usedByNick:nickname,type:info.type,ts:serverTimestamp()});
  if(info.type==="premium"){
    b.set(doc(db,_C.l(),uid+"_premium"),{pending:true,code,ts:serverTimestamp()});
  } else {
    b.set(doc(db,_C.l(),uid+"_boost"),{
      max:info.type==="unlimited_1h"?0:10,
      until:Timestamp.fromMillis(Date.now()+durMs),
      unlimited:info.type==="unlimited_1h",
      code,type:info.type
    });
  }
  try{ await b.commit(); }
  catch(e){ console.error(e); addMsg("bot","❌ No se pudo validar el código. Intenta de nuevo."); return; }
  if(info.type==="premium"){
    _premiumPending=true;
    addMsg("bot","✅ Código canjeado: "+info.label+"\n\nTu próxima sensi será PREMIUM: funciona para cualquier modelo y no se publica en el chat en vivo (feed). Escribe tu marca y modelo cuando quieras.");
  } else {
    _boostsList=[{max:info.type==="unlimited_1h"?0:10,until:Date.now()+durMs,unlimited:info.type==="unlimited_1h"}];
    updateCounter();
    if(info.type==="boost10_2d") addMsg("bot","✅ Código canjeado: "+info.label+"\n\nTu límite subió de "+MAX_DEF+" a 10 sensis cada 5 horas durante 2 días.");
    else if(info.type==="boost10_1d") addMsg("bot","✅ Código canjeado: "+info.label+"\n\nTu límite subió de "+MAX_DEF+" a 10 sensis cada 5 horas durante 1 día.");
    else addMsg("bot","✅ Código canjeado: "+info.label+"\n\nSensis ILIMITADAS durante la próxima hora. ⚡");
  }
}

// ── STATE ─────────────────────────────────────────────
let nickname="", step="idle", data={}, myCount=0, myMax=MAX_DEF;
let currentTheme="default", currentColor="#38BEFF", pendingTheme="default", pendingColor="#38BEFF";
let activeFeedId=null;

// ── DEVICE FINGERPRINT (anti-trampas nivel Play Protect) ─
async function buildFingerprint(){
  const nav=window.navigator;
  const scr=window.screen;
  // Señales de hardware/browser que NO cambian con incógnito, cookies borradas ni cambio de nombre
  const signals=[
    nav.hardwareConcurrency||0,          // núcleos CPU
    nav.deviceMemory||0,                  // RAM (GB)
    scr.width+"x"+scr.height,            // resolución
    scr.colorDepth,                       // profundidad de color
    nav.platform||"",                     // plataforma OS
    nav.language||"",                     // idioma
    Intl.DateTimeFormat().resolvedOptions().timeZone||"", // zona horaria
    nav.maxTouchPoints||0,               // puntos táctiles
    typeof nav.getBattery,               // API batería disponible
    typeof window.DeviceMotionEvent,     // acelerómetro
    (nav.plugins&&nav.plugins.length)||0, // plugins
  ];
  // Canvas fingerprint — cada GPU/driver renderiza diferente
  try{
    const cv2=document.createElement("canvas");
    const c2=cv2.getContext("2d");
    c2.textBaseline="top"; c2.font="14px Arial";
    c2.fillStyle="#f60"; c2.fillRect(0,0,100,30);
    c2.fillStyle="#069"; c2.fillText("SENSIS☠",2,2);
    c2.strokeStyle="rgba(102,204,0,0.7)";
    c2.beginPath(); c2.arc(50,15,10,0,Math.PI*2); c2.stroke();
    signals.push(cv2.toDataURL().slice(-30));
  }catch(e){}
  // WebGL fingerprint
  try{
    const gl=document.createElement("canvas").getContext("webgl");
    if(gl){
      signals.push(gl.getParameter(gl.RENDERER)||"");
      signals.push(gl.getParameter(gl.VENDOR)||"");
    }
  }catch(e){}
  // Audio fingerprint (con timeout — en móvil el AudioContext puede quedar suspendido
  // hasta que el usuario interactúa, y no debe bloquear el arranque del script)
  try{
    const ac=new(window.AudioContext||window.webkitAudioContext)();
    const osc=ac.createOscillator();
    const an=ac.createAnalyser();
    osc.connect(an); an.connect(ac.destination);
    osc.start(0); osc.stop(0.01);
    signals.push(ac.sampleRate||0);
    await Promise.race([ ac.close(), new Promise(res=>setTimeout(res,300)) ]);
  }catch(e){}
  const raw=signals.join("|");
  return _hsh(raw).toString(36);
}

async function getDeviceId(){
  // Combina fingerprint (estable) + ID persistente (IndexedDB — sobrevive clear cookies)
  const fp=await buildFingerprint();
  // Intentar leer de IndexedDB primero (con timeout — en incógnito/algunos móviles puede bloquearse)
  const _to=ms=>new Promise(res=>setTimeout(()=>res(null),ms));
  let idbId=await Promise.race([idbGet("sg_fp"), _to(500)]);
  if(!idbId){ idbId="f"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); await Promise.race([idbSet("sg_fp",idbId), _to(500)]); }
  // ID final = hash(fingerprint + idbId) — no cambia aunque borres localStorage
  return _hsh(fp+idbId).toString(36);
}

// IndexedDB helpers — sobrevive borrar cookies y localStorage
function idbGet(key){
  return new Promise(res=>{
    try{
      const r=indexedDB.open("_sg",1);
      r.onupgradeneeded=e=>e.target.result.createObjectStore("kv");
      r.onsuccess=e=>{ const t=e.target.result.transaction("kv","readonly"); const g=t.objectStore("kv").get(key); g.onsuccess=()=>res(g.result||null); g.onerror=()=>res(null); };
      r.onerror=()=>res(null);
    }catch{res(null);}
  });
}
function idbSet(key,val){
  return new Promise(res=>{
    try{
      const r=indexedDB.open("_sg",1);
      r.onupgradeneeded=e=>e.target.result.createObjectStore("kv");
      r.onsuccess=e=>{ const t=e.target.result.transaction("kv","readwrite"); t.objectStore("kv").put(val,key); t.oncomplete=()=>res(); t.onerror=()=>res(); };
      r.onerror=()=>res();
    }catch{res();}
  });
}

const DEVICE_ID=await getDeviceId();

// ── FIRESTORE LIMIT (inmutable desde cliente) ─────────
function getLimitKey(today){
  // Google users: límite por UID de Google (persiste en todos sus dispositivos)
  // Sin Google: límite por fingerprint del dispositivo
  const base=auth.currentUser?auth.currentUser.uid:("fp_"+DEVICE_ID);
  return base+"_"+today;
}
// Resuelve el nombre ACTUAL de un usuario a partir de su UID estable
// (el UID nunca cambia aunque el usuario se renombre; esto evita que el
// Programa de Creadores se desincronice cuando alguien cambia su nombre)
async function _resolveCurrentNickByUid(uid){
  if(!uid) return null;
  try{
    const q=query(collection(db,_C.u()),where("uid","==",uid));
    const snap=await getDocs(q);
    if(snap.empty) return null;
    // Si por algún motivo quedó más de un documento con el mismo UID (p.ej. un
    // borrado anterior que falló), nos quedamos con el más reciente según
    // lastRenameTs/lastSeen en vez de confiar en el orden de Firestore.
    let best=null, bestTs=-1;
    snap.forEach(d=>{
      const data=d.data();
      const ts=(data.lastRenameTs&&data.lastRenameTs.toMillis)?data.lastRenameTs.toMillis():(data.lastSeen&&data.lastSeen.toMillis)?data.lastSeen.toMillis():0;
      if(ts>=bestTs){ bestTs=ts; best=data.nickname||d.id; }
    });
    return best;
  }catch(e){ console.error("No se pudo resolver el nombre actual por UID:",e); }
  return null;
}

var _winReset=0; const WIN_MS=5*60*60*1000; // 5 sensis cada 5 horas: la ventana empieza con la primera sensi y se reinicia sola
function _winKey(){ return auth.currentUser.uid+"_win"; }
function _winLeft(){ const l=_winReset-Date.now(); return l>0?_fmtRemaining(l):"unos minutos"; }
function _winTick(){ if(_winReset&&Date.now()>=_winReset){ myCount=0; _winReset=0; } }
async function getServerCount(nick){
  const snap=await getDoc(doc(db,_C.l(),_winKey()));
  if(!snap.exists()) return 0;
  const st=snap.data().start&&snap.data().start.toMillis?snap.data().start.toMillis():0;
  if(Date.now()<st+WIN_MS){ _winReset=st+WIN_MS; return snap.data().count||0; }
  return 0;
}
async function incServerCount(nick){
  const ref=doc(db,_C.l(),_winKey()), uRef=doc(db,_C.u(),nick);
  const [snap,uSnap]=await Promise.all([getDoc(ref),getDoc(uRef)]);
  const d=snap.exists()?snap.data():null;
  const st=d&&d.start&&d.start.toMillis?d.start.toMillis():0;
  const prevTotal=uSnap.exists()?(uSnap.data().totalSensi||0):0;
  // Un solo lote: contador de la ventana + total. Las reglas de Firestore validan ambos.
  const attempt=async(same)=>{
    const b=writeBatch(db), c=same?(d.count||0)+1:1;
    b.set(ref,{count:c,nick,start:same?d.start:serverTimestamp(),ts:serverTimestamp()});
    b.update(uRef,{totalSensi:prevTotal+1,lastSeen:serverTimestamp()});
    await b.commit(); return c;
  };
  const sameFirst=!!d&&Date.now()<st+WIN_MS;
  let n; try{ n=await attempt(sameFirst); }catch(e){ if(!d) throw e; n=await attempt(!sameFirst); } // reintento por si el reloj del celular está desfasado
  _winReset=(n===1)?Date.now()+WIN_MS:st+WIN_MS;
  return n;
}

function getToday(){ const d=new Date(); return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); }
// Calcula la racha de días consecutivos entrando a la app. Si ya entró hoy,
// no cambia nada (evita sumar de más si recarga la página varias veces el
// mismo día). Si entró AYER, suma 1. Si se saltó un día o más, se reinicia en 1.
function _computeStreak(prevData){
  const today=getToday();
  const lastDay=prevData&&prevData.lastLoginDay;
  let streak=(prevData&&prevData.streak)||0;
  if(lastDay===today) return {streak,lastLoginDay:today};
  if(lastDay){
    const [py,pm,pd]=lastDay.split("-").map(Number);
    const prevD=new Date(py,pm-1,pd);
    const now=new Date();
    const diffDays=Math.round((new Date(now.getFullYear(),now.getMonth(),now.getDate())-prevD)/86400000);
    streak=diffDays===1?streak+1:1;
  } else {
    streak=1;
  }
  return {streak,lastLoginDay:today};
}
// Cuando el admin cambia el límite de alguien (por su nombre actual), también lo
// guardamos bajo su ID estable (uid de Google o fingerprint) para que el límite
// no se pierda si esa persona cambia de nombre o vuelve a entrar con uno anterior.
async function _mirrorMaxOverrideByNick(nick, max){
  try{
    const uSnap=await getDoc(doc(db,_C.u(),nick));
    if(!uSnap.exists()) return;
    const ud=uSnap.data();
    const key=ud.uid?ud.uid:(ud.did?("fp_"+ud.did):null);
    if(key) await setDoc(doc(db,_C.l(),key+"_max"),{maxOverride:max},{merge:true});
  }catch(e){ console.error("No se pudo sincronizar el límite por ID:",e); }
}
function lsGet(k){ try{return JSON.parse(localStorage.getItem(k));}catch{return null;} }
function lsSet(k,v){ localStorage.setItem(k,JSON.stringify(v)); }
function updateCounter(){
  _winTick();
  if(_isUnlimitedNow()){ document.getElementById("ctrLabel").textContent="♾️ ILIMITADAS"; return; }
  const eff=_effectiveMax();
  document.getElementById("ctrLabel").textContent=Math.max(0,eff-myCount)+"/"+eff+" SENSIS/5H"+((myCount>0&&_winReset>Date.now())?" · "+_fmtRemaining(_winReset-Date.now()):"");
}

// ── SENSIS LOGIC ──────────────────────────────────────
// ── CLASIFICACIÓN DE MARCAS POR GAMA ─────────────────────────────────────
// Antes esto tenía 3 problemas reales:
//  1) De las 96 marcas en MARCAS[], 51 (más de la mitad) no estaban en
//     NINGÚN set de grupo -> caían todas silenciosamente al genérico "D",
//     sin ninguna calibración específica (ZTE, Nothing, Fairphone, Coolpad,
//     Kyocera, Hisense, y decenas de marcas regionales quedaban ahí).
//  2) "itel" (tal cual aparece en MARCAS, con i minúscula) NO coincidía con
//     "Itel"/"iTel" en _GC porque Set.has() distingue mayúsculas/minúsculas
//     -> esa marca puntual también caía a "D" por un simple problema de
//     casing, aunque a simple vista pareciera estar cubierta.
//  3) El grupo "V" (perfil de gama gaming: pantalla grande + touch de altí-
//     sima frecuencia, ver P.V y _SCREEN_PROFILES.V) estaba definido pero
//     _grp() nunca lo devolvía para NADA -> código muerto, ninguna marca
//     lo usaba en la práctica.
// _grp() ahora compara sin distinguir mayúsculas/minúsculas (evita que
// vuelva a pasar el bug #2 con cualquier marca futura), y las 51 marcas
// sueltas quedaron reclasificadas por gama real de mercado en vez de cabina
// caer todas juntas a un grupo que no las representa.
const _GA=new Set(["Samsung","Google Pixel","OnePlus","Sony","Sony Ericsson","Razer","Sharp","Sharp Aquos","Nubia","RED","Vertu"]);
const _GB=new Set(["Motorola","Nokia","LG","HTC","Asus","Lenovo","TCL","Meizu","Meitu","Microsoft","Fairphone","ZUK","Nothing"]);
const _GB2=new Set(["Xiaomi","Poco"]);
const _GB3=new Set(["Honor","Huawei","HMD Global"]);
const _GB4=new Set(["Realme","Oppo","Vivo"]);
const _GC=new Set(["Infinix","Tecno","Itel","iTel","itel","Alcatel","BLU","Wiko","Blackview","Doogee","Oukitel","Cubot","Ulefone","UMIDIGI","Gionee","Micromax","Lava","Intex","Karbonn","Celkon","Spice","QMobile","Walton","Symphony","MyPhone","Cherry Mobile",
  "ZTE","Acer","Panasonic","Amazon","BlackBerry","Spectra","Caterpillar","Coolpad","Xolo","Positivo","Multilaser","Philco","Hisense","Kyocera","CloudFone","Vsmart","Archos","Prestigio","BQ","Casper","General Mobile","Allview","Advan","Mito","Polytron","SPC","Maxtron","Evercoss","Torque","Starmobile","Verykool","iVoomi","Freetel","Vestel","Reeder","Konka","Haier","Elephone","Leagoo","Homtom","Vernee","Bluboo","AGM","Sugar","Neffos"]);
const _GV=new Set(["iQOO"]); // gama "gaming": pantalla grande + touch de alta frecuencia (ver P.V)
const MARCAS=["iPhone","Samsung","Motorola","Xiaomi","Honor","Huawei","Realme","Oppo","Vivo","Google Pixel","OnePlus","Sony","Asus","Lenovo","Nokia","LG","HTC","TCL","Poco","Infinix","Tecno","Alcatel","BLU","Blackview","Doogee","Oukitel","Cubot","Ulefone","UMIDIGI","Meizu","Nubia","RED","Razer","Sharp","ZTE","Acer","Panasonic","Microsoft","Amazon","BlackBerry","itel","Spectra","iQOO","Caterpillar","Wiko","Symphony","Walton","Coolpad","Gionee","Karbonn","Micromax","Lava","Xolo","QMobile","Positivo","Multilaser","Philco","Hisense","Kyocera","Cherry Mobile","CloudFone","MyPhone","Vsmart","Fairphone","Archos","Prestigio","BQ","Casper","General Mobile","Allview","Advan","Mito","Polytron","SPC","Maxtron","Evercoss","Torque","Starmobile","Verykool","ZUK","Vertu","iVoomi","Freetel","Vestel","Reeder","Konka","Haier","Elephone","Leagoo","Homtom","Vernee","Bluboo","AGM","Nothing","Sugar","Neffos"];
const P={A:{genMin:144,genMax:200,rojoD:[0,3],x2D:[-12,-6],franMin:62,franMax:76,camaraD:[16,28],dpiMin:530,dpiMax:610},B:{genMin:145,genMax:196,rojoD:[0,3],x2D:[-12,-6],franMin:55,franMax:72,camaraD:[14,26],dpiMin:530,dpiMax:600},B2:{genMin:143,genMax:188,rojoD:[0,2],x2D:[-14,-7],franMin:53,franMax:70,camaraD:[13,24],dpiMin:530,dpiMax:595},B3:{genMin:146,genMax:193,rojoD:[0,2],x2D:[-13,-7],franMin:55,franMax:73,camaraD:[14,26],dpiMin:530,dpiMax:598},B4:{genMin:143,genMax:196,rojoD:[0,3],x2D:[-13,-7],franMin:57,franMax:75,camaraD:[15,27],dpiMin:530,dpiMax:602},C:{genMin:148,genMax:182,rojoD:[0,2],x2D:[-10,-5],franMin:50,franMax:68,camaraD:[18,32],dpiMin:530,dpiMax:580},D:{genMin:145,genMax:192,rojoD:[0,3],x2D:[-12,-6],franMin:54,franMax:71,camaraD:[14,26],dpiMin:530,dpiMax:596},E:{genMin:85,genMax:200,rojoD:[0,4],x2D:[-18,-10],franMin:52,franMax:70,camaraD:[20,36],dpiMin:0,dpiMax:0},V:{genMin:162,genMax:200,rojoD:[0,2],x2D:[-6,-2],franMin:66,franMax:80,camaraD:[8,16],dpiMin:600,dpiMax:630}};
function _grp(m){
  if(!m) return "D";
  const mm=String(m).trim().toLowerCase();
  if(mm==="iphone") return "E";
  const find=(set)=>[...set].some(x=>x.toLowerCase()===mm);
  if(find(_GA)) return "A";
  if(find(_GB)) return "B";
  if(find(_GB2)) return "B2";
  if(find(_GB3)) return "B3";
  if(find(_GB4)) return "B4";
  if(find(_GV)) return "V";
  if(find(_GC)) return "C";
  return "D";
}
function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
const MARCA_ALIAS={
  "redmi":"Xiaomi","redmagic":"Nubia","red magic":"Nubia",
  "zte":"ZTE","axon":"ZTE","blade":"ZTE",
  "poco":"Poco","poko":"Poco",
  "acer":"Acer","liquid":"Acer",
  "iphone":"iPhone","apple":"iPhone",
  "pixel":"Google Pixel","google pixel":"Google Pixel",
  "oneplus":"OnePlus","one plus":"OnePlus",
  "blackberry":"BlackBerry",
  "amazon fire":"Amazon","kindle fire":"Amazon",
};
// Separar camelCase/palabras pegadas: "samsunggalaxy" → "samsung galaxy"
// "redminote12" → "redmi note12", "honorx5c" → "honor x5c"
function splitPegado(txt){
  // Insertar espacio antes de números que siguen a letras: "galaxya12" → "galaxy a12"
  let r=txt.replace(/([a-záéíóúñ])(\d)/gi,"$1 $2");
  // Insertar espacio antes de mayúscula después de minúscula (camelCase),
  // pero solo si hay 2+ minúsculas antes (evita romper "iPhone" → "i Phone")
  r=r.replace(/([a-záéíóúñ]{2,})([A-ZÁÉÍÓÚÑ])/g,"$1 $2");
  return r;
}
function detectM(txt){
  const expanded=splitPegado(txt);
  const t=expanded.toLowerCase();
  // Primero revisar aliases (ej: redmi → Xiaomi)
  for(const [alias,brand] of Object.entries(MARCA_ALIAS)){
    if(t.includes(alias)) return brand;
  }
  // Luego buscar en MARCAS normales (más largo gana)
  let f=null;
  for(const m of MARCAS){
    if(t.includes(m.toLowerCase())){if(!f||m.length>f.length)f=m;}
  }
  return f;
}
function exMod(txt,marca){
  // Primero expandir el texto por si viene pegado
  const expanded=splitPegado(txt);
  const stopWords=["para","un","una","el","la","con","sin","dpi","quiero","dame","necesito","sensibilidad","alta","media","baja","por favor","porfavor","me","puedes","dar","genera","generame","generar"];
  // Quitar la marca (usando alias también)
  let m=expanded;
  // Quitar alias de marca del texto expandido
  for(const [alias] of Object.entries(MARCA_ALIAS)){
    m=m.replace(new RegExp(alias,"gi")," ");
  }
  m=m.replace(new RegExp(marca,"gi")," ").trim();
  stopWords.forEach(w=>{m=m.replace(new RegExp("\\b"+w+"\\b","gi")," ");});
  // Preservar capitalización original del usuario para el modelo
  // Tomar el modelo del texto original (después de quitar la marca)
  const origExpanded=splitPegado(txt);
  let origMod=origExpanded;
  for(const [alias] of Object.entries(MARCA_ALIAS)){
    origMod=origMod.replace(new RegExp(alias,"gi")," ");
  }
  origMod=origMod.replace(new RegExp(marca,"gi")," ");
  stopWords.forEach(w=>{origMod=origMod.replace(new RegExp("\\b"+w+"\\b","gi")," ");});
  const clean=origMod.replace(/\s+/g," ").trim();
  return clean||marca;
}

// ── MOTOR MEJORADO: calibración por física angular real ─────────────────
// ── (no reemplaza genSensi, es una alternativa) ──────────────────────────
// Modelo (basado en cómo se relacionan sensibilidad/DPI/giro en shooters,
// investigado en guías técnicas: cm-por-360° = 360×2.54 ÷ (DPI × sensi × yaw)):
// cada movimiento se traduce a un GIRO ANGULAR real usando trigonometría.
//  • Lateral/salto = velocidad angular (radianes/seg ≈ velocidad lineal / distancia):
//    cuánto debe girar la cámara para no perder al enemigo.
//  • Adelante/atrás = CAMBIO DE DISTANCIA (ganar o "faltar" distancia): no gira
//    la cámara, pero cambia el tamaño angular del blanco (2·atan(ancho/2·dist)),
//    o sea qué tan fácil/difícil es acertarle.
//  • Agachado = reduce la altura real del personaje → target angularmente más chico.
// Todo se combina con la magnitud vectorial (Pitágoras) de sus componentes
// horizontal y vertical, en vez de un solo número mezclado a mano.
const _D0=12, _W0=0.35, _H0=1.00, _HC=0.60; // distancia/alto/ancho de referencia (unidades normalizadas)
const _MOV_PROFILES=[
  // {nombre, distDelta(+aleja/-acerca), lat(vel.lateral 0-1), vert(vel.vertical 0-1), h(altura real), peso(frecuencia real)}
  {n:"quieto",       distDelta:0,     lat:0,    vert:0,    h:_H0, peso:0.10},
  {n:"adelante",     distDelta:-0.18, lat:0,    vert:0,    h:_H0, peso:0.12}, // gana distancia
  {n:"atras",        distDelta:+0.18, lat:0,    vert:0,    h:_H0, peso:0.07}, // pierde/le falta distancia
  {n:"lateral_izq",  distDelta:0,     lat:0.55, vert:0,    h:_H0, peso:0.10},
  {n:"lateral_der",  distDelta:0,     lat:0.55, vert:0,    h:_H0, peso:0.10},
  {n:"espaldas",     distDelta:0,     lat:0.95, vert:0,    h:_H0, peso:0.05}, // giro/flick rápido
  {n:"salto",        distDelta:0,     lat:0,    vert:0.45, h:_H0, peso:0.08},
  {n:"salto_izq",    distDelta:0,     lat:0.55, vert:0.45, h:_H0, peso:0.06},
  {n:"salto_der",    distDelta:0,     lat:0.55, vert:0.45, h:_H0, peso:0.06},
  {n:"agachado",     distDelta:0,     lat:0,    vert:0,    h:_HC, peso:0.10},
  {n:"agachado_izq", distDelta:0,     lat:0.42, vert:0,    h:_HC, peso:0.08},
  {n:"agachado_der", distDelta:0,     lat:0.42, vert:0,    h:_HC, peso:0.08},
];
// ── PERFIL FÍSICO DE PANTALLA Y CHIP TÁCTIL POR GAMA DE HARDWARE ─────────
// Antes el modelo angular usaba SIEMPRE la misma "pantalla de referencia"
// (_D0/_W0/_H0 fijos) sin importar el modelo, y el único ajuste por
// hardware era un empujón plano inventado (_GAMA_NUDGE) sin relación con
// ninguna medida real. Esto agrega dos cosas que antes faltaban:
//   1) TAMAÑO/PROPORCIÓN REAL DE PANTALLA: la diagonal típica (pulgadas) y
//      el aspect ratio (alto/ancho) de cada gama, para escalar _D0/_W0/_H0
//      -> una pantalla físicamente más grande implica que el dedo recorre
//      más distancia real por cada fracción de swipe, así que el mismo
//      "giro lógico" exige MENOS sensibilidad software (más espacio físico
//      para deslizar); una pantalla chica exige MÁS. El aspect ratio real
//      (no uno fijo) es justo lo que corrige el "centro de la resolución":
//      el ángulo hacia el centro de la pantalla (donde normalmente está el
//      enemigo/mira) depende de cuán alta/ancha es esa pantalla en
//      particular, no de un valor universal igual para todos los modelos.
//   2) LATENCIA TÁCTIL DEL CHIP: frecuencia de muestreo (Hz) real de esa
//      gama -> un chip que reporta el toque con menos frecuencia "pierde"
//      parte del gesto real del dedo entre una muestra y la siguiente, y
//      necesita más sensibilidad para compensar ese recorrido no
//      capturado; un chip rápido (240Hz+) no pierde nada del gesto.
// TOUCH SAMPLING (touchHz) — corregido con datos reales, no inventados:
//   • Flagship Android (S/Note, OnePlus, Pixel): 240Hz confirmado por
//     TrustedReviews, PhoneArena y guías de touch-sampling 2025-2026.
//   • Gama media (90-120Hz AMOLED "touch calibrado"): guía de compra
//     Alibaba Electronics 2026.
//   • Gama baja/entrada: ~60Hz, "adecuado pero sin precisión en gestos
//     rápidos" — misma guía 2026.
//   • iPhone: Apple no publica el dato oficialmente, pero fuentes cruzadas
//     (Versus.com, PhoneArena, Macworld) coinciden en 120Hz en los modelos
//     base y hasta 240-360Hz en los Pro con ProMotion — se usa 150Hz como
//     valor mixto representativo de la gama completa "iPhone" (no separa
//     Pro de base en el selector de marca).
//   • Gaming phones: ROG Phone 480-720Hz y RedMagic hasta 960-1000Hz,
//     confirmado por TrustedReviews, XDA Forums y Epey — se usa 600Hz como
//     valor representativo de esa franja (antes tenía 360Hz, muy por
//     debajo de lo real).
// chipMs YA NO es un número aparte inventado: se calcula directo del
// touchHz real (periodo entre muestras = 1000/Hz), así queda atado al
// mismo dato investigado en vez de ser una segunda cifra suelta.
const _SCREEN_PROFILES={
  // diagIn: diagonal típica de pantalla (pulgadas) · aspect: alto/ancho típico
  // touchHz: frecuencia de muestreo táctil típica (ver fuentes arriba)
  // touchLagMs: RETRASO real de respuesta táctil (latencia dedo->pantalla,
  // distinto de touchHz: touchHz es cuántas veces por segundo el chip LEE
  // el dedo, touchLagMs es cuánto tarda esa lectura en traducirse en un
  // cambio visible en pantalla — paneles/controladores más lentos o con
  // procesamiento extra (filtros de imagen, etc.) agregan retraso aunque
  // el touchHz sea alto). Estimado por gama mientras no se investigue el
  // modelo exacto (ver _buildPartialResult / _screenProfile más abajo).
  A:{diagIn:6.7,aspect:2.20,touchHz:240,touchLagMs:8},   // flagships (Samsung S/Note, Pixel, OnePlus, Sony)
  B:{diagIn:6.5,aspect:2.17,touchHz:120,touchLagMs:14},  // gama media-alta
  B2:{diagIn:6.4,aspect:2.15,touchHz:110,touchLagMs:16}, // gama media
  B3:{diagIn:6.5,aspect:2.17,touchHz:100,touchLagMs:15}, // gama media-alta (variante)
  B4:{diagIn:6.6,aspect:2.18,touchHz:120,touchLagMs:13}, // gama media-alta (variante)
  C:{diagIn:6.5,aspect:2.15,touchHz:60,touchLagMs:24},   // gama baja/entrada, chips más lentos
  D:{diagIn:6.5,aspect:2.16,touchHz:90,touchLagMs:17},   // gama genérica/no catalogada
  E:{diagIn:6.1,aspect:2.16,touchHz:150,touchLagMs:10},  // iPhone (mezcla base 120Hz / Pro ProMotion 240-360Hz)
  V:{diagIn:6.8,aspect:2.22,touchHz:600,touchLagMs:5},   // gaming phones (RedMagic hasta 960-1000Hz, ROG 480-720Hz)
};
const _SCREEN_REF={diagIn:6.5,aspect:2.17,touchHz:120,touchLagMs:14,refreshHz:90,chipScore:0.6,resShort:1080,resLong:2400}; // punto neutro de referencia (nudge=0)
// ── LOOKUP DE SPECS REALES DE CELULAR (caché-primero + Cloudflare Worker) ─
// Antes _screenProfile solo devolvía el estimado genérico por gama/marca.
// Ahora, si ya se investigó el modelo EXACTO (marca+modelo) alguna vez —
// por cualquier usuario, en cualquier momento — se usan sus specs reales
// en vez del estimado. La investigación corre en un Cloudflare Worker
// aparte (ver worker.js + DEPLOY.md) — se eligió Cloudflare en vez de una
// Cloud Function de Firebase para evitar el plan Blaze (que en México pide
// RFC); Cloudflare Workers es gratis sin tarjeta ni trámite fiscal. Este
// bloque es el lado cliente: consulta caché en Firestore, y si hace falta,
// llama al Worker una vez y guarda el resultado. Si el Worker todavía no
// está desplegado (_DEVICE_LOOKUP_URL vacío) o falla, todo esto se salta
// en silencio y la app sigue funcionando igual que antes.
// IMPORTANTE: touchLagMs (retraso de pantalla) es un campo NUEVO que el
// cliente ya sabe leer/validar/calibrar acá, pero la IA que lo INVESTIGA
// corre del lado del Worker (worker.js), que no forma parte de este
// archivo. Falta agregar "touchLagMs" al prompt/schema de ese worker para
// que efectivamente lo busque y lo devuelva; mientras tanto se usa el
// estimado por gama de la tabla de arriba (igual que con touchHz cuando
// no se encuentra).
const _DEVICE_LOOKUP_URL="https://sensis-device-lookup.botdesensibilidades.workers.dev";
const _DEVICE_SPECS_SCHEMA_V=3; // subir este número cada vez que cambie qué campos se investigan/aceptan, para que el caché viejo en Firestore se re-consulte una vez más en vez de quedar "found:false" para siempre.
const LIMITS_DEVICE={diagIn:[4.0,8.5],aspect:[1.6,2.6],touchHz:[40,1000],touchLagMs:[0,80]};
function _inRangeDevice(v,[lo,hi]){ return typeof v==="number"&&isFinite(v)&&v>=lo&&v<=hi; }
const _deviceSpecsCache=new Map();
const _deviceSpecsInFlight=new Map();
// Acepta cada campo (diagIn/aspect/touchHz) por separado en vez de exigir
// los 3 a la vez: found=true si AL MENOS uno quedó validado. Los campos que
// no vinieron o no pasaron el rango quedan en null y _screenProfile los
// completa con el estimado por gama, campo por campo.
// Campos extra que investiga el Worker: resolución, frecuencia de refresco y chip. Se aceptan varios
// nombres posibles (resolution/resW+resH, refreshHz/refreshRate/..., chip/chipset/soc/...) por si el
// Worker los llama distinto; cada uno se valida por rango y los que no sirvan quedan en null.
const _FIS_DEF={A:{refreshHz:120,chipScore:0.85},B:{refreshHz:90,chipScore:0.60},B2:{refreshHz:120,chipScore:0.65},B3:{refreshHz:90,chipScore:0.60},B4:{refreshHz:90,chipScore:0.60},C:{refreshHz:90,chipScore:0.30},D:{refreshHz:90,chipScore:0.50},E:{refreshHz:60,chipScore:0.95},V:{refreshHz:144,chipScore:0.90}};
function _num(v){const n=typeof v==="number"?v:parseFloat(String(v==null?"":v).replace(",","."));return isFinite(n)?n:null;}
function _parseResolution(d){
  let w=null,h=null;
  const c=d.resolution!=null?d.resolution:(d.resolucion!=null?d.resolucion:(d.res!=null?d.res:d.screenResolution));
  if(typeof c==="string"){const m=c.match(/(\d{3,4})\s*[x×*]\s*(\d{3,4})/i);if(m){w=+m[1];h=+m[2];}}
  else if(c&&typeof c==="object"){w=_num(c.w!=null?c.w:(c.width!=null?c.width:c.ancho));h=_num(c.h!=null?c.h:(c.height!=null?c.height:c.alto));}
  if(!(w>0&&h>0)){
    w=_num(d.resShort!=null?d.resShort:(d.resW!=null?d.resW:(d.widthPx!=null?d.widthPx:d.anchoPx)));
    h=_num(d.resLong!=null?d.resLong:(d.resH!=null?d.resH:(d.heightPx!=null?d.heightPx:d.altoPx)));
  }
  if(!(w>0&&h>0))return null;
  const sh=Math.min(w,h),lg=Math.max(w,h);
  return(sh>=400&&sh<=2200&&lg>=800&&lg<=4500)?{resShort:Math.round(sh),resLong:Math.round(lg)}:null;
}
// Puntaje 0..1 del chip por familia/gen (heurística por nombre, no un benchmark): se usa para estimar
// cuánto retraso extra mete la CPU/GPU al renderizar el juego.
function _chipScore(name){
  const n=String(name||"").toLowerCase();
  const T=[
    [/snapdragon\s*8\s*(elite|gen\s*[2-9])/,1.0],[/snapdragon\s*8(\s*\+)?\s*gen\s*1|snapdragon\s*8\+/,0.93],[/snapdragon\s*(8[0-9]{2}|870)/,0.86],
    [/snapdragon\s*7\+?\s*gen\s*[23]|snapdragon\s*7s\s*gen\s*[23]/,0.74],[/snapdragon\s*(778|780|782|7\s*gen\s*1|7s\s*gen\s*1)/,0.68],
    [/snapdragon\s*(7[0-9]{2}|695)/,0.58],[/snapdragon\s*6\s*gen|snapdragon\s*6[0-9]{2}/,0.48],[/snapdragon\s*4/,0.30],
    [/dimensity\s*9[0-9]{3}/,0.96],[/dimensity\s*8[0-9]{3}/,0.76],[/dimensity\s*7[0-9]{3}/,0.62],[/dimensity\s*6[0-9]{3}/,0.48],[/dimensity\s*(1[0-9]{3}|9[0-9]{2})/,0.70],
    [/helio\s*g9/,0.38],[/helio\s*g8/,0.28],[/helio\s*(g[0-7]|p)/,0.22],
    [/exynos\s*2[2-9]/,0.90],[/exynos\s*(1[2-9]|9[0-9]{2})/,0.55],[/apple\s*a[0-9]{2}|\ba1[0-9]\b/,0.98],[/tensor/,0.75],[/kirin\s*9/,0.85],[/kirin/,0.55],
    [/unisoc|tiger|spreadtrum|\bt6[0-9]{2}\b|\bt7[0-9]{2}\b/,0.26]
  ];
  for(const [re,v] of T) if(re.test(n)) return v;
  return null;
}
function _buildPartialResult(d){
  d=d||{};
  const diagIn=_inRangeDevice(d.diagIn,LIMITS_DEVICE.diagIn)?d.diagIn:null;
  let aspect=_inRangeDevice(d.aspect,LIMITS_DEVICE.aspect)?d.aspect:null;
  const touchHz=_inRangeDevice(d.touchHz,LIMITS_DEVICE.touchHz)?d.touchHz:null;
  const touchLagMs=_inRangeDevice(d.touchLagMs,LIMITS_DEVICE.touchLagMs)?d.touchLagMs:null;
  const res=_parseResolution(d);
  const rf=_num(d.refreshHz!=null?d.refreshHz:(d.refreshRate!=null?d.refreshRate:(d.refresh!=null?d.refresh:(d.hz!=null?d.hz:(d.frecuenciaRefresco!=null?d.frecuenciaRefresco:d.tasaRefresco)))));
  const refreshHz=_inRangeDevice(rf,[24,360])?Math.round(rf):null;
  const cr=d.chip!=null?d.chip:(d.chipset!=null?d.chipset:(d.soc!=null?d.soc:(d.procesador!=null?d.procesador:d.cpu)));
  const chip=(typeof cr==="string"&&cr.trim())?cr.trim().slice(0,60):null;
  let chipScore=_inRangeDevice(_num(d.chipScore),[0,1])?_num(d.chipScore):null;
  if(chipScore==null&&chip)chipScore=_chipScore(chip);
  if(aspect==null&&res){const a=res.resLong/res.resShort;if(_inRangeDevice(a,LIMITS_DEVICE.aspect))aspect=a;} // el aspecto también sale de la resolución
  const found=(diagIn!=null||aspect!=null||touchHz!=null||touchLagMs!=null||refreshHz!=null||chipScore!=null||res!=null);
  return {found,diagIn,aspect,touchHz,touchLagMs,resShort:res?res.resShort:null,resLong:res?res.resLong:null,refreshHz,chip,chipScore};
}
function _deviceKey(marca,modelo){
  return (String(marca||"").trim()+"|"+String(modelo||"").trim()).toLowerCase().replace(/\s+/g," ").slice(0,180);
}
async function _lookupDeviceSpecs(marca,modelo){
  if(!marca||!modelo) return null;
  const key=_deviceKey(marca,modelo);
  if(_deviceSpecsCache.has(key)) return _deviceSpecsCache.get(key);
  if(_deviceSpecsInFlight.has(key)) return _deviceSpecsInFlight.get(key);
  const p=(async()=>{
    try{
      // 1) Lectura directa a Firestore primero: si ya lo investigó otro
      // usuario antes, esto resuelve al instante y GRATIS, sin llamar al
      // Worker para nada.
      // _DEVICE_SPECS_SCHEMA_V: versión del esquema guardado. Entradas
      // viejas (guardadas ANTES de aceptar campo por campo / antes de
      // touchLagMs) quedaban con found:false para siempre aunque el
      // modelo SÍ fuera identificable, porque el Worker viejo exigía los
      // 3 datos a la vez. Si el doc en Firestore no tiene esta versión (o
      // es menor), se lo trata como si no estuviera cacheado y se vuelve
      // a consultar al Worker UNA vez más con la lógica nueva.
      const snap=await getDoc(doc(db,"device_specs",key));
      if(snap.exists()&&snap.data().v===_DEVICE_SPECS_SCHEMA_V){
        const d=snap.data();
        const result=d.found?_buildPartialResult(d):{found:false};
        console.log("📱 [device_specs] '"+modelo+"' ya estaba en caché (Firestore):",result);
        _deviceSpecsCache.set(key,result);
        return result;
      }
      if(snap.exists()) console.log("📱 [device_specs] '"+modelo+"' estaba en caché con un esquema viejo -> se vuelve a investigar con la lógica nueva.");
      if(!_DEVICE_LOOKUP_URL){
        // Worker todavía no desplegado/conectado -> no hay forma de
        // investigar este modelo todavía, se sigue con el estimado por
        // gama de siempre. No se cachea como "found:false" para que, una
        // vez que conectes el Worker, sí se investigue de verdad.
        console.warn("📱 [device_specs] _DEVICE_LOOKUP_URL está vacío -> usando estimado por gama, no se investigó nada.");
        return {found:false};
      }
      // 2) No está en caché (o estaba con esquema viejo) -> se invoca el
      // Worker (investiga con IA).
      console.log("📱 [device_specs] '"+modelo+"' es nuevo -> consultando Worker:",_DEVICE_LOOKUP_URL);
      const resp=await _withTimeout(fetch(_DEVICE_LOOKUP_URL,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({marca,modelo})
      }),16000,"timeout");
      const data=await resp.json();
      console.log("📱 [device_specs] Worker respondió:",JSON.stringify(data));
      // Revalidamos los rangos también acá (defensa extra, además de la
      // que ya hace el Worker) antes de aceptar y guardar cualquier valor.
      // IMPORTANTE: antes se exigía que los 3 datos (diagonal, aspecto Y
      // touch Hz) fueran válidos a la vez, o se descartaba TODO. El touch
      // sampling casi nunca se publica para gama media/baja, así que un
      // celular real y bien documentado en pantalla terminaba sin usar
      // NADA de lo investigado. Ahora se acepta campo por campo: lo que
      // sí sea válido se usa, y solo el/los campo(s) faltante(s) caen al
      // estimado por gama (ver _screenProfile).
      const result=(data&&data.found)?_buildPartialResult(data):{found:false};
      if(!result.found) console.warn("📱 [device_specs] La respuesta no tenía ningún dato válido/en rango -> se usa el estimado por gama completo.");
      else if(!(result.diagIn!=null&&result.aspect!=null&&result.touchHz!=null&&result.touchLagMs!=null&&result.refreshHz!=null&&result.chipScore!=null&&result.resShort!=null)) console.log("📱 [device_specs] Se aceptaron solo los campos válidos; el resto usa estimado por gama:",result);
      _deviceSpecsCache.set(key,result);
      // 3) Guardar en Firestore PARA SIEMPRE (incluso si found:false, para
      // no volver a preguntarle al Worker por un modelo que no reconoce
      // cada vez que alguien lo vuelva a escribir) -- con la versión de
      // esquema actual, para que si en el futuro se agrega OTRO campo
      // nuevo, esta entrada también se pueda re-investigar una vez más.
      if(result.found) setDoc(doc(db,"device_specs",key),{marca,modelo,...result,v:_DEVICE_SPECS_SCHEMA_V,ts:serverTimestamp()})
        .then(()=>console.log("📱 [device_specs] Guardado en Firestore para siempre."))
        .catch(err=>console.warn("📱 [device_specs] No se pudo guardar en Firestore (revisá las reglas, paso 8 del DEPLOY.md):",err.message));
      return result;
    }catch(e){
      // Nunca debe romper la generación de la sensi: si algo falla (red,
      // Worker caído, etc.), simplemente no se encontró nada y se sigue
      // con el estimado por gama de siempre.
      console.warn("📱 [device_specs] Falló la consulta ("+e.message+") -> usando estimado por gama.");
      const result={found:false};
      _deviceSpecsCache.set(key,result); // evita reintentar en cada sensi de esta sesión
      return result;
    }finally{
      _deviceSpecsInFlight.delete(key);
    }
  })();
  _deviceSpecsInFlight.set(key,p);
  return p;
}
function _screenProfile(marca,modelo){
  const fallback=_SCREEN_PROFILES[_grp(marca)]||_SCREEN_REF;
  const def=_FIS_DEF[_grp(marca)]||_FIS_DEF.D;
  const extra=(c)=>({refreshHz:c&&c.refreshHz!=null?c.refreshHz:def.refreshHz,chipScore:c&&c.chipScore!=null?c.chipScore:def.chipScore,resShort:c&&c.resShort!=null?c.resShort:_SCREEN_REF.resShort,resLong:c&&c.resLong!=null?c.resLong:_SCREEN_REF.resLong});
  if(modelo){
    const cached=_deviceSpecsCache.get(_deviceKey(marca,modelo));
    if(cached&&cached.found){
      // Se completa campo por campo: el dato investigado (real) tiene
      // prioridad; cualquier campo que no se haya podido validar cae al
      // estimado por gama en vez de descartar todo el resultado.
      const merged={
        diagIn:cached.diagIn!=null?cached.diagIn:fallback.diagIn,
        aspect:cached.aspect!=null?cached.aspect:fallback.aspect,
        touchHz:cached.touchHz!=null?cached.touchHz:fallback.touchHz,
        touchLagMs:cached.touchLagMs!=null?cached.touchLagMs:fallback.touchLagMs,
        ...extra(cached)
      };
      console.log("📱 [calibración] Usando specs REALES (parcial/completo) para '"+modelo+"':",merged,"(investigado:",cached,")");
      return merged;
    }
  }
  console.log("📱 [calibración] Usando estimado por gama ('"+_grp(marca)+"') para '"+marca+" "+(modelo||"")+"':",fallback);
  return {...fallback,...extra(null)};
}
// ══════════════════════════════════════════════════════════════════════
//  MOTOR MEJORADO v2 · física + cálculo + estadística (sin valores fijos)
// ══════════════════════════════════════════════════════════════════════
// Cada valor sale de una cadena de fórmulas, no de rangos pegados a mano:
//  1) GEOMETRÍA REAL: ancho = diagonal/√(1+a²) (Pitágoras, a = alto/ancho), alto = a·ancho,
//     en cm (×2.54). Es el espacio físico que tiene el pulgar para mover la cámara.
//  2) GANANCIA ANGULAR: un giro de 180° debe caber en una fracción del ancho y ±30° en una
//     fracción del alto → g_h = 180/L_h, g_v = 60/L_v (grados por cm). Se combinan con la
//     raíz cuadrática media ponderada G = √((w_h·g_h² + w_v·g_v²)/(w_h+w_v)), con pesos w
//     que salen de la velocidad angular RMS de los 12 movimientos (lat/dist, vert/dist).
//  3) LATENCIA: τ = 1000/touchHz + lag. En τ el dedo ya recorrió v·τ, se pierde la fracción
//     λ·τ/T del gesto y la ganancia debe subir 1/(1−λτ/T).
//  4) DPI: cm/360 = 360×2.54/(DPI×sens×yaw) → la sensi de software escala ∝ 1/DPI; el juego
//     amortigua parte de eso, así que se aplica la RAÍZ: (DPI_ref/DPI)^½.
//  5) Todo se resume en ln g (0 = celular de referencia). La posición dentro de la ventana de
//     cada valor sale de una curva tanh: suave, sin amontonarse en los bordes.
//  6) El RUIDO no es un rand() plano: es una gaussiana (Box-Muller) con σ por propagación de
//     errores: σ² = σ_dedo² + (∂ln g/∂τ · τ · σ_lag)² (cómo apoya el dedo + incertidumbre
//     de la latencia).
//  7) ZOOM ÓPTICO (2x, 4x): "monitor distance matching",
//     r(M,k) = atan(k·tan(θz/2)) / atan(k·tan(θ/2)), con tan(θz/2) = tan(θ/2)/M.
//     El coeficiente k se despeja de la ventana física del nivel.
//  8) ANTI-REPETICIÓN: se recuerdan los últimos valores y se elige uno a distancia mínima de
//     ellos, así dos sensis seguidas no salen pegadas.
const _FIS={
  FOV:70*Math.PI/180,  // campo de visión de referencia (rad)
  SWEEP:0.42,          // fracción del ancho que barre el pulgar en un giro de 180°
  SWEEP_V:0.25,        // fracción del alto para ±30° verticales
  T_FLICK:0.18,        // s: duración típica de ese barrido
  LAMBDA:0.5,          // fracción del retraso que realmente se pierde del gesto
  DPI_REF:560,         // DPI de referencia
  K_REF:1.30,          // coeficiente de monitor-distance "de fábrica" del juego
  SIG_DEDO:0.11,       // σ relativa (ln) de la longitud real del barrido de una persona
  SIG_LAG:0.20,        // σ relativa de la latencia medida
  EPS_DEDO:0.10,       // cm: temblor/jitter de contacto del pulgar
  KAPPA:0.25,          // fracción del tamaño del blanco que el error angular puede ocupar
  BETA:0.30,           // peso del techo de precisión sobre ln g
  CPU_MS:6,            // ms de retraso extra que mete un chip flojo (puntaje 0) al renderizar
  GAMMA_RES:0.35,      // amortiguación de la densidad de píxeles (el juego normaliza parte de ella)
  ESC:0.10,            // escala de la tanh (unidades de ln g): menor = más separación entre resultados
  DEV:3.2              // cuánto pesan los datos del celular (Worker) al mover el centro del resultado
};
const _FIS_K={baja:[0.50,0.95],media:[0.60,1.10],alta:[0.70,1.20]}; // ventana de k por nivel
function _gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function _sigm(z){return 0.5+0.5*Math.tanh(z);}
function _mdm(M,k){const t=Math.tan(_FIS.FOV/2);return Math.atan(k*t/M)/Math.atan(k*t);}
function _kDeRatio(M,r){let a=0.02,b=8;for(let i=0;i<40;i++){const m=(a+b)/2;if(_mdm(M,m)<r)a=m;else b=m;}return (a+b)/2;} // bisección: r(M,k)=r
function _fisGeom(s){const w=s.diagIn/Math.sqrt(1+s.aspect*s.aspect)*2.54;return{W:w,H:s.aspect*w};}
let _fisMovCache=null;
// Usa los 12 movimientos del personaje de dos formas:
//  · velocidad angular RMS de cada eje (lat/dist y vert/dist) -> pesos w_h, w_v
//  · tamaño angular del blanco: α = 2·atan(x/2d) en ancho y alto (adelante/atrás cambian d,
//    agachado cambia el alto); tamaño del movimiento = √(αW·αH) y se promedia con la media
//    ARMÓNICA ponderada (los blancos chicos dominan la dificultad): S = Σw / Σ(w/tamaño)
function _fisMov(){
  if(_fisMovCache)return _fisMovCache;
  let sh=0,sv=0,sw=0,inv=0;
  for(const m of _MOV_PROFILES){
    const dist=_D0*(1+m.distDelta),wh=m.lat/dist,wv=m.vert/dist;
    sh+=m.peso*wh*wh;sv+=m.peso*wv*wv;sw+=m.peso;
    const aW=2*Math.atan(_W0/(2*dist)),aH=2*Math.atan(m.h/(2*dist));
    inv+=m.peso/Math.sqrt(aW*aH);
  }
  return(_fisMovCache={h:sh/sw,v:sv/sw,Sdeg:(sw/inv)*180/Math.PI});
}
// De qué campos del Worker hay dato REAL (y cuáles son estimado por gama).
function _fisFuentes(marca,modelo){
  const c=modelo?_deviceSpecsCache.get(_deviceKey(marca,modelo)):null,ok=!!(c&&c.found);
  return{diagIn:ok&&c.diagIn!=null,aspect:ok&&c.aspect!=null,touchHz:ok&&c.touchHz!=null,touchLagMs:ok&&c.touchLagMs!=null,res:ok&&c.resShort!=null,refreshHz:ok&&c.refreshHz!=null,chip:ok&&c.chipScore!=null};
}
function _fisGanancia(sp,dpiVal,src){
  const mov=_fisMov();
  const calc=(x)=>{
    const g=_fisGeom(x),gh=180/(_FIS.SWEEP*g.W),gv=60/(_FIS.SWEEP_V*g.H);
    const G=Math.sqrt((mov.h*gh*gh+mov.v*gv*gv)/(mov.h+mov.v));
    // Retraso total = muestreo táctil + lag de pantalla + media trama del refresco (se ve en el próximo
    // frame, en promedio medio periodo) + retraso por carga del chip.
    const frame=1000/(x.refreshHz||90),cpu=_FIS.CPU_MS*(1-(x.chipScore!=null?x.chipScore:0.6));
    const tau=(1000/x.touchHz+x.touchLagMs+0.5*frame+cpu)/1000;
    const perdida=Math.max(0.35,1-_FIS.LAMBDA*tau/_FIS.T_FLICK);
    // Techo de precisión: el error del dedo ε = √(jitter² + (v·τ)²) (Pitágoras: temblor + arrastre por
    // latencia) multiplicado por la ganancia (°/cm) no debe pasar de una fracción del blanco.
    const v=_FIS.SWEEP*g.W/_FIS.T_FLICK,eps=Math.sqrt(_FIS.EPS_DEDO*_FIS.EPS_DEDO+Math.pow(v*tau,2));
    const ppi=Math.sqrt(x.resShort*x.resShort+x.resLong*x.resLong)/x.diagIn; // píxeles por pulgada reales
    return{G:G/perdida,tau,perdida,Gp:_FIS.KAPPA*mov.Sdeg/eps,ppi,frame,cpu};
  };
  const a=calc(sp),r=calc(_SCREEN_REF);
  // Más píxeles por cm de barrido = más giro por el mismo gesto -> menos sensi (amortiguado por GAMMA_RES)
  let lng=Math.log(a.G/r.G)+_FIS.BETA*Math.log(a.Gp/r.Gp)+_FIS.GAMMA_RES*Math.log(r.ppi/a.ppi);
  if(dpiVal)lng+=0.5*Math.log(_FIS.DPI_REF/dpiVal);
  // Incertidumbre: si el dato viene del Worker (real) pesa poco; si es estimado por gama pesa mucho.
  const real=src||{},dLn=(_FIS.LAMBDA/_FIS.T_FLICK)/a.perdida; // ∂ln g/∂τ
  let v2=_FIS.SIG_DEDO*_FIS.SIG_DEDO+Math.pow(dLn*a.tau*_FIS.SIG_LAG,2);
  const add=(x)=>{v2+=x*x;};
  add(real.diagIn?0.008:0.045);                                              // ∂ln g/∂ln diag ≈ -1
  add(real.aspect?0.006:0.033);                                              // ∂ln W/∂ln a ≈ -a²/(1+a²)
  add(dLn*(1/sp.touchHz)*(real.touchHz?0.03:0.35));                          // periodo de muestreo
  add(dLn*(sp.touchLagMs/1000)*(real.touchLagMs?0.10:0.45));                 // retraso de pantalla
  add(_FIS.GAMMA_RES*(real.res?0.02:0.12));                                  // densidad de píxeles
  add(dLn*(0.5*a.frame/1000)*(real.refreshHz?0.02:0.30));                    // frecuencia de refresco
  add(dLn*(a.cpu/1000)*(real.chip?0.15:0.60));                               // carga del chip
  return{lng,sigma:Math.sqrt(v2)};
}
function _histGet(k){try{const a=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(a)?a.filter(Number.isFinite):[];}catch(e){return[];}}
function _histPush(k,v,n){try{const a=_histGet(k);a.push(v);localStorage.setItem(k,JSON.stringify(a.slice(-(n||6))));}catch(e){}}
// Elige un valor del muestreador físico que quede a >= minSep de los últimos generados.
function _spread(name,sampler,lo,hi,minSep,nHist){
  lo=Math.round(lo);hi=Math.round(hi);if(lo>hi){const t=lo;lo=hi;hi=t;}
  const key="sg_hist_"+name,hist=_histGet(key).slice(-(nHist||3));
  let best=lo,bestD=-1;
  for(let i=0;i<60;i++){
    const v=clamp(Math.round(sampler()),lo,hi);
    const d=hist.length?Math.min.apply(null,hist.map(h=>Math.abs(h-v))):1e9;
    if(d>=minSep){best=v;bestD=d;break;}
    if(d>bestD){bestD=d;best=v;}
  }
  _histPush(key,best,6);
  return best;
}
function genSensiMejorado(marca,modelo,nivel,dpi){
  const grp=_grp(marca),iP=(grp==="E"),p=P[grp];
  // ── Ventana de la General según el nivel (banda del nivel ∩ límites del grupo) ──
  const BANDA={baja:[145,158],media:[159,174],alta:[176,200]},BANDA_I={baja:[89,120],media:[121,169],alta:[172,200]};
  const bd=(iP?BANDA_I:BANDA)[nivel]||(iP?BANDA_I:BANDA).media;
  let gLo=iP?bd[0]:clamp(Math.max(p.genMin,bd[0]),bd[0],bd[1]),gHi=iP?bd[1]:clamp(Math.min(bd[1],p.genMax),bd[0],bd[1]);
  if(gLo>gHi){gLo=p.genMin;gHi=p.genMax;}
  gHi=Math.min(gHi,197); // deja sitio para que Punto Rojo siempre quede por encima
  if(gHi-gLo<6){const c=(gLo+gHi)/2;gLo=Math.round(c-3);gHi=Math.min(197,Math.round(c+3));} // ventana mínima: nunca un valor único
  const FLOOR=iP?60:100; // piso de los valores (iPhone baja por debajo de 100)
  const hsR=Math.random(),hs=hsR<0.60?"full":hsR<0.90?"mid":"normal";
  // ── DPI (se calcula primero porque entra en la física: sensi ∝ DPI^-½) ──
  let dpiV=null;
  if(dpi&&!iP&&p.dpiMin>0){
    const f=nivel==="baja"?[0.55,1]:nivel==="media"?[0.25,0.75]:[0,0.45],span=p.dpiMax-p.dpiMin;
    dpiV=_spread("dpi_"+nivel,()=>p.dpiMin+span*(f[0]+(f[1]-f[0])*_sigm(1.1*_gauss())),p.dpiMin+span*f[0],p.dpiMin+span*f[1],8,4);
    dpiV=clamp(dpiV,530,630);
  }
  // ── Física del dispositivo → ln g y su incertidumbre σ ──
  const F=_fisGanancia(_screenProfile(marca,modelo),dpiV,_fisFuentes(marca,modelo));
  // Centro del resultado según el celular: los datos del Worker mueven el centro de forma suave y acotada (±1.8),
  // y el azar físico (zs) reparte alrededor de ese centro, así no se amontona en los bordes de la banda.
  const z0=1.8*Math.tanh(_FIS.DEV*F.lng/_FIS.ESC/1.8),zs=F.sigma/_FIS.ESC;
  // ── GENERAL ──
  let general=_spread("gen_"+(iP?"i":"a")+nivel,()=>gLo+(gHi-gLo)*_sigm(z0+zs*_gauss()),gLo,gHi,clamp(Math.round((gHi-gLo)/5),3,8),2); // solo se aleja de los 2 últimos: separa sin borrar el sesgo del celular
  // ── PUNTO ROJO: offset sobre General (más alto con hs "normal", más pegado con "full") ──
  const rLo=Math.max(nivel==="baja"?5:4,p.rojoD[0]+4),rHi=Math.max(rLo+6,p.rojoD[1]*3+6+(nivel==="baja"?2:0)); // nunca pegado al General (mínimo 4-5 puntos)
  const zh=hs==="full"?-0.9:hs==="mid"?0:0.9;
  // Las ventanas se acotan con el espacio libre hasta 199: así nada se amontona en el 200.
  const topR=199-Math.round(4*_sigm(_gauss())); // techo variable (195-199): evita que varios valores terminen clavados en 199
  const rHi2=Math.max(2,Math.min(rHi,topR-general)),rLo2=Math.min(rLo,rHi2);
  const off=_spread("roj_"+nivel,()=>rLo2+(rHi2-rLo2)*_sigm(0.8*z0+zh+zs*_gauss()),rLo2,rHi2,3,2);
  let rojo=general+off;
  // ── ZOOM 2x: reducción por monitor-distance matching, k dentro de la ventana del nivel ──
  const xLo=Math.abs(p.x2D[1]),xHi=Math.abs(p.x2D[0]),dMin=Math.max(5,xLo),dMax=xHi+12;
  const kr=_FIS_K[nivel]||_FIS_K.media,r2ref=_mdm(2,_FIS.K_REF);
  const dX2=_spread("x2d_"+nivel,()=>{const k=kr[0]*Math.pow(kr[1]/kr[0],_sigm(0.6*z0+zs*_gauss()));return rojo*(1-_mdm(2,k)/r2ref);},dMin,dMax,3,2);
  let x2=clamp(rojo-dX2,FLOOR,rojo-3);
  // ── ZOOM 4x: compensación ∝ √(r2/r4) − 1 (la raíz amortigua la respuesta del juego) ──
  const kq=_kDeRatio(2,clamp(x2/rojo,0.3,0.999)*r2ref);
  const fq=Math.sqrt(_mdm(2,kq)/_mdm(4,kq))-1;
  const topX=199-Math.round(7*_sigm(_gauss())),hi4=Math.max(3,Math.min(40,topX-x2)),lo4=Math.min(16,Math.max(3,hi4-5));
  const d4=_spread("x4d_"+nivel,()=>x2*(0.32+0.22*_sigm(0.5*z0+zs*_gauss()))*fq,lo4,hi4,4,2);
  let x4=x2+d4;
  // ── FRANCOTIRADOR: ventana propia del grupo, posición por física ──
  const fMin=p.franMin,fMax=p.franMax,fD=fMax-fMin;
  const fr=nivel==="baja"?[0,0.55]:nivel==="media"?[0.25,0.80]:[0.45,1];
  const fLo=fMin+fD*fr[0],fHi=fMin+fD*fr[1];
  let franco=_spread("fran_"+nivel,()=>fLo+(fHi-fLo)*_sigm(0.7*z0+zs*_gauss()),Math.max(fMin,fLo-1),Math.min(fMax,fHi+1),3,2);
  // ── CÁMARA LIBRE: offset sobre General ──
  const cD=p.camaraD[1]-p.camaraD[0],wd=Math.max(3,Math.round(cD*0.25));
  const cr=nivel==="baja"?[0,0.38]:nivel==="media"?[0.22,0.72]:[0.50,1];
  const cLo=p.camaraD[0]+cD*cr[0]-wd,cHi=p.camaraD[0]+cD*cr[1]+wd;
  const topC=199-Math.round(7*_sigm(_gauss())),hiC=Math.max(2,Math.min(cHi,topC-general)),loC=Math.min(cLo,Math.max(2,hiC-3));
  const offC=_spread("cam_"+nivel,()=>loC+(hiC-loC)*_sigm(0.7*z0+zs*_gauss()),loC,hiC,3,2);
  let camara=general+offC;
  // ── BOTÓN (giroscopio): menos ganancia pide más control fino ──
  let bw;
  if(iP)bw=nivel==="baja"?[38,46]:nivel==="media"?[42,49]:[44,52];
  else if(nivel==="baja")bw=hs==="full"?[32,34]:hs==="mid"?[33,35]:[34,36];
  else if(nivel==="media")bw=hs==="full"?[36,39]:hs==="mid"?[38,41]:[40,43];
  else bw=hs==="full"?[34,36]:hs==="mid"?[36,37]:[38,39];
  const bLo=Math.max(32,bw[0]-2),bHi=Math.min(52,bw[1]+2);
  let boton=_spread("bot_"+nivel+(iP?"i":""),()=>bLo+(bHi-bLo)*_sigm(-0.7*z0+zs*_gauss()),bLo,bHi,2,2);
  const rd=rojo-general;
  if(hs==="full"||rd>=3)boton-=(rd>=6?3:2);else if(rd>=1)boton-=1;
  boton=clamp(Math.round(boton),32,52);
  // ── Orden final de seguridad ──
  rojo=clamp(rojo,FLOOR,200);x2=clamp(Math.round(x2),FLOOR,200);x4=clamp(x4,FLOOR,200);camara=clamp(camara,FLOOR,200);
  if(rojo<=general){rojo=Math.min(200,general+1);if(rojo<=general)general=rojo-1;}
  if(x2>=rojo)x2=rojo-3;
  if(x4<=x2)x4=Math.min(200,x2+8);
  franco=clamp(franco,fMin,Math.min(fMax,x2-1));
  // Garantía final: TODOS los valores salen como enteros (nada de decimales).
  const I=Math.round;
  return{general:I(general),rojo:I(rojo),x2:I(x2),x4:I(x4),franco:I(franco),camara:I(camara),boton:I(boton),dpi:dpiV==null?null:I(dpiV),nivel,hs,motor:"mejorado"};
}

// ── CANVAS FX ─────────────────────────────────────────
const cv=document.getElementById("fx"),ctx=cv.getContext("2d",{desynchronized:true})||cv.getContext("2d");
let fxMode="none",fxRAF=null,drops=[],_fxHoldUntil=0; // _fxHoldUntil: el fondo se pausa SOLO hasta ese instante (cambios de pestaña, ventanas), nunca por scroll
// Bucle de fondo con ahorro: no dibuja mientras la interfaz hace una transición grande (cambio de pestaña,
// ventanas abiertas) ni con la pestaña oculta. El scroll NO lo pausa. El último cuadro queda en pantalla y se reanuda solo.
function _fxRaf(cb){
  return requestAnimationFrame(function w(t){
    const b=document.body;
    if(document.hidden||Date.now()<_fxHoldUntil||b.classList.contains("ov-open")){ fxRAF=requestAnimationFrame(w); return; }
    cb(t);
  });
}
function resizeFX(){cv.width=window.innerWidth;cv.height=window.innerHeight;}
resizeFX(); window.addEventListener("resize",resizeFX);

// ── OPTIMIZACIÓN DE RENDIMIENTO ──────────────────────────────────────
// Antes, varios fondos (abyss/inferno/blood/mint) creaban un
// ctx.createRadialGradient() NUEVO por cada partícula EN CADA FRAME
// (hasta ~80 gradientes/frame × 60fps = miles de objetos/segundo). Crear
// un CanvasGradient es una operación cara; eso era la causa real del
// trabón general, no solo durante el scroll.
// Solución: el gradiente de cada "tipo" de brillo (color+radio) se dibuja
// UNA sola vez sobre un mini-canvas y se reutiliza con drawImage(), que es
// muchísimo más barato que recrear el gradiente cada vez.
const _glowSpriteCache=new Map();
function _glowSprite(colorRGB){
  // colorRGB: "255,180,60" (sin alpha). Un solo sprite base por color;
  // el tamaño y brillo por partícula se ajustan luego con drawImage()
  // (escala) y ctx.globalAlpha (opacidad) — ambos casi gratis, a
  // diferencia de crear un gradiente nuevo por partícula por frame.
  let sp=_glowSpriteCache.get(colorRGB);
  if(sp) return sp;
  const R=32, size=R*2;
  const c=document.createElement("canvas"); c.width=size; c.height=size;
  const sc=c.getContext("2d");
  const g=sc.createRadialGradient(R,R,0,R,R,R);
  g.addColorStop(0,`rgba(${colorRGB},1)`); g.addColorStop(1,`rgba(${colorRGB},0)`);
  sc.fillStyle=g; sc.beginPath(); sc.arc(R,R,R,0,Math.PI*2); sc.fill();
  _glowSpriteCache.set(colorRGB,c);
  return c;
}
function _drawGlow(colorRGB,x,y,size,alpha){
  ctx.globalAlpha=alpha;
  ctx.drawImage(_glowSprite(colorRGB),x-size/2,y-size/2,size,size);
  ctx.globalAlpha=1;
}

function stopFX(){
  if(fxRAF){cancelAnimationFrame(fxRAF);fxRAF=null;}
  ctx.clearRect(0,0,cv.width,cv.height);
  const v=document.getElementById("fxVideo");
  if(v){ v.pause(); v.removeAttribute("src"); v.load(); v.style.display="none"; delete v.dataset.fxName; }
}

// Espejo liviano del color actual para que Matrix pueda leerlo en cada frame
// sin costo (evita hacer getComputedStyle 60 veces por segundo).
let _fxAccentRGB="56,190,255", _fxAccentHex="#38BEFF";
function startMatrix(){
  stopFX(); fxMode="matrix";
  const cols=Math.floor(cv.width/14);
  drops=Array(cols).fill(1);
  const chars="アイウエカキサタナハマ0123456789ABCDEF☠⚡";
  function draw(){
    ctx.fillStyle="rgba(0,0,0,0.05)";ctx.fillRect(0,0,cv.width,cv.height);
    ctx.fillStyle=_fxAccentHex;ctx.font="13px monospace"; // sigue al color actual (aleatorio o fijo), a diferencia de los demás fondos que mantienen su color propio
    drops.forEach((y,i)=>{const c=chars[Math.floor(Math.random()*chars.length)];ctx.fillText(c,i*14,y*14);if(y*14>cv.height&&Math.random()>0.975)drops[i]=0;drops[i]++;});
    fxRAF=_fxRaf(draw);
  }
  draw();
}

function startRain(){
  stopFX(); fxMode="rain";
  // Más gotas, más largas, doble trazo (||) para efecto más visible
  const drops2=Array.from({length:120},()=>({
    x:Math.random()*window.innerWidth,
    y:Math.random()*window.innerHeight,
    s:Math.random()*1.2+0.6,       // grosor 0.6–1.8px
    sp:Math.random()*3+2,           // velocidad más rápida
    len:Math.random()*18+14,        // largo 14–32px
    gap:Math.random()*3+1           // espacio entre los dos trazos (||)
  }));
  function draw(){
    ctx.clearRect(0,0,cv.width,cv.height);
    drops2.forEach(d=>{
      // Trazo izquierdo |
      ctx.beginPath();
      ctx.moveTo(d.x,d.y);
      ctx.lineTo(d.x-d.sp*0.3,d.y+d.len);
      ctx.strokeStyle="rgba(56,190,255,0.75)";
      ctx.lineWidth=d.s;
      ctx.stroke();
      // Trazo derecho | (el segundo del ||)
      ctx.beginPath();
      ctx.moveTo(d.x+d.gap,d.y);
      ctx.lineTo(d.x+d.gap-d.sp*0.3,d.y+d.len*0.7);
      ctx.strokeStyle="rgba(56,190,255,0.35)";
      ctx.lineWidth=d.s*0.6;
      ctx.stroke();
      d.y+=d.sp*2.2;
      d.x-=0.4;
      if(d.y>cv.height){d.y=-d.len;d.x=Math.random()*cv.width;}
    });
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ⚠️ Antes los 5 temas de abajo (cyber/neon/gold/blood/mint) usaban esta misma
// función genérica, solo cambiando el color -> se veían todos idénticos.
// Se mantiene por compatibilidad pero ya no se usa desde applyTheme.
function startParticles(color){
  stopFX(); fxMode="particles";
  const pts=Array.from({length:40},()=>({x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight+window.innerHeight,r:Math.random()*3+1,sp:Math.random()*0.8+0.3,op:Math.random()}));
  function draw(){
    ctx.clearRect(0,0,cv.width,cv.height);
    pts.forEach(p=>{
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2);
      g.addColorStop(0,color+"cc"); g.addColorStop(1,color+"00");
      ctx.beginPath();ctx.arc(p.x,p.y,p.r*2,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
      p.y-=p.sp; p.op+=0.01;
      if(p.y<-10){p.y=cv.height+10;p.x=Math.random()*cv.width;}
    });
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── CYBER: polvo de datos + destellos de paquetes cruzando la pantalla ──
function startCyberDust(){
  stopFX(); fxMode="cyberdust";
  const dust=Array.from({length:55},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height,r:Math.random()*1.8+0.6,vy:-(Math.random()*0.4+0.15),ph:Math.random()*Math.PI*2}));
  let streaks=[]; let t=0;
  function draw(){
    ctx.fillStyle="rgba(2,8,16,0.16)"; ctx.fillRect(0,0,cv.width,cv.height);
    // polvo digital titilando, subiendo lento
    dust.forEach(p=>{
      const flick=0.4+0.6*Math.abs(Math.sin(t*0.04+p.ph));
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(56,190,255,${0.55*flick})`; ctx.fill();
      p.y+=p.vy; if(p.y<-10){p.y=cv.height+10;p.x=Math.random()*cv.width;}
    });
    // paquetes de datos: destellos rápidos que cruzan en diagonal
    if(Math.random()<0.025){
      const fromLeft=Math.random()<0.5;
      streaks.push({x:fromLeft?-20:cv.width+20,y:Math.random()*cv.height*0.7,vx:(fromLeft?1:-1)*(Math.random()*4+3),len:Math.random()*40+30});
    }
    streaks.forEach(s=>{
      const grad=ctx.createLinearGradient(s.x,s.y,s.x-s.len*Math.sign(s.vx),s.y);
      grad.addColorStop(0,"rgba(160,230,255,0.9)"); grad.addColorStop(1,"rgba(160,230,255,0)");
      ctx.strokeStyle=grad; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(s.x-s.len*Math.sign(s.vx),s.y); ctx.stroke();
      s.x+=s.vx;
    });
    streaks=streaks.filter(s=>s.x>-60&&s.x<cv.width+60);
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── NEON: anillos de pulso expandiéndose + tubos de luz flotantes ──
function startNeonPulse(){
  stopFX(); fxMode="neonpulse";
  let rings=[]; let t=0;
  const tubes=Array.from({length:6},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height,len:Math.random()*60+40,ang:Math.random()*Math.PI,vx:(Math.random()-0.5)*0.3,vy:(Math.random()-0.5)*0.3,ph:Math.random()*Math.PI*2}));
  function draw(){
    ctx.fillStyle="rgba(8,0,16,0.18)"; ctx.fillRect(0,0,cv.width,cv.height);
    // tubos de neón flotando, brillo pulsante
    tubes.forEach(tb=>{
      const glow=0.4+0.5*Math.sin(t*0.05+tb.ph);
      ctx.strokeStyle=`rgba(170,68,255,${glow})`; ctx.lineWidth=3; ctx.lineCap="round";
      ctx.beginPath();
      ctx.moveTo(tb.x-Math.cos(tb.ang)*tb.len/2,tb.y-Math.sin(tb.ang)*tb.len/2);
      ctx.lineTo(tb.x+Math.cos(tb.ang)*tb.len/2,tb.y+Math.sin(tb.ang)*tb.len/2);
      ctx.stroke();
      tb.x+=tb.vx; tb.y+=tb.vy;
      if(tb.x<0)tb.x=cv.width; if(tb.x>cv.width)tb.x=0;
      if(tb.y<0)tb.y=cv.height; if(tb.y>cv.height)tb.y=0;
    });
    // anillos de pulso naciendo en puntos aleatorios
    if(Math.random()<0.035){ rings.push({x:Math.random()*cv.width,y:Math.random()*cv.height,r:2,life:1}); }
    rings.forEach(r=>{
      ctx.strokeStyle=`rgba(255,90,200,${0.5*r.life})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(r.x,r.y,r.r,0,Math.PI*2); ctx.stroke();
      r.r+=1.8; r.life-=0.012;
    });
    rings=rings.filter(r=>r.life>0);
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── GOLD: lluvia de monedas/destellos dorados con brillo giratorio ──
function startGoldRush(){
  stopFX(); fxMode="goldrush";
  const coins=Array.from({length:35},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height-cv.height,sp:Math.random()*1.5+0.8,size:Math.random()*3+2,rot:Math.random()*Math.PI*2,rotSp:(Math.random()-0.5)*0.15,drift:(Math.random()-0.5)*0.5}));
  let t=0;
  function draw(){
    ctx.fillStyle="rgba(10,7,0,0.14)"; ctx.fillRect(0,0,cv.width,cv.height);
    // rayos de luz sutiles desde arriba
    const rg=ctx.createLinearGradient(0,0,0,cv.height*0.4);
    rg.addColorStop(0,"rgba(255,200,0,0.05)"); rg.addColorStop(1,"rgba(255,200,0,0)");
    ctx.fillStyle=rg; ctx.fillRect(0,0,cv.width,cv.height*0.4);
    coins.forEach(c=>{
      // el "giro" de la moneda se simula achatando el ancho con el coseno de su rotación
      const w=Math.abs(Math.cos(c.rot))*c.size+0.6;
      const bright=0.5+0.5*Math.abs(Math.sin(c.rot));
      ctx.fillStyle=`rgba(255,${200+bright*55|0},${bright*90|0},${0.85})`;
      ctx.beginPath(); ctx.ellipse(c.x,c.y,w,c.size,0,0,Math.PI*2); ctx.fill();
      c.y+=c.sp; c.x+=c.drift; c.rot+=c.rotSp;
      if(c.y>cv.height+10){ c.y=-10; c.x=Math.random()*cv.width; }
    });
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── BLOOD: goteo denso con estela + niebla roja baja ──
function startBloodDrip(){
  stopFX(); fxMode="blooddrip";
  const drips=Array.from({length:24},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height-cv.height,sp:Math.random()*3+2.5,len:Math.random()*22+14,drift:(Math.random()-0.5)*0.3}));
  let splats=[]; let t=0;
  function draw(){
    ctx.fillStyle="rgba(6,0,0,0.16)"; ctx.fillRect(0,0,cv.width,cv.height);
    // niebla roja densa en la parte baja
    const fog=ctx.createLinearGradient(0,cv.height*0.75,0,cv.height);
    fog.addColorStop(0,"rgba(120,0,10,0)"); fog.addColorStop(1,"rgba(120,0,10,0.22)");
    ctx.fillStyle=fog; ctx.fillRect(0,cv.height*0.75,cv.width,cv.height*0.25);
    // gotas: en vez de un gradiente lineal nuevo por gota (24/frame), un
    // trazo sólido semitransparente da el mismo efecto de "estela" a mucho
    // menor costo (sin crear ningún objeto CanvasGradient).
    ctx.strokeStyle="rgba(200,0,25,0.7)"; ctx.lineWidth=2; ctx.lineCap="round";
    drips.forEach(d=>{
      ctx.beginPath(); ctx.moveTo(d.x,d.y-d.len); ctx.lineTo(d.x,d.y); ctx.stroke();
      d.y+=d.sp; d.x+=d.drift;
      if(d.y>cv.height*0.85 && Math.random()<0.02){ splats.push({x:d.x,y:cv.height*0.9+Math.random()*cv.height*0.1,life:1}); }
      if(d.y>cv.height+20){ d.y=-Math.random()*100; d.x=Math.random()*cv.width; }
    });
    // salpicaduras al tocar el "suelo"
    splats.forEach(s=>{
      ctx.fillStyle=`rgba(200,0,25,${0.5*s.life})`;
      ctx.beginPath(); ctx.ellipse(s.x,s.y,6*(1.6-s.life),2.5*(1.6-s.life),0,0,Math.PI*2); ctx.fill();
      s.life-=0.04;
    });
    splats=splats.filter(s=>s.life>0);
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── MINT: burbujas frescas ondulando en brisa + brillos fríos ──
function startMintBreeze(){
  stopFX(); fxMode="mintbreeze";
  const bubbles=Array.from({length:24},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height+cv.height,r:Math.random()*4+2,sp:Math.random()*0.7+0.3,ph:Math.random()*Math.PI*2,amp:Math.random()*20+8}));
  _glowSprite("61,255,180");
  _glowSprite("61,255,180");
  // Fondo difuso: no depende de ninguna partícula, se cachea igual que la
  // viñeta de otros fondos (solo se recalcula si cambia el tamaño de pantalla).
  let _mbW=-1,_mbH=-1,mbg=null;
  function _mintBg(){
    if(_mbW!==cv.width||_mbH!==cv.height){
      _mbW=cv.width; _mbH=cv.height;
      mbg=ctx.createRadialGradient(cv.width*0.5,cv.height*0.4,0,cv.width*0.5,cv.height*0.4,cv.height*0.7);
      mbg.addColorStop(0,"rgba(61,255,180,0.04)"); mbg.addColorStop(1,"rgba(61,255,180,0)");
    }
    return mbg;
  }
  let t=0;
  function draw(){
    ctx.clearRect(0,0,cv.width,cv.height);
    // brillo frío difuso de fondo, sigue el movimiento suave
    ctx.fillStyle=_mintBg(); ctx.fillRect(0,0,cv.width,cv.height);
    bubbles.forEach(b=>{
      const wob=Math.sin(t*0.03+b.ph)*b.amp*0.02;
      _drawGlow("61,255,180",b.x,b.y,b.r*4.4,0.7);
      ctx.strokeStyle="rgba(200,255,235,0.4)"; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.stroke();
      b.y-=b.sp; b.x+=wob;
      if(b.y<-10){ b.y=cv.height+10; b.x=Math.random()*cv.width; }
    });
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── OCÉANO REAL (olas animadas, no lluvia) ─────────────
function startOcean(){
  stopFX(); fxMode="ocean";
  let t=0;
  const bubbles=Array.from({length:26},()=>({x:Math.random()*window.innerWidth,y:window.innerHeight+Math.random()*200,r:Math.random()*2+1,sp:Math.random()*0.6+0.3}));
  function waveY(x,baseY,amp,freq,speed,phase){
    return baseY+Math.sin(x*freq+t*speed+phase)*amp;
  }
  function drawWave(baseY,amp,freq,speed,phase,color){
    ctx.beginPath();
    ctx.moveTo(0,cv.height);
    for(let x=0;x<=cv.width;x+=8){
      ctx.lineTo(x,waveY(x,baseY,amp,freq,speed,phase));
    }
    ctx.lineTo(cv.width,cv.height);
    ctx.closePath();
    ctx.fillStyle=color;
    ctx.fill();
  }
  function draw(){
    ctx.clearRect(0,0,cv.width,cv.height);
    const seaTop=cv.height*0.62;
    // Fondo del mar (degradado sutil de profundidad)
    const g=ctx.createLinearGradient(0,seaTop,0,cv.height);
    g.addColorStop(0,"rgba(0,40,80,0.35)"); g.addColorStop(1,"rgba(0,10,26,0.6)");
    ctx.fillStyle=g; ctx.fillRect(0,seaTop,cv.width,cv.height-seaTop);
    // Capas de olas (de más lejana/oscura a más cercana/clara)
    drawWave(seaTop+18,10,0.012,0.9,0,"rgba(0,60,110,0.35)");
    drawWave(seaTop+34,14,0.017,1.3,2,"rgba(0,90,150,0.32)");
    drawWave(seaTop+52,10,0.022,1.8,4,"rgba(56,190,255,0.28)");
    // Brillos de espuma en la cresta de la ola superior
    ctx.strokeStyle="rgba(200,240,255,0.35)"; ctx.lineWidth=1.5;
    ctx.beginPath();
    for(let x=0;x<=cv.width;x+=8){ const y=waveY(x,seaTop+18,10,0.012,0.9,0); x===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
    ctx.stroke();
    // Burbujas subiendo
    bubbles.forEach(b=>{
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
      ctx.fillStyle="rgba(200,240,255,0.4)"; ctx.fill();
      b.y-=b.sp; if(b.y<seaTop){ b.y=cv.height+Math.random()*40; b.x=Math.random()*cv.width; }
    });
    t+=0.016;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── FIRE REAL ─────────────────────────────────────────
function startFire(){
  stopFX(); fxMode="fire";
  const W=Math.min(cv.width,520), Hfull=cv.height;
  const H=Math.round(Hfull*0.5); // el fuego solo ocupa la mitad inferior de la pantalla (no la tapa entera)
  const offsetX=Math.floor((cv.width-W)/2);
  const offsetY=Hfull-H;
  const cell=4; // resolución del buffer interno (más chico = más filas = mejor disipación del calor)
  const cols=Math.max(24,Math.floor(W/cell)), rows=Math.max(50,Math.floor(H/cell));
  const buf=new Uint8Array(cols*rows).fill(0);

  // Canvas interno pequeño: se dibuja ahí y luego se escala suavizado al canvas real
  const off=document.createElement("canvas"); off.width=cols; off.height=rows;
  const fctx=off.getContext("2d");
  const imgData=fctx.createImageData(cols,rows);

  // Paleta realista: negro -> rojo oscuro -> naranja -> amarillo -> blanco cálido
  const pal=new Uint8Array(256*4);
  for(let i=0;i<256;i++){
    const t=i/255; let r,g,b;
    if(t<0.22){ const k=t/0.22; r=k*110; g=0; b=0; }
    else if(t<0.5){ const k=(t-0.22)/0.28; r=110+k*145; g=k*70; b=0; }
    else if(t<0.8){ const k=(t-0.5)/0.30; r=255; g=70+k*150; b=k*40; }
    else { const k=(t-0.8)/0.20; r=255; g=220+k*35; b=40+k*190; }
    const o=i*4; pal[o]=r; pal[o+1]=g; pal[o+2]=b; pal[o+3]=i<3?0:255;
  }
  function spreadFire(src){
    const rnd=Math.round(Math.random()*3)&3;
    const dst=src-cols-1+rnd;
    if(dst>=0&&dst<buf.length) buf[dst]=Math.max(0,buf[src]-(rnd&1)-1);
  }
  ctx.imageSmoothingEnabled=true;
  function draw(){
    for(let x=0;x<cols;x++) buf[(rows-1)*cols+x]=195+Math.random()*60|0;
    for(let y=1;y<rows;y++) for(let x=0;x<cols;x++) spreadFire(y*cols+x);
    const data=imgData.data;
    for(let p=0;p<buf.length;p++){
      const v=buf[p], o=p*4, po=v*4;
      data[o]=pal[po]; data[o+1]=pal[po+1]; data[o+2]=pal[po+2]; data[o+3]=pal[po+3];
    }
    fctx.putImageData(imgData,0,0);
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.drawImage(off,0,0,cols,rows,offsetX,offsetY,W,H);
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── CIBERSEGURIDAD: grilla de red + haz de escaneo ─────
function startCyberGuard(){
  stopFX(); fxMode="cyberguard";
  const cell=42; let scanY=0; let pulses=[];
  const nodes=Array.from({length:9},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height,vx:(Math.random()-0.5)*0.15,vy:(Math.random()-0.5)*0.15}));
  const codeBits=Array.from({length:22},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height,s:Math.random()<0.5?"1":"0",sp:Math.random()*0.4+0.15,op:Math.random()*0.3+0.08}));
  let t=0;
  function draw(){
    ctx.fillStyle="rgba(2,10,20,0.22)"; ctx.fillRect(0,0,cv.width,cv.height);
    // grilla base
    ctx.strokeStyle="rgba(56,190,255,0.14)"; ctx.lineWidth=1;
    for(let x=0;x<cv.width;x+=cell){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,cv.height);ctx.stroke(); }
    for(let y=0;y<cv.height;y+=cell){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cv.width,y);ctx.stroke(); }
    // bits binarios cayendo lento, tipo dataset de fondo
    ctx.font="11px monospace";
    codeBits.forEach(b=>{
      ctx.fillStyle=`rgba(120,220,255,${b.op})`;
      ctx.fillText(b.s,b.x,b.y);
      b.y+=b.sp; if(b.y>cv.height){ b.y=-10; b.x=Math.random()*cv.width; b.s=Math.random()<0.5?"1":"0"; }
    });
    // red de nodos conectados (efecto "topología de seguridad")
    nodes.forEach((n,i)=>{
      n.x+=n.vx; n.y+=n.vy;
      if(n.x<0||n.x>cv.width) n.vx*=-1;
      if(n.y<0||n.y>cv.height) n.vy*=-1;
      nodes.slice(i+1).forEach(m=>{
        const d=Math.hypot(n.x-m.x,n.y-m.y);
        if(d<180){ ctx.strokeStyle=`rgba(56,190,255,${0.18*(1-d/180)})`; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(n.x,n.y); ctx.lineTo(m.x,m.y); ctx.stroke(); }
      });
    });
    nodes.forEach(n=>{
      ctx.beginPath(); ctx.arc(n.x,n.y,3,0,Math.PI*2); ctx.fillStyle="rgba(160,230,255,0.75)"; ctx.fill();
      ctx.beginPath(); ctx.arc(n.x,n.y,7,0,Math.PI*2); ctx.strokeStyle="rgba(56,190,255,0.35)"; ctx.stroke();
    });
    // celdas pulsantes tipo "escaneo detectado"
    if(Math.random()<0.04){ pulses.push({x:Math.floor(Math.random()*cv.width/cell)*cell,y:Math.floor(Math.random()*cv.height/cell)*cell,life:1}); }
    pulses.forEach(p=>{
      ctx.fillStyle=`rgba(56,190,255,${0.35*p.life})`;
      ctx.fillRect(p.x,p.y,cell,cell);
      ctx.strokeStyle=`rgba(120,220,255,${0.6*p.life})`;
      ctx.strokeRect(p.x+1,p.y+1,cell-2,cell-2);
      p.life-=0.02;
    });
    pulses=pulses.filter(p=>p.life>0);
    // esquineras tipo HUD/mira táctica en las 4 esquinas
    const cs=26,m=18;
    ctx.strokeStyle="rgba(160,230,255,0.4)"; ctx.lineWidth=2;
    [[m,m,1,1],[cv.width-m,m,-1,1],[m,cv.height-m,1,-1],[cv.width-m,cv.height-m,-1,-1]].forEach(([x,y,dx,dy])=>{
      ctx.beginPath(); ctx.moveTo(x,y+cs*dy); ctx.lineTo(x,y); ctx.lineTo(x+cs*dx,y); ctx.stroke();
    });
    // haz de escaneo vertical
    const grad=ctx.createLinearGradient(0,scanY-70,0,scanY);
    grad.addColorStop(0,"rgba(56,190,255,0)"); grad.addColorStop(1,"rgba(56,190,255,0.28)");
    ctx.fillStyle=grad; ctx.fillRect(0,scanY-70,cv.width,70);
    ctx.strokeStyle="rgba(160,230,255,0.85)"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(0,scanY); ctx.lineTo(cv.width,scanY); ctx.stroke();
    scanY+=2.2; if(scanY>cv.height+70) scanY=-10;
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── CONSOLA: terminal con scroll de líneas + scanlines CRT ──
function startTerminal(){
  stopFX(); fxMode="terminal";
  const lineH=17, cols=Math.floor(cv.width/8.4);
  const chars="01ABCDEF{}[]<>#$%_/\\;:.";
  const bootMsgs=["ACCESS GRANTED","SCANNING NETWORK...","FIREWALL OK","DECRYPTING PACKET","CONNECTION SECURE","ROOT@SENSISGOOD:~$"];
  let lines=Array.from({length:Math.ceil(cv.height/lineH)+2},()=>_termLine());
  let offset=0,t=0,cursorOn=true,cursorT=0;
  // viñeta cacheada (solo se recalcula si cambia el tamaño de pantalla)
  let _tvgW=-1,_tvgH=-1,tvg=null;
  function _termVignette(){
    if(_tvgW!==cv.width||_tvgH!==cv.height){
      _tvgW=cv.width; _tvgH=cv.height;
      tvg=ctx.createRadialGradient(cv.width/2,cv.height/2,cv.height*0.3,cv.width/2,cv.height/2,cv.height*0.75);
      tvg.addColorStop(0,"rgba(0,0,0,0)"); tvg.addColorStop(1,"rgba(0,0,0,0.45)");
    }
    return tvg;
  }
  function _termLine(){
    const boot=Math.random()<0.08;
    if(boot) return {s:bootMsgs[Math.floor(Math.random()*bootMsgs.length)],hl:true};
    const len=Math.floor(Math.random()*cols*0.7)+8; let s="> ";
    for(let i=0;i<len;i++) s+=chars[Math.floor(Math.random()*chars.length)];
    return {s,hl:false};
  }
  function draw(){
    ctx.fillStyle="rgba(0,5,2,0.16)"; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.font="13px monospace";
    lines.forEach((ln,i)=>{
      ctx.fillStyle=ln.hl?"rgba(255,200,0,0.65)":"rgba(61,255,143,0.55)";
      if(ln.hl){ ctx.shadowColor="rgba(255,200,0,0.5)"; ctx.shadowBlur=6; } else { ctx.shadowBlur=0; }
      ctx.fillText(ln.s,10,i*lineH-offset+lineH);
      ctx.shadowBlur=0;
    });
    offset+=0.6;
    if(offset>=lineH){ offset=0; lines.shift(); lines.push(_termLine()); }
    // cursor parpadeante al final de la última línea
    cursorT++; if(cursorT>28){ cursorT=0; cursorOn=!cursorOn; }
    if(cursorOn){ ctx.fillStyle="rgba(61,255,143,0.8)"; ctx.fillRect(10,cv.height-lineH+3,8,12); }
    // scanlines CRT
    ctx.fillStyle="rgba(0,0,0,0.08)";
    for(let y=0;y<cv.height;y+=3) ctx.fillRect(0,y,cv.width,1);
    // viñeta + flicker sutil de pantalla vieja
    if(Math.random()<0.02){ ctx.fillStyle="rgba(61,255,143,0.03)"; ctx.fillRect(0,0,cv.width,cv.height); }
    ctx.fillStyle=_termVignette(); ctx.fillRect(0,0,cv.width,cv.height);
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── CYBERPUNK: horizonte synthwave con grilla en perspectiva + sol ──
function startSynthwave(){
  stopFX(); fxMode="synthwave";
  let t=0;
  const horizon=cv=>cv.height*0.55;
  const stars=Array.from({length:60},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height*0.5,r:Math.random()*1.4+0.3,ph:Math.random()*Math.PI*2}));
  const mountains=Array.from({length:8},()=>Math.random()*0.4+0.15);
  function draw(){
    const hz=horizon(cv);
    ctx.clearRect(0,0,cv.width,cv.height);
    // estrellas titilando en el cielo
    stars.forEach(s=>{
      const tw=0.4+0.6*Math.abs(Math.sin(t*0.02+s.ph));
      ctx.fillStyle=`rgba(200,220,255,${tw*0.6})`;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
    });
    // sol con franjas horizontales estilo synthwave
    ctx.save();
    ctx.beginPath(); ctx.arc(cv.width/2,hz-40,70,0,Math.PI*2); ctx.clip();
    const sunG=ctx.createLinearGradient(0,hz-110,0,hz+30);
    sunG.addColorStop(0,"#FFD86B"); sunG.addColorStop(0.5,"#FF5AC8"); sunG.addColorStop(1,"#AA44FF");
    ctx.fillStyle=sunG; ctx.fillRect(cv.width/2-70,hz-110,140,140);
    ctx.fillStyle="rgba(10,0,20,0.85)";
    for(let s=0;s<5;s++){ ctx.fillRect(cv.width/2-70,hz-10+s*9,140,4); }
    ctx.restore();
    const glow=ctx.createRadialGradient(cv.width/2,hz-40,10,cv.width/2,hz-40,150);
    glow.addColorStop(0,"rgba(255,120,220,0.35)"); glow.addColorStop(1,"rgba(170,68,255,0)");
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cv.width/2,hz-40,150,0,Math.PI*2); ctx.fill();
    // siluetas de montañas
    ctx.fillStyle="rgba(20,0,35,0.8)";
    ctx.beginPath(); ctx.moveTo(0,hz);
    mountains.forEach((h,i)=>{ ctx.lineTo((cv.width/(mountains.length-1))*i,hz-h*90); });
    ctx.lineTo(cv.width,hz); ctx.closePath(); ctx.fill();
    // línea de horizonte
    ctx.strokeStyle="rgba(255,90,200,0.5)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,hz); ctx.lineTo(cv.width,hz); ctx.stroke();
    // grilla de piso en perspectiva
    const vpX=cv.width/2;
    for(let i=-12;i<=12;i++){
      ctx.beginPath(); ctx.moveTo(vpX+i*40,cv.height); ctx.lineTo(vpX+i*6,hz);
      ctx.strokeStyle="rgba(170,68,255,0.35)"; ctx.stroke();
    }
    for(let j=0;j<10;j++){
      const p=((j*0.11+t*0.02)%1);
      const y=hz+p*p*(cv.height-hz);
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cv.width,y);
      ctx.strokeStyle=`rgba(255,90,200,${0.25*(1-p)})`; ctx.stroke();
    }
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── INFERNAL: suelo de lava agrietado + brasas subiendo ──
function startInferno(){
  stopFX(); fxMode="inferno";
  const embers=Array.from({length:45},()=>({x:Math.random()*cv.width,y:cv.height+Math.random()*100,r:Math.random()*2.2+0.8,sp:Math.random()*1.4+0.5,drift:(Math.random()-0.5)*0.6,life:Math.random()}));
  const smoke=Array.from({length:10},()=>({x:Math.random()*cv.width,y:cv.height*0.85+Math.random()*cv.height*0.15,r:Math.random()*40+30,sp:Math.random()*0.3+0.15,op:Math.random()*0.05+0.03}));
  const cracks=Array.from({length:10},()=>({x:Math.random()*cv.width,ph:Math.random()*Math.PI*2}));
  // precalentar sprites usados (evita el primer frame más costoso)
  _glowSprite("60,20,10"); _glowSprite("255,180,60"); _glowSprite("255,220,150");
  let t=0;
  function draw(){
    ctx.fillStyle="rgba(5,0,0,0.14)"; ctx.fillRect(0,0,cv.width,cv.height);
    // humo subiendo lento (sprite reutilizado, solo cambia tamaño/opacidad)
    smoke.forEach(s=>{
      _drawGlow("60,20,10",s.x,s.y,s.r*2,s.op*2.2);
      s.y-=s.sp; if(s.y<-s.r){ s.y=cv.height+s.r; s.x=Math.random()*cv.width; }
    });
    const floorH=cv.height*0.22;
    const lg=ctx.createLinearGradient(0,cv.height-floorH,0,cv.height);
    lg.addColorStop(0,"rgba(255,90,0,0.05)"); lg.addColorStop(1,"rgba(255,60,0,0.28)");
    ctx.fillStyle=lg; ctx.fillRect(0,cv.height-floorH,cv.width,floorH);
    // grietas de lava pulsando por toda la pantalla, no solo el piso
    cracks.forEach(c=>{
      const glow=0.12+0.14*Math.sin(t*0.04+c.ph);
      ctx.strokeStyle=`rgba(255,140,0,${glow})`; ctx.lineWidth=1.6;
      ctx.beginPath();
      let x=c.x,y=cv.height;
      ctx.moveTo(x,y);
      for(let i=0;i<5;i++){ x+=(Math.sin(c.ph+i)*18); y-=floorH*0.9/5; ctx.lineTo(x,y); }
      ctx.stroke();
    });
    embers.forEach(p=>{
      _drawGlow("255,180,60",p.x,p.y,p.r*6,0.85);
      p.y-=p.sp; p.x+=p.drift+Math.sin(p.y*0.02)*0.4;
      if(p.y<-10){ p.y=cv.height+Math.random()*40; p.x=Math.random()*cv.width; }
    });
    // destello ocasional tipo chispa/explosión pequeña
    if(Math.random()<0.015){
      const fx=Math.random()*cv.width, fy=cv.height-floorH*Math.random();
      _drawGlow("255,220,150",fx,fy,100,0.5);
    }
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

// ── ABISMO: fondo marino profundo, bioluminiscencia + haces de luz ──
function startAbyss(){
  stopFX(); fxMode="abyss";
  const orbs=Array.from({length:28},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height,r:Math.random()*2+1,vx:(Math.random()-0.5)*0.25,vy:(Math.random()-0.5)*0.25,hue:Math.random()<0.5?"56,190,255":"61,255,180",ph:Math.random()*Math.PI*2}));
  const jellies=Array.from({length:4},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height,vy:-(Math.random()*0.2+0.08),ph:Math.random()*Math.PI*2,size:Math.random()*14+16}));
  const fishes=Array.from({length:6},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height,sp:(Math.random()*0.4+0.2)*(Math.random()<0.5?1:-1),size:Math.random()*5+4}));
  _glowSprite("56,190,255"); _glowSprite("61,255,180");
  // La viñeta de profundidad es siempre la misma mientras no cambie el tamaño
  // de pantalla -> se cachea y solo se recalcula si el usuario rota el
  // celular, en vez de crear el gradiente de nuevo 60 veces por segundo.
  let _vgW=-1,_vgH=-1,vg=null;
  function _vignette(){
    if(_vgW!==cv.width||_vgH!==cv.height){
      _vgW=cv.width; _vgH=cv.height;
      vg=ctx.createRadialGradient(cv.width/2,cv.height/2,cv.height*0.2,cv.width/2,cv.height/2,cv.height*0.8);
      vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,0.5)");
    }
    return vg;
  }
  let t=0;
  function draw(){
    ctx.fillStyle="rgba(0,3,8,0.18)"; ctx.fillRect(0,0,cv.width,cv.height);
    // haces de luz
    for(let i=0;i<3;i++){
      const x=cv.width*(0.2+i*0.3)+Math.sin(t*0.005+i)*40;
      const g=ctx.createLinearGradient(x,0,x+80,cv.height);
      g.addColorStop(0,"rgba(56,190,255,0.06)"); g.addColorStop(1,"rgba(56,190,255,0)");
      ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(x-50,0); ctx.lineTo(x+130,0); ctx.lineTo(x+40,cv.height); ctx.lineTo(x-140,cv.height); ctx.closePath(); ctx.fill();
    }
    // peces silueta cruzando el fondo
    fishes.forEach(f=>{
      ctx.fillStyle="rgba(4,12,24,0.85)";
      ctx.beginPath();
      ctx.ellipse(f.x,f.y,f.size,f.size*0.45,0,0,Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(f.x-f.size*(f.sp>0?1:-1),f.y);
      ctx.lineTo(f.x-f.size*1.6*(f.sp>0?1:-1),f.y-f.size*0.4);
      ctx.lineTo(f.x-f.size*1.6*(f.sp>0?1:-1),f.y+f.size*0.4);
      ctx.closePath(); ctx.fill();
      f.x+=f.sp; if(f.x<-20)f.x=cv.width+20; if(f.x>cv.width+20)f.x=-20;
    });
    // medusas bioluminiscentes flotando hacia arriba
    jellies.forEach(j=>{
      const bob=Math.sin(t*0.03+j.ph)*4;
      ctx.fillStyle="rgba(61,255,180,0.18)";
      ctx.beginPath(); ctx.arc(j.x+bob,j.y,j.size,Math.PI,0); ctx.fill();
      for(let k=-2;k<=2;k++){
        ctx.strokeStyle="rgba(61,255,180,0.22)"; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(j.x+bob+k*j.size*0.3,j.y);
        ctx.lineTo(j.x+bob+k*j.size*0.3+Math.sin(t*0.05+k)*4,j.y+j.size*1.3);
        ctx.stroke();
      }
      j.y+=j.vy; if(j.y<-30){ j.y=cv.height+30; j.x=Math.random()*cv.width; }
    });
    // plancton/partículas bioluminiscentes (sprite reutilizado)
    orbs.forEach(p=>{
      const flick=0.5+0.5*Math.sin(t*0.05+p.ph);
      _drawGlow(p.hue,p.x,p.y,p.r*8,0.85*flick);
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=cv.width; if(p.x>cv.width)p.x=0;
      if(p.y<0)p.y=cv.height; if(p.y>cv.height)p.y=0;
    });
    ctx.fillStyle=_vignette(); ctx.fillRect(0,0,cv.width,cv.height);
    t++;
    fxRAF=_fxRaf(draw);
  }
  draw();
}

function applyTheme(t){
  currentTheme=t;
  // Conservar todas las clases de estado que no son "fondo" (glass, rgb-*,
  // persona-mono, etc.) — antes se perdían porque se pisaba TODO el className.
  const keepClasses=Array.from(document.body.classList).filter(c=>!c.startsWith("t-"));
  document.body.className=keepClasses.join(" ");
  document.body.style.backgroundImage=""; // limpia un fondo personalizado si había uno activo
  stopFX();
  if(t==="matrix"){document.body.classList.add("t-matrix");startMatrix();}
  else if(t==="rain"){document.body.classList.add("t-rain");startRain();}
  else if(t==="cyber"){document.body.classList.add("t-cyber");startCyberDust();}
  else if(t==="fire"){document.body.classList.add("t-fire");startVideoOrFallback("fuego",startFire);}
  else if(t==="neon"){document.body.classList.add("t-neon");startNeonPulse();}
  else if(t==="ocean"){document.body.classList.add("t-ocean");startVideoOrFallback("oceano",startOcean);}
  else if(t==="gold"){document.body.classList.add("t-gold");startGoldRush();}
  else if(t==="blood"){document.body.classList.add("t-blood");startBloodDrip();}
  else if(t==="mint"){document.body.classList.add("t-mint");startMintBreeze();}
  else if(t==="cyberguard"){document.body.classList.add("t-cyberguard");startCyberGuard();}
  else if(t==="terminal"){document.body.classList.add("t-terminal");startTerminal();}
  else if(t==="synthwave"){document.body.classList.add("t-synthwave");startSynthwave();}
  else if(t==="inferno"){document.body.classList.add("t-inferno");startInferno();}
  else if(t==="abyss"){document.body.classList.add("t-abyss");startAbyss();}
  savePrefs();
}

// Usa el video real de fondo (fuego.mp4 / oceano.mp4) si está disponible;
// si el archivo no carga (falta, error de red, etc.) cae automáticamente
// al efecto dibujado en canvas como respaldo, sin dejar la pantalla en blanco.
function startVideoOrFallback(name, fallbackFn){
  const v=document.getElementById("fxVideo");
  if(!v){ fallbackFn(); return; }
  // Si ya es el mismo video y sigue reproduciéndose, no lo reiniciamos —
  // recargar el src de un video que ya está andando es lo que causaba el
  // "trabón" al reproducirse (rebuffer completo de golpe).
  const targetSrc=name+".mp4";
  if(v.dataset.fxName===name && !v.paused && !v.ended){
    v.style.display="block";
    return;
  }
  let fellBack=false;
  const toFallback=()=>{
    if(fellBack) return;
    fellBack=true;
    v.style.display="none";
    v.onerror=null;
    delete v.dataset.fxName;
    fallbackFn();
  };
  v.onerror=toFallback;
  v.dataset.fxName=name;
  v.src=targetSrc;
  v.style.display="block";
  const p=v.play();
  if(p&&p.catch) p.catch(toFallback);
}

function applyColor(c){
  currentColor=c;
  _repaintSensiTables(); // cada cuadro de la tabla de sensi toma su propio tono a partir del color elegido
  document.body.classList.toggle("nocolor",String(c).toUpperCase()==="#E6E6E6"); // "Quitar color": acento neutro + glassmorphism blanco
  // CSS var (--ac para colores sólidos/gradientes; --ac-rgb para los rgba()
  // usados en bordes/fondos translúcidos en toda la app)
  document.documentElement.style.setProperty("--ac",c);
  const _hx=c.replace("#","");
  const _r=parseInt(_hx.substring(0,2),16), _g=parseInt(_hx.substring(2,4),16), _b=parseInt(_hx.substring(4,6),16);
  if(!isNaN(_r)&&!isNaN(_g)&&!isNaN(_b)){
    document.documentElement.style.setProperty("--ac-rgb",`${_r},${_g},${_b}`);
    // Espejo liviano para el fondo Matrix: es el ÚNICO fondo que sigue el
    // color actual (aleatorio cada 5s, o el que elijas fijo). Los demás
    // (rain, cyber, ocean, fuego, oro, sangre, menta, neón) mantienen su
    // color propio siempre, es parte de su identidad visual.
    _fxAccentRGB=`${_r},${_g},${_b}`;
    _fxAccentHex=c;
  }
  // Header title gradient
  document.querySelectorAll(".header h1").forEach(el=>{
    el.style.background=`linear-gradient(135deg,#fff,${c},${c}aa)`;
    el.style.webkitBackgroundClip="text";
    el.style.backgroundClip="text";
  });
  // Online dot
  document.querySelectorAll(".dot").forEach(el=>{ el.style.background=c; el.style.boxShadow=`0 0 5px ${c}`; });
  // Active tab border
  const styleId="sg-color-style";
  let st=document.getElementById(styleId);
  if(!st){ st=document.createElement("style"); st.id=styleId; document.head.appendChild(st); }
  st.textContent=`
    .tab.active{color:${c}!important;border-bottom-color:${c}!important;}
    .fi-user{color:${c}!important;}
    .feed-item:hover{border-color:${c}44!important;}
    .obtn{color:${c}!important;border-color:${c}44!important;}
    #sendBtn{background:linear-gradient(160deg,${c},${c}aa)!important;}
    .cpbtn{color:${c}!important;border-color:${c}44!important;}
    .r-chip.mine{border-color:${c}88!important;background:${c}22!important;}
    .nb-media{color:${c}!important;border-color:${c}44!important;background:${c}18!important;}
    .inp:focus{border-color:${c}88!important;}
    .online-dot,.dot{background:${c}!important;box-shadow:0 0 5px ${c}!important;}
  `;
  savePrefs();
}

// ── FONDO PERSONALIZADO (imagen subida por el usuario) ──────────────────
// Sin backend ni claves expuestas:
// 1) Se valida que el archivo sea una imagen real (por sus bytes, no por la
//    extensión, que se puede falsear fácilmente).
// 2) Se analiza 100% en el navegador con NSFWJS (TensorFlow.js) para
//    bloquear contenido pornográfico. La librería se carga solo la primera
//    vez que alguien usa esta función, para no pesarle a nadie más.
// 3) Se comprime antes de guardar (localStorage tiene límite ~5-8MB).
// Intenta cargar el script probando varias URLs/CDN en orden: si la primera
// falla (bloqueada por la red del usuario, caída, etc.) prueba la siguiente
// en vez de rendirse. Antes solo probaba jsdelivr y si esa red la bloqueaba,
// siempre fallaba.
function _loadScriptAny(urls){
  return new Promise(async(res,rej)=>{
    let lastErr=null;
    for(const src of urls){
      try{ await _loadScriptOnce(src); res(); return; }
      catch(e){ lastErr=e; console.error("Falló CDN, probando siguiente:",src,e); }
    }
    rej(new Error("Ningún servidor de descarga respondió (revisa tu conexión o si tu red bloquea CDNs)"));
  });
}
function _loadScriptOnce(src){
  return new Promise((res,rej)=>{
    const existing=document.querySelector(`script[src="${src}"]`);
    if(existing){ res(); return; }
    const s=document.createElement("script");
    s.src=src;
    s.onload=()=>res();
    s.onerror=()=>{ s.remove(); rej(new Error("No se pudo cargar "+src)); };
    document.head.appendChild(s);
  });
}
function _withTimeout(promise,ms,msg){
  return Promise.race([
    promise,
    new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg||"Tiempo de espera agotado")),ms))
  ]);
}
let _nsfwModelPromise=null;
function _ensureNsfwModel(){
  if(_nsfwModelPromise) return _nsfwModelPromise;
  _nsfwModelPromise=(async()=>{
    try{
      if(!window.tf) await _loadScriptAny([
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js",
        "https://fastly.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js",
        "https://unpkg.com/@tensorflow/tfjs@4.11.0/dist/tf.min.js",
        "https://gcore.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js"
      ]);
      if(!window.nsfwjs) await _loadScriptAny([
        "https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/dist/nsfwjs.min.js",
        "https://fastly.jsdelivr.net/npm/nsfwjs@4.2.1/dist/nsfwjs.min.js",
        "https://unpkg.com/nsfwjs@4.2.1/dist/nsfwjs.min.js",
        "https://gcore.jsdelivr.net/npm/nsfwjs@4.2.1/dist/nsfwjs.min.js"
      ]);
      return await nsfwjs.load();
    }catch(e){
      // MUY IMPORTANTE: si falla, se limpia la caché para que el próximo
      // intento vuelva a cargar de cero en vez de repetir el mismo error
      // para siempre (este era el bug: "siempre dice que no se pudo").
      _nsfwModelPromise=null;
      console.error("Error cargando el modelo NSFW:",e);
      throw e;
    }
  })();
  return _nsfwModelPromise;
}
// Verifica los primeros bytes del archivo (firma real) en vez de confiar en
// la extensión: alguien podría renombrar cualquier archivo a "foto.jpg".
function _isRealImage(bytes){
  if(bytes[0]===0xFF&&bytes[1]===0xD8&&bytes[2]===0xFF) return true; // JPEG
  if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4E&&bytes[3]===0x47) return true; // PNG
  if(bytes[0]===0x47&&bytes[1]===0x49&&bytes[2]===0x46) return true; // GIF
  if(bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50) return true; // WEBP
  return false;
}
function _compressImage(img,maxW,quality){
  const scale=Math.min(1,maxW/img.width);
  const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
  const c=document.createElement("canvas"); c.width=w; c.height=h;
  c.getContext("2d").drawImage(img,0,0,w,h);
  return c.toDataURL("image/jpeg",quality);
}
function _setCustomBgStatus(msg,color){
  const el=document.getElementById("customBgStatus");
  if(el){ el.textContent=msg; el.style.color=color||"rgba(160,215,255,0.5)"; }
}
function _showImgScan(sub){
  document.getElementById("imgScanSub").textContent=sub||"Verificando que sea segura, un momento.";
  document.getElementById("imgScanModal").classList.add("show");
}
function _hideImgScan(){ document.getElementById("imgScanModal").classList.remove("show"); }
let _pendingCustomBg=null;
document.getElementById("customBgPickBtn").addEventListener("click",()=>document.getElementById("customBgFile").click());
document.getElementById("customBgFile").addEventListener("change",async function(){
  const f=this.files[0];
  const previewWrap=document.getElementById("customBgPreviewWrap");
  const applyBtn=document.getElementById("customBgApplyBtn");
  previewWrap.style.display="none"; applyBtn.style.display="none"; _pendingCustomBg=null;
  if(!f) return;
  if(f.size>8*1024*1024){ _setCustomBgStatus("❌ La imagen no puede superar 8MB.","#FF5566"); this.value=""; return; }

  _setCustomBgStatus("🔍 Verificando archivo...");
  const head=new Uint8Array(await f.slice(0,12).arrayBuffer());
  if(!_isRealImage(head)){ _setCustomBgStatus("❌ El archivo no es una imagen válida.","#FF5566"); this.value=""; return; }

  let dataUrl;
  try{
    dataUrl=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
  }catch(e){ _setCustomBgStatus("❌ No se pudo leer la imagen.","#FF5566"); this.value=""; return; }
  const img=new Image();
  try{ await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=dataUrl; }); }
  catch(e){ _setCustomBgStatus("❌ La imagen está dañada.","#FF5566"); this.value=""; return; }

  // Se guarda en localStorage (no en Firestore, que tiene límite de 1MB
  // por documento), así que hay mucho más margen: subimos resolución y
  // calidad bastante respecto a antes (1280px/0.75 -> 1920px/0.9) para que
  // se vea nítida en pantallas grandes, sin recortar nada de la imagen
  // original (se reescala completa, manteniendo su proporción intacta).
  _pendingCustomBg=_compressImage(img,1920,0.90);
  document.getElementById("customBgPreview").src=_pendingCustomBg;
  previewWrap.style.display="block"; applyBtn.style.display="block";
  _setCustomBgStatus("✅ Imagen lista. Pulsa aplicar para usarla de fondo.","#3DFF8F");
});
function _applyCustomBgVisual(dataUrl){
  currentTheme="custom";
  const keepClasses=Array.from(document.body.classList).filter(c=>!c.startsWith("t-"));
  document.body.className=keepClasses.join(" ");
  stopFX();
  document.body.classList.add("t-custom");
  document.body.style.backgroundImage=`linear-gradient(rgba(3,7,13,0.55),rgba(3,7,13,0.55)),url(${dataUrl})`;
  // ANTES: "cover" recortaba bordes de la imagen para llenar toda la
  // pantalla sin importar la proporción real de la foto. Cambiado a
  // "contain" para que SIEMPRE se vea la imagen completa, sin recortar
  // nada — si la proporción no coincide exactamente con la pantalla,
  // puede quedar una franja del fondo oscuro arriba/abajo o a los lados,
  // pero nunca se pierde parte de la foto.
  document.body.style.backgroundSize="contain";
  document.body.style.backgroundRepeat="no-repeat";
  document.body.style.backgroundColor="#04070f";
  document.body.style.backgroundPosition="center";
  document.body.style.backgroundAttachment="fixed";
  const rb=document.getElementById("customBgRemoveBtn"); if(rb) rb.style.display="block";
}
document.getElementById("customBgApplyBtn").addEventListener("click",()=>{
  if(!_pendingCustomBg) return;
  _applyCustomBgVisual(_pendingCustomBg);
  try{ localStorage.setItem("sg_custom_bg",_pendingCustomBg); }
  catch(e){ addMsg("bot","⚠️ La imagen se aplicó, pero es muy grande para recordarla la próxima vez que entres."); }
  savePrefs();
  document.getElementById("cfgModal").classList.remove("show");
  addMsg("bot","✅ Fondo personalizado aplicado.");
});
document.getElementById("customBgRemoveBtn").addEventListener("click",()=>{
  localStorage.removeItem("sg_custom_bg");
  document.getElementById("customBgRemoveBtn").style.display="none";
  document.getElementById("customBgPreviewWrap").style.display="none";
  document.getElementById("customBgApplyBtn").style.display="none";
  _setCustomBgStatus("");
  if(currentTheme==="custom") applyTheme("default");
  addMsg("bot","🗑️ Fondo personalizado eliminado.");
});

// ── RANKING (leaderboard) ──────────────────────────────────────────────
let _rankUnsubs=[];
function _stopRankListeners(){ _rankUnsubs.forEach(u=>u()); _rankUnsubs=[]; }
function _renderRankingList(rows,field,emoji,label){
  const el=document.getElementById("rankingList");
  if(!rows.length){ el.innerHTML="<div style='text-align:center;font-size:11px;color:rgba(160,215,255,0.4);padding:20px 0;'>Todavía no hay datos suficientes.</div>"; return; }
  const medals=["🥇","🥈","🥉"];
  el.innerHTML=rows.map((d,i)=>{
    const u=d.data();
    const pos=medals[i]||("#"+(i+1));
    const avatarStyle=u.avatar?`background-image:url(${u.avatar});background-size:cover;background-position:center;`:"";
    const mine=u.nickname===nickname?"border-color:var(--ac)!important;":"";
    // Antes se comparaba d.id (que es el NICKNAME, así están guardados los
    // docs de usuario) contra el set de UIDs -> nunca podía coincidir por
    // esa vía, y quedaba solo la comparación por nickname como respaldo, que
    // fallaba si el creador cambió de nickname después de ser aprobado. El
    // campo correcto para comparar por UID es u.uid (guardado en el propio
    // documento al iniciar sesión), igual que se hace en el feed.
    const isCreator=(u.uid&&_verifiedCreatorUIDs.has(u.uid))||(u.nickname&&_verifiedCreatorNicks.has(u.nickname));
    const creatorBadgeHtml=isCreator?`<img src="${CREATOR_BADGE_IMG}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-left:4px;flex-shrink:0;" title="Creador Verificado"/>`:"";
    return `<div style="display:flex;align-items:center;gap:10px;background:color-mix(in srgb, var(--ac) 8%, #04070f);border:1px solid rgba(255,255,255,0.08);${mine}border-radius:16px;padding:8px 12px;">
      <span style="font-size:15px;width:26px;text-align:center;flex-shrink:0;">${pos}</span>
      <span style="width:30px;height:30px;border-radius:50%;background:#0a1420;${avatarStyle}flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;">${u.avatar?"":"👤"}</span>
      <span style="flex:1;display:flex;align-items:center;font-size:12px;font-weight:700;color:#E4F2FF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.nickname||"?"}${creatorBadgeHtml}</span>
      <span style="font-size:12px;font-weight:900;color:var(--ac);flex-shrink:0;">${emoji} ${u[field]||0}</span>
    </div>`;
  }).join("");
}
function _loadRankingTab(tab){
  _stopRankListeners();
  { const _rl=document.getElementById("rankingList"); if(!_rl.children.length) _rl.innerHTML="<div style='text-align:center;font-size:11px;color:rgba(160,215,255,0.4);padding:20px 0;'>Cargando ranking...</div>"; else _rl.style.opacity=".5"; }
  const field=tab==="streak"?"streak":"totalSensi";
  const emoji=tab==="streak"?"🔥":"🎮";
  const q=query(collection(db,_C.u()),orderBy(field,"desc"),limit(10));
  const unsub=onSnapshot(q,snap=>{
    const rows=snap.docs.filter(d=>(d.data()[field]||0)>0);
    document.getElementById("rankingList").style.opacity="";
    _renderRankingList(rows,field,emoji);
  },err=>{
    console.error("Error cargando ranking:",err);
    document.getElementById("rankingList").innerHTML="<div style='text-align:center;font-size:11px;color:#FF5566;padding:20px 0;'>No se pudo cargar el ranking.</div>";
  });
  _rankUnsubs.push(unsub);
}
document.getElementById("rankBtn").addEventListener("click",()=>{
  document.getElementById("rankingModal").classList.add("show");
  document.querySelectorAll(".rankTabBtn").forEach(b=>{
    b.classList.toggle("sel",b.dataset.rt==="sensis");
    b.style.background=b.dataset.rt==="sensis"?"rgba(var(--ac-rgb),0.18)":"transparent";
    b.style.color=b.dataset.rt==="sensis"?"var(--ac)":"rgba(160,215,255,0.5)";
  });
  _loadRankingTab("sensis");
});
document.getElementById("rankingCloseX").addEventListener("click",()=>{
  document.getElementById("rankingModal").classList.remove("show");
  _stopRankListeners();
});

// ── OBTENER MÁS CRÉDITOS (referidos) ─────────────────────────────────────
document.getElementById("creditsBtn").addEventListener("click",()=>{
  const link=location.origin+location.pathname+"?ref="+encodeURIComponent(nickname);
  document.getElementById("referralLinkIn").value=link;
  document.getElementById("creditsModal").classList.add("show");
});
document.getElementById("creditsCloseX").addEventListener("click",()=>{
  document.getElementById("creditsModal").classList.remove("show");
});
document.getElementById("referralCopyBtn").addEventListener("click",function(){
  const inp=document.getElementById("referralLinkIn");
  inp.select();
  navigator.clipboard?.writeText(inp.value).catch(()=>document.execCommand("copy"));
  const orig=this.textContent;
  this.textContent="✅ Copiado";
  setTimeout(()=>{ this.textContent=orig; },1800);
});
document.getElementById("referralShareBtn").addEventListener("click",async()=>{
  const link=document.getElementById("referralLinkIn").value;
  const text="Te invito a probar SENSIS GOOD FF 🎮 — entra con mi link:";
  if(navigator.share){
    try{ await navigator.share({title:"SENSIS GOOD FF",text,url:link}); }catch(e){ /* el usuario canceló, no pasa nada */ }
  }else{
    navigator.clipboard?.writeText(link).catch(()=>{});
    alert("Link copiado. Pégalo donde quieras compartirlo con tu amigo.");
  }
});
document.querySelectorAll(".rankTabBtn").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".rankTabBtn").forEach(b=>{
    const sel=b===btn;
    b.classList.toggle("sel",sel);
    b.style.background=sel?"rgba(var(--ac-rgb),0.18)":"transparent";
    b.style.color=sel?"var(--ac)":"rgba(160,215,255,0.5)";
  });
  _loadRankingTab(btn.dataset.rt);
}));

// ── VER PERFIL DE OTRO USUARIO (solo lectura, desde el feed) ─────────────
async function _openPublicProfile(nick){
  if(!nick) return;
  const m=document.getElementById("viewProfileModal");
  document.getElementById("viewProfileNick").textContent=nick;
  document.getElementById("viewProfileStreak").textContent="Cargando...";
  document.getElementById("viewProfileBio").textContent="";
  document.getElementById("viewProfileAvatarPreview").style.backgroundImage="";
  document.getElementById("viewProfileAvatarPreview").textContent="👤";
  document.getElementById("viewProfileBannerPreview").style.backgroundImage="";
  document.getElementById("viewProfileTotalSensi").textContent="0";
  document.getElementById("viewProfileStreakNum").textContent="0";
  m.classList.add("show");
  try{
    const snap=await getDoc(doc(db,_C.u(),nick));
    if(!snap.exists()){
      document.getElementById("viewProfileStreak").textContent="Usuario no encontrado.";
      return;
    }
    const u=snap.data();
    const streak=u.streak||0;
    document.getElementById("viewProfileStreak").textContent="🔥 "+streak+" día"+(streak!==1?"s":"");
    document.getElementById("viewProfileBio").textContent=u.bio||"";
    document.getElementById("viewProfileTotalSensi").textContent=u.totalSensi||0;
    document.getElementById("viewProfileStreakNum").textContent=streak;
    if(u.avatar){ document.getElementById("viewProfileAvatarPreview").style.backgroundImage=`url(${u.avatar})`; document.getElementById("viewProfileAvatarPreview").textContent=""; }
    if(u.banner){ document.getElementById("viewProfileBannerPreview").style.backgroundImage=`url(${u.banner})`; }
  }catch(e){
    console.error("No se pudo cargar el perfil público:",e);
    document.getElementById("viewProfileStreak").textContent="No se pudo cargar el perfil.";
  }
}
document.getElementById("viewProfileCloseX").addEventListener("click",()=>document.getElementById("viewProfileModal").classList.remove("show"));

// ── TEMAS DE PERSONALIZACIÓN COMPLETA ──────────────────
const PERSONA_THEMES={
  hacker:{name:"HACKER",bg:"matrix",color:"#3DFF8F",mono:true},
  cyber:{name:"CIBERSEGURIDAD",bg:"cyberguard",color:"#38BEFF",mono:true},
  consola:{name:"CONSOLA",bg:"terminal",color:"#3DFF8F",mono:true},
  neon:{name:"CYBERPUNK",bg:"synthwave",color:"#FF5AC8",mono:false},
  infernal:{name:"INFERNAL",bg:"inferno",color:"#FF5566",mono:false},
  abismo:{name:"ABISMO",bg:"abyss",color:"#38BEFF",mono:false},
};
let activePersonaTheme=null;
function applyPersonaTheme(id){
  const p=PERSONA_THEMES[id];
  if(!p) return;
  activePersonaTheme=id;
  applyTheme(p.bg);
  applyColor(p.color);
  document.body.classList.toggle("persona-mono",!!p.mono);
  document.querySelectorAll("#personaGrid .topt").forEach(el=>el.classList.toggle("sel",el.dataset.pt===id));
  _updatePersonaLock();
  lsSet("sg_persona",id);
  const msg=document.getElementById("personaActiveMsg");
  if(msg) msg.textContent="🎭 Tema activo: "+p.name+". Desactívalo para elegir fondo/color por separado.";
}
function disablePersonaTheme(){
  activePersonaTheme=null;
  document.body.classList.remove("persona-mono");
  applyTheme("none"); // Bug fix: sin esto el fondo del tema (matrix/fuego/etc.) se quedaba activo
  document.querySelectorAll("#personaGrid .topt").forEach(el=>el.classList.remove("sel"));
  _updatePersonaLock();
  lsSet("sg_persona",null);
  const msg=document.getElementById("personaActiveMsg");
  if(msg) msg.textContent="";
}
function _updatePersonaLock(){
  const locked=!!activePersonaTheme;
  ["cfgSecFondo","cfgSecColor"].forEach(id=>{
    const sec=document.getElementById(id);
    if(!sec) return;
    sec.style.opacity=locked?"0.4":"";
    sec.style.pointerEvents=locked?"none":"";
  });
}
document.getElementById("personaGrid")?.addEventListener("click",e=>{
  const opt=e.target.closest(".topt");
  if(!opt) return;
  document.querySelectorAll("#personaGrid .topt").forEach(el=>el.classList.remove("sel"));
  opt.classList.add("sel");
});
document.getElementById("applyPersonaBtn")?.addEventListener("click",()=>{
  const sel=document.querySelector("#personaGrid .topt.sel");
  if(!sel){ addMsg("bot","⚠️ Elige un tema primero."); return; }
  applyPersonaTheme(sel.dataset.pt);
  document.getElementById("cfgModal").classList.remove("show");
  addMsg("bot","🎭 Tema aplicado: "+PERSONA_THEMES[sel.dataset.pt].name);
});
document.getElementById("disablePersonaBtn")?.addEventListener("click",()=>{
  disablePersonaTheme();
  addMsg("bot","🚫 Tema desactivado. Ya puedes elegir fondo y color por separado.");
});

// ── EFECTO DE PULSACIÓN (ripple) AL TOCAR LA PANTALLA ────────────────────
let _rippleEnabled=false;
function _spawnRipple(x,y){
  const r=document.createElement("div");
  r.className="tap-ripple";
  r.style.left=x+"px"; r.style.top=y+"px";
  document.body.appendChild(r);
  r.addEventListener("animationend",()=>r.remove());
}
function _rippleHandler(e){
  const pt=e.touches&&e.touches[0]?e.touches[0]:e;
  _spawnRipple(pt.clientX,pt.clientY);
}
function setRippleEffect(on){
  _rippleEnabled=on;
  document.removeEventListener("pointerdown",_rippleHandler);
  if(on) document.addEventListener("pointerdown",_rippleHandler);
  savePrefs();
}

// ── EFECTO DE "BOLITAS" AL ACTIVAR UN INTERRUPTOR ────────────────────────
// Delegado en document (no en cada .sw individual) para que funcione con
// TODOS los switches de la app automáticamente, incluyendo los que se creen
// más adelante — no hay que enganchar nada por cada uno.
function _spawnSwitchBurst(originEl){
  const r=originEl.getBoundingClientRect();
  const cx=r.left+r.width-9, cy=r.top+r.height/2; // desde la bolita del switch (lado encendido)
  const n=3+Math.round(Math.random()); // 3 o 4 bolitas
  for(let i=0;i<n;i++){
    const b=document.createElement("div");
    b.className="sw-burst";
    const angle=(-70+Math.random()*140)*(Math.PI/180); // abanico hacia afuera, no hacia atrás
    const dist=28+Math.random()*26;
    b.style.setProperty("--dx",(Math.cos(angle)*dist)+"px");
    b.style.setProperty("--dy",(Math.sin(angle)*dist)+"px");
    b.style.left=cx+"px"; b.style.top=cy+"px";
    b.style.animationDelay=(i*25)+"ms";
    document.body.appendChild(b);
    b.addEventListener("animationend",()=>b.remove());
  }
}
document.addEventListener("change",e=>{
  const input=e.target;
  if(input.tagName==="INPUT"&&input.type==="checkbox"&&input.checked&&input.closest(".sw")){
    _spawnSwitchBurst(input.closest(".sw"));
  }
},true);

// ── DESTELLOS AL MOSTRAR UNA SENSI GENERADA ──────────────────────────────
// Clase y tiempos propios (no comparte con _spawnSwitchBurst) para poder
// hacerlas más lentas y notorias sin tocar el efecto del interruptor.
function _spawnSensiSparkles(bubbleEl){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const r=bubbleEl.getBoundingClientRect();
    if(!r.width) return;
    const pts=[
      {x:r.left+8,y:r.top+8},
      {x:r.right-8,y:r.top+8},
      {x:r.left+r.width*0.5,y:r.top-4},
      {x:r.left+r.width*0.5,y:r.bottom-6},
    ];
    pts.forEach((pt,i)=>{
      setTimeout(()=>{
        for(let j=0;j<2;j++){
          const b=document.createElement("div");
          b.className="sensi-spark";
          const angle=Math.random()*Math.PI*2;
          const dist=26+Math.random()*22;
          b.style.setProperty("--dx",(Math.cos(angle)*dist)+"px");
          b.style.setProperty("--dy",(Math.sin(angle)*dist)+"px");
          b.style.left=pt.x+"px"; b.style.top=pt.y+"px";
          document.body.appendChild(b);
          b.addEventListener("animationend",()=>b.remove());
        }
      },i*130);
    });
  }));
}
document.getElementById("rippleToggle").addEventListener("change",e=>setRippleEffect(e.target.checked));

function savePrefs(){ lsSet("sg_prefs",{theme:currentTheme,color:currentColor,glass:document.body.classList.contains("glass"),randomColors:!!_randomColorInterval,ripple:_rippleEnabled}); }
function loadPrefs(){
  const p=lsGet("sg_prefs");
  applyGlass(p&&p.glass===false?false:true); // por defecto activado
  if(p){
    if(p.theme==="custom"){
      const savedBg=localStorage.getItem("sg_custom_bg");
      if(savedBg) _applyCustomBgVisual(savedBg); else applyTheme("default");
    } else if(p.theme) applyTheme(p.theme);
    if(p.color)applyColor(p.color);
    if(p.randomColors) setRandomColors(true);
    if(p.ripple) setRippleEffect(true);
  }
  const gt=document.getElementById("glassToggle"); if(gt) gt.checked=document.body.classList.contains("glass");
  const rt=document.getElementById("randomColorToggle"); if(rt) rt.checked=!!_randomColorInterval;
  const ripT=document.getElementById("rippleToggle"); if(ripT) ripT.checked=_rippleEnabled;
  const savedPersona=lsGet("sg_persona");
  if(savedPersona&&PERSONA_THEMES[savedPersona]) applyPersonaTheme(savedPersona);
  else _updatePersonaLock();
}

// ── GLASSMORPHISM toggle ──
function applyGlass(on){
  document.body.classList.toggle("glass",!!on);
  savePrefs();
}
document.getElementById("glassToggle").addEventListener("change",e=>applyGlass(e.target.checked));

// ── Colores aleatorios cada 5s ──
let _randomColorInterval=null;
function hslToHex(h,s,l){
  s/=100; l/=100;
  const k=n=>(n+h/30)%12;
  const a=s*Math.min(l,1-l);
  const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  const toHex=x=>Math.round(255*x).toString(16).padStart(2,"0");
  return "#"+toHex(f(0))+toHex(f(8))+toHex(f(4));
}
let _lastRandomHue=Math.random()*360;
// Color aleatorio con OLA: una onda del color nuevo se expande, el color cambia al pasar la ola
// y el contador de 5 s empieza recién cuando la ola termina.
let _rcT=null,_rcW=null,_rcOn=false;
function _rcStop(){
  _rcOn=false; clearTimeout(_rcT); _rcT=null;
  if(_rcW){ try{_rcW.cancel();}catch(e){} _rcW=null; }
  document.querySelectorAll(".rc-wave").forEach(e=>e.remove());
}
function _rcStep(){
  if(!_rcOn) return;
  // saturación 78-100%, luminosidad 52-62% (siempre vívido) y salto de ≥25° de hue
  // 50% un color de la paleta de acentos (24) y 50% un matiz nuevo generado (rango más amplio)
  let rc;
  if(Math.random()<0.5){ const pool=[...document.querySelectorAll(".copt")].map(o=>o.dataset.c).filter(c=>c.toLowerCase()!==String(currentColor).toLowerCase()&&c.toUpperCase()!=="#E6E6E6"); rc=pool[Math.floor(Math.random()*pool.length)]; }
  else{ _lastRandomHue=(_lastRandomHue+25+Math.random()*310)%360; rc=hslToHex(_lastRandomHue, 65+Math.random()*35, 45+Math.random()*21); }
  const m=rc.slice(1).match(/../g).map(h=>parseInt(h,16)).join(",");
  const next=()=>{ if(_rcOn) _rcT=setTimeout(_rcStep,5000); };
  const paint=()=>{ applyColor(rc); document.querySelectorAll(".copt").forEach(x=>x.classList.remove("sel")); };
  if(matchMedia("(prefers-reduced-motion:reduce)").matches){ paint(); next(); return; }
  const w=document.createElement("div"); w.className="rc-wave";
  w.style.cssText="position:fixed;left:"+(20+Math.random()*60)+"%;top:"+(20+Math.random()*60)+"%;width:260vmax;height:260vmax;margin:-130vmax 0 0 -130vmax;border-radius:50%;pointer-events:none;z-index:9000;will-change:transform,opacity;background:radial-gradient(circle,rgba("+m+",.16) 0,rgba("+m+",.16) 40%,rgba("+m+",.55) 47%,rgba("+m+",0) 56%)";
  document.body.appendChild(w);
  const a=w.animate([{transform:"scale(0)",opacity:1},{transform:"scale(1)",opacity:0}],{duration:1400,easing:"cubic-bezier(.3,.6,.4,1)"});
  _rcW=a;
  setTimeout(()=>{ if(_rcOn) paint(); },420); // el color cambia cuando el frente de la ola cruza la pantalla
  a.onfinish=()=>{ w.remove(); _rcW=null; next(); }; // el contador de 5 s arranca al terminar la ola
}
function setRandomColors(on,imm){
  _rcStop(); _randomColorInterval=on?1:null;
  if(on){ _rcOn=true; if(imm) _rcStep(); else _rcT=setTimeout(_rcStep,5000); }
  savePrefs();
}
document.getElementById("randomColorToggle").addEventListener("change",e=>setRandomColors(e.target.checked,true));

// ── TUTORIAL DE BIENVENIDA (spotlight sobre la interfaz real; se guarda en Firestore, no en localStorage) ──
const TUTORIAL_STEPS=[
  {icon:"👋",title:"¡Bienvenido a SENSIS BOT!",body:"Este es un tour guiado: te iré señalando cada función directo sobre la pantalla real. Puedes saltarlo cuando quieras con \"SALTAR\".",target:null},
  {icon:"🌐",title:"EN VIVO",body:"Aquí está el feed: todos comparten HUDs, mensajes y resultados en tiempo real. Aquí SÍ aparece el filtro de búsqueda 🔍.",target:"#tFeed",before:async()=>{ document.getElementById("menuModal").classList.remove("show"); switchTab("feed"); await _tutWait(150); }},
  {icon:"🔍",title:"Filtro de búsqueda",body:"Este filtro solo existe aquí, en el feed. En \"Mi Chat\" no aparece.",target:"#feedToolbar",before:async()=>{ document.getElementById("menuModal").classList.remove("show"); switchTab("feed"); await _tutWait(150); }},
  {icon:"➕",title:"Publicar un HUD",body:"Toca este botón para subir un HUD: pegas el código y eliges cuántos dedos tiene (2 a 6, o <b>Personalizado</b> para elegir entre 1 y 10).",target:"#huAddBtn",before:async()=>{ document.getElementById("menuModal").classList.remove("show"); switchTab("feed"); await _tutWait(150); }},
  {icon:"💬",title:"MI CHAT",body:"Tu conversación privada con el bot. Aquí NO aparece el filtro de búsqueda.",target:"#tMio",before:async()=>{ document.getElementById("menuModal").classList.remove("show"); switchTab("mio"); await _tutWait(150); }},
  {icon:"📬",title:"Bandeja",body:"Aquí recibes mensajes, retos y recompensas que te envíe el admin.",target:"#inboxBtn",before:async()=>{ document.getElementById("menuModal").classList.add("show"); await _tutWait(560); }},
  {icon:"🎁",title:"Productos Gratis",body:"Descargas gratuitas (comandos, modificaciones, sensibilidades) alojadas en MediaFire. Se actualiza de vez en cuando.",target:"#freeProductsBtn",before:async()=>{ document.getElementById("menuModal").classList.add("show"); await _tutWait(560); }},
  {icon:"🎟️",title:"Códigos",body:"Acá ves todos los códigos activos del momento. Toca <b>Canjear</b> en el que quieras usar — cada código es de un solo uso por persona.",target:"#codesBtn",before:async()=>{ document.getElementById("menuModal").classList.add("show"); await _tutWait(560); }},
  {icon:"⚙️",title:"Configuración",body:"Todo lo personalizable del bot vive detrás de este botón. Vamos a abrirlo.",target:"#cfgBtn",before:async()=>{ const m=document.getElementById("menuModal"),was=m.classList.contains("show"); m.classList.add("show"); document.getElementById("cfgModal").classList.remove("show"); await _tutWait(was?60:560); }},
  {icon:"🆔",title:"Tu ID de Encuentro",body:"Este código de 6 dígitos es único y tuyo. Compártelo con un admin para que te encuentre fácilmente. Tócalo para copiarlo.",target:"#meetIdDisplay",before:async()=>{ document.getElementById("cfgBtn").click(); await _tutWait(560); document.querySelector(".cfgnav-btn[data-sec='cfgSecSession']")?.click(); await _tutWait(150); }},
  {icon:"🎨",title:"Colores del bot",body:"Elige un color fijo, o activa <b>Colores aleatorios</b> para que cambie solo cada 5 segundos.",target:"[data-sec='cfgSecColor']",before:async()=>{ openCfgSection("cfgSecColor"); await _tutWait(560); }},
  {icon:"✨",title:"Efectos visuales",body:"Activa/desactiva el <b>Glassmorphism</b> (vidrio esmerilado translúcido) y las <b>Luces RGB</b> (borde animado). El RGB se aplica por separado a la barra de escribir, mensajes y botones.",target:"[data-sec='cfgSecEffects']",before:async()=>{ openCfgSection("cfgSecEffects"); await _tutWait(560); }},
  {icon:"🎭",title:"Temas de Personalización",body:"6 estilos completos (Hacker, Ciberseguridad, Consola, Cyberpunk, Infernal, Abismo): cambian color, fondo animado y tipografía juntos. Mientras uno esté activo, el fondo y color sueltos quedan bloqueados.",target:"[data-sec='cfgSecPersona']",before:async()=>{ openCfgSection("cfgSecPersona"); await _tutWait(560); }},
  {icon:"🖼️",title:"Fondos animados",body:"Elige entre varios fondos animados (Matrix, lluvia, fuego, partículas, océano y más) para ambientar el bot.",target:"[data-sec='cfgSecFondo']",before:async()=>{ openCfgSection("cfgSecFondo"); await _tutWait(560); }},
  {icon:"📷",title:"Fondo con tu propia imagen",body:"En esta misma sección, más abajo, puedes subir <b>tu propia foto</b> como fondo (no solo los animados prediseñados). Se sube la imagen completa, se ajusta sola para verse bien en tu pantalla, y queda guardada en tu dispositivo.",target:"#customBgPickBtn",before:async()=>{ openCfgSection("cfgSecFondo"); await _tutWait(560); }},
  {icon:"✅",title:"¡Listo!",body:"Ya conoces todas las funciones principales. Puedes volver a este tutorial cuando quieras desde Configuración → Sesión. ¡Disfruta SENSIS BOT Creación de SENSIS GOOD FF!",target:null,before:async()=>{ document.getElementById("cfgModal").classList.remove("show"); await _tutWait(150); }},
];
let _tutStep=0,_tutBusy=false,_tutRaf=0;
function _tutWait(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function renderTutorialStep(){
  const s=TUTORIAL_STEPS[_tutStep];
  if(s.before){ try{ await s.before(); }catch(e){} }
  document.getElementById("tutSlideIcon").textContent=s.icon;
  document.getElementById("tutSlideTitle").textContent=s.title;
  document.getElementById("tutSlideBody").innerHTML=s.body;
  document.getElementById("tutBackBtn").style.display=_tutStep>0?"":"none";
  document.getElementById("tutNextBtn").textContent=_tutStep===TUTORIAL_STEPS.length-1?"✅ FINALIZAR":"SIGUIENTE →";
  const dots=document.getElementById("tutDots"); dots.innerHTML="";
  TUTORIAL_STEPS.forEach((_,i)=>{
    const d=document.createElement("div");
    d.style.cssText=`width:${i===_tutStep?16:6}px;height:6px;border-radius:4px;background:${i===_tutStep?"var(--ac)":"rgba(160,215,255,0.25)"};transition:all .2s;`;
    dots.appendChild(d);
  });
  _positionSpotlight(s.target);
  _tutTrack(s.target);
}
// Sigue al elemento unos instantes: los menús y secciones se animan al abrirse y el elemento se mueve
function _tutTrack(sel){
  cancelAnimationFrame(_tutRaf);
  const t=sel?document.querySelector(sel):null; if(!t) return;
  const t0=performance.now(); let last="";
  const loop=()=>{
    const r=t.getBoundingClientRect(), k=[r.left|0,r.top|0,r.width|0,r.height|0].join();
    if(k!==last){ last=k; _positionSpotlight(sel,true); }
    if(performance.now()-t0<900) _tutRaf=requestAnimationFrame(loop);
  };
  _tutRaf=requestAnimationFrame(loop);
}
function _positionSpotlight(sel,instant){
  const spot=document.getElementById("tutSpotlight");
  const tip=document.getElementById("tutTooltip");
  const target=sel?document.querySelector(sel):null;
  if(target){
    // BUG encontrado: si el target está dentro de un contenedor con scroll
    // (ej. la sección "Fondo" del modal de Configuración, que es más larga
    // que la pantalla) y queda fuera de lo visible, getBoundingClientRect()
    // devuelve coordenadas gigantes (muy por debajo de la pantalla). El
    // spotlight y el tooltip se dibujaban en esas coordenadas -> quedaban
    // FUERA de la pantalla visible (incluido el botón "Siguiente"), dejando
    // el tutorial trabado sin ninguna forma de avanzar ni cerrar.
    // Fix: forzar que el elemento quede visible en pantalla ANTES de medir
    // su posición.
    if(!instant) target.scrollIntoView({block:"center",inline:"nearest"});
    const r=target.getBoundingClientRect();
    const pad=8;
    const _p=(spot.style.display==="block"&&!instant)?spot.getBoundingClientRect():null;
    spot.getAnimations().forEach(a=>a.cancel());
    spot.style.display="block";
    spot.style.left=(r.left-pad)+"px";
    spot.style.top=(r.top-pad)+"px";
    spot.style.width=(r.width+pad*2)+"px";
    spot.style.height=(r.height+pad*2)+"px";
    spot.style.borderRadius=Math.max(10,Math.min(r.width,r.height)/2)+"px";
    spot.style.outline="2px solid var(--ac)";
    if(_p&&_p.width&&!matchMedia("(prefers-reduced-motion:reduce)").matches){ // movimiento por transform (GPU), no por layout
      const n=spot.getBoundingClientRect();
      spot.animate([{transformOrigin:"0 0",transform:"translate("+(_p.left-n.left)+"px,"+(_p.top-n.top)+"px) scale("+(_p.width/n.width)+","+(_p.height/n.height)+")"},{transformOrigin:"0 0",transform:"none"}],{duration:220,easing:"cubic-bezier(.65,0,.35,1)"});
    }
    // Colocar el tooltip arriba o abajo del elemento, según el espacio disponible
    const tipH=tip.offsetHeight||220, tipW=Math.min(300,window.innerWidth*0.88);
    let top=r.bottom+16;
    if(top+tipH>window.innerHeight-10) top=Math.max(10,r.top-tipH-16);
    // Salvaguarda extra: pase lo que pase con el cálculo de arriba, el
    // tooltip NUNCA debe quedar fuera de la pantalla (ni arriba ni abajo).
    top=Math.max(10,Math.min(top,window.innerHeight-tipH-10));
    let left=Math.min(Math.max(10,r.left),window.innerWidth-tipW-10);
    tip.style.top=top+"px"; tip.style.left=left+"px";
  } else {
    spot.style.display="none";
    const tipH=tip.offsetHeight||220, tipW=Math.min(300,window.innerWidth*0.88);
    tip.style.top=((window.innerHeight-tipH)/2)+"px";
    tip.style.left=((window.innerWidth-tipW)/2)+"px";
  }
  tip.style.display="block";
}
function showTutorial(){
  _tutStep=0; document.body.classList.add("tut-on");
  document.getElementById("tutTooltip").style.display="block";
  renderTutorialStep();
  window.addEventListener("resize",_tutOnResize);
}
function _tutOnResize(){
  const s=TUTORIAL_STEPS[_tutStep];
  if(s) _positionSpotlight(s.target);
}
async function closeTutorial(){
  document.body.classList.remove("tut-on"); cancelAnimationFrame(_tutRaf);
  document.getElementById("tutSpotlight").style.display="none";
  document.getElementById("tutTooltip").style.display="none";
  document.getElementById("cfgModal").classList.remove("show");
  window.removeEventListener("resize",_tutOnResize);
  try{
    if(nickname) await setDoc(doc(db,_C.u(),nickname),{tutorialSeen:true},{merge:true});
  }catch(e){}
}
document.getElementById("tutNextBtn").addEventListener("click",async()=>{
  if(_tutBusy) return; _tutBusy=true;
  try{ if(_tutStep<TUTORIAL_STEPS.length-1){ _tutStep++; await renderTutorialStep(); } else closeTutorial(); } finally{ _tutBusy=false; }
});
document.getElementById("tutBackBtn").addEventListener("click",async()=>{
  if(_tutBusy) return; _tutBusy=true;
  try{ if(_tutStep>0){ _tutStep--; await renderTutorialStep(); } } finally{ _tutBusy=false; }
});
document.getElementById("tutSkipX").addEventListener("click",closeTutorial);
document.getElementById("reopenTutBtn")?.addEventListener("click",()=>{
  document.getElementById("cfgModal").classList.remove("show");
  showTutorial();
});

// ── RGB ANIMADO ──
function applyRgbState(){
  const on=document.getElementById("rgbToggle").checked;
  document.body.classList.toggle("rgb-on",on);
  document.body.classList.toggle("rgb-input",on&&document.getElementById("rgbTgInput").checked);
  document.body.classList.toggle("rgb-msgs",on&&document.getElementById("rgbTgMsgs").checked);
  document.body.classList.toggle("rgb-btns",on&&document.getElementById("rgbTgBtns").checked);
  document.getElementById("rgbTargets").style.display=on?"":"none";
  document.getElementById("rgbWarn").style.display=on?"":"none";
  lsSet("sg_rgb",{on,input:document.getElementById("rgbTgInput").checked,msgs:document.getElementById("rgbTgMsgs").checked,btns:document.getElementById("rgbTgBtns").checked});
}
document.getElementById("rgbToggle").addEventListener("change",e=>{
  if(e.target.checked){
    const ok=confirm("⚠️ El RGB animado puede consumir más batería y causar lag en algunos dispositivos.\n\n¿Quieres activarlo de todas formas?");
    if(!ok){ e.target.checked=false; return; }
  }
  applyRgbState();
});
["rgbTgInput","rgbTgMsgs","rgbTgBtns"].forEach(id=>{
  document.getElementById(id).addEventListener("change",applyRgbState);
});
function restoreRgbState(){
  const saved=lsGet("sg_rgb");
  if(saved){
    document.getElementById("rgbToggle").checked=!!saved.on;
    document.getElementById("rgbTgInput").checked=saved.input!==false;
    document.getElementById("rgbTgMsgs").checked=!!saved.msgs;
    document.getElementById("rgbTgBtns").checked=!!saved.btns;
    applyRgbState();
  }
}
restoreRgbState();

// ── EMOJI PICKER ──────────────────────────────────────
const popup=document.getElementById("emojiPopup");
EMOJIS.forEach(e=>{
  const s=document.createElement("span"); s.className="ep-e"; s.textContent=e;
  s.addEventListener("click",()=>{ if(activeFeedId) reaccionar(activeFeedId,e); popup.classList.remove("show"); });
  popup.insertBefore(s,document.getElementById("epClose"));
});
document.getElementById("epClose").addEventListener("click",()=>popup.classList.remove("show"));
document.addEventListener("click",e=>{ if(!popup.contains(e.target)) popup.classList.remove("show"); });

function showPicker(id,x,y){
  activeFeedId=id;
  const px=Math.min(x,window.innerWidth-266);
  const py=Math.max(y-190,10);
  popup.style.left=px+"px"; popup.style.top=py+"px";
  popup.classList.add("show");
}

// Una reacción por usuario — nueva reemplaza la anterior
async function reaccionar(docId,emoji){
  if(!nickname) return;
  // Las sensis viven en Supabase; chat/hud siguen en Firestore. Detectamos el origen
  // por el elemento en pantalla (se guarda en dataset.src al construirlo).
  const el=document.querySelector(`.feed-item[data-id="${docId}"]`);
  const src=el?el.dataset.src:"fs";
  if(src==="sb"){
    await _feedCall("react",nickname,{id:String(docId),emoji});
    return;
  }
  const ref=doc(db,_C.f(),docId);
  const snap=await getDoc(ref);
  if(!snap.exists()) return;
  const reactions=snap.data().reactions||{};
  // quitar reacción anterior del usuario en cualquier emoji
  let prev=null;
  Object.keys(reactions).forEach(em=>{ if(reactions[em]&&reactions[em][nickname]){ prev=em; delete reactions[em][nickname]; } });
  // si eligió el mismo = solo quitar
  if(prev!==emoji){
    if(!reactions[emoji]) reactions[emoji]={};
    reactions[emoji][nickname]=true;
  }
  await updateDoc(ref,{reactions});
}

// ── FEED ──────────────────────────────────────────────
// Insignia de racha: solo se muestra a partir de 10 días seguidos entrando,
// para que sea un logro visible y no un dato molesto desde el día 1.
function _streakBadgeHtml(item){
  const s=item.streak||0;
  if(s<10) return "";
  return `<span style="font-size:10px;font-weight:900;color:#FF8844;margin-left:5px;">🔥${s}</span>`;
}
// Botón de "like" (❤️) reutilizando el mismo sistema de reacciones que ya
// existe (reaccionar()) — un toque simple en vez de tener que mantener
// presionado para abrir el selector de emojis completo.
function _likeButtonHtml(id,item){
  const reactions=item.reactions||{};
  const heartUsers=reactions["❤️"]||{};
  const cnt=Object.keys(heartUsers).length;
  const mine=heartUsers[nickname]?"mine":"";
  return `<button class="fi-like-btn ${mine}" data-id="${id}" data-e="❤️" title="Me gusta">❤️<span class="fi-like-count">${cnt>0?cnt:""}</span></button>`;
}
function buildFI(id,item){
  if(item.type==="chat"){
    const el=document.createElement("div"); el.className="feed-item feed-chat"; el.dataset.id=id; el.dataset.owner=item.nickname||""; el.dataset.src="fs"; if(item.uid) el.dataset.uid=item.uid;
    const t=item.ts?.toDate?new Date(item.ts.toDate()).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"}):"-";
    const creatorBadgeHtml=_isVerifiedCreator(item)?"<img src='"+CREATOR_BADGE_IMG+"' class='verified-badge' style='width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-left:4px;' title='Creador Verificado'/>":"";
    const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
    el.innerHTML=`<div class='fi-head'><span class='fi-user'>💬 <span class="fi-nick" data-nick="${esc(item.nickname||"User")}">${esc(item.nickname||"User")}</span>${creatorBadgeHtml}${_streakBadgeHtml(item)}</span><span class='fi-time'>${t}</span></div><div class='fi-result' style='white-space:pre-wrap;'>${esc(item.text||"")}</div><div class='fi-reactions'>${_likeButtonHtml(id,item)}</div>`;
    return el;
  }
  if(item.type==="hud"){
    const el=document.createElement("div"); el.className="feed-item feed-hud"; el.dataset.id=id; el.dataset.owner=item.nickname||""; el.dataset.src="fs"; if(item.uid) el.dataset.uid=item.uid;
    const t=item.ts?.toDate?new Date(item.ts.toDate()).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"}):"-";
    const creatorBadgeHtml=_isVerifiedCreator(item)?"<img src='"+CREATOR_BADGE_IMG+"' class='verified-badge' style='width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-left:4px;' title='Creador Verificado'/>":"";
    const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
    const deviceLine=(item.marca||item.modelo)?`<div class='fi-device'>📱 ${esc(item.marca||"")} ${esc(item.modelo||"")}</div>`:"";
    const fingersLine=item.fingers?`<div style="font-size:10px;color:rgba(160,215,255,0.6);margin-top:2px;">✋ ${item.fingers} dedo${item.fingers==1?"":"s"}</div>`:"";
    el.innerHTML=`<div class='fi-head'><span class='fi-user'>🖼️ <span class="fi-nick" data-nick="${esc(item.nickname||"User")}">${esc(item.nickname||"User")}</span>${creatorBadgeHtml}${_streakBadgeHtml(item)}</span><span class='fi-time'>${t}</span></div>${deviceLine}${fingersLine}<div class='fi-hud-code' data-code="${esc(item.code||"")}">${esc(item.code||"")}</div><div class='fi-hint'>toca el código para copiarlo</div><div class='fi-reactions'>${_likeButtonHtml(id,item)}</div>`;
    el.querySelector(".fi-hud-code").addEventListener("click",e=>{
      const code=e.currentTarget.dataset.code;
      navigator.clipboard?.writeText(code).then(()=>{ e.currentTarget.textContent="✅ Copiado"; setTimeout(()=>{ e.currentTarget.textContent=code; },1000); }).catch(()=>{});
    });
    return el;
  }
  const el=document.createElement("div"); el.className="feed-item"; el.dataset.id=id; el.dataset.owner=item.nickname||""; el.dataset.src=item._src||"fs"; if(item.uid) el.dataset.uid=item.uid;
  const t=item.ts?.toDate?new Date(item.ts.toDate()).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"}):"-";
  const nc=item.nivel==="baja"?"nb-baja":item.nivel==="media"?"nb-media":"nb-alta";
  const hl=item.hs==="full"?"🎯 HS":item.hs==="mid"?"⚡ MID":"";
  const dL=item.dpi?"\n🔵 DPI: "+item.dpi:"";
  const reactions=item.reactions||{};
  const chips=Object.entries(reactions).filter(([,u])=>Object.keys(u).length>0).map(([em,u])=>{
    const cnt=Object.keys(u).length; const mine=u[nickname]?"mine":"";
    return`<span class='r-chip ${mine}' data-e='${em}' data-id='${id}'>${em}<span class='rc'>${cnt}</span></span>`;
  }).join("");
  const creatorBadgeHtml=_isVerifiedCreator(item)?"<img src='"+CREATOR_BADGE_IMG+"' class='verified-badge' style='width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-left:4px;' title='Creador Verificado'/>":"";
  el.innerHTML=`<div class='fi-head'><span class='fi-user'>☠️ <span class="fi-nick" data-nick="${item.nickname||"User"}">${item.nickname||"User"}</span>${creatorBadgeHtml}${_streakBadgeHtml(item)}</span><span class='fi-time'>${t}</span></div><div class='fi-device'>📱 ${item.marca} ${item.modelo}</div><span class='nivel-badge ${nc}'>${NL[item.nivel]||""} ${hl}</span><div class='fi-result'>🎮 General: ${item.general}\n🔴 Mira Rojo: ${item.rojo}\n🔭 Mira 2X: ${item.x2}\n🔬 Mira 4X: ${item.x4}\n🏹 Francotirador: ${item.franco}\n📷 Cámara 360°: ${item.camara}\n🕹️ Botón Disparo: ${item.boton}${dL}</div><div class='fi-reactions'>${_likeButtonHtml(id,item)}${chips}</div><div class='fi-hint'>mantén presionado para más reacciones</div>`;
  let pt,mv=false;
  el.addEventListener("touchstart",e=>{ mv=false; pt=setTimeout(()=>{ if(!mv)showPicker(id,e.touches[0].clientX,e.touches[0].clientY); },600); },{passive:true});
  el.addEventListener("touchmove",()=>{ mv=true; clearTimeout(pt); },{passive:true});
  el.addEventListener("touchend",()=>clearTimeout(pt),{passive:true});
  el.addEventListener("contextmenu",e=>{ e.preventDefault(); showPicker(id,e.clientX,e.clientY); });
  el.querySelectorAll(".r-chip").forEach(c=>c.addEventListener("click",e=>{ e.stopPropagation(); reaccionar(c.dataset.id,c.dataset.e); }));
  return el;
}

// Sets en vivo de creadores con Programa aprobado.
// Se usa para pintar la insignia en TODOS sus mensajes/sensis (incluso los
// enviados antes de ser aprobados), en vez de depender solo del campo
// guardado en el momento del envío. Se identifica principalmente por UID
// (que no cambia) y, si no hay UID, por nickname (compatibilidad con
// registros viejos).
let _verifiedCreatorUIDs=new Set();
let _verifiedCreatorNicks=new Set();
function _isVerifiedCreator(item){
  if(item.uid&&_verifiedCreatorUIDs.has(item.uid)) return true;
  if(!item.uid&&item.nickname&&_verifiedCreatorNicks.has(item.nickname)) return true;
  return false;
}
onSnapshot(query(collection(db,"creators"),where("status","==","approved")),snap=>{
  const uids=new Set(), nicks=new Set();
  snap.forEach(d=>{
    const data=d.data();
    const uid=(data.uid||"").trim();
    const nk=(data.nickname||d.id||"").trim();
    if(uid) uids.add(uid);
    if(nk) nicks.add(nk);
  });
  _verifiedCreatorUIDs=uids;
  _verifiedCreatorNicks=nicks;
  // Re-render del feed actual para que la insignia aparezca sin esperar el próximo mensaje
  const fp=document.getElementById("feedPanel");
  fp.querySelectorAll(".feed-item").forEach(el=>{
    const nameEl=el.querySelector(".fi-user");
    if(!nameEl) return;
    const badge=nameEl.querySelector("img");
    const verified=(el.dataset.uid&&_verifiedCreatorUIDs.has(el.dataset.uid))||(!el.dataset.uid&&el.dataset.owner&&_verifiedCreatorNicks.has(el.dataset.owner));
    if(verified&&!badge){
      const img=document.createElement("img");
      img.src=CREATOR_BADGE_IMG; img.style.cssText="width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-left:4px;"; img.title="Creador Verificado";
      nameEl.appendChild(img);
    } else if(!verified&&badge){
      badge.remove();
    }
  });
});

const feedQ=query(collection(db,_C.f()),orderBy("ts","desc"),limit(40));
let _feedFilterText="", _latestFeedDocs=[], _latestFirestoreDocs=[], _latestSupabaseDocs=[];

// Fix scroll trabado: reconstruir todo el feed (innerHTML="") mientras el dedo
// sigue en la pantalla congela el scroll nativo hasta soltar. Solución: mientras
// hay un touch activo sobre el feed, solo guardamos los datos y marcamos
// "pendiente"; el render real se aplica recién al soltar el dedo.
let _feedTouchActive=false, _feedRenderPending=false;
const _feedPanelEl0=document.getElementById("feedPanel");
// Delegado: un solo listener para todo el feed en vez de uno por item.
// Cubre el botón de like (❤️) y el nombre de usuario (abre su perfil).
_feedPanelEl0.addEventListener("click",(e)=>{
  const likeBtn=e.target.closest(".fi-like-btn");
  if(likeBtn){ e.stopPropagation(); reaccionar(likeBtn.dataset.id,"❤️"); return; }
  const nickEl=e.target.closest(".fi-nick");
  if(nickEl){ e.stopPropagation(); _openPublicProfile(nickEl.dataset.nick); return; }
});
_feedPanelEl0.addEventListener("touchstart",()=>{ _feedTouchActive=true; },{passive:true});
_feedPanelEl0.addEventListener("touchend",()=>{
  _feedTouchActive=false;
  if(_feedRenderPending){ _feedRenderPending=false; _renderFeed(); }
},{passive:true});
_feedPanelEl0.addEventListener("touchcancel",()=>{
  _feedTouchActive=false;
  if(_feedRenderPending){ _feedRenderPending=false; _renderFeed(); }
},{passive:true});

// Normaliza una fila de Supabase (sensi) al mismo "shape" que usan buildFI/_renderFeed:
// { id, data(): {...} } con item._src="sb" para que reaccionar() sepa a qué tabla ir.
function _wrapSbRow(row){
  return { id: row.id, data: ()=>({
    type:"sensi", nickname:row.nickname, uid:row.uid, marca:row.marca, modelo:row.modelo,
    nivel:row.nivel, hs:row.hs, general:row.general, rojo:row.rojo, x2:row.x2, x4:row.x4,
    franco:row.franco, camara:row.camara, boton:row.boton, dpi:row.dpi,
    reactions:row.reactions||{}, creatorVerified:row.creator_verified, streak:row.streak||0,
    ts:{ toDate:()=>new Date(row.created_at) },
    _src:"sb", _ms:new Date(row.created_at).getTime()
  })};
}
function _msOf(d){
  const it=d.data();
  if(it._ms) return it._ms;
  return it.ts?.toDate ? it.ts.toDate().getTime() : 0;
}
function _mergeFeedSources(){
  // Junta chat/hud (Firestore) + sensis (Supabase), ordena por fecha y se queda con los últimos 40
  _latestFeedDocs=[..._latestFirestoreDocs,..._latestSupabaseDocs]
    .sort((a,b)=>_msOf(a)-_msOf(b))
    .slice(-40);
  if(_feedTouchActive){ _feedRenderPending=true; }
  else { _renderFeed(); }
  document.getElementById("onlineN").textContent=Math.max(1,Math.min(_latestFeedDocs.length+rand(1,4),35));
}
function _renderFeed(){
  const fp=document.getElementById("feedPanel");
  const atB=fp.scrollHeight-fp.scrollTop-fp.clientHeight<80;
  const q=_feedFilterText.trim().toLowerCase();
  const docsToShow=_latestFeedDocs.filter(d=>{
    if(!q) return true;
    const it=d.data();
    if(it.type==="chat") return true; // el filtro es por marca/modelo, los mensajes de texto libre no aplican -> siempre visibles
    const marca=(it.marca||"").toLowerCase(), modelo=(it.modelo||"").toLowerCase();
    return marca.includes(q)||modelo.includes(q);
  });
  // Render incremental: si los ítems actuales en pantalla son un prefijo exacto de
  // los nuevos (el caso normal: solo se agregó algo al final), NO se toca el DOM
  // existente, solo se añaden los nuevos. Esto evita el innerHTML="" completo que
  // causaba el trabón/congelamiento del scroll al llegar sensis mientras deslizas.
  const existing=[...fp.children];
  const sameCount=Math.min(existing.length,docsToShow.length);
  let prefixMatches=true;
  for(let i=0;i<sameCount;i++){
    if(existing[i].dataset.id!==docsToShow[i].id){ prefixMatches=false; break; }
  }
  if(prefixMatches && existing.length<=docsToShow.length){
    for(let i=existing.length;i<docsToShow.length;i++){
      fp.appendChild(buildFI(docsToShow[i].id,docsToShow[i].data()));
    }
  } else {
    // Cambió el filtro, se reordenó, o se borró algo del medio -> reconstrucción completa
    fp.innerHTML="";
    docsToShow.forEach(d=>fp.appendChild(buildFI(d.id,d.data())));
  }
  if(atB) fp.scrollTop=fp.scrollHeight;
}
onSnapshot(feedQ,snap=>{
  _latestFirestoreDocs=[...snap.docs].reverse();
  _mergeFeedSources();
});
document.getElementById("huFilterInput").addEventListener("input",e=>{ _feedFilterText=e.target.value; _renderFeed(); });

// Carga inicial de sensis desde Supabase + suscripción realtime (equivalente a onSnapshot)
(async function _initSupabaseFeed(){
  const {data:rows,error}=await sb.from("feed_sensis").select("*").order("created_at",{ascending:false}).limit(40);
  if(error){ console.error("Error cargando sensis de Supabase:",error); return; }
  _latestSupabaseDocs=(rows||[]).reverse().map(_wrapSbRow);
  _mergeFeedSources();

  sb.channel("feed_sensis-changes")
    .on("postgres_changes",{event:"*",schema:"public",table:"feed_sensis"},payload=>{
      if(payload.eventType==="INSERT"){
        _latestSupabaseDocs.push(_wrapSbRow(payload.new));
        _latestSupabaseDocs=_latestSupabaseDocs.slice(-40);
      } else if(payload.eventType==="UPDATE"){
        const idx=_latestSupabaseDocs.findIndex(d=>d.id===payload.new.id);
        if(idx>=0) _latestSupabaseDocs[idx]=_wrapSbRow(payload.new);
      } else if(payload.eventType==="DELETE"){
        _latestSupabaseDocs=_latestSupabaseDocs.filter(d=>d.id!==payload.old.id);
      }
      _mergeFeedSources();
    })
    .subscribe();
})();

// ── SUBIR HUD ─────────────────────────────────────────
document.getElementById("huAddBtn").addEventListener("click",()=>{
  document.getElementById("hudCodeIn").value="";
  document.getElementById("hudStatusMsg").textContent="";
  document.getElementById("hudFingersSel").value="4";
  document.getElementById("hudFingersCustomSel").style.display="none";
  document.getElementById("hudFingersCustomSel").value="4";
  // BUG: este modal es un ".overlay" (igual que cfgModal, menuModal, etc.),
  // que en toda la app se abre/cierra con la clase CSS "show", no con
  // style.display. El elemento YA tiene display:flex por CSS, pero queda
  // invisible e inclickeable (opacity:0, visibility:hidden,
  // pointer-events:none) hasta que se le agrega ".show". Por eso al tocar
  // "+" técnicamente "se abría" pero no se veía ni se podía tocar nada.
  document.getElementById("hudModal").classList.add("show");
});
document.getElementById("hudFingersSel").addEventListener("change",e=>{
  document.getElementById("hudFingersCustomSel").style.display=(e.target.value==="custom")?"":"none";
});
document.getElementById("hudCloseX").addEventListener("click",()=>{ document.getElementById("hudModal").classList.remove("show"); });
document.getElementById("hudModal").addEventListener("click",e=>{ if(e.target.id==="hudModal") document.getElementById("hudModal").classList.remove("show"); });
document.getElementById("hudPublishBtn").addEventListener("click",async()=>{
  const codeRaw=document.getElementById("hudCodeIn").value.trim();
  const statusEl=document.getElementById("hudStatusMsg");
  if(!codeRaw){ statusEl.textContent="⚠️ Pega el código del HUD."; statusEl.style.color="#FF5566"; return; }
  if(codeRaw.length<6||codeRaw.length>120){ statusEl.textContent="⚠️ Ese código no se ve válido."; statusEl.style.color="#FF5566"; return; }
  const fingersSelVal=document.getElementById("hudFingersSel").value;
  const fingers=fingersSelVal==="custom"?parseInt(document.getElementById("hudFingersCustomSel").value,10):parseInt(fingersSelVal,10);
  const btn=document.getElementById("hudPublishBtn");
  btn.disabled=true; btn.textContent="Publicando...";
  try{
    const _uRef=doc(db,_C.u(),nickname);
    const uSnap=await getDoc(_uRef).catch(()=>null);
    const isCreator=uSnap&&uSnap.exists()&&uSnap.data().creatorVerified===true;
    await addDoc(collection(db,_C.f()),{type:"hud",nickname,uid:auth.currentUser.uid,code:codeRaw,fingers,creatorVerified:isCreator,streak:window._myStreak||0,ts:serverTimestamp()});
    statusEl.style.color="#3DFF8F"; statusEl.textContent="✅ ¡HUD publicado!";
    setTimeout(()=>{ document.getElementById("hudModal").classList.remove("show"); },700);
  }catch(e){
    console.error("Error publicando HUD:",e);
    statusEl.style.color="#FF5566"; statusEl.textContent="❌ No se pudo publicar. Intenta de nuevo.";
  }finally{
    btn.disabled=false; btn.textContent="📤 ENVIAR";
  }
});


// ── MY CHAT ───────────────────────────────────────────
// Tabla grande de la sensibilidad: ocupa todo el ancho del chat (los dos espacios, bot y usuario).
// Íconos dibujados con código (SVG, trazo = currentColor) en vez de emojis, como la campana de notificaciones.
const _STBL_ICONS={
  general:'<svg viewBox="0 0 24 24"><rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.3" r="1.1" fill="currentColor"/><circle cx="18.2" cy="13.9" r="1.1" fill="currentColor"/></svg>',
  rojo:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/></svg>',
  x2:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2"/><path d="M12 2.8v4.4M12 16.8v4.4M2.8 12h4.4M16.8 12h4.4"/><text x="12" y="15.2" text-anchor="middle" font-size="8.5" font-weight="900" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">2x</text></svg>',
  x4:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" stroke-width="2.6"/><path d="M12 2.8v4.4M12 16.8v4.4M2.8 12h4.4M16.8 12h4.4"/><text x="12" y="15.2" text-anchor="middle" font-size="8.5" font-weight="900" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">4x</text></svg>',
  franco:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.6"/><path d="M2.4 12h19.2M12 2.4v19.2"/><circle cx="12" cy="12" r="3.4"/><circle cx="6.6" cy="12" r=".8" fill="currentColor"/><circle cx="17.4" cy="12" r=".8" fill="currentColor"/><circle cx="12" cy="6.6" r=".8" fill="currentColor"/><circle cx="12" cy="17.4" r=".8" fill="currentColor"/></svg>',
  camara:'<svg viewBox="0 0 24 24"><path d="M4 8h3l1.6-2.2h6.8L17 8h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8z"/><circle cx="12" cy="13.2" r="3.6"/></svg>',
  boton:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.6" fill="currentColor" fill-opacity=".4"/><path d="M12 1.6v2.6M12 19.8v2.6M1.6 12h2.6M19.8 12h2.6"/></svg>'
};
// Color de cada cuadro: sale del color elegido (o del aleatorio) girando el tono; cada cuadro un tono distinto.
// Con "Quitar color" (acento neutro) cada cuadro usa un gris distinto.
const _STBL_HUE=[0,50,100,155,210,262,312], _STBL_GRAY=[0.92,0.80,0.68,0.57,0.86,0.74,0.62];
function _hexToHsl(hex){
  let h=String(hex||"").replace("#",""); if(h.length===3)h=h.split("").map(c=>c+c).join("");
  const r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255;
  if(isNaN(r)||isNaN(g)||isNaN(b))return[199,1,0.61];
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2; let hh=0,s=0;
  if(mx!==mn){const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn); hh=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); hh*=60;}
  return[hh,s,l];
}
function _hslToRgb(h,s,l){
  h=(((h%360)+360)%360)/360;
  const f=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
  return[Math.round(f(p,q,h+1/3)*255),Math.round(f(p,q,h)*255),Math.round(f(p,q,h-1/3)*255)];
}
function _paintSensiCell(cell,i){
  const[hh,s,l]=_hexToHsl(currentColor); let rgb;
  if(s<0.12){const v=Math.round(_STBL_GRAY[i%7]*255);rgb=[v,v,v];}
  else rgb=_hslToRgb(hh+_STBL_HUE[i%7],Math.max(s,0.55),Math.min(Math.max(l,0.52),0.68));
  cell.style.setProperty("--cc","rgb("+rgb.join(",")+")"); cell.style.setProperty("--cc-rgb",rgb.join(","));
}
function _repaintSensiTables(){ document.querySelectorAll(".stbl-cell").forEach(c=>_paintSensiCell(c,+c.dataset.i||0)); }
function _buildSensiTable(b,t){
  const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;};
  b.textContent="";
  b.appendChild(el("div","stbl-title","✅ SENSIBILIDAD GENERADA"));
  b.appendChild(el("div","stbl-dev","📱 "+t.device));
  const tags=el("div","stbl-tags");
  tags.appendChild(el("span","stbl-tag",t.nivel));
  if(t.hs)tags.appendChild(el("span","stbl-tag hs",t.hs));
  if(t.prem)tags.appendChild(el("span","stbl-tag prem","✨ PREMIUM"));
  if(t.dpi)tags.appendChild(el("span","stbl-tag dpi","🔵 DPI "+t.dpi));
  b.appendChild(tags);
  const grid=el("div","stbl-grid");
  t.rows.forEach((r,i)=>{
    const cell=el("div","stbl-cell"+(i===0?" main":"")); cell.dataset.i=i;
    const lab=el("div","stbl-lab"), ico=el("span","stbl-ico");
    ico.innerHTML=_STBL_ICONS[r[0]]||""; // SVG constante (sin datos del usuario)
    lab.appendChild(ico); lab.appendChild(el("span",null,r[1]));
    cell.appendChild(lab); cell.appendChild(el("div","stbl-val",String(r[2])));
    _paintSensiCell(cell,i); grid.appendChild(cell);
  });
  b.appendChild(grid);
  b.appendChild(el("div","stbl-foot","— SENSIS GOOD FF ☠️⚡"));
}
function addMsg(from,text,opts={}){
  // Avisos de estado (✅ ❌ ⛔ ⚠️ ⏳ 🎉) → notificación de 5 s en vez de burbuja en el chat
  if(from==="bot"&&!opts.copy&&!opts.regen&&!opts.adm&&typeof text==="string"&&text.length<=300&&/^(✅|🎉|❌|⛔|⚠️|⏳|ℹ️)/.test(text)){ notify(text); return document.createElement("div"); }
  const c=document.getElementById("myMsgs");
  const w=document.createElement("div"); w.className="mw "+from;
  const b=document.createElement("div"); b.className="bub "+(opts.adm?"adm":from);
  b.textContent=text;
  if(opts.table){ _buildSensiTable(b,opts.table); w.classList.add("wide"); }
  // Marca especial de "sensi generada" (siempre viene con el botón de copiar)
  // para que tenga su propia animación de aparición, distinta de un mensaje
  // normal del bot.
  const isSensiReveal=!!opts.copy;
  if(isSensiReveal) b.classList.add("bub-sensi");
  if(opts.copy){
    const btn=document.createElement("button"); btn.className="cpbtn"; btn.textContent="📋 COPIAR SENSIBILIDAD";
    btn.addEventListener("click",()=>{
      const ta=document.createElement("textarea"); ta.value=opts.copy; ta.style.cssText="position:fixed;opacity:0;";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      btn.textContent="✅ COPIADO"; btn.classList.add("ok");
      setTimeout(()=>{ btn.textContent="📋 COPIAR SENSIBILIDAD"; btn.classList.remove("ok"); },2000);
    });
    b.appendChild(btn);
  }
  // Fix #7: botón para regenerar otra sensibilidad con la misma marca/modelo, justo debajo de copiar
  if(opts.regen){
    const rbtn=document.createElement("button"); rbtn.className="cpbtn"; rbtn.textContent="🔄 GENERAR OTRA SENSIBILIDAD";
    rbtn.addEventListener("click",opts.regen);
    b.appendChild(rbtn);
  }
  w.appendChild(b);
  if(opts.btns){
    const bd=document.createElement("div"); bd.className="bbtns";
    opts.btns.forEach(lbl=>{
      const btn=document.createElement("button"); btn.className="obtn"; btn.textContent=lbl;
      btn.addEventListener("click",()=>onBtn(lbl,bd)); bd.appendChild(btn);
    });
    w.appendChild(bd);
  }
  c.appendChild(w); c.scrollTop=c.scrollHeight;
  if(isSensiReveal) _spawnSensiSparkles(b);
}

function onBtn(lbl,bd,silent){
  bd.querySelectorAll(".obtn").forEach(b=>b.disabled=true);
  if(step==="nivel"){
    const n=lbl.includes("Baja")?"baja":lbl.includes("Media")?"media":"alta";
    data.nivel=n; addMsg("user",lbl);
    if(_grp(data.marca)==="E"){
      // iPhone (iOS) no tiene ajuste de DPI: se omite la pregunta y se genera directo
      data.dpi=false; step="dpi";
      onBtn("❌ Sin DPI",bd,true);
      return;
    }
    step="dpi";
    setTimeout(()=>addMsg("bot","¿Con DPI calibrado?",{btns:["✅ Sí, con DPI","❌ Sin DPI"]}),300);
  } else if(step==="dpi"){
    data.dpi=lbl.includes("Sí"); if(!silent) addMsg("user",lbl); // silent: al "generar otra" no se manda ningún mensaje
    setTimeout(async()=>{
      try{
        // doble check servidor
        const srv=await getServerCount(nickname);
        if(srv>=_effectiveMax()){ addMsg("bot","⛔ Ya usaste tus sensis de esta ronda.\n\nSe restablecen en "+_winLeft()+". ☠️⚡"); return; }
        const isPremiumGen=_premiumPending; if(isPremiumGen) _setPremiumPending(false); // one-shot: se consume sí o sí, se publique o no
        // Si es la primera vez que se genera con este modelo exacto, esto
        // consulta specs reales (ver DEPLOY.md) antes de calibrar — con
        // timeout corto para que nunca trabe la generación si la Cloud
        // Function no está desplegada o tarda de más.
        await _lookupDeviceSpecs(data.marca,data.modelo).catch(()=>{});
        const r=genSensiMejorado(data.marca,data.modelo,data.nivel,data.dpi);
        myCount=await incServerCount(nickname); updateCounter();
        const hs=r.hs==="full"?"🎯 HEADSHOT CONFIG":r.hs==="mid"?"⚡ HEADSHOT MID":"";
        const dL=r.dpi?"\n🔵 DPI: "+r.dpi:"";
        const premL=isPremiumGen?"\n✨ PREMIUM (privada, no va al feed)":"";
        const txt="✅ SENSIBILIDAD GENERADA\n📱 "+data.marca+" "+data.modelo+"\n"+NL[r.nivel]+" "+hs+premL+"\n\n🎮 General: "+r.general+"\n🔴 Mira Rojo: "+r.rojo+"\n🔭 Mira 2X: "+r.x2+"\n🔬 Mira 4X: "+r.x4+"\n🏹 Francotirador: "+r.franco+"\n📷 Cámara 360°: "+r.camara+"\n🕹️ Botón Disparo: "+r.boton+dL+"\n\n— SENSIS GOOD FF ☠️⚡";
        addMsg("bot",txt,{copy:txt,table:{
          device:data.marca+" "+data.modelo, nivel:NL[r.nivel], hs:hs, prem:isPremiumGen, dpi:r.dpi,
          rows:[["general","General",r.general],["rojo","Mira Rojo",r.rojo],["x2","Mira 2X",r.x2],["x4","Mira 4X",r.x4],["franco","Francotirador",r.franco],["camara","Cámara 360°",r.camara],["boton","Botón Disparo",r.boton]]
        },regen:()=>{
          // Repite la generación con la misma marca/modelo/nivel/dpi ya elegidos (fix #7)
          // IMPORTANTE: al terminar la generación step vuelve a "idle", así que hay que
          // reponerlo a "dpi" o onBtn ignora el clic (ese era el bug).
          step="dpi";
          onBtn(data.dpi?"✅ Sí, con DPI":"❌ Sin DPI",document.createElement("div"),true);
        }});
        const _uRef=doc(db,_C.u(),nickname);
        if(!isPremiumGen){
          const uSnap2=await getDoc(_uRef).catch(()=>null);
          const isCreator=uSnap2&&uSnap2.exists()&&uSnap2.data().creatorVerified===true;
          // Migrado a Supabase: las sensibilidades publicadas al feed ya no van a Firestore
          const _okFeed=await _feedCall("publish",nickname,{payload:{
            marca:data.marca, modelo:data.modelo, nivel:r.nivel, hs:r.hs,
            general:r.general, rojo:r.rojo, x2:r.x2, x4:r.x4, franco:r.franco,
            camara:r.camara, boton:r.boton, dpi:r.dpi||null
          }});
          if(!_okFeed){
            addMsg("bot","⚠️ No se pudo publicar tu sensibilidad en el feed. Intenta de nuevo en un momento.");
          }
        }
        const rem=_effectiveMax()-myCount;
        setTimeout(()=>{
          if(rem>0) addMsg("bot","Te quedan "+rem+" sensibilidad"+(rem!==1?"es":"")+" hoy.\n\n¿Quieres otra? Escribe tu marca y modelo.");
          else addMsg("bot","⛔ Llegaste al límite.\n\nSe restablece en "+_winLeft()+". ☠️⚡");
        },350);
      }catch(e){
        console.error("Error generando sensi:",e);
        addMsg("bot","⚠️ Algo falló generando tu sensi. Escribe tu marca y modelo para intentar de nuevo.");
      }finally{
        // Pase lo que pase (éxito o error) el chat SIEMPRE debe quedar libre
        // para el próximo mensaje -> nunca más se queda "trabado" en step="dpi".
        step="idle";
      }
    },300);
  }
}

function handleSend(){
  const inp=document.getElementById("msgInput"); const msg=inp.value.trim(); if(!msg)return; inp.value="";
  if(step!=="idle"){ addMsg("user",msg); return; }
  if(/^\d{6}$/.test(msg)){ addMsg("user",msg); redeemCode(msg); return; }
  _winTick(); if(myCount>=_effectiveMax()){ addMsg("user",msg); setTimeout(()=>addMsg("bot","⛔ Llegaste al límite.\n\nSe restablece en "+_winLeft()+". ☠️⚡"),300); return; }
  const marca=detectM(msg); addMsg("user",msg);
  if(marca){ const modelo=exMod(msg,marca); data={marca,modelo,nivel:"",dpi:false}; step="nivel"; setTimeout(()=>addMsg("bot","📱 "+marca+" "+modelo+"\n\n¿Qué nivel de sensibilidad?",{btns:["🟢 Baja","🔵 Media","🔴 Alta"]}),300); }
  else { setTimeout(()=>addMsg("bot","No reconocí la marca. Ej:\n📱 Honor X5C Plus\n📱 Samsung Galaxy A54\n📱 Xiaomi Redmi Note 12"),300); }
}

// ── CHAT LIBRE (EN VIVO) ────────────────────────────────────────────
let _lastFeedMsgTs=0;
async function handleFeedSend(){
  const inp=document.getElementById("feedInput"); const raw=inp.value.trim(); if(!raw)return;
  const now=Date.now();
  if(now-_lastFeedMsgTs<1500) return; // anti-spam básico
  _lastFeedMsgTs=now;
  inp.value="";
  const text=censurarTexto(raw).slice(0,300);
  try{
    const _uRef=doc(db,_C.u(),nickname);
    const uSnap2=await getDoc(_uRef).catch(()=>null);
    const isCreator=uSnap2&&uSnap2.exists()&&uSnap2.data().creatorVerified===true;
    await addDoc(collection(db,_C.f()),{type:"chat",nickname,uid:auth.currentUser.uid,text,creatorVerified:isCreator,streak:window._myStreak||0,ts:serverTimestamp()});
  }catch(e){ console.error("No se pudo enviar el mensaje:",e); }
}

// ── TABS ──────────────────────────────────────────────
// Apaga el blur del glass (si aplica) Y pausa el dibujo del fondo animado
// mientras se scrollea, sin importar el tema activo -> libera el hilo
// principal justo cuando el navegador más lo necesita para el touch scroll.
let _scrollFreezeT=null, _freezeUntil=0;
// Apaga el blur del vidrio durante ms milisegundos (scroll, cambios de pestaña, modales).
// Si ya había un freeze más largo, se respeta el más largo.
function _freezeFx(ms,soft){
  document.body.classList.add("is-scrolling");
  if(!soft)_fxHoldUntil=Math.max(_fxHoldUntil,Date.now()+ms); // soft = solo scroll: apaga el blur de las ventanas pero NO pausa el fondo
  const until=Date.now()+ms; if(until>_freezeUntil) _freezeUntil=until;
  clearTimeout(_scrollFreezeT);
  _scrollFreezeT=setTimeout(()=>document.body.classList.remove("is-scrolling"),Math.max(150,_freezeUntil-Date.now()));
}
function _onGlassScroll(){ _freezeFx(150,true); }
document.getElementById("myMsgs").addEventListener("scroll",_onGlassScroll,{passive:true});
document.getElementById("feedPanel").addEventListener("scroll",_onGlassScroll,{passive:true});
function _playPanelFade(el,dir){
  // dir: -1 = entra desde la izquierda (retrocediendo), 1 = entra desde la
  // derecha (avanzando), 0/undefined = solo sube desde abajo (comportamiento
  // anterior, para paneles sin un "orden" claro). Esto es lo que le da la
  // sensación de "Push" de PowerPoint: la sección nueva entra siempre desde
  // el lado hacia donde te estás moviendo dentro del menú, no de la nada.
  el.style.setProperty("--slide-x",dir?(dir>0?"48px":"-48px"):"0px");
  el.style.setProperty("--slide-y",dir?"0px":"22px");
  el.classList.remove("panel-fade");
  // ANTES: "void el.offsetWidth" forzaba un reflow SÍNCRONO de TODA la
  // página para garantizar que la animación se reinicie. El problema: esto
  // se ejecuta justo después de hacer visible un panel grande (el feed,
  // hasta 40 tarjetas), que es el PEOR momento posible para forzar un
  // recálculo de layout bloqueante -> eso era el lag/traba real al tocar
  // el botón del feed. requestAnimationFrame logra el mismo "replay" de la
  // animación (deja pasar un frame antes de reponer la clase) sin bloquear
  // el hilo principal con un cálculo de layout forzado.
  requestAnimationFrame(()=>{ el.classList.add("panel-fade"); });
}
// Antes se disparaban el scroll-al-fondo Y la animación de entrada al mismo
// tiempo, en dos cadenas de rAF separadas que competían entre sí -> el
// "salto" de scrollTop obligaba a un reflow justo en medio de la animación
// de transform, y eso se sentía como un pequeño trabado/corte. Ahora el
// orden es fijo: primero se espera el layout y se fija el scroll (mientras
// el panel sigue invisible, opacity:0, así el salto no se nota), y RECIÉN
// DESPUÉS se dispara la animación de entrada — sin overlaps.
function _scrollToBottomThenReveal(scrollEl,fadeEl,dir){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    scrollEl.scrollTop=scrollEl.scrollHeight;
    _playPanelFade(fadeEl,dir);
    // Un segundo ajuste por si algo (fuente cargando, imagen, etc.) todavía
    // movió la altura justo después del primer frame.
    setTimeout(()=>{ scrollEl.scrollTop=scrollEl.scrollHeight; },160);
  }));
}
// Entrada de un panel: queda invisible (panel-pre) mientras se fija el scroll al fondo
// y SOLO después arranca la animación (transform + opacity, nada de layout).
function _enterPanel(scrollEl,fadeEl,dir){
  fadeEl.classList.remove("panel-in","panel-fade");
  fadeEl.classList.add("panel-pre");
  requestAnimationFrame(()=>{
    scrollEl.scrollTop=scrollEl.scrollHeight;
    // El panel se "despega" de la pestaña tocada: su centro, justo en el borde de abajo de la pestaña
    const tab=document.getElementById(dir>0?"tMio":"tFeed"), pr=fadeEl.getBoundingClientRect(), tr=tab.getBoundingClientRect();
    fadeEl.style.setProperty("--ox",(tr.left+tr.width/2-pr.left)+"px");
    fadeEl.style.setProperty("--oy",(tr.bottom-pr.top)+"px");
    requestAnimationFrame(()=>{
      fadeEl.classList.remove("panel-pre");
      fadeEl.classList.add("panel-in");
      setTimeout(()=>{ scrollEl.scrollTop=scrollEl.scrollHeight; },60);
      setTimeout(()=>fadeEl.classList.remove("panel-in"),950);
    });
  });
}
let _tabPrev="mio";
// El indicador se estira como una liga al viajar de una pestaña a otra.
function _stretchIndicator(ind,from,to){
  try{
    ind.animate([
      {transform:"translateX("+from+"%) scaleX(1)"},
      {transform:"translateX("+((from+to)/2)+"%) scaleX(1.6)",offset:.38},
      {transform:"translateX("+to+"%) scaleX(1)"}
    ],{duration:640,easing:"cubic-bezier(.22,1,.36,1)"});
  }catch(e){}
}
function switchTab(t){
  const changed=(_tabPrev!==t); _tabPrev=t;
  _freezeFx(640);
  document.getElementById("tFeed").classList.toggle("active",t==="feed");
  document.getElementById("tMio").classList.toggle("active",t==="mio");
  const ind=document.getElementById("tabIndicator");
  if(ind){
    ind.style.transform=(t==="feed")?"translateX(0%)":"translateX(100%)";
    if(changed) _stretchIndicator(ind,t==="feed"?100:0,t==="feed"?0:100);
  }
  document.getElementById("feedToolbar").style.display=(t==="feed")?"":"none";
  document.getElementById("feedPanel").style.display=t==="feed"?"flex":"none";
  document.getElementById("feedInputArea").style.display=t==="feed"?"flex":"none";
  document.getElementById("myPanel").style.display=t==="mio"?"flex":"none";
  if(t==="feed"){ const fp=document.getElementById("feedPanel"); _enterPanel(fp,fp,-1); }
  if(t==="mio"){ _enterPanel(document.getElementById("myMsgs"),document.getElementById("myPanel"),1); }
}

// ── CONFIG MODAL ──────────────────────────────────────
// ── VISTA PREVIA REAL de cada fondo (mini versión del efecto real) ──
let _miniRAFs={};
function stopMiniPreviews(){
  Object.keys(_miniRAFs).forEach(k=>{ if(_miniRAFs[k]) cancelAnimationFrame(_miniRAFs[k]); });
  _miniRAFs={};
  if(_miniObserver){ _miniObserver.disconnect(); }
}
// Por si el modal se cierra por otra vía (guardar nombre, ban, etc.), detenemos igual las previews
new MutationObserver(()=>{
  const m=document.getElementById("cfgModal");
  if(m&&!m.classList.contains("show")) stopMiniPreviews();
}).observe(document.getElementById("cfgModal"),{attributes:true,attributeFilter:["class"]});
// Antes, TODAS las miniaturas del selector de temas (hasta 9) corrían su
// animación en paralelo sin importar si estaban visibles o no -> mientras
// scrolleas para ver los temas, tenías 9 animaciones + el fondo principal
// compitiendo por el mismo hilo al mismo tiempo. Ahora solo animan las que
// están realmente a la vista; las que el scroll saca de pantalla se pausan
// solas y retoman automáticamente al volver a aparecer.
let _miniObserver=null;
function startMiniPreviews(){
  stopMiniPreviews();
  if(_miniObserver) _miniObserver.disconnect();
  const colors={cyber:"#38BEFF",neon:"#AA44FF",gold:"#FFC800",blood:"#FF0020",mint:"#3DFF8F"};
  _miniObserver=new IntersectionObserver(entries=>{
    entries.forEach(en=>{
      const c=en.target, t=c.dataset.t, key=t;
      if(en.isIntersecting){
        if(_miniRAFs[key]) return; // ya está animando
        const pctx=c.getContext("2d"), w=c.width, h=c.height;
        if(t==="matrix") _miniMatrix(pctx,w,h,t);
        else if(t==="rain") _miniRain(pctx,w,h,t);
        else if(t==="ocean") _miniOcean(pctx,w,h,t);
        else if(t==="fire") _miniFire(pctx,w,h,t);
        else _miniParticles(pctx,w,h,t,colors[t]||"#38BEFF");
      } else if(_miniRAFs[key]){
        cancelAnimationFrame(_miniRAFs[key]); delete _miniRAFs[key];
      }
    });
  },{threshold:0.05});
  document.querySelectorAll(".tprev-canvas").forEach(c=>_miniObserver.observe(c));
}
function _miniMatrix(ctx,w,h,key){
  const cols=Math.max(4,Math.floor(w/10)); const drops=Array(cols).fill(1);
  const chars="アイウエカキサタナ0123456789";
  function draw(){
    ctx.fillStyle="rgba(3,7,13,0.2)"; ctx.fillRect(0,0,w,h);
    ctx.fillStyle="#0f0"; ctx.font="10px monospace";
    drops.forEach((y,i)=>{ const c=chars[Math.floor(Math.random()*chars.length)]; ctx.fillText(c,i*10,y*10); if(y*10>h&&Math.random()>0.9) drops[i]=0; drops[i]++; });
    _miniRAFs[key]=requestAnimationFrame(draw);
  }
  draw();
}
function _miniRain(ctx,w,h,key){
  const drops=Array.from({length:16},()=>({x:Math.random()*w,y:Math.random()*h,sp:Math.random()*1.5+1,len:Math.random()*7+5}));
  function draw(){
    ctx.clearRect(0,0,w,h); ctx.fillStyle="#001428"; ctx.fillRect(0,0,w,h);
    drops.forEach(d=>{
      ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(d.x-1,d.y+d.len);
      ctx.strokeStyle="rgba(56,190,255,0.85)"; ctx.lineWidth=1; ctx.stroke();
      d.y+=d.sp*2; if(d.y>h){d.y=-d.len;d.x=Math.random()*w;}
    });
    _miniRAFs[key]=requestAnimationFrame(draw);
  }
  draw();
}
function _miniOcean(ctx,w,h,key){
  let t=0;
  function waveY(x,baseY,amp,freq,speed,phase){ return baseY+Math.sin(x*freq+t*speed+phase)*amp; }
  function draw(){
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle="#000a1a"; ctx.fillRect(0,0,w,h);
    const seaTop=h*0.35;
    const g=ctx.createLinearGradient(0,seaTop,0,h);
    g.addColorStop(0,"rgba(0,60,110,0.5)"); g.addColorStop(1,"rgba(0,10,26,0.8)");
    ctx.fillStyle=g; ctx.fillRect(0,seaTop,w,h-seaTop);
    [[seaTop+3,3,0.10,0.9,0,"rgba(0,90,150,0.5)"],[seaTop+8,4,0.16,1.4,2,"rgba(56,190,255,0.55)"]].forEach(([baseY,amp,freq,speed,phase,color])=>{
      ctx.beginPath(); ctx.moveTo(0,h);
      for(let x=0;x<=w;x+=4){ ctx.lineTo(x,waveY(x,baseY,amp,freq,speed,phase)); }
      ctx.lineTo(w,h); ctx.closePath(); ctx.fillStyle=color; ctx.fill();
    });
    t+=0.05;
    _miniRAFs[key]=requestAnimationFrame(draw);
  }
  draw();
}
function _miniParticles(ctx,w,h,key,color){
  const pts=Array.from({length:12},()=>({x:Math.random()*w,y:Math.random()*h+h,r:Math.random()*1.6+0.6,sp:Math.random()*0.5+0.2}));
  function draw(){
    ctx.clearRect(0,0,w,h); ctx.fillStyle="#03070D"; ctx.fillRect(0,0,w,h);
    pts.forEach(p=>{
      const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2);
      g.addColorStop(0,color+"cc"); g.addColorStop(1,color+"00");
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      p.y-=p.sp; if(p.y<-4){p.y=h+4;p.x=Math.random()*w;}
    });
    _miniRAFs[key]=requestAnimationFrame(draw);
  }
  draw();
}
function _miniFire(ctx,w,h,key){
  const hFire=Math.round(h*0.55), offsetY=h-hFire;
  const cols=Math.max(16,Math.floor(w/4)), rows=Math.max(16,Math.floor(hFire/3));
  const buf=new Uint8Array(cols*rows).fill(0);
  const off=document.createElement("canvas"); off.width=cols; off.height=rows;
  const fctx=off.getContext("2d"); const imgData=fctx.createImageData(cols,rows);
  const pal=new Uint8Array(256*4);
  for(let i=0;i<256;i++){
    const t=i/255; let r,g,b;
    if(t<0.22){const k=t/0.22;r=k*110;g=0;b=0;}
    else if(t<0.5){const k=(t-0.22)/0.28;r=110+k*145;g=k*70;b=0;}
    else if(t<0.8){const k=(t-0.5)/0.30;r=255;g=70+k*150;b=k*40;}
    else{const k=(t-0.8)/0.20;r=255;g=220+k*35;b=40+k*190;}
    const o=i*4; pal[o]=r;pal[o+1]=g;pal[o+2]=b;pal[o+3]=i<3?0:255;
  }
  function spread(src){
    const rnd=Math.round(Math.random()*3)&3;
    const dst=src-cols-1+rnd;
    if(dst>=0&&dst<buf.length) buf[dst]=Math.max(0,buf[src]-(rnd&1)-1);
  }
  function draw(){
    for(let x=0;x<cols;x++) buf[(rows-1)*cols+x]=195+Math.random()*60|0;
    for(let y=1;y<rows;y++) for(let x=0;x<cols;x++) spread(y*cols+x);
    const data=imgData.data;
    for(let p=0;p<buf.length;p++){ const v=buf[p],o=p*4,po=v*4; data[o]=pal[po];data[o+1]=pal[po+1];data[o+2]=pal[po+2];data[o+3]=pal[po+3]; }
    fctx.putImageData(imgData,0,0);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle="#03070D"; ctx.fillRect(0,0,w,h);
    ctx.drawImage(off,0,0,cols,rows,0,offsetY,w,hFire);
    _miniRAFs[key]=requestAnimationFrame(draw);
  }
  draw();
}

// ── PANEL: ÚNETE AL CANAL DE WHATSAPP ──
const WA_LINK="https://chat.whatsapp.com/IW4rvkw02nGE6ZGKaDedaa?s=cl&p=a&mlu=4&ilr=4&iam=2";
let _waTimerId=null;
function maybeShowWhatsAppPromo(){
  if(localStorage.getItem("sg_wa_followed")==="1") return;
  setTimeout(()=>{
    document.getElementById("waModal").classList.add("show");
  }, 900);
}
document.getElementById("waCloseX").addEventListener("click",()=>{
  document.getElementById("waModal").classList.remove("show");
  if(_waTimerId){ clearInterval(_waTimerId); _waTimerId=null; }
});
document.getElementById("waJoinBtn").addEventListener("click",function(){
  const btn=this;
  const statusEl=document.getElementById("waStatusMsg");
  window.open(WA_LINK,"_blank");
  // Cuenta regresiva real de 3s (no depende de detectar si volviste a la pestaña,
  // que en muchos navegadores móviles no es confiable).
  if(_waTimerId) clearInterval(_waTimerId);
  let secondsLeft=3;
  btn.disabled=true; btn.style.opacity="0.6";
  statusEl.textContent="⏳ Espera "+secondsLeft+"s (tiempo de unirte al canal)...";
  _waTimerId=setInterval(()=>{
    secondsLeft--;
    if(secondsLeft>0){
      statusEl.textContent="⏳ Espera "+secondsLeft+"s (tiempo de unirte al canal)...";
    } else {
      clearInterval(_waTimerId); _waTimerId=null;
      localStorage.setItem("sg_wa_followed","1");
      statusEl.textContent="✅ ¡Gracias por unirte!";
      btn.disabled=false; btn.style.opacity="1";
      setTimeout(()=>document.getElementById("waModal").classList.remove("show"), 1200);
    }
  },1000);
});

document.getElementById("menuBtn").addEventListener("click",()=>{
  document.getElementById("menuModal").classList.add("show");
});
document.getElementById("menuCloseX").addEventListener("click",()=>{
  document.getElementById("menuModal").classList.remove("show");
});
// Al elegir cualquier opción del menú, se cierra automáticamente para no
// quedar dos ventanas superpuestas (el menú + la sección elegida).
document.getElementById("menuModal").addEventListener("click",(e)=>{
  if(e.target.closest(".menu-item")){
    document.getElementById("menuModal").classList.remove("show");
  }
});
document.getElementById("freeProductsBtn").addEventListener("click",()=>{
  document.getElementById("freeProductsModal").classList.add("show");
});
document.getElementById("freeProductsCloseX").addEventListener("click",()=>{
  document.getElementById("freeProductsModal").classList.remove("show");
});
document.getElementById("freeProductsModal").addEventListener("click",(e)=>{
  if(e.target.id==="freeProductsModal") document.getElementById("freeProductsModal").classList.remove("show");
});
// ── CÓDIGOS: lista de todos los REDEEM_CODES visibles con botón "Canjear"
// (antes solo se podía usar tipeando el código de 6 dígitos directo en el
// chat, sin ninguna forma de saber qué códigos existían). Ahora además:
// - Si el usuario ya tiene un código en uso (boost activo o premium
//   pendiente), TODOS los botones quedan bloqueados con una cuenta
//   regresiva en vivo hasta que se libere.
// - Cada código individual, si ya fue canjeado por esta persona hace menos
//   de 3 días, muestra su propia cuenta regresiva hasta que se pueda
//   volver a usar (en vez de quedar bloqueado para siempre).
let _codesTicker=null;
async function _renderCodesList(){
  const c=document.getElementById("codesListContainer");
  if(!c) return;
  const codes=Object.keys(REDEEM_CODES);
  if(!codes.length){
    c.innerHTML="<div style='font-size:12px;color:rgba(160,215,255,0.4);text-align:center;padding:20px;'>Sin códigos disponibles por ahora.</div>";
    return;
  }
  const uid=_ownerKey();
  // Traer, en paralelo, cuándo se canjeó (si acaso) cada código por esta persona.
  const usedAt={};
  await Promise.all(codes.map(async code=>{
    try{
      const snap=await getDoc(doc(db,"redeemCodeUses",code+"_"+uid));
      usedAt[code]=snap.exists()&&snap.data().ts?.toMillis?snap.data().ts.toMillis():null;
    }catch(e){ usedAt[code]=null; }
  }));
  c.innerHTML="";
  const globalUntil=_activeBoostUntil(); // fin del boost por tiempo activo (0 si no hay)
  const globalBlocked=(globalUntil>Date.now())||_premiumPending;
  if(globalBlocked){
    const notice=document.createElement("div");
    notice.style.cssText="font-size:11px;color:#FFC800;text-align:center;padding:8px 10px;margin-bottom:10px;border-radius:12px;background:rgba(255,200,0,0.08);border:1px solid rgba(255,200,0,0.25);";
    notice.id="codesGlobalNotice";
    c.appendChild(notice);
  }
  codes.forEach(code=>{
    const info=REDEEM_CODES[code];
    const row=document.createElement("div");
    row.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-radius:16px;border:1px solid rgba(var(--ac-rgb),0.15);background:rgba(var(--ac-rgb),0.05);margin-bottom:10px;";
    const label=document.createElement("span");
    label.style.cssText="font-size:12px;font-weight:800;color:rgba(160,215,255,0.85);";
    label.textContent=info.label;
    const btn=document.createElement("button");
    btn.className="cbtn";
    btn.dataset.code=code;
    btn.style.cssText="width:auto;padding:8px 16px;margin-bottom:0;white-space:nowrap;font-size:11px;flex-shrink:0;";
    btn.addEventListener("click",()=>{
      document.getElementById("codesModal").classList.remove("show");
      switchTab("mio");
      redeemCode(code);
    });
    row.appendChild(label);
    row.appendChild(btn);
    c.appendChild(row);
    row.dataset.usedAt=usedAt[code]||"";
  });
  _tickCodesList(); // primer pintado inmediato de estados/tiempos
  if(_codesTicker) clearInterval(_codesTicker);
  _codesTicker=setInterval(_tickCodesList,1000);
}
// Repinta cada botón según su estado ahora mismo (se llama cada segundo
// mientras el modal está abierto, para que las cuentas regresivas se vean
// correr en vivo sin tener que volver a leer Firestore a cada tick).
function _tickCodesList(){
  const c=document.getElementById("codesListContainer");
  if(!c||!c.isConnected||!document.getElementById("codesModal").classList.contains("show")){
    if(_codesTicker){ clearInterval(_codesTicker); _codesTicker=null; }
    return;
  }
  const now=Date.now();
  const globalUntil=_activeBoostUntil();
  const globalBlocked=(globalUntil>now)||_premiumPending;
  const notice=document.getElementById("codesGlobalNotice");
  if(notice){
    notice.textContent=_premiumPending
      ?"⏳ Tenés un Premium pendiente: genera tu próxima sensi para liberarlo."
      :"⏳ Tenés un código en uso · libre en "+_fmtRemaining(globalUntil-now);
  }
  c.querySelectorAll(".cbtn[data-code]").forEach(btn=>{
    const row=btn.closest("div");
    const usedAt=row.dataset.usedAt?parseInt(row.dataset.usedAt,10):0;
    const cooldownLeft=usedAt?(CODE_RESET_MS-(now-usedAt)):0;
    if(cooldownLeft>0){
      btn.disabled=true; btn.style.opacity="0.5"; btn.style.cursor="not-allowed";
      btn.textContent="⏱️ "+_fmtRemaining(cooldownLeft);
    } else if(globalBlocked){
      btn.disabled=true; btn.style.opacity="0.5"; btn.style.cursor="not-allowed";
      btn.textContent="🔒 En uso";
    } else {
      btn.disabled=false; btn.style.opacity="1"; btn.style.cursor="pointer";
      btn.textContent="Canjear";
    }
  });
}
document.getElementById("codesBtn").addEventListener("click",()=>{
  _renderCodesList();
  document.getElementById("codesModal").classList.add("show");
});
document.getElementById("codesCloseX").addEventListener("click",()=>{
  document.getElementById("codesModal").classList.remove("show");
  if(_codesTicker){ clearInterval(_codesTicker); _codesTicker=null; }
});
document.getElementById("codesModal").addEventListener("click",(e)=>{
  if(e.target.id==="codesModal"){
    document.getElementById("codesModal").classList.remove("show");
    if(_codesTicker){ clearInterval(_codesTicker); _codesTicker=null; }
  }
});
// ── SOPORTE: informar errores, bugs o vulnerabilidades por correo ──
const _SUP_MAIL="charlysaenzx2657@gmail.com";
(function(){
  const $=id=>document.getElementById(id), m=$("supportModal"); if(!m) return;
  const KINDS={
    bug:{label:"Error / bug",hint:"🐞 Cuéntanos qué estabas haciendo, qué esperabas que pasara y qué pasó en realidad."},
    vuln:{label:"Vulnerabilidad",hint:"🔒 Describe la falla y cómo reproducirla. No la publiques ni la compartas: este reporte llega solo al correo del desarrollador."},
    idea:{label:"Sugerencia",hint:"💡 Cuéntanos tu idea o qué mejorarías de la app."},
    other:{label:"Otro",hint:"💬 Escríbenos lo que necesites."}
  };
  let kind="bug";
  const setKind=k=>{ kind=k; $("supChips").querySelectorAll(".sup-chip").forEach(c=>c.classList.toggle("sel",c.dataset.kind===k)); $("supHint").textContent=KINDS[k].hint; };
  const status=(t,ok)=>{ const s=$("supStatus"); s.textContent=t; s.style.color=ok?"#3DFF8F":"#FF5566"; };
  const close=()=>m.classList.remove("show");
  setKind("bug");
  $("supportBtn").addEventListener("click",()=>{ $("supNick").textContent=(typeof nickname==="string"&&nickname)?nickname:"—"; status("",true); m.classList.add("show"); });
  $("supportCloseX").addEventListener("click",close);
  m.addEventListener("click",e=>{ if(e.target===m) close(); });
  $("supChips").addEventListener("click",e=>{ const c=e.target.closest(".sup-chip"); if(c) setKind(c.dataset.kind); });
  $("supMsg").addEventListener("input",e=>{ $("supCount").textContent=e.target.value.length+"/1500"; });
  $("supSendBtn").addEventListener("click",()=>{
    const msg=$("supMsg").value.trim();
    if(msg.length<10){ status("Escribe al menos 10 caracteres para que podamos ayudarte.",false); return; }
    const nick=(typeof nickname==="string"&&nickname)?nickname:"(sin nombre)";
    let uid=""; try{ uid=(auth&&auth.currentUser&&auth.currentUser.uid)||""; }catch(e){}
    const subject="[SENSIS GOOD FF] "+KINDS[kind].label+" — "+nick;
    const body=msg+"\n\n────────────\nTipo: "+KINDS[kind].label+"\nUsuario: "+nick+(uid?"\nID: "+uid:"")+"\nDispositivo: "+navigator.userAgent+"\nPantalla: "+screen.width+"x"+screen.height+"\nFecha: "+new Date().toLocaleString();
    window.location.href="mailto:"+_SUP_MAIL+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
    status("Se abrió tu app de correo: solo pulsa Enviar. Si no se abrió, usa «Copiar correo de soporte».",true);
  });
  $("supCopyBtn").addEventListener("click",async()=>{
    try{ await navigator.clipboard.writeText(_SUP_MAIL); status("Correo copiado: "+_SUP_MAIL,true); }
    catch(e){ status("Correo de soporte: "+_SUP_MAIL,true); }
  });
})();
// ── Ocultar / mostrar la barra superior (logo, créditos, nombre, menú, notificaciones) ──
// "Ocultar" vive junto a la campana de notificaciones; "Mostrar" aparece arriba a la izquierda cuando está oculta.
(function(){
  const b=document.body,hide=document.getElementById("hdrHide"),show=document.getElementById("hdrToggle"); if(!hide||!show) return;
  let hidden=false; try{ hidden=localStorage.getItem("sg_hdr_hidden")==="1"; }catch(e){}
  if(hidden) b.classList.add("hdr-hidden");
  const go=(doHide)=>{
    try{ localStorage.setItem("sg_hdr_hidden",doHide?"1":"0"); }catch(e){}
    _freezeFx(320);
    if(doHide){ b.classList.add("hdr-out"); setTimeout(()=>{ b.classList.add("hdr-hidden"); b.classList.remove("hdr-out"); },190); }
    else{ b.classList.remove("hdr-hidden"); b.classList.add("hdr-out"); requestAnimationFrame(()=>requestAnimationFrame(()=>b.classList.remove("hdr-out"))); }
  };
  hide.addEventListener("click",()=>go(true));
  show.addEventListener("click",()=>go(false));
})();
// Al abrir cualquier ventana (overlay) se apaga el blur unos instantes para que la animación fluya.
(function(){
  const mo=new MutationObserver(ms=>{
    for(const r of ms){
      if(r.target.classList.contains("show") && !(r.oldValue||"").split(" ").includes("show")){ _freezeFx(640); break; }
    }
    // con una ventana abierta el fondo animado se pausa (ya está tapado y atenuado)
    document.body.classList.toggle("ov-open",!!document.querySelector(".overlay.show"));
  });
  document.querySelectorAll(".overlay").forEach(o=>mo.observe(o,{attributes:true,attributeFilter:["class"],attributeOldValue:true}));
})();
document.getElementById("cfgBtn").addEventListener("click",()=>{
  document.getElementById("newNickIn").value=nickname;
  document.querySelectorAll(".topt").forEach(o=>o.classList.toggle("sel",o.dataset.t===currentTheme));
  document.querySelectorAll(".copt").forEach(o=>o.classList.toggle("sel",o.dataset.c===currentColor));
  document.getElementById("customBgRemoveBtn").style.display=(currentTheme==="custom"&&localStorage.getItem("sg_custom_bg"))?"block":"none";
  const _sBox=document.getElementById("cfgStreakBox");
  if(_sBox) _sBox.textContent="🔥 Racha: "+(window._myStreak||0)+" día"+((window._myStreak||0)!==1?"s":"")+" seguido"+((window._myStreak||0)!==1?"s":"");
  document.getElementById("cfgModal").classList.add("show");
  startMiniPreviews();
});
document.getElementById("cfgClose").addEventListener("click",()=>{ document.getElementById("cfgModal").classList.remove("show"); stopMiniPreviews(); });

// Navegación entre secciones del modal de ajustes (menú horizontal con iconos)
document.getElementById("cfgNav").addEventListener("click",e=>{
  const btn=e.target.closest(".cfgnav-btn");
  if(!btn) return;
  _freezeFx(520);
  // Dirección tipo "Push" de PowerPoint: si el ícono nuevo está más a la
  // derecha que el seleccionado antes, la sección entra desde la derecha;
  // si está más a la izquierda, entra desde la izquierda.
  const allBtns=[...document.querySelectorAll(".cfgnav-btn")];
  const prevBtn=allBtns.find(b=>b.classList.contains("sel"));
  const dir=prevBtn&&prevBtn!==btn?(allBtns.indexOf(btn)>allBtns.indexOf(prevBtn)?1:-1):0;
  document.querySelectorAll(".cfgnav-btn").forEach(b=>b.classList.toggle("sel",b===btn));
  document.querySelectorAll(".msec[id^='cfgSec']").forEach(s=>{
    const show=s.id===btn.dataset.sec;
    s.style.display=show?"block":"none";
    if(show){
      // La sección se "despega" del icono tocado (el origen queda justo debajo de ese botón)
      const sr=s.getBoundingClientRect(), br=btn.getBoundingClientRect();
      s.style.setProperty("--ox",(br.left+br.width/2-sr.left)+"px");
      s.style.setProperty("--oy",(br.bottom-sr.top)+"px");
    }
  });
});
function openCfgSection(secId){
  const modal=document.getElementById("cfgModal");
  if(!modal.classList.contains("show")){
    document.getElementById("newNickIn").value=nickname;
    document.querySelectorAll(".topt").forEach(o=>o.classList.toggle("sel",o.dataset.t===currentTheme));
    document.querySelectorAll(".copt").forEach(o=>o.classList.toggle("sel",o.dataset.c===currentColor));
    modal.classList.add("show");
    startMiniPreviews();
  }
  const navBtn=document.querySelector(`.cfgnav-btn[data-sec="${secId}"]`);
  if(navBtn) navBtn.click();
}

document.querySelectorAll(".topt").forEach(o=>o.addEventListener("click",()=>{
  pendingTheme=o.dataset.t;
  document.querySelectorAll(".topt").forEach(x=>x.classList.toggle("sel",x.dataset.t===pendingTheme));
}));
document.querySelectorAll(".copt").forEach(o=>o.addEventListener("click",()=>{
  pendingColor=o.dataset.c;
  document.querySelectorAll(".copt").forEach(x=>x.classList.toggle("sel",x.dataset.c===pendingColor));
  if(o.classList.contains("copt-none")) document.getElementById("applyColorBtn").click(); // "Quitar color" se aplica al instante, sin pulsar APLICAR
}));

document.getElementById("applyThemeBtn").addEventListener("click",()=>{ applyTheme(pendingTheme); document.getElementById("cfgModal").classList.remove("show"); addMsg("bot","✅ Fondo aplicado."); });
document.getElementById("applyColorBtn").addEventListener("click",()=>{
  const _go=()=>{ if(_randomColorInterval){ setRandomColors(false); document.getElementById("randomColorToggle").checked=false; } applyColor(pendingColor); document.getElementById("cfgModal").classList.remove("show"); addMsg("bot",String(pendingColor).toUpperCase()==="#E6E6E6"?"✅ Color quitado.":"✅ Color aplicado."); };
  if(_randomColorInterval) _rcWarn(_go); else _go();
});
// ── MOTOR DE SENSI: solo existe genSensiMejorado (para siempre) ─────
window.sensiEngine="mejorado";
try{ localStorage.removeItem("sensiEngine"); }catch(e){}

document.getElementById("changeNickBtn").addEventListener("click",async()=>{
  const n=document.getElementById("newNickIn").value.trim();
  if(!n||n.length<2){ alert("Mínimo 2 letras"); return; }
  if(n===nickname){ document.getElementById("cfgModal").classList.remove("show"); return; }

  try{
    // Leer doc actual del usuario UNA vez (se usa tanto para el límite de cambio como para copiar datos)
    const oldRef=doc(db,_C.u(),nickname);
    const oldSnap=await getDoc(oldRef);
    const oldData=oldSnap.exists()?oldSnap.data():{};

    // Verificar límite de cambio de nombre (1 cada 7 días)
    const lastRenameTs=oldData.lastRenameTs;
    if(lastRenameTs){
      const lastMs=lastRenameTs.toDate?lastRenameTs.toDate().getTime():lastRenameTs;
      const diffMs=Date.now()-lastMs;
      const sevenDaysMs=7*24*60*60*1000;
      if(diffMs<sevenDaysMs){
        const remainingDays=Math.ceil((sevenDaysMs-diffMs)/(24*60*60*1000));
        alert("⏳ Solo puedes cambiar tu nombre una vez cada 7 días.\n\nPodrás cambiarlo de nuevo en "+remainingDays+" día"+(remainingDays!==1?"s":"")+".");
        return;
      }
    }

    // Verificar que el nuevo nombre no esté tomado por otro UID
    const newRef=doc(db,_C.u(),n);
    const newSnap=await getDoc(newRef);
    if(newSnap.exists()){
      const nd=newSnap.data();
      const myUID=localStorage.getItem("sg_uid");
      if(nd.uid&&myUID&&nd.uid!==myUID){ alert("⛔ Ese nombre ya está en uso."); return; }
    }

    // Crear nuevo doc conservando UID, sensis, límite, etc. + marca de tiempo del cambio
    await setDoc(newRef,{...oldData, nickname:n, renamedFrom:nickname, lastSeen:serverTimestamp(), lastRenameTs:serverTimestamp()});

    // Migrar también el estatus del Programa de Creadores (si lo tenía) para que no se desincronice
    try{
      const oldCreatorRef=doc(db,"creators",nickname);
      const oldCreatorSnap=await getDoc(oldCreatorRef);
      if(oldCreatorSnap.exists()){
        await setDoc(doc(db,"creators",n),{...oldCreatorSnap.data(),nickname:n},{merge:true});
        try{ await deleteDoc(oldCreatorRef); }catch(e){ console.error("No se pudo borrar el registro de creador anterior:",e); }
      }
    }catch(e){ console.error("No se pudo migrar el estatus de creador:",e); }

    // Aplicar el cambio localmente YA (no depende de que el borrado del doc viejo funcione)
    const prevNick=nickname;
    nickname=n;
    localStorage.setItem(_xd("ODEsODQ=",0x36),n);
    if(typeof window._rewatchUserDoc==="function") window._rewatchUserDoc();
    document.getElementById("cfgModal").classList.remove("show");
    addMsg("bot","✅ Nombre cambiado a: "+n);

    // Borrar TODOS los documentos viejos ligados a este mismo UID (no solo el
    // nombre inmediatamente anterior). Así, aunque algún borrado anterior
    // hubiera fallado y quedaran nombres viejos acumulados, un cambio de
    // nombre nuevo los limpia a todos y deja el nombre nuevo como el único.
    try{
      const myUidNow=oldData.uid||localStorage.getItem("sg_uid");
      if(myUidNow){
        const qOld=query(collection(db,_C.u()),where("uid","==",myUidNow));
        const oldDocsSnap=await getDocs(qOld);
        const deletions=[];
        oldDocsSnap.forEach(d=>{
          if(d.id!==n) deletions.push(deleteDoc(d.ref).catch(e=>console.error("No se pudo borrar el nombre anterior ("+d.id+"):",e)));
        });
        await Promise.all(deletions);
      } else {
        await deleteDoc(oldRef);
      }
    }catch(e){ console.error("No se pudo limpiar los nombres anteriores:",e); }
  }catch(e){
    console.error("Error al cambiar de nombre:",e);
    alert("⛔ Ocurrió un error al cambiar el nombre. Intenta de nuevo.");
  }
});
(function(){
  const el=document.getElementById("meetIdDisplay");
  el.addEventListener("click",()=>{
    const code=el.dataset.meetid||"";
    if(!code||code==="------") return;
    navigator.clipboard?.writeText(code).catch(()=>{});
    const old=el.textContent; el.textContent="✅ Copiado"; setTimeout(()=>{ el.textContent=old; },900);
  });
})();
document.getElementById("cfgBtn")?.addEventListener("click",async()=>{
  const el=document.getElementById("meetIdDisplay");
  if(!nickname) return;
  try{
    const snap=await getDoc(doc(db,_C.u(),nickname));
    const code=(snap.exists()&&snap.data().meetId)||"";
    el.textContent=code||"------";
    el.dataset.meetid=code;
  }catch(e){}
});
document.getElementById("clearSessBtn").addEventListener("click",()=>{
  if(confirm("¿Cerrar sesión? Solo se borra tu nombre guardado, tu límite se mantiene.")){
    localStorage.removeItem(_xd("ODEsODQ=",0x36));
    (googleUser?signOut(auth):Promise.resolve()).catch(()=>{}).finally(()=>location.reload()); // la sesión anónima se conserva: es tu identidad
  }
});

// ── ADMIN PANEL ───────────────────────────────────────
// Función global para cambiar tabs del admin
window.switchAdminTab=function(tab){
  tab=({users:"usuarios",creators:"creadores"})[tab]||tab;
  const prev=document.querySelector("#adminNav .an-btn.sel");
  const btns=[...document.querySelectorAll("#adminNav .an-btn")];
  const nb=btns.find(b=>b.dataset.asec===tab); if(!nb) return;
  const dir=prev&&prev!==nb?(btns.indexOf(nb)>btns.indexOf(prev)?1:-1):0;
  btns.forEach(b=>b.classList.toggle("sel",b===nb));
  _freezeFx(520);
  // Las tarjetas se ocultan con una clase (así no se pisa el display propio de cada una)
  document.querySelectorAll("#adminContent [data-asec]").forEach(c=>c.classList.toggle("a-hide",c.dataset.asec!==tab));
  const cc=document.getElementById("adminCreatorsContent");
  cc.style.display=(tab==="creadores")?"block":"none";
  if(tab==="creadores") _loadCreatorsPanel();
  const body=document.getElementById("adminBody");
  body.scrollTop=0;
  body.style.setProperty("--slide-x",(dir*40)+"px"); body.style.setProperty("--slide-y","0px");
  body.classList.remove("panel-fade"); requestAnimationFrame(()=>body.classList.add("panel-fade"));
};

let _creatorsLoaded=false;
let _unsubCreatorsPanel=null;

function _loadCreatorsPanel(){
  if(_creatorsLoaded) return;
  _creatorsLoaded=true;
  const cc=document.getElementById("adminCreatorsContent");
  if(!cc) return;

  cc.innerHTML="<div style='font-size:10px;font-weight:900;letter-spacing:3px;color:rgba(255,200,0,0.7);margin-bottom:12px;'>🎬 CREADORES DE CONTENIDO</div>"
    +"<div id='creatorsPanelList' style='display:flex;flex-direction:column;gap:8px;'><div style='font-size:11px;color:rgba(160,215,255,0.3);'>Cargando...</div></div>"
    +"<div id='creatorsPanelDetail' style='display:none;margin-top:12px;padding:12px;background:color-mix(in srgb, var(--ac) 11%, #04070f);border-radius:16px;border:1px solid rgba(255,200,0,0.15);'></div>";

  // En tiempo real: todos los creadores aprobados
  if(_unsubCreatorsPanel) _unsubCreatorsPanel();
  _unsubCreatorsPanel=onSnapshot(
    query(collection(db,"creators"),where("status","in",["approved","expelled"])),
    snap=>{
      const list=document.getElementById("creatorsPanelList");
      if(!list) return;
      list.innerHTML="";
      if(snap.empty){
        list.innerHTML="<div style='font-size:11px;color:rgba(160,215,255,0.3);text-align:center;padding:20px;'>Sin creadores aprobados aún.</div>";
        return;
      }
      snap.docs.forEach(d=>{
        const c=d.data();
        const isExpelled=c.status==="expelled";
        const row=document.createElement("div");
        row.style.cssText="padding:10px 12px;border-radius:14px;border:1px solid rgba("+(isExpelled?"255,85,102":"255,200,0")+",0.2);background:rgba("+(isExpelled?"255,85,102":"255,200,0")+",0.04);cursor:pointer;";
        row.innerHTML="<div style='display:flex;justify-content:space-between;align-items:center;'>"
          +"<span style='font-size:12px;font-weight:900;color:"+(isExpelled?"#FF5566":"#FFC800")+"'>"+(isExpelled?"🚫":"🎬")+" "+c.nickname+"</span>"
          +"<span style='font-size:10px;color:rgba(160,215,255,0.4);'>"+c.plataforma+"</span>"
          +"</div>"
          +"<div style='font-size:10px;color:rgba(160,215,255,0.4);margin-top:3px;'>"+c.channelUrl+"</div>";
        row.addEventListener("click",()=>_showCreatorDetail(c, d.id));
        list.appendChild(row);
      });
    }
  );
}

let _cpCurrentNick=null;
let _cpCurrentDocId=null;

function _showCreatorDetail(c, docId){
  _cpCurrentNick=c.nickname;
  _cpCurrentDocId=docId;
  if(c.uid){
    _resolveCurrentNickByUid(c.uid).then(n=>{ if(n) _cpCurrentNick=n; });
  }
  const det=document.getElementById("creatorsPanelDetail");
  if(!det) return;
  det.style.display="block";
  det.innerHTML="<div style='font-size:11px;font-weight:900;color:#FFC800;margin-bottom:8px;'>🎬 "+c.nickname+"</div>"
    +"<div style='font-size:10px;color:rgba(160,215,255,0.5);margin-bottom:6px;'>Plataforma: "+c.plataforma+"</div>"
    +"<a href='"+c.channelUrl+"' target='_blank' style='font-size:10px;color:var(--ac);display:block;margin-bottom:8px;word-break:break-all;'>🔗 "+c.channelUrl+"</a>"
    +"<img src='"+c.photo+"' style='width:60px;height:60px;object-fit:cover;border-radius:11px;border:1px solid rgba(255,200,0,0.2);margin-bottom:8px;'/>"
    +"<a href='"+c.video1+"' target='_blank' style='display:block;font-size:10px;color:var(--ac);margin-bottom:4px;'>🎬 Video 1</a>"
    +"<a href='"+c.video2+"' target='_blank' style='display:block;font-size:10px;color:var(--ac);margin-bottom:10px;'>🎬 Video 2</a>"
    +"<div id='cpLimitInfo' style='font-size:10px;color:rgba(61,255,143,0.6);margin-bottom:8px;'>Cargando límite...</div>"
    +"<div style='display:flex;gap:6px;margin-bottom:8px;'>"
    +"<input id='cpLimitInput' type='number' min='1' max='200' placeholder='Nuevo límite/5h' class='inp' style='flex:1;font-size:11px;'/>"
    +"<button id='cpSetLimitBtn' style='flex:1;padding:8px;background:rgba(255,200,0,0.1);border:1px solid rgba(255,200,0,0.3);border-radius:11px;color:#FFC800;font-size:10px;font-weight:900;cursor:pointer;'>🔢 APLICAR</button>"
    +"</div>"
    +"<textarea id='cpMsgInput' placeholder='Mensaje o recompensa para el creador...' class='inp' style='font-size:11px;min-height:50px;margin-bottom:4px;resize:vertical;'></textarea>"
    +"<input id='cpRewardLimit' type='number' min='1' max='200' placeholder='Límite a aplicar con la recompensa (opcional)' class='inp' style='font-size:11px;margin-bottom:6px;'/>"
    +"<div style='display:flex;gap:6px;margin-bottom:8px;'>"
    +"<button id='cpSendMsgBtn' style='flex:1;padding:8px;background:rgba(var(--ac-rgb),0.1);border:1px solid rgba(var(--ac-rgb),0.3);border-radius:11px;color:var(--ac);font-size:10px;font-weight:900;cursor:pointer;'>📩 MENSAJE</button>"
    +"<button id='cpSendRewardBtn' style='flex:1;padding:8px;background:rgba(61,255,143,0.1);border:1px solid rgba(61,255,143,0.3);border-radius:11px;color:#3DFF8F;font-size:10px;font-weight:900;cursor:pointer;'>🎁 RECOMPENSA</button>"
    +"</div>"
    +(c.status==="approved"
      ?"<button id='cpExpelBtn' style='width:100%;padding:8px;background:rgba(255,85,102,0.1);border:1px solid rgba(255,85,102,0.3);border-radius:11px;color:#FF5566;font-size:10px;font-weight:900;cursor:pointer;'>🚫 EXPULSAR</button>"
      :"<div style='margin-top:6px;font-size:10px;color:rgba(255,85,102,0.5);text-align:center;'>🚫 Expulsado</div>");

  // Cargar límite actual en tiempo real
  onSnapshot(doc(db,_C.u(),c.nickname),uSnap=>{
    const el=document.getElementById("cpLimitInfo");
    if(!el) return;
    const lim=uSnap.exists()?uSnap.data().maxOverride??5:5;
    el.textContent="Límite actual: "+lim+" sensis/5h";
  });
}

// Funciones del panel creadores
// Listeners delegados del panel creadores (usando event delegation en el contenedor)
document.getElementById("adminCreatorsContent").addEventListener("click",async e=>{
  const nick=_cpCurrentNick;
  if(!nick) return;
  if(e.target.id==="cpSetLimitBtn"){
    const lim=parseInt(document.getElementById("cpLimitInput").value);
    if(!lim||lim<1){ alert("Ingresa un límite válido."); return; }
    await setDoc(doc(db,_C.u(),nick),{maxOverride:lim},{merge:true});
    _mirrorMaxOverrideByNick(nick,lim);
    await addDoc(collection(db,"inbox"),{to:nick,msg:"🔢 Tu límite fue actualizado a "+lim+" sensis/5h.",type:"admin",read:false,ts:serverTimestamp()});
    document.getElementById("cpLimitInput").value="";
    alert("Límite "+lim+" aplicado a "+nick+" ✅");
  }
  else if(e.target.id==="cpSendMsgBtn"){
    const msg=document.getElementById("cpMsgInput").value.trim();
    if(!msg){ alert("Escribe un mensaje."); return; }
    await addDoc(collection(db,"inbox"),{to:nick,msg,type:"admin",read:false,ts:serverTimestamp()});
    document.getElementById("cpMsgInput").value="";
    alert("Mensaje enviado a "+nick+" ✅");
  }
  else if(e.target.id==="cpSendRewardBtn"){
    const msg=document.getElementById("cpMsgInput").value.trim();
    const newLimitRaw=document.getElementById("cpRewardLimit").value.trim();
    const newLimit=newLimitRaw&&parseInt(newLimitRaw)>0?parseInt(newLimitRaw):null;
    if(!msg){ alert("Escribe la descripción de la recompensa."); return; }
    // Antes: el límite se aplicaba aquí mismo, al enviar, así que cuando el
    // usuario tocaba "RECLAMAR" en su bandeja no pasaba nada nuevo (ya se
    // había activado solo). Ahora solo se guarda el mensaje con el newLimit
    // pendiente; el botón RECLAMAR de la bandeja (más abajo, línea del
    // listener de inboxList) es el único lugar donde se aplica maxOverride.
    await addDoc(collection(db,"inbox"),{to:nick,msg,type:"reward",reward:msg,newLimit:newLimit||null,claimed:false,read:false,ts:serverTimestamp()});
    document.getElementById("cpMsgInput").value="";
    document.getElementById("cpRewardLimit").value="";
    alert("Recompensa enviada"+(newLimit?" · pendiente de reclamar: "+newLimit:"")+" ✅");
  }
  else if(e.target.id==="cpExpelBtn"){
    if(!confirm("¿Expulsar a "+nick+"?")) return;
    const reason=prompt("Motivo:")||"Incumplimiento de normas.";
    await setDoc(doc(db,"creators",_cpCurrentDocId||nick),{status:"expelled",expelReason:reason},{merge:true});
    await setDoc(doc(db,_C.u(),nick),{maxOverride:5,creatorVerified:false},{merge:true});
    _mirrorMaxOverrideByNick(nick,5);
    await addDoc(collection(db,"inbox"),{to:nick,msg:"🚫 Fuiste expulsado del Programa de Creadores.\n\nMotivo: "+reason,type:"admin",read:false,ts:serverTimestamp()});
    document.getElementById("creatorsPanelDetail").style.display="none";
    alert("Expulsado ✅");
  }
});

async function showAdmin(){
  _isAdmin=true;
  const _sp0=document.getElementById("splashScreen"); if(_sp0) _sp0.style.display="none";
  document.getElementById("loginScreen").style.display="none";
  document.getElementById("chatScreen").style.display="none";
  document.getElementById("adminScreen").style.display="flex";
  document.getElementById("adminScreen").style.flexDirection="column";
  const ac=document.getElementById("adminContent");
  let selectedUser="";

  ac.innerHTML=`
  <div class='acard gold'>
    <div class='atitle gold'>📊 ESTADÍSTICAS GLOBALES</div>
    <div class='stat-grid' id='statGrid'><div style='color:rgba(160,215,255,0.4);font-size:12px;'>Cargando...</div></div>
  </div>
  <div class='acard'>
    <div class='atitle blue'>📋 USUARIOS — toca uno para seleccionar</div>
    <input class='inp' id='aUserSearch' placeholder='🔍 Buscar por nombre, #uid o ID de encuentro...' style='margin-bottom:8px;'/>
    <div id='aUserList' style='display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;'></div>
  </div>
  <div class='acard' id='aActionCard' style='display:none;'>
    <div class='atitle blue'>👤 USUARIO SELECCIONADO: <span id='aSelLabel' style='color:#FFC800;'></span></div>
    <div class='ainfo' id='aUserInfo' style='margin-bottom:10px;'></div>
    <div class='agrid' style='margin-bottom:10px;'>
      <button class='abtn abtn-red' id='aBanBtn'>⛔ BANEAR</button>
      <button class='abtn abtn-green' id='aUnbanBtn'>✅ DESBANEAR</button>
      <button class='abtn abtn-gold' id='aTmpBtn'>⏱️ BAN TEMP</button>
      <button class='abtn abtn-blue' id='aRefreshBtn'>🔄 ACTUALIZAR</button>
    </div>
    <div class='atitle blue' style='margin-bottom:6px;'>🔢 LÍMITE (CADA 5H)</div>
    <div style='display:flex;gap:8px;margin-bottom:10px;'>
      <input class='inp' id='aMaxIn' placeholder='Número (ej: 10)' type='number' style='flex:1;'/>
      <button class='abtn abtn-blue' id='aSetMaxBtn' style='flex:1;'>✅ APLICAR</button>
    </div>
    <div class='atitle blue' style='margin-bottom:2px;'>📨 MENSAJE / RECOMPENSA</div>
    <div style='font-size:10px;color:rgba(160,215,255,0.4);margin-bottom:10px;'>Puedes enviar un mensaje, créditos, o ambos a la vez.</div>
    <div style='font-size:10px;color:rgba(160,215,255,0.6);margin-bottom:4px;'>✉️ Mensaje</div>
    <textarea class='inp' id='aPmMsg' placeholder='Escribe el mensaje... (opcional)' rows='3' style='resize:none;margin-bottom:10px;'></textarea>
    <div style='font-size:10px;color:rgba(160,215,255,0.6);margin-bottom:4px;'>🎁 Créditos / recompensa</div>
    <input class='inp' id='aUserRewardMsg' placeholder='Descripción (ej: +10 sensis/5h) (opcional)' style='margin-bottom:6px;'/>
    <input class='inp' id='aUserRewardLimit' type='number' min='1' max='100' placeholder='Nuevo límite/5h a aplicar (opcional)' style='margin-bottom:10px;'/>
    <div style='display:flex;gap:8px;'>
      <button class='abtn abtn-blue' style='flex:1;' id='aSendPmBtn'>📩 SOLO MENSAJE</button>
      <button class='abtn abtn-green' style='flex:1;' id='aUserSendRewardBtn'>🎁 SOLO CRÉDITOS</button>
    </div>
    <button class='abtn abtn-gold' style='width:100%;margin-top:8px;' id='aSendBothBtn'>📨 ENVIAR MENSAJE + CRÉDITOS</button>
  </div>
  <div class='acard' style='border-color:rgba(255,160,0,0.25);'>
    <div class='atitle gold'>🔧 MODO MANTENIMIENTO</div>
    <div id='aMaintStatus' style='font-size:11px;color:rgba(160,215,255,0.5);margin-bottom:10px;'>Cargando estado...</div>
    <input class='inp' id='aMaintMsg' placeholder='Mensaje para usuarios (ej: Volvemos en 1h)' style='margin-bottom:8px;'/>
    <div style='display:flex;gap:8px;'>
      <button class='abtn abtn-gold' style='flex:1;' id='aMaintOnBtn'>🔧 ACTIVAR</button>
      <button class='abtn abtn-green' style='flex:1;' id='aMaintOffBtn'>✅ DESACTIVAR</button>
    </div>
  </div>`;

  // Listeners tiempo real — se guardan para desuscribir si el admin sale
  let _unsubFeed=null, _unsubUsers=null, _unsubSelUser=null;

  function stopAdminListeners(){
    if(_unsubFeed){_unsubFeed();_unsubFeed=null;}
    if(_unsubUsers){_unsubUsers();_unsubUsers=null;}
    if(_unsubSelUser){_unsubSelUser();_unsubSelUser=null;}
  }

  function loadAdminData(){
    // Si ya hay listeners activos, no duplicar
    if(_unsubFeed||_unsubUsers) return;
    // ── Estadísticas: sensis totales en tiempo real
    _unsubFeed=onSnapshot(collection(db,_C.f()),feedSnap=>{
      const statGrid=document.getElementById("statGrid");
      if(!statGrid)return;
      const sensis=feedSnap.size;
      // preservar el número de usuarios si ya está renderizado
      const prevUsers=statGrid.querySelector(".stat-box:nth-child(2) .stat-n");
      const usersN=prevUsers?prevUsers.textContent:"…";
      statGrid.innerHTML=`<div class='stat-box'><div class='stat-n'>${sensis}</div><div class='stat-l'>SENSIS TOTAL</div></div><div class='stat-box'><div class='stat-n' id='statUsersN'>${usersN}</div><div class='stat-l'>USUARIOS</div></div>`;
    });

    // ── Lista de usuarios en tiempo real
    let _allRealUsers=[];
    function _renderUserRows(){
      const ul=document.getElementById("aUserList");
      if(!ul)return;
      const q=(document.getElementById("aUserSearch")?.value||"").trim().toLowerCase();
      const list=q?_allRealUsers.filter(u=>{
        const nick=(u.nickname||"").toLowerCase();
        const uidTail=(u.uid||"").toLowerCase();
        const meet=(u.meetId||"").toLowerCase();
        return nick.includes(q)||uidTail.includes(q)||meet.includes(q);
      }):_allRealUsers;
      ul.innerHTML="";
      list.forEach(u=>{
        const row=document.createElement("div");
        row.style.cssText="padding:10px 12px;border-radius:14px;border:1px solid rgba(var(--ac-rgb),0.12);background:color-mix(in srgb, var(--ac) 11%, #04070f);cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:all 0.15s;";
        const creatorTag=u.creatorVerified?"<img src='"+CREATOR_BADGE_IMG+"' style='width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-left:4px;'/>":"";
        row.innerHTML=`<span style='font-size:12px;font-weight:800;color:${u.banned?"#FF5566":"#E4F2FF"};'>${u.banned?"⛔":"✅"} ${u.nickname}${creatorTag}</span><span style='font-size:10px;color:rgba(160,215,255,0.4);'>${u.totalSensi||0} sensis · ${u.meetId?"🆔"+u.meetId:"#"+(u.uid||"???").slice(-6)}</span>`;
        row.addEventListener("click",()=>selectUser(u.nickname, row));
        if(u.nickname===selectedUser) row.style.borderColor="#FFC800";
        ul.appendChild(row);
      });
      if(!list.length) ul.innerHTML=`<div style='font-size:12px;color:rgba(160,215,255,0.3);padding:8px;'>${q?"Sin resultados para \""+q+"\".":"Sin usuarios aún."}</div>`;
    }
    document.getElementById("aUserSearch").addEventListener("input",_renderUserRows);
    _unsubUsers=onSnapshot(collection(db,_C.u()),userSnap=>{
      // Actualizar contador de usuarios en stat-grid
      const statUsersN=document.getElementById("statUsersN");
      // Filtrar docs internos (_banned_fp_*)
      const realUsers=userSnap.docs.filter(d=>!d.id.startsWith("_banned_fp_"));
      if(statUsersN) statUsersN.textContent=realUsers.length;
      _allRealUsers=realUsers.map(d=>d.data()).filter(u=>u.nickname);
      _renderUserRows();
    });
  }

  async function selectUser(nick, rowEl){
    selectedUser=nick;
    document.querySelectorAll("#aUserList > div").forEach(r=>r.style.borderColor="rgba(var(--ac-rgb),0.12)");
    if(rowEl) rowEl.style.borderColor="#FFC800";
    document.getElementById("aSelLabel").textContent=nick;
    document.getElementById("aActionCard").style.display="block";
    refreshUserInfo(nick);
  }

  function refreshUserInfo(nick){
    if(_unsubSelUser){_unsubSelUser();_unsubSelUser=null;}
    _unsubSelUser=onSnapshot(doc(db,_C.u(),nick),s=>{
      const el=document.getElementById("aUserInfo");
      if(!el)return;
      if(!s.exists()){ el.textContent="No encontrado."; return; }
      const d=s.data();
      const isOnline=d.online===true;
      const isCreatorUser=d.creatorVerified===true;
      const lastS=d.lastSeen?.toDate?d.lastSeen.toDate():null;
      const lastStr=lastS?lastS.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"?";
      const lastSpan = !isOnline ? "<span style='font-size:10px;color:rgba(160,215,255,0.3);'>última vez: "+lastStr+"</span>" : "";
      el.innerHTML=`<div style='display:flex;align-items:center;gap:8px;margin-bottom:8px;'>
        <span class='online-badge ${isOnline?"on":"off"}'><span class='dot-sm'></span>${isOnline?"🟢 EN LÍNEA":"⚫ DESCONECTADO"}</span>
        ${lastSpan}
      </div>
      <pre style='font-size:11px;color:rgba(160,215,255,0.7);white-space:pre-wrap;line-height:1.8;'>🆔 UID: ${d.uid||"Sin ID"}
👤 Nombre: ${d.nickname}
${isCreatorUser?"🎬 CREADOR VERIFICADO ✅\n":""}🎮 Sensis totales: ${d.totalSensi||0}
⚠️ Baneado: ${d.banned?"SÍ ⛔":"NO ✅"}
🔢 Límite por 5h: ${d.maxOverride??5}
📱 Device: ${(d.did||"").slice(0,16)}...</pre>`;
    });
  }

  loadAdminData();

  // ── MANTENIMIENTO en tiempo real ──
  const _maintRef=doc(db,"config","maintenance");
  onSnapshot(_maintRef,mSnap=>{
    const el=document.getElementById("aMaintStatus"); if(!el)return;
    if(mSnap.exists()&&mSnap.data().on){
      el.textContent="⚠️ ACTIVO: "+( mSnap.data().msg||"Página en mantenimiento");
      el.style.color="#FFC800";
    } else {
      el.textContent="✅ Desactivado — la app funciona normal";
      el.style.color="rgba(61,255,143,0.6)";
    }
  });
  document.getElementById("aMaintOnBtn").addEventListener("click",async()=>{
    const msg=document.getElementById("aMaintMsg").value.trim()||"Página en mantenimiento. Volvemos pronto.";
    await setDoc(_maintRef,{on:true,msg},{merge:true});
  });
  document.getElementById("aMaintOffBtn").addEventListener("click",async()=>{
    await setDoc(_maintRef,{on:false,msg:""},{merge:true});
  });

  // ── SOLICITUDES DE CREADORES en tiempo real ───────────────────────────
  // Agregar card al panel admin
  const creatorsCard=document.createElement("div");
  creatorsCard.className="acard";
  creatorsCard.style.borderColor="rgba(255,200,0,0.25)";
  creatorsCard.innerHTML=`<div class='atitle gold'>🎬 SOLICITUDES CREADORES</div>
    <div id='aCreatorList' style='max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:10px;'>
      <div style='font-size:11px;color:rgba(160,215,255,0.3);'>Cargando...</div>
    </div>
    <div id='aCreatorDetail' style='display:none;'>
      <div style='font-size:10px;color:rgba(160,215,255,0.5);margin-bottom:6px;' id='aCreatorNick'></div>
      <div style='display:flex;gap:6px;margin-bottom:8px;'>
        <a id='aCreatorChannel' href='#' target='_blank' style='font-size:10px;color:var(--ac);word-break:break-all;'></a>
      </div>
      <div style='display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;'>
        <img id='aCreatorPhoto' src='' style='width:72px;height:72px;object-fit:cover;border-radius:11px;border:1px solid rgba(var(--ac-rgb),0.2);'/>
      </div>
      <div style='display:flex;flex-direction:column;gap:6px;margin-bottom:8px;'>
        <a id='aCreatorVid1' href='#' target='_blank' style='font-size:11px;color:var(--ac);padding:6px 10px;background:rgba(var(--ac-rgb),0.07);border-radius:11px;border:1px solid rgba(var(--ac-rgb),0.15);word-break:break-all;'>🎬 Video 1</a>
        <a id='aCreatorVid2' href='#' target='_blank' style='font-size:11px;color:var(--ac);padding:6px 10px;background:rgba(var(--ac-rgb),0.07);border-radius:11px;border:1px solid rgba(var(--ac-rgb),0.15);word-break:break-all;'>🎬 Video 2</a>
      </div>
      <div style='display:flex;gap:6px;margin-bottom:8px;'>
        <button class='abtn abtn-green' style='flex:1;' id='aCreatorApproveBtn'>✅ APROBAR</button>
        <button class='abtn' style='flex:1;background:rgba(255,85,102,0.1);border-color:rgba(255,85,102,0.3);color:#FF5566;' id='aCreatorRejectBtn'>❌ RECHAZAR</button>
      </div>
      <div style='display:flex;gap:6px;margin-bottom:8px;align-items:center;'>
        <input class='inp' id='aCreatorLimitInput' type='number' min='1' max='100' placeholder='Nuevo límite/5h' style='flex:1;font-size:11px;'/>
        <button class='abtn abtn-gold' style='flex:1;' id='aCreatorSetLimitBtn'>🔢 CAMBIAR LÍMITE</button>
      </div>
      <div style='display:flex;gap:6px;margin-bottom:8px;'>
        <button class='abtn' style='flex:1;background:rgba(255,100,0,0.1);border-color:rgba(255,100,0,0.3);color:#FF8C00;' id='aCreatorExpelBtn'>🚫 EXPULSAR</button>
      </div>
      <div style='margin-top:8px;border-top:1px solid rgba(var(--ac-rgb),0.1);padding-top:10px;'>
        <div style='font-size:9px;letter-spacing:1px;color:rgba(255,200,0,0.6);margin-bottom:6px;'>🏆 ENVIAR RETO</div>
        <input class='inp' id='aChallengeMsg' placeholder='Descripción del reto...' style='margin-bottom:4px;font-size:11px;'/>
        <div style='margin-bottom:4px;'>
          <button id='aToggleLinkReq' style='font-size:10px;background:rgba(var(--ac-rgb),0.08);border:1px solid rgba(var(--ac-rgb),0.2);border-radius:8px;color:rgba(var(--ac-rgb),0.6);padding:4px 10px;cursor:pointer;'>🔗 Agregar link de referencia (opcional)</button>
        </div>
        <div id='aLinkReqWrap' style='display:none;margin-bottom:4px;'>
          <input class='inp' id='aChallengeLinkReq' placeholder='https://tiktok.com/... o YouTube...' style='font-size:11px;'/>
        </div>
        <button class='abtn abtn-gold' style='width:100%;' id='aSendChallengeBtn'>🏆 ENVIAR RETO</button>
      </div>
      <div style='margin-top:8px;border-top:1px solid rgba(var(--ac-rgb),0.1);padding-top:10px;'>
        <div style='font-size:9px;letter-spacing:1px;color:rgba(61,255,143,0.6);margin-bottom:6px;'>🎁 ENVIAR CRÉDITOS/RECOMPENSA (a este creador)</div>
        <div id='aCreatorRetos' style='max-height:100px;overflow-y:auto;margin-bottom:6px;font-size:10px;color:rgba(160,215,255,0.4);'>Sin retos pendientes de recompensar.</div>
        <input class='inp' id='aChallengeReward' placeholder='Descripción recompensa (ej: +10 sensis/5h)' style='margin-bottom:4px;font-size:11px;'/>
        <input class='inp' id='aChallengeNewLimit' type='number' min='1' max='100' placeholder='Nuevo límite/5h a aplicar automáticamente' style='margin-bottom:6px;font-size:11px;'/>
        <button class='abtn abtn-green' style='width:100%;' id='aSendRewardBtn'>🎁 ENVIAR CRÉDITOS</button>
      </div>
    </div>`;
  document.getElementById("adminContent").querySelector(".acard:last-child").after(creatorsCard);
  // Reparto de tarjetas por sección: Resumen (estadísticas + mantenimiento), Usuarios y Creadores
  (function(){
    const tag=(el,s)=>{ if(el) el.dataset.asec=s; };
    tag(document.getElementById("statGrid")?.closest(".acard"),"resumen");
    tag(document.getElementById("aMaintMsg")?.closest(".acard"),"resumen");
    tag(document.getElementById("aUserList")?.closest(".acard"),"usuarios");
    tag(document.getElementById("aActionCard"),"usuarios");
    tag(creatorsCard,"creadores");
    window.switchAdminTab("resumen");
  })();

  // Listener en tiempo real para solicitudes pendientes
  let _selCreator=null;
  let _selCreatorDocId=null;
  onSnapshot(query(collection(db,"creators"),where("status","==","pending")),cSnap=>{
    const _nb=document.getElementById("aNavBadge"); if(_nb){ _nb.textContent=cSnap.size; _nb.style.display=cSnap.size?"":"none"; }
    const list=document.getElementById("aCreatorList");
    if(!list) return;
    list.innerHTML="";
    if(cSnap.empty){ list.innerHTML="<div style='font-size:11px;color:rgba(160,215,255,0.3);'>Sin solicitudes pendientes.</div>"; return; }
    cSnap.docs.forEach(d=>{
      const c=d.data();
      const row=document.createElement("div");
      row.style.cssText="padding:8px 10px;border-radius:11px;border:1px solid rgba(255,200,0,0.15);background:rgba(255,200,0,0.04);cursor:pointer;display:flex;justify-content:space-between;align-items:center;";
      row.innerHTML=`<span style='font-size:11px;font-weight:800;color:#E4F2FF;'>${c.nickname}</span><span style='font-size:10px;color:rgba(160,215,255,0.4);'>${c.plataforma} · ⏳</span>`;
      row.addEventListener("click",async()=>{
        _selCreatorDocId=d.id;
        // Resuelve el nombre ACTUAL por UID (por si se renombró desde que aplicó)
        _selCreator=(c.uid && await _resolveCurrentNickByUid(c.uid)) || c.nickname;
        document.getElementById("aCreatorDetail").style.display="block";
        document.getElementById("aCreatorNick").textContent="👤 "+_selCreator+" · "+c.plataforma+" · "+c.channelUrl;
        _loadCreatorChallenges();
        document.getElementById("aCreatorChannel").textContent=c.channelUrl;
        document.getElementById("aCreatorChannel").href=c.channelUrl;
        document.getElementById("aCreatorPhoto").src=c.photo||"";
        const v1=document.getElementById("aCreatorVid1");
        v1.href=c.video1||"#"; v1.textContent="🎬 Video 1 — "+( c.video1||"sin link");
        const v2=document.getElementById("aCreatorVid2");
        v2.href=c.video2||"#"; v2.textContent="🎬 Video 2 — "+(c.video2||"sin link");
      });
      list.appendChild(row);
    });
  });

  document.getElementById("aCreatorApproveBtn").addEventListener("click",async()=>{
    if(!_selCreator) return;
    await setDoc(doc(db,"creators",_selCreatorDocId||_selCreator),{status:"approved"},{merge:true});
    // Aumentar límite diario del usuario a 20
    await setDoc(doc(db,_C.u(),_selCreator),{maxOverride:20,creatorVerified:true},{merge:true});
    _mirrorMaxOverrideByNick(_selCreator,20);
    // Notificar al usuario
    await addDoc(collection(db,"inbox"),{to:_selCreator,msg:"🎬 ¡Felicidades! Tu solicitud al Programa de Creadores fue APROBADA.\n\n⭐ Beneficios activos:\n• 20 sensis/5h\n• Badge de Creador Verificado en tus sensibilidades\n• Acceso a retos exclusivos\n\n¡Bienvenido al programa!",type:"admin",read:false,ts:serverTimestamp()});
    document.getElementById("aCreatorDetail").style.display="none";
    alert("Creador aprobado ✅");
  });

  document.getElementById("aCreatorRejectBtn").addEventListener("click",async()=>{
    if(!_selCreator) return;
    const reason=prompt("Razón del rechazo (opcional):") || "No cumple los requisitos.";
    await setDoc(doc(db,"creators",_selCreatorDocId||_selCreator),{status:"rejected",rejectReason:reason},{merge:true});
    await addDoc(collection(db,"inbox"),{to:_selCreator,msg:"❌ Tu solicitud al Programa de Creadores fue rechazada.\n\nMotivo: "+reason+"\n\nPuedes volver a intentarlo.",type:"admin",read:false,ts:serverTimestamp()});
    document.getElementById("aCreatorDetail").style.display="none";
    alert("Solicitud rechazada.");
  });

  document.getElementById("aCreatorSetLimitBtn").addEventListener("click",async()=>{
    if(!_selCreator) return;
    const lim=parseInt(document.getElementById("aCreatorLimitInput").value);
    if(!lim||lim<1||lim>100){ alert("Ingresa un límite válido (1-100)."); return; }
    await setDoc(doc(db,_C.u(),_selCreator),{maxOverride:lim},{merge:true});
    _mirrorMaxOverrideByNick(_selCreator,lim);
    await addDoc(collection(db,"inbox"),{to:_selCreator,msg:"🔢 El admin actualizó tu límite a "+lim+" sensis/5h.\n\nTu nuevo límite ya está activo automáticamente.",type:"admin",read:false,ts:serverTimestamp()});
    alert("Límite de "+lim+" aplicado a "+_selCreator+" ✅");
  });

  document.getElementById("aSendRewardBtn").addEventListener("click",async()=>{
    if(!_selCreator) return;
    const reward=document.getElementById("aChallengeReward").value.trim();
    const newLimitRaw=document.getElementById("aChallengeNewLimit").value.trim();
    const newLimit=newLimitRaw&&parseInt(newLimitRaw)>0?parseInt(newLimitRaw):null;
    if(!reward&&!newLimit){ alert("Pon la descripción de la recompensa o el nuevo límite."); return; }
    const retoId=document.getElementById("aChallengeReward").dataset.retoId||null;
    // El límite YA NO se aplica aquí: se guarda pendiente y solo se activa
    // cuando el usuario toca "RECLAMAR" en su bandeja (ver listener de
    // inboxList / claim-btn). Antes se aplicaba al instante, por lo que la
    // recompensa quedaba "reclamada" sin que el usuario hiciera nada.
    await addDoc(collection(db,"inbox"),{
      to:_selCreator,
      msg:"🎁 ¡Recompensa recibida por completar tu reto!\n\n"+(reward||"")+(newLimit?"\n\n📬 Tienes "+newLimit+" sensis/5h esperando en tu bandeja, toca RECLAMAR para activarlos.":""),
      type:"reward",
      reward:reward||"",
      newLimit:newLimit||null,
      claimed:false,
      read:false,
      ts:serverTimestamp()
    });
    // Marcar el reto como recompensado
    if(retoId) await setDoc(doc(db,"inbox",retoId),{rewarded:true,reward:reward||""},{merge:true});
    document.getElementById("aChallengeReward").value="";
    document.getElementById("aChallengeNewLimit").value="";
    delete document.getElementById("aChallengeReward").dataset.retoId;
    document.getElementById("aSendRewardBtn").textContent="🎁 ENVIAR CRÉDITOS";
    alert("Créditos enviados a "+_selCreator+(newLimit?" · Límite aplicado: "+newLimit:"")+" ✅");
  });

  document.getElementById("aCreatorExpelBtn").addEventListener("click",async()=>{
    if(!_selCreator) return;
    if(!confirm("¿Expulsar a "+_selCreator+" del programa de creadores?")) return;
    const reason=prompt("Razón de expulsión (opcional):") || "Incumplimiento de normas.";
    await setDoc(doc(db,"creators",_selCreatorDocId||_selCreator),{status:"expelled",expelReason:reason},{merge:true});
    // Quitar beneficios
    await setDoc(doc(db,_C.u(),_selCreator),{maxOverride:5,creatorVerified:false},{merge:true});
    _mirrorMaxOverrideByNick(_selCreator,5);
    await addDoc(collection(db,"inbox"),{to:_selCreator,msg:"🚫 Fuiste expulsado del Programa de Creadores.\n\nMotivo: "+reason+"\n\nContacta al admin si crees que es un error.",type:"admin",read:false,ts:serverTimestamp()});
    document.getElementById("aCreatorDetail").style.display="none";
    alert("Creador expulsado. Se quitaron los beneficios.");
  });

  // Cargar retos completados del creador seleccionado (para enviar recompensa)
  function _loadCreatorChallenges(){
    const retosDiv=document.getElementById("aCreatorRetos");
    if(!retosDiv||!_selCreator) return;
    // Escuchar retos entregados (con linkCompleted) del creador actual
    onSnapshot(query(collection(db,"inbox"),where("to","==",_selCreator),where("type","==","challenge"),where("linkCompleted","!=",null),orderBy("linkCompleted","desc"),limit(10)),snap=>{
      if(!retosDiv) return;
      if(snap.empty){ retosDiv.textContent="Sin retos completados aún."; return; }
      retosDiv.innerHTML="";
      snap.docs.forEach(rd=>{
        const r=rd.data();
        if(!r.linkCompleted) return;
        const already=r.reward||r.rewarded;
        const row=document.createElement("div");
        row.style.cssText="padding:6px 8px;border-radius:8px;border:1px solid rgba(61,255,143,"+(already?"0.1":"0.25")+");background:rgba(61,255,143,"+(already?"0.02":"0.05")+");margin-bottom:4px;cursor:"+(already?"default":"pointer")+";";
        row.innerHTML="<span style='font-size:10px;color:"+(already?"rgba(160,215,255,0.3)":"#3DFF8F")+"'>"+(already?"✅ ":"🎯 ")+"</span>"
          +"<a href='"+r.linkCompleted+"' target='_blank' style='font-size:10px;color:var(--ac);word-break:break-all;'>"+r.linkCompleted.slice(0,40)+"...</a>"
          +(already?"<span style='font-size:9px;color:rgba(160,215,255,0.3);'> · Ya recompensado</span>":"");
        if(!already) row.addEventListener("click",()=>{
          // Seleccionar este reto para recompensar
          document.getElementById("aChallengeReward").dataset.retoId=rd.id;
          document.getElementById("aChallengeNewLimit").dataset.retoId=rd.id;
          row.style.borderColor="rgba(255,200,0,0.5)";
          row.style.background="rgba(255,200,0,0.06)";
          document.getElementById("aSendRewardBtn").textContent="🎁 RECOMPENSAR ESTE RETO";
        });
        retosDiv.appendChild(row);
      });
    });
  }

  // Toggle link de referencia en reto
  document.getElementById("aToggleLinkReq").addEventListener("click",()=>{
    const wrap=document.getElementById("aLinkReqWrap");
    const btn=document.getElementById("aToggleLinkReq");
    const show=wrap.style.display==="none";
    wrap.style.display=show?"block":"none";
    btn.textContent=show?"🔗 Quitar link de referencia":"🔗 Agregar link de referencia (opcional)";
    btn.style.color=show?"rgba(255,85,102,0.7)":"rgba(56,190,255,0.6)";
    btn.style.borderColor=show?"rgba(255,85,102,0.3)":"rgba(56,190,255,0.2)";
    if(!show) document.getElementById("aChallengeLinkReq").value="";
  });

  document.getElementById("aSendChallengeBtn").addEventListener("click",async()=>{
    if(!_selCreator) return;
    const msg=document.getElementById("aChallengeMsg").value.trim();
    const linkReq=document.getElementById("aChallengeLinkReq").value.trim();
    if(!msg){ alert("Escribe la descripción del reto."); return; }
    await addDoc(collection(db,"inbox"),{to:_selCreator,msg,linkRequired:linkReq||"",type:"challenge",read:false,ts:serverTimestamp()});
    document.getElementById("aChallengeMsg").value="";
    document.getElementById("aChallengeLinkReq").value="";
    alert("Reto enviado a "+_selCreator+" ✅");
  });

  document.getElementById("aBanBtn").addEventListener("click",async()=>{
    if(!selectedUser||!confirm("¿Banear a "+selectedUser+"?"))return;
    await setDoc(doc(db,_C.u(),selectedUser),{banned:true,bannedUntil:null},{merge:true});
    alert("Baneado ✅"); refreshUserInfo(selectedUser);
  });
  document.getElementById("aUnbanBtn").addEventListener("click",async()=>{
    if(!selectedUser)return;
    // Desbanear usuario
    await setDoc(doc(db,_C.u(),selectedUser),{banned:false,bannedUntil:null},{merge:true});
    // Borrar también el ban de fingerprint (device) si existe
    const uSnap=await getDoc(doc(db,_C.u(),selectedUser));
    if(uSnap.exists()){
      const did=uSnap.data().did;
      if(did){
        try{ await setDoc(doc(db,_C.u(),"_banned_fp_"+did),{banned:false},{merge:true}); }catch(e){}
      }
    }
    alert("Desbaneado ✅"); refreshUserInfo(selectedUser);
  });
  document.getElementById("aTmpBtn").addEventListener("click",async()=>{
    if(!selectedUser)return;
    const raw=prompt("Duración del ban:\n\nEjemplos:\n  30s → 30 segundos\n  10m → 10 minutos\n  2h → 2 horas\n  1d → 1 día\n\nEscribe el tiempo:");
    if(!raw||!raw.trim())return;
    const match=raw.trim().toLowerCase().match(/^(\d+(\.\d+)?)\s*([smhd])$/);
    if(!match){ alert("Formato inválido. Usa: 30s, 10m, 2h, 1d"); return; }
    const val=parseFloat(match[1]);
    const unit=match[3];
    const ms=unit==="s"?val*1000:unit==="m"?val*60000:unit==="h"?val*3600000:val*86400000;
    const label=unit==="s"?val+"s":unit==="m"?val+"m":unit==="h"?val+"h":val+"d";
    await setDoc(doc(db,_C.u(),selectedUser),{banned:true,bannedUntil:new Date(Date.now()+ms)},{merge:true});
    alert("Ban de "+label+" aplicado ✅"); refreshUserInfo(selectedUser);
  });
  document.getElementById("aRefreshBtn").addEventListener("click",async()=>{ if(selectedUser) refreshUserInfo(selectedUser); });
  document.getElementById("aSetMaxBtn").addEventListener("click",async()=>{
    if(!selectedUser)return;
    const m=parseInt(document.getElementById("aMaxIn").value); if(isNaN(m))return;
    await setDoc(doc(db,_C.u(),selectedUser),{maxOverride:m},{merge:true});
    _mirrorMaxOverrideByNick(selectedUser,m);
    alert("Límite de "+m+" aplicado ✅"); refreshUserInfo(selectedUser);
  });
  document.getElementById("aSendBothBtn").addEventListener("click",async()=>{
    if(!selectedUser){ alert("Selecciona un usuario primero."); return; }
    const pm=document.getElementById("aPmMsg").value.trim();
    const reward=document.getElementById("aUserRewardMsg").value.trim();
    const limitRaw=document.getElementById("aUserRewardLimit").value.trim();
    const newLimit=limitRaw&&parseInt(limitRaw)>0?parseInt(limitRaw):null;
    if(!pm&&!reward&&!newLimit){ alert("Escribe al menos un mensaje, una recompensa o un nuevo límite."); return; }
    const btn=document.getElementById("aSendBothBtn");
    btn.disabled=true; btn.textContent="Enviando...";
    try{
      // El límite queda pendiente de reclamar (no se aplica aquí), igual que
      // en el resto de flujos de recompensa — ver botón RECLAMAR en la bandeja.
      if(pm) await addDoc(collection(db,_C.p()),{to:selectedUser,msg:pm,ts:serverTimestamp()});
      if(reward||newLimit){
        await addDoc(collection(db,"inbox"),{
          to:selectedUser,
          msg:"🎁 ¡Créditos recibidos!\n\n"+(reward||"")+(newLimit?"\n\n📬 Tienes "+newLimit+" sensis/5h esperando en tu bandeja, toca RECLAMAR para activarlos.":""),
          type:"reward", reward:reward||"", newLimit:newLimit||null, claimed:false, read:false, ts:serverTimestamp()
        });
      }
      document.getElementById("aPmMsg").value="";
      document.getElementById("aUserRewardMsg").value="";
      document.getElementById("aUserRewardLimit").value="";
      alert("Enviado a "+selectedUser+" ✅");
    }catch(e){
      console.error("Error al enviar mensaje/créditos:",e);
      alert("⚠️ No se pudo enviar. Intenta de nuevo.");
    }
    btn.disabled=false; btn.textContent="📨 ENVIAR MENSAJE + CRÉDITOS";
  });
  document.getElementById("aSendPmBtn").addEventListener("click",async()=>{
    if(!selectedUser)return;
    const msg=document.getElementById("aPmMsg").value.trim(); if(!msg)return;
    await addDoc(collection(db,_C.p()),{to:selectedUser,msg,ts:serverTimestamp()});
    document.getElementById("aPmMsg").value=""; alert("Mensaje enviado a "+selectedUser+" ✅");
  });
  document.getElementById("aUserSendRewardBtn").addEventListener("click",async()=>{
    if(!selectedUser){ alert("Selecciona un usuario primero."); return; }
    const reward=document.getElementById("aUserRewardMsg").value.trim();
    const limitRaw=document.getElementById("aUserRewardLimit").value.trim();
    const newLimit=limitRaw&&parseInt(limitRaw)>0?parseInt(limitRaw):null;
    if(!reward&&!newLimit){ alert("Pon la descripción de los créditos o el nuevo límite."); return; }
    const btn=document.getElementById("aUserSendRewardBtn");
    btn.disabled=true; btn.textContent="Enviando...";
    try{
      // Igual que en los otros flujos: el límite queda pendiente hasta que
      // el usuario toque RECLAMAR en su bandeja, no se aplica al enviar.
      await addDoc(collection(db,"inbox"),{
        to:selectedUser,
        msg:"🎁 ¡Créditos recibidos!\n\n"+(reward||"")+(newLimit?"\n\n📬 Tienes "+newLimit+" sensis/5h esperando en tu bandeja, toca RECLAMAR para activarlos.":""),
        type:"reward",
        reward:reward||"",
        newLimit:newLimit||null,
        claimed:false,
        read:false,
        ts:serverTimestamp()
      });
      document.getElementById("aUserRewardMsg").value="";
      document.getElementById("aUserRewardLimit").value="";
      alert("Créditos enviados a "+selectedUser+(newLimit?" · pendiente de reclamar: "+newLimit:"")+" ✅");
    }catch(e){
      console.error("Error al enviar créditos:",e);
      alert("⚠️ No se pudieron enviar los créditos. Intenta de nuevo.");
    }
    btn.disabled=false; btn.textContent="🎁 ENVIAR CRÉDITOS";
  });
}

document.getElementById("adminExitBtn").addEventListener("click",()=>{
  _isAdmin=false;
  _creatorsLoaded=false;
  if(_unsubCreatorsPanel){ _unsubCreatorsPanel(); _unsubCreatorsPanel=null; }
  if(typeof stopAdminListeners==="function") stopAdminListeners();
  document.getElementById("adminScreen").style.display="none";
  const _sp=document.getElementById("splashScreen"); if(_sp) _sp.style.display="none";
  document.getElementById("loginScreen").style.display="flex";
});

// ── BAN SCREEN TOTAL ──────────────────────────────────
function showBanScreen(msg, untilDate){
  // Solo borramos sesión en ban permanente; en temporal la conservamos para auto-relogin
  if(!untilDate) localStorage.removeItem(_xd("ODEsODQ=",0x36));
  // Ocultar todo
  document.getElementById("chatScreen").style.display="none";
  document.getElementById("loginScreen").style.display="none";
  document.getElementById("adminScreen").style.display="none";
  const _sp=document.getElementById("splashScreen"); if(_sp) _sp.style.display="none";
  // Crear pantalla de ban
  let existing=document.getElementById("banScreen");
  if(existing) existing.remove();
  const bs=document.createElement("div");
  bs.id="banScreen";
  bs.style.cssText="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 24px;gap:16px;background:rgba(20,0,0,0.95);animation:fadeIn 0.4s ease;";
  const icon=document.createElement("div");
  icon.style.cssText="font-size:64px;animation:bounce 1s ease infinite;";
  icon.textContent="⛔";
  const title=document.createElement("div");
  title.style.cssText="font-size:18px;font-weight:900;letter-spacing:3px;color:#FF5566;text-align:center;";
  title.textContent="CUENTA SUSPENDIDA";
  const txt=document.createElement("div");
  txt.style.cssText="font-size:13px;font-weight:600;color:rgba(255,150,150,0.7);text-align:center;line-height:1.8;white-space:pre-wrap;";
  txt.textContent=msg;
  bs.appendChild(icon); bs.appendChild(title); bs.appendChild(txt);
  // Contador regresivo si es temporal
  if(untilDate){
    const timer=document.createElement("div");
    timer.style.cssText="font-size:28px;font-weight:900;color:#FF5566;font-variant-numeric:tabular-nums;";
    bs.appendChild(timer);
    const hint=document.createElement("div");
    hint.style.cssText="font-size:10px;letter-spacing:2px;color:rgba(255,85,102,0.4);text-align:center;";
    hint.textContent="TIEMPO RESTANTE";
    bs.appendChild(hint);
    async function tick(){
      const ms=untilDate-new Date();
      if(ms<=0){
        // Ban temporal expirado: borrar fingerprint y recargar
        location.reload(); return;
      }
      const h=Math.floor(ms/3600000);
      const m=Math.floor((ms%3600000)/60000);
      const s=Math.floor((ms%60000)/1000);
      timer.textContent=(h>0?h+"h ":"")+m+"m "+s+"s";
      setTimeout(tick,1000);
    }
    tick();
  }
  document.getElementById("app").appendChild(bs);
}

// Verificar si el fingerprint está baneado (aunque usen otro nombre)
async function checkFingerprintBan(){
  try{
    await ensureAuth();
    const qs=await getDocs(query(collection(db,_C.u()),where("did","==",DEVICE_ID),where("banned","==",true),limit(5)));
    let perm=false;
    qs.forEach(d=>{ if(!d.data().bannedUntil) perm=true; });
    if(perm){
      showBanScreen("⛔ Este dispositivo fue suspendido.\n\n🚫 Ban permanente del dispositivo.\n\nNo puedes usar otro nombre.", null);
      return true;
    }
  }catch(e){}
  return false;
}

// ── ENTRAR ────────────────────────────────────────────
async function entrar(googleUID=null){
  const n=document.getElementById("nickIn").value.trim();
  if(!n||n.length<2){ alert("Mínimo 2 letras"); return; }
  await ensureAuth();
  // Verificar ban por fingerprint y leer doc de usuario en paralelo (antes eran 2 viajes seguidos)
  const uRef=doc(db,_C.u(),n);
  const [fpBanned,uS]=await Promise.all([checkFingerprintBan(), getDoc(uRef)]);
  if(fpBanned) return;

  // Identidad = uid de Firebase (anónimo o Google). Ya no se confía en localStorage.
  const authUID=auth.currentUser.uid;
  const savedUID=authUID;
  const limitOwnerKey=authUID;
  let _udForMax=null;

  if(uS.exists()){
    const ud=uS.data();
    _udForMax=ud;
    // nombre tomado por otra cuenta — verificar correctamente
    const incomingUID = googleUID || savedUID;
    let storedUID   = ud.uid;
    // Migración de cuentas viejas (solo funciona mientras config/migration.open sea true en Firestore)
    if(storedUID && storedUID!==authUID && !ud.googleAccount){
      try{ await updateDoc(uRef,{uid:authUID}); storedUID=authUID; ud.uid=authUID; }catch(_e){}
    }
    // Si el nombre tiene un UID y el que entra tiene otro UID diferente...
    if(storedUID && incomingUID && storedUID !== incomingUID){
      // Excepción: si el nombre estaba en uso SIN Google y ahora entra CON Google
      // se le permite tomar el nombre (actualiza su UID al de Google)
      // Solo bloquear si la cuenta existente YA tiene Google vinculado con OTRO uid
      if(ud.googleAccount && storedUID !== googleUID){
        alert("⛔ Ese nombre ya está vinculado a otra cuenta de Google."); return;
      }
      // Si venía sin Google y ahora entra sin Google con diferente uid → bloquear
      if(!googleUID && !ud.googleAccount && storedUID !== savedUID){
        alert("⛔ Ese nombre ya está en uso. Elige otro."); return;
      }
      // En cualquier otro caso (p.ej. tenía uid local, ahora entra con Google) → permitir
    }
    if(ud.banned){
      const until=ud.bannedUntil;
      const untilDate=until?new Date(until.seconds?until.seconds*1000:until):null;
      if(!untilDate||untilDate>new Date()){
        // Mostrar pantalla de ban real con countdown si es temporal
        let banMsg="⛔ TU CUENTA FUE SUSPENDIDA\n\n";
        if(untilDate){
          const ms=untilDate-new Date();
          const hrs=Math.ceil(ms/3600000);
          const mins=Math.ceil(ms/60000);
          banMsg+=mins<60?`⏱️ Duración: ${mins} minuto${mins!==1?"s":""}`:`⏱️ Duración: ${hrs} hora${hrs!==1?"s":""}`;
          banMsg+="\n\nVuelve cuando termine el ban.";
        } else {
          banMsg+="🚫 Ban permanente\n\nContacta al administrador.";
        }
        showBanScreen(banMsg, untilDate);
        return;
      } /* ban vencido: las reglas ya lo ignoran, no hace falta escribir */
    }
  }

  // Generar UID único si no tiene
  // Si tiene Google UID, usarlo (más seguro y atado a cuenta Google)
  const myUID=authUID; localStorage.setItem("sg_uid",myUID);

  const isGoogleUser=!!googleUID;

  // Límite diario: SIEMPRE por ID (UID de Google o fingerprint del dispositivo),
  // nunca por el nombre. Así, si cambiás de nombre o volvés a entrar con un
  // nombre anterior, tu límite personalizado no se pierde ni se resetea.
  myMax=(_udForMax && typeof _udForMax.maxOverride==="number")?_udForMax.maxOverride:MAX_DEF;

  // ID de encuentro: código corto de 6 dígitos numéricos para que un admin
  // pueda ubicar al usuario fácilmente. Se guarda SOLO en Firestore (ligado
  // al usuario), nunca en localStorage — así no se comparte entre cuentas
  // que usan el mismo dispositivo, y se verifica que no se repita con nadie.
  const uSnapForMeet=await getDoc(uRef).catch(()=>null);
  let meetId=(uSnapForMeet&&uSnapForMeet.exists()&&uSnapForMeet.data().meetId)||null;
  if(!meetId){
    for(let attempt=0;attempt<6;attempt++){
      const candidate=String(Math.floor(100000+Math.random()*900000));
      const dupSnap=await getDocs(query(collection(db,_C.u()),where("meetId","==",candidate),limit(1))).catch(()=>null);
      if(!dupSnap||dupSnap.empty){ meetId=candidate; break; }
    }
    if(!meetId) meetId=String(Date.now()).slice(-6); // último recurso, prácticamente único
  }

  // Registrar/actualizar usuario con UID
  const _prevUD=uSnapForMeet&&uSnapForMeet.exists()?uSnapForMeet.data():null;
  const {streak:_myStreak,lastLoginDay:_todayKey}=_computeStreak(_prevUD);
  window._myStreak=_myStreak;
  const _sf=document.getElementById("streakFloat");
  if(_sf){ _sf.style.display=_myStreak>0?"flex":"none"; document.getElementById("streakFloatNum").textContent=_myStreak; }
  const _baseDoc={nickname:n, uid:myUID, did:DEVICE_ID, googleAccount:isGoogleUser, lastSeen:serverTimestamp(), online:true, meetId, streak:_myStreak, lastLoginDay:_todayKey};
  if(!(uSnapForMeet&&uSnapForMeet.exists())) await setDoc(uRef,{..._baseDoc,banned:false,createdAt:serverTimestamp()});
  else await setDoc(uRef,_baseDoc,{merge:true});

  // Tutorial de bienvenida: se guarda en Firestore (tutorialSeen), no en localStorage,
  // para que se muestre una sola vez a cada usuario sin importar el dispositivo.
  const _tutSeen=(uSnapForMeet&&uSnapForMeet.exists()&&uSnapForMeet.data().tutorialSeen)===true;
  if(!_tutSeen) setTimeout(()=>{ showTutorial(); },600);

  nickname=n; localStorage.setItem(_xd("ODEsODQ=",0x36),n);

  // ── REFERIDOS: si entró por primera vez con un link "?ref=alguien" y ese
  // "alguien" no es él mismo, le suma +1 sensi/5h PERMANENTE a quien lo
  // invitó. Se usa un doc "referrals/{nickname del nuevo}" como candado:
  // como cada usuario nuevo solo puede tener UN doc con su propio nombre,
  // es imposible cobrar el mismo referido dos veces aunque recargue la
  // página o borre el link. Solo corre para cuentas realmente nuevas
  // (uSnapForMeet no existía antes de este login).
  const _refCode=new URLSearchParams(location.search).get("ref");
  if(_refCode && !(uSnapForMeet&&uSnapForMeet.exists()) && _refCode!==n){
    (async()=>{
      try{
        const refDocRef=doc(db,"referrals",n);
        const refSnap=await getDoc(refDocRef);
        if(refSnap.exists()) return; // ya se cobró este referido antes, no duplicar
        const rUserRef=doc(db,_C.u(),_refCode);
        const rSnap=await getDoc(rUserRef);
        if(!rSnap.exists()) return;
        const _cur=(typeof rSnap.data().maxOverride==="number")?rSnap.data().maxOverride:MAX_DEF;
        if(_cur>=25) return; // tope de bonus por invitaciones
        const newMax=_cur+1;
        // Un solo lote: candado + bonus + aviso. Las reglas validan que todo sea legítimo.
        const _rb=writeBatch(db);
        _rb.set(refDocRef,{referrer:_refCode,referred:n,ts:serverTimestamp()});
        _rb.update(rUserRef,{maxOverride:newMax,lastRefFrom:n});
        _rb.set(doc(db,"inbox","ref_"+n),{to:_refCode,referred:n,msg:"🎉 ¡"+n+" se unió usando tu link de invitación!\n\nGanaste +1 sensi/5h PERMANENTE. Tu límite ahora es "+newMax+".",type:"reward",reward:"+1 sensi/5h permanente por invitar a "+n,newLimit:null,claimed:true,read:false,ts:serverTimestamp()});
        await _rb.commit();
      }catch(e){ console.error("Error procesando referido:",e); }
    })();
  }

  myCount=await getServerCount(n);
  _loadBoost();
  await _lgSuccess(n);
  document.body.classList.add("in-app");
  const _sp=document.getElementById("splashScreen"); if(_sp) _sp.style.display="none";
  document.getElementById("loginScreen").style.display="none";
  document.getElementById("chatScreen").style.display="flex";
  document.getElementById("inboxBtn").style.display="";
  document.getElementById("creatorBtn").style.display="";
  document.getElementById("creditsBtn").style.display="";
  document.getElementById("rankBtn").style.display="";
  document.getElementById("cfgBtn").style.display="";
  document.getElementById("menuBtn").style.display="";
  _startInboxDot();
  // Re-evaluar mantenimiento ahora que el chat está visible (y no es admin)
  if(!_isAdmin){
    const mSnap2=await getDoc(_maintDocRef).catch(()=>null);
    if(mSnap2&&mSnap2.exists()&&mSnap2.data().on){
      const maintMsg=mSnap2.data().msg||"Página en mantenimiento. Volvemos pronto.";
      let ms=document.getElementById("maintScreen");
      if(!ms){
        ms=document.createElement("div"); ms.id="maintScreen";
        ms.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,6,0,0.97);z-index:9999;gap:16px;padding:24px;";
        ms.innerHTML=`<div style='font-size:56px;'>🔧</div><div style='font-size:17px;font-weight:900;letter-spacing:3px;color:#FFC800;'>MANTENIMIENTO</div><div style='font-size:13px;color:rgba(255,200,0,0.6);text-align:center;line-height:1.8;'>${maintMsg}</div>`;
        document.body.appendChild(ms);
      } else { ms.style.display="flex"; }
    }
  }
  updateCounter(); switchTab("mio");
  addMsg("bot","⚡ Hola "+n+"!\n\nDime tu marca y modelo.\n\nEj: Honor X5C Plus");
  maybeShowWhatsAppPromo();

  // Listener tiempo real: ban y limite
  // Se re-suscribe automáticamente si el usuario cambia de nombre (ver changeNickBtn),
  // así el ban/límite en vivo no deja de sincronizarse tras un cambio de nombre.
  let _firstUserSnap=true;
  let _unsubUserWatch=null;
  function _watchUserDoc(nk){
    if(_unsubUserWatch){ _unsubUserWatch(); _unsubUserWatch=null; }
    _unsubUserWatch=onSnapshot(doc(db,_C.u(),nk),snap=>{
    if(!snap.exists())return;
    const ud=snap.data();
    if(ud.banned){
      const until=ud.bannedUntil;
      const untilDate=until?new Date(until.seconds?until.seconds*1000:until):null;
      const bannedNow=!untilDate||untilDate>new Date();
      if(bannedNow){
        // Calcular horas restantes si es temporal
        let banMsg="⛔ TU CUENTA FUE SUSPENDIDA\n\n";
        if(untilDate){
          const ms=untilDate-new Date();
          const hrs=Math.ceil(ms/3600000);
          const mins=Math.ceil(ms/60000);
          banMsg+=mins<60?`⏱️ Duración: ${mins} minuto${mins!==1?"s":""}`:`⏱️ Duración: ${hrs} hora${hrs!==1?"s":""}`;
          banMsg+="\n\nVuelve cuando termine el ban.";
        } else {
          banMsg+="🚫 Ban permanente\n\nContacta al administrador.";
        }
        // Mostrar pantalla de ban TOTAL — saca de sesión
        showBanScreen(banMsg, untilDate);
        return;
      }
    }
    // Si estaba baneado y el admin lo desbaneó en tiempo real → restaurar chat
    const banScreen=document.getElementById("banScreen");
    if(banScreen){
      banScreen.remove();
      document.getElementById("chatScreen").style.display="flex";
      document.getElementById("inboxBtn").style.display="";
      document.getElementById("creatorBtn").style.display="";
      document.getElementById("cfgBtn").style.display="";
      addMsg("bot","✅ Tu cuenta fue reactivada por el administrador.");
    }
    if(ud.maxOverride!==null&&ud.maxOverride!==undefined){
      if(!_firstUserSnap&&ud.maxOverride!==myMax){
        myMax=ud.maxOverride; updateCounter();
        addMsg("bot","⚙️ El admin cambió tu límite a "+myMax+" sensis/5h.");
      } else {
        myMax=ud.maxOverride; updateCounter();
      }
    }
    _firstUserSnap=false;
  });
  }
  _watchUserDoc(n);
  window._rewatchUserDoc=()=>{ _firstUserSnap=true; _watchUserDoc(nickname); };

  // Listener tiempo real: mensajes privados
  const _seenPMs=new Set();
  let _pmReady=false;
  onSnapshot(query(collection(db,_C.p()),where("to","==",n),orderBy("ts","desc"),limit(20)),snap=>{
    // Primera vez: marcar todos los docs existentes como "ya vistos" sin mostrar
    if(!_pmReady){
      snap.docs.forEach(d=>_seenPMs.add(d.id));
      _pmReady=true;
      return;
    }
    snap.docChanges().forEach(ch=>{
      if(ch.type==="added"){
        // Ya visto (doble-fire serverTimestamp) → ignorar
        if(_seenPMs.has(ch.doc.id)) return;
        _seenPMs.add(ch.doc.id);
        const d=ch.doc.data();
        if(d.msg) addMsg("bot","📩 Mensaje del Admin:\n\n"+d.msg,{adm:true});
      }
    });
  });
}

// ── GOOGLE AUTH ───────────────────────────────────────
let googleUser=null;
let _isAdmin=false;
const CREATOR_BADGE_IMG="data:image/png;base64,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"; const CREDITS_ICON_IMG="data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27><circle cx=%2712%27 cy=%2712%27 r=%2711%27 fill=%27%23FFC800%27/><circle cx=%2712%27 cy=%2712%27 r=%278.5%27 fill=%27none%27 stroke=%27%237a5b00%27 stroke-width=%271.4%27/><path d=%27M13 5 L7 13 H11 L10 19 L17 10 H12.5 Z%27 fill=%27%237a5b00%27/></svg>";
// se pone true cuando el admin entra al panel // Firebase user object if logged with Google

async function entrarConGoogle(){
  try{
    const result=await signInWithPopup(auth,_gProvider);
    googleUser=result.user;
    if(googleUser.email===ADMIN_EMAIL){ showAdmin(); return; } // admin = tu Google (las reglas lo verifican en el servidor)
    const savedN=localStorage.getItem(_xd("ODEsODQ=",0x36));
    // Si no hay nombre guardado en este dispositivo (p.ej. justo después de
    // cerrar sesión), buscamos primero si esta cuenta de Google YA tiene un
    // nombre registrado en Firestore por su UID. Ese nombre puede ser distinto
    // al nombre original de Google si el usuario se renombró antes. Solo si
    // no existe ningún registro previo caemos al nombre de Google.
    let recoveredNick=null;
    if(!savedN){
      try{ recoveredNick=await _resolveCurrentNickByUid(googleUser.uid); }catch(e){ /* si falla, seguimos con el fallback de abajo */ }
    }
    const displayName=googleUser.displayName||googleUser.email.split("@")[0]||"User";
    // Nombre a usar: guardado local > registrado en Firestore por UID > displayName limpio
    let n=savedN||recoveredNick||(displayName.replace(/[^a-zA-Z0-9_\-]/g,"").slice(0,20))||"Player";
    if(!savedN&&!recoveredNick&&document.getElementById("loginScreen").classList.contains("show")){ n=await _lgAskName((displayName.replace(/[^a-zA-Z0-9_\-]/g,"").slice(0,20))||"Player"); }
    // Verificar si el nombre está tomado por otra cuenta Google antes de intentar entrar
    const snap=await getDoc(doc(db,_C.u(),n));
    if(snap.exists()&&snap.data().googleAccount&&snap.data().uid&&snap.data().uid!==googleUser.uid){
      // Nombre tomado por otro Google → pedir al usuario que elija otro
      const nuevo=prompt("El nombre '"+n+"' ya está en uso por otra cuenta de Google.\n\nElige un nombre diferente:");
      if(!nuevo||nuevo.trim().length<2){ alert("Necesitas un nombre válido para entrar."); googleUser=null; return; }
      n=nuevo.trim().replace(/[^a-zA-Z0-9_\-]/g,"").slice(0,20);
    }
    document.getElementById("nickIn").value=n;
    await entrar(googleUser.uid);
  }catch(e){
    if(e.code==="auth/popup-blocked"){
      alert("El popup fue bloqueado por el navegador.\nPermite popups para este sitio en la barra de dirección y vuelve a intentarlo.");
    } else if(e.code!=="auth/popup-closed-by-user"){
      alert("Error al entrar con Google: "+e.message);
    }
  }
}

// ── INIT ──────────────────────────────────────────────
// ── CHECK MANTENIMIENTO al arrancar ──
const _maintDocRef=doc(db,"config","maintenance");
onSnapshot(_maintDocRef,mSnap=>{
  // No aplicar mantenimiento al admin ni en la pantalla de login
  if(_isAdmin) return;
  const chatVisible=document.getElementById("chatScreen").style.display==="flex";
  if(mSnap.exists()&&mSnap.data().on){
    // Solo mostrar si el usuario ya inició sesión (no en el login ni login Google)
    if(!chatVisible) return;
    const maintMsg=mSnap.data().msg||"Página en mantenimiento. Volvemos pronto.";
    let ms=document.getElementById("maintScreen");
    if(!ms){
      ms=document.createElement("div");
      ms.id="maintScreen";
      ms.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,6,0,0.97);z-index:9999;gap:16px;padding:24px;";
      ms.innerHTML=`<div style='font-size:56px;'>🔧</div><div style='font-size:17px;font-weight:900;letter-spacing:3px;color:#FFC800;'>MANTENIMIENTO</div><div style='font-size:13px;color:rgba(255,200,0,0.6);text-align:center;line-height:1.8;'>${maintMsg}</div>`;
      document.body.appendChild(ms);
    } else {
      ms.querySelector("div:last-child").textContent=maintMsg;
      ms.style.display="flex";
    }
  } else {
    const ms=document.getElementById("maintScreen");
    if(ms) ms.style.display="none";
  }
});

const savedNick=localStorage.getItem(_xd("ODEsODQ=",0x36));
if(savedNick) document.getElementById("nickIn").value=savedNick;
loadPrefs();
restoreRgbState();

// Helper: si por algún motivo el auto-login no puede completarse, mostramos
// recién ahí la pantalla de login (nunca antes).
function _fallbackToLogin(){
  const splashEl=document.getElementById("splashScreen");
  if(splashEl) splashEl.style.display="none";
  const loginEl=document.getElementById("loginScreen");
  if(loginEl) loginEl.classList.add("show");
}
function _alreadyEntered(){
  return document.getElementById("chatScreen").style.display==="flex" || !!document.getElementById("banScreen");
}

pendingTheme=currentTheme; pendingColor=currentColor;

document.getElementById("googleBtn").addEventListener("click",()=>_lgRun(entrarConGoogle));
const _I18N={
 en:{"ENTENDIDO":"GOT IT","Nuevo botón de notificaciones: toca la campana, arriba a la izquierda, para ver tus avisos.":"New notifications button: tap the bell, top left, to see your alerts.","Nuevo cuadro de notificaciones: aquí ves todo lo que has recibido y puedes borrarlo cuando quieras.":"New notifications box: here you see everything you've received and you can clear it anytime.","Herramienta creada por":"Tool created by","NOTIFICACIONES":"NOTIFICATIONS","BORRAR TODO":"CLEAR ALL","Sin notificaciones":"No notifications","ahora":"now","MODO ALEATORIO ACTIVO":"RANDOM MODE ACTIVE","Para poner un color de acento debes desactivar el modo aleatorio de colores.":"To set an accent color you must turn off the random color mode.","DESACTIVAR Y APLICAR COLOR":"TURN OFF AND APPLY COLOR","CANCELAR":"CANCEL","🚫 QUITAR COLOR":"🚫 REMOVE COLOR","SIGUIENTE":"NEXT","⏱️ ¡Nueva actualización! Ya no esperas un día: ahora tus sensis se restablecen cada 5 horas.":"⏱️ New update! You no longer wait a whole day: now your sensis reset every 5 hours.","🎟️ Los códigos también cambiaron: suben tu límite a 10 sensis cada 5 horas durante los días que dura el código.":"🎟️ Codes changed too: they raise your limit to 10 sensis every 5 hours for as many days as the code lasts.","ENTRA AL CHAT":"JOIN THE CHAT","Elige un nombre para recibir tu sensibilidad personalizada para Free Fire":"Pick a name to get your personalized Free Fire sensitivity","ENTRAR CON GOOGLE":"SIGN IN WITH GOOGLE","O ESCRIBE TU NOMBRE":"OR TYPE YOUR NAME","Tu nombre (ej: SniperX, NoobKiller...)":"Your name (e.g. SniperX, NoobKiller...)","⚡ ENTRAR":"⚡ ENTER","Google: límite por cuenta":"Google: limit per account","Sin cuenta: por dispositivo":"No account: per device","🌐 EN VIVO":"🌐 LIVE","💬 MI CHAT":"💬 MY CHAT","EN LÍNEA":"ONLINE","SENSIS HOY":"SENSIS TODAY","VERIFICANDO...":"VERIFYING...","Validando credenciales...":"Checking credentials...","¡SESIÓN EXITOSA!":"LOGIN SUCCESSFUL!","Bienvenido,":"Welcome,","Cuenta de Google verificada ✅":"Google account verified ✅","ELIGE TU NOMBRE":"CHOOSE YOUR NAME","Será tu nombre en el chat y el ranking. Podrás cambiarlo después.":"This will be your name in the chat and ranking. You can change it later.","💾 GUARDAR NOMBRE":"💾 SAVE NAME","¡LISTO!":"ALL SET!","Mínimo 2 letras o números (sin espacios ni símbolos).":"At least 2 letters or numbers (no spaces or symbols).","Ese nombre ya está en uso, elige otro.":"That name is already taken, pick another."},
 pt:{"ENTENDIDO":"ENTENDI","Nuevo botón de notificaciones: toca la campana, arriba a la izquierda, para ver tus avisos.":"Novo botão de notificações: toque no sino, no canto superior esquerdo, para ver seus avisos.","Nuevo cuadro de notificaciones: aquí ves todo lo que has recibido y puedes borrarlo cuando quieras.":"Nova caixa de notificações: aqui você vê tudo o que recebeu e pode apagar quando quiser.","Herramienta creada por":"Ferramenta criada por","NOTIFICACIONES":"NOTIFICAÇÕES","BORRAR TODO":"LIMPAR TUDO","Sin notificaciones":"Sem notificações","ahora":"agora","MODO ALEATORIO ACTIVO":"MODO ALEATÓRIO ATIVO","Para poner un color de acento debes desactivar el modo aleatorio de colores.":"Para definir uma cor de destaque, você deve desativar o modo aleatório de cores.","DESACTIVAR Y APLICAR COLOR":"DESATIVAR E APLICAR COR","CANCELAR":"CANCELAR","🚫 QUITAR COLOR":"🚫 REMOVER COR","SIGUIENTE":"PRÓXIMO","⏱️ ¡Nueva actualización! Ya no esperas un día: ahora tus sensis se restablecen cada 5 horas.":"⏱️ Nova atualização! Você não espera mais um dia: agora suas sensis são restabelecidas a cada 5 horas.","🎟️ Los códigos también cambiaron: suben tu límite a 10 sensis cada 5 horas durante los días que dura el código.":"🎟️ Os códigos também mudaram: aumentam seu limite para 10 sensis a cada 5 horas pelos dias que o código durar.","ENTRA AL CHAT":"ENTRE NO CHAT","Elige un nombre para recibir tu sensibilidad personalizada para Free Fire":"Escolha um nome para receber sua sensibilidade personalizada de Free Fire","ENTRAR CON GOOGLE":"ENTRAR COM O GOOGLE","O ESCRIBE TU NOMBRE":"OU DIGITE SEU NOME","Tu nombre (ej: SniperX, NoobKiller...)":"Seu nome (ex: SniperX, NoobKiller...)","Google: límite por cuenta":"Google: limite por conta","Sin cuenta: por dispositivo":"Sem conta: por dispositivo","🌐 EN VIVO":"🌐 AO VIVO","💬 MI CHAT":"💬 MEU CHAT","EN LÍNEA":"ONLINE","SENSIS HOY":"SENSIS HOJE","VERIFICANDO...":"VERIFICANDO...","Validando credenciales...":"Validando credenciais...","¡SESIÓN EXITOSA!":"LOGIN CONCLUÍDO!","Bienvenido,":"Bem-vindo,","Cuenta de Google verificada ✅":"Conta Google verificada ✅","ELIGE TU NOMBRE":"ESCOLHA SEU NOME","Será tu nombre en el chat y el ranking. Podrás cambiarlo después.":"Será seu nome no chat e no ranking. Você poderá mudar depois.","💾 GUARDAR NOMBRE":"💾 SALVAR NOME","¡LISTO!":"PRONTO!","Mínimo 2 letras o números (sin espacios ni símbolos).":"Mínimo 2 letras ou números (sem espaços ou símbolos).","Ese nombre ya está en uso, elige otro.":"Esse nome já está em uso, escolha outro."},
 fr:{"ENTENDIDO":"COMPRIS","Nuevo botón de notificaciones: toca la campana, arriba a la izquierda, para ver tus avisos.":"Nouveau bouton de notifications : touche la cloche, en haut à gauche, pour voir tes alertes.","Nuevo cuadro de notificaciones: aquí ves todo lo que has recibido y puedes borrarlo cuando quieras.":"Nouvelle boîte de notifications : tu y vois tout ce que tu as reçu et tu peux l'effacer quand tu veux.","Herramienta creada por":"Outil créé par","NOTIFICACIONES":"NOTIFICATIONS","BORRAR TODO":"TOUT EFFACER","Sin notificaciones":"Aucune notification","ahora":"à l'instant","MODO ALEATORIO ACTIVO":"MODE ALÉATOIRE ACTIF","Para poner un color de acento debes desactivar el modo aleatorio de colores.":"Pour choisir une couleur d'accent, tu dois désactiver le mode couleurs aléatoires.","DESACTIVAR Y APLICAR COLOR":"DÉSACTIVER ET APPLIQUER LA COULEUR","CANCELAR":"ANNULER","🚫 QUITAR COLOR":"🚫 RETIRER LA COULEUR","SIGUIENTE":"SUIVANT","⏱️ ¡Nueva actualización! Ya no esperas un día: ahora tus sensis se restablecen cada 5 horas.":"⏱️ Nouvelle mise à jour ! Plus besoin d'attendre un jour : tes sensis se réinitialisent maintenant toutes les 5 heures.","🎟️ Los códigos también cambiaron: suben tu límite a 10 sensis cada 5 horas durante los días que dura el código.":"🎟️ Les codes ont aussi changé : ils portent ta limite à 10 sensis toutes les 5 heures pendant la durée du code.","ENTRA AL CHAT":"REJOINS LE CHAT","Elige un nombre para recibir tu sensibilidad personalizada para Free Fire":"Choisis un nom pour recevoir ta sensibilité Free Fire personnalisée","ENTRAR CON GOOGLE":"SE CONNECTER AVEC GOOGLE","O ESCRIBE TU NOMBRE":"OU ÉCRIS TON NOM","Tu nombre (ej: SniperX, NoobKiller...)":"Ton nom (ex : SniperX, NoobKiller...)","⚡ ENTRAR":"⚡ ENTRER","Google: límite por cuenta":"Google : limite par compte","Sin cuenta: por dispositivo":"Sans compte : par appareil","🌐 EN VIVO":"🌐 EN DIRECT","💬 MI CHAT":"💬 MON CHAT","EN LÍNEA":"EN LIGNE","SENSIS HOY":"SENSIS AUJOURD'HUI","VERIFICANDO...":"VÉRIFICATION...","Validando credenciales...":"Validation des identifiants...","¡SESIÓN EXITOSA!":"CONNEXION RÉUSSIE !","Bienvenido,":"Bienvenue,","Cuenta de Google verificada ✅":"Compte Google vérifié ✅","ELIGE TU NOMBRE":"CHOISIS TON NOM","Será tu nombre en el chat y el ranking. Podrás cambiarlo después.":"Ce sera ton nom dans le chat et le classement. Tu pourras le changer plus tard.","💾 GUARDAR NOMBRE":"💾 ENREGISTRER LE NOM","¡LISTO!":"C'EST PRÊT !","Mínimo 2 letras o números (sin espacios ni símbolos).":"Minimum 2 lettres ou chiffres (sans espaces ni symboles).","Ese nombre ya está en uso, elige otro.":"Ce nom est déjà pris, choisis-en un autre."}
};
const _LANG=(((()=>{try{return localStorage.getItem("sg_lang");}catch(e){return null;}})()||(navigator.languages&&navigator.languages[0])||navigator.language||"es")+"").slice(0,2).toLowerCase();
const _D=_I18N[_LANG],_K=_D?Object.keys(_D).sort((a,b)=>b.length-a.length):[];
function _trStr(t){ for(const k of _K){ if(t.includes(k)) t=t.split(k).join(_D[k]); } return t; }
function _trTree(r){
  if(!_D) return;
  if(r.nodeType===3){ const v=_trStr(r.nodeValue); if(v!==r.nodeValue) r.nodeValue=v; return; }
  if(r.nodeType!==1||/^(SCRIPT|STYLE)$/.test(r.tagName)) return;
  const w=document.createTreeWalker(r,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT); let n=r;
  do{
    if(n.nodeType===3){ if(!/^(SCRIPT|STYLE)$/.test(n.parentNode.tagName)){ const v=_trStr(n.nodeValue); if(v!==n.nodeValue) n.nodeValue=v; } }
    else if(n.placeholder){ const v=_trStr(n.placeholder); if(v!==n.placeholder) n.placeholder=v; }
  }while(n=w.nextNode());
}
if(_D){
  document.documentElement.lang=_LANG; _trTree(document.body);
  new MutationObserver(ms=>{ for(const m of ms){ if(m.type==="characterData") _trTree(m.target); else m.addedNodes.forEach(_trTree); } }).observe(document.body,{childList:true,subtree:true,characterData:true});
}
function _ptWash(x,y,c){
  if(matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  const d=document.createElement("div");
  d.style.cssText="position:fixed;left:"+(x-60)+"px;top:"+(y-60)+"px;width:120px;height:120px;border-radius:50%;background:"+c+";pointer-events:none;z-index:9999;will-change:transform,opacity";
  document.body.appendChild(d);
  d.animate([{transform:"scale(0)",opacity:.45},{transform:"scale("+(Math.max(innerWidth,innerHeight)/50)+")",opacity:0}],{duration:800,easing:"cubic-bezier(.16,1,.3,1)"}).onfinish=()=>d.remove();
}
document.getElementById("applyPersonaBtn")?.addEventListener("click",e=>{
  const sel=document.querySelector("#personaGrid .topt.sel"); if(!sel) return;
  _ptWash(e.clientX,e.clientY,getComputedStyle(sel).getPropertyValue("--pc").trim()||"#3DFF8F");
  sel.animate([{transform:"scale(1)"},{transform:"scale(1.14)"},{transform:"scale(1)"}],{duration:520,easing:"cubic-bezier(.34,1.56,.64,1)"});
});
document.getElementById("disablePersonaBtn")?.addEventListener("click",e=>_ptWash(e.clientX,e.clientY,"#ffffff"));
function _rcWarn(onOk){
  if(document.getElementById("rcWarn")) return;
  const ov=document.createElement("div"); ov.id="rcWarn";
  ov.innerHTML='<div id="rcWarnCard"><div class="rw-i">🎨</div><h3>MODO ALEATORIO ACTIVO</h3><p>Para poner un color de acento debes desactivar el modo aleatorio de colores.</p><button class="btn-main" id="rwOk">DESACTIVAR Y APLICAR COLOR</button><button id="rwNo">CANCELAR</button></div>';
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),300); };
  ov.onclick=e=>{ if(e.target===ov||e.target.id==="rwNo") close(); else if(e.target.id==="rwOk"){ close(); onOk(); } };
  document.body.appendChild(ov); _trTree(ov);
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.classList.add("on")));
}
// ── NOTIFICACIONES: aviso de 5 s con X + centro de notificaciones (guarda hasta 100) ──
var _notifs=[]; try{ _notifs=JSON.parse(localStorage.getItem("sg_notifs")||"[]"); }catch(e){}
const _sv=(p,z)=>'<svg viewBox="0 0 24 24" width="'+(z||18)+'" height="'+(z||18)+'" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';
const _NP={ok:'<path d="M20 6 9 17l-5-5"/>',err:'<path d="M18 6 6 18M6 6l12 12"/>',warn:'<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'};
const _BELL='<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';
function _nSave(){ try{ localStorage.setItem("sg_notifs",JSON.stringify(_notifs.slice(0,100).map(({t,y,ts,r})=>({t,y,ts,r})))); }catch(e){} }
function _nBadge(){ const n=_notifs.filter(x=>!x.r).length,b=document.getElementById("notifBadge"); if(!b) return; b.textContent=n>9?"9+":n; b.style.display=n?"flex":"none"; }
function _nAgo(ts){ const s=(Date.now()-ts)/1000; return s<60?"ahora":s<3600?Math.floor(s/60)+" min":s<86400?Math.floor(s/3600)+" h":Math.floor(s/86400)+" d"; }
function _nRender(){
  const L=document.getElementById("nList"); if(!L) return;
  L.innerHTML=_notifs.length?"":'<div class="n-empty">'+_sv(_BELL,34)+'<span>Sin notificaciones</span></div>';
  _notifs.forEach(n=>{
    const r=document.createElement("div"); r.className="n-it "+n.y+(n._new?" new":"");
    r.innerHTML='<span class="ti">'+_sv(_NP[n.y],16)+'</span><div class="nb"><div class="tx"></div><small></small></div>';
    r.querySelector(".tx").textContent=n.t; r.querySelector("small").textContent=_nAgo(n.ts); L.appendChild(r);
  });
  _trTree(L);
}
function notify(text){
  const y=/^(✅|🎉)/.test(text)?"ok":/^(❌|⛔)/.test(text)?"err":/^(⚠️|⏳)/.test(text)?"warn":"info";
  const t=String(text).replace(/^(✅|🎉|❌|⛔|⚠️|⏳|ℹ️)\s*/,"");
  const open=!!document.getElementById("notifOv");
  _notifs.unshift({t,y,ts:Date.now(),r:open?1:0,_new:open}); _notifs=_notifs.slice(0,100); _nSave(); _nBadge(); if(open) _nRender();
  let box=document.getElementById("toastBox"); if(!box){ box=document.createElement("div"); box.id="toastBox"; document.body.appendChild(box); }
  while(box.children.length>=3) box.lastChild.remove();
  const el=document.createElement("div"); el.className="toast "+y;
  el.innerHTML='<span class="ti">'+_sv(_NP[y],18)+'</span><div class="tx"></div><button class="tx-x" aria-label="Cerrar">'+_sv(_NP.err,14)+'</button><i class="tbar"></i>';
  el.querySelector(".tx").textContent=t; box.prepend(el); _trTree(el);
  const close=()=>{ if(el._c) return; el._c=1; el.classList.add("out"); setTimeout(()=>el.remove(),280); };
  el.querySelector(".tx-x").onclick=close; setTimeout(close,5000);
}
function _nOpen(){
  if(document.getElementById("notifOv")) return;
  _notifs.forEach(n=>{ n._new=!n.r; n.r=1; }); _nSave(); _nBadge();
  const ov=document.createElement("div"); ov.id="notifOv";
  ov.innerHTML='<div id="notifCard"><div class="n-h"><b>NOTIFICACIONES</b><span><button id="nClear">BORRAR TODO</button><button id="nX" aria-label="Cerrar">'+_sv(_NP.err,16)+'</button></span></div><div id="nList"></div></div>';
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>{ ov.remove(); _notifs.forEach(n=>delete n._new); },260); };
  ov.onclick=e=>{ if(e.target===ov||e.target.closest("#nX")) close(); else if(e.target.id==="nClear"){ _notifs=[]; _nSave(); _nBadge(); _nRender(); } };
  document.body.appendChild(ov); _nRender(); _trTree(ov);
  requestAnimationFrame(()=>requestAnimationFrame(()=>ov.classList.add("on")));
}
document.getElementById("notifBtn")?.addEventListener("click",_nOpen); _nBadge();
function _lgRun(fn){
  const sc=document.getElementById("loginScreen"),b=document.getElementById("loginBtn"),h=sc.querySelector("h2"),p=sc.querySelector("p"),th=h.textContent,tp=p.textContent;
  if(b.disabled) return;
  window._lgT0=Date.now(); b.disabled=true; sc.classList.add("busy");
  h.textContent="VERIFICANDO..."; p.textContent="Validando credenciales...";
  return Promise.resolve(fn()).finally(()=>{ sc.classList.remove("busy","ok","naming"); b.disabled=false; h.textContent=th; p.textContent=tp; });
}
function _lgAskName(def){
  const sc=document.getElementById("loginScreen"),inp=document.getElementById("lgName"),btn=document.getElementById("lgNameBtn"),err=document.getElementById("lgNameErr"),h=sc.querySelector("h2"),p=sc.querySelector("p"),wait=ms=>new Promise(r=>setTimeout(r,ms));
  return new Promise(async res=>{
    await wait(Math.max(0,1400-(Date.now()-(window._lgT0||0))));
    sc.classList.remove("busy"); sc.classList.add("ok"); h.textContent="¡SESIÓN EXITOSA!"; p.textContent="Cuenta de Google verificada ✅";
    await wait(1500);
    h.textContent="ELIGE TU NOMBRE"; p.textContent="Será tu nombre en el chat y el ranking. Podrás cambiarlo después.";
    inp.value=def; sc.classList.add("naming"); setTimeout(()=>inp.focus(),300);
    const go=async()=>{
      const v=inp.value.trim().replace(/[^a-zA-Z0-9_\-]/g,"").slice(0,20);
      if(v.length<2){ err.textContent="Mínimo 2 letras o números (sin espacios ni símbolos)."; return; }
      btn.disabled=true;
      try{ const sn=await getDoc(doc(db,_C.u(),v)); if(sn.exists()&&sn.data().uid&&sn.data().uid!==auth.currentUser.uid){ err.textContent="Ese nombre ya está en uso, elige otro."; btn.disabled=false; return; } }catch(e){}
      sc.classList.remove("naming"); h.textContent="¡LISTO!"; p.textContent="Bienvenido, "+v+" 🎮"; await wait(1200); res(v);
    };
    btn.onclick=go; inp.onkeydown=e=>{ if(e.key==="Enter") go(); };
  });
}
// Espera a que termine la verificación, muestra "Sesión exitosa" y recién entonces deja pasar al chat
async function _lgSuccess(nick){
  const sc=document.getElementById("loginScreen");
  if(!sc.classList.contains("show")||!sc.classList.contains("busy")) return;
  await new Promise(r=>setTimeout(r,Math.max(0,1400-(Date.now()-(window._lgT0||0)))));
  sc.classList.remove("busy"); sc.classList.add("ok");
  sc.querySelector("h2").textContent="¡SESIÓN EXITOSA!";
  sc.querySelector("p").textContent="Bienvenido, "+nick+" 🎮";
  await new Promise(r=>setTimeout(r,1800));
}
document.querySelectorAll("#loginScreen>*:not(.login-logo)").forEach((e,i)=>e.style.animationDelay=(.12+i*.07)+"s");
document.querySelectorAll("#menuModal .menu-item").forEach((e,i)=>e.style.animationDelay=(.06+i*.05)+"s");
document.addEventListener("pointerdown",e=>{
  const b=e.target.closest(".btn-main,.btn-google,.menu-item,#applyPersonaBtn,#disablePersonaBtn"); if(!b) return;
  const r=b.getBoundingClientRect(),z=Math.max(r.width,r.height)*2,d=document.createElement("span");
  d.className="rip"; d.style.cssText="width:"+z+"px;height:"+z+"px;left:"+(e.clientX-r.left-z/2)+"px;top:"+(e.clientY-r.top-z/2)+"px";
  b.appendChild(d); setTimeout(()=>d.remove(),600);
},{passive:true});
document.getElementById("loginBtn").addEventListener("click",()=>_lgRun(()=>entrar(null)));
document.getElementById("nickIn").addEventListener("keydown",e=>{ if(e.key==="Enter")_lgRun(()=>entrar(null)); });
document.getElementById("sendBtn").addEventListener("click",handleSend);
document.getElementById("msgInput").addEventListener("keydown",e=>{ if(e.key==="Enter")handleSend(); });
document.getElementById("feedSendBtn").addEventListener("click",handleFeedSend);
document.getElementById("feedInput").addEventListener("keydown",e=>{ if(e.key==="Enter")handleFeedSend(); });
document.getElementById("tFeed").addEventListener("click",()=>switchTab("feed"));
document.getElementById("tMio").addEventListener("click",()=>switchTab("mio"));
// ── SWIPE horizontal para cambiar de pestaña (feed <-> mi chat) ──────────
// Deslizar hacia la izquierda = ir al feed ("EN VIVO"); hacia la derecha =
// volver a "Mi Chat". Usa touchstart/touchend pasivos (no bloquea el
// scroll vertical normal de las listas) y exige que el gesto sea rápido y
// predominantemente horizontal, para no confundirlo con un scroll normal.
(function(){
  const chatScreen=document.getElementById("chatScreen");
  if(!chatScreen) return;
  let sx=0, sy=0, st=0, tracking=false;
  chatScreen.addEventListener("touchstart",e=>{
    if(e.touches.length!==1) return;
    sx=e.touches[0].clientX; sy=e.touches[0].clientY; st=Date.now(); tracking=true;
  },{passive:true});
  chatScreen.addEventListener("touchend",e=>{
    if(!tracking) return;
    tracking=false;
    const t=e.changedTouches[0];
    const dx=t.clientX-sx, dy=t.clientY-sy, dt=Date.now()-st;
    if(dt>600) return; // gesto lento -> probablemente scroll, no swipe
    if(Math.abs(dx)<70 || Math.abs(dx)<Math.abs(dy)*1.4) return; // no fue predominantemente horizontal
    const isFeedActive=document.getElementById("tFeed").classList.contains("active");
    if(dx<0 && !isFeedActive) switchTab("feed");
    else if(dx>0 && isFeedActive) switchTab("mio");
  },{passive:true});
})();

// Único camino de auto-login (Google o no): se ejecuta UNA sola vez, cuando
// Firebase ya resolvió si hay sesión de Google activa. Así se evita la
// condición de carrera que antes podía hacer que, tras cambiar de nombre,
// la app te reingresara con el nombre viejo por timing de red.
let _autoLoginStarted=false;
onAuthStateChanged(auth, async _u=>{
  const user=(_u&&!_u.isAnonymous)?_u:null; // la sesión anónima NO cuenta como Google
  googleUser=user;
  if(_alreadyEntered()) return;
  if(_autoLoginStarted) return;
  _autoLoginStarted=true;
  const _tryLogin=async(retry)=>{
    // Siempre se lee el nombre guardado MÁS RECIENTE justo antes de usarlo
    const freshNick=localStorage.getItem(_xd("ODEsODQ=",0x36));
    if(freshNick){
      document.getElementById("nickIn").value=freshNick;
      try{
        await entrar(user?user.uid:null);
        if(!_alreadyEntered()){
          if(retry<2){ setTimeout(()=>_tryLogin(retry+1), 500); }
          else{ _fallbackToLogin(); }
        }
      }catch(e){
        console.error("Auto-login falló:",e);
        if(retry<2){ setTimeout(()=>_tryLogin(retry+1), 500); }
        else{ _fallbackToLogin(); }
      }
    } else if(user){
      // Sesión de Google activa pero sin nombre guardado localmente (p.ej. tras
      // cerrar sesión). Antes de recurrir al nombre original de Google, buscamos
      // si ya existe un documento de usuario con este UID: si el usuario se
      // renombró anteriormente, ese documento tiene el nombre ACTUALIZADO y es
      // el que hay que usar, no el nombre viejo de Google.
      let recoveredNick=null;
      try{ recoveredNick=await _resolveCurrentNickByUid(user.uid); }catch(e){ /* si falla, seguimos con el fallback de abajo */ }
      const displayN=user.displayName||user.email.split("@")[0]||"Player";
      const cleanN=displayN.replace(/[^a-zA-Z0-9_\-]/g,"").slice(0,20);
      document.getElementById("nickIn").value=recoveredNick||cleanN||"";
      if(recoveredNick){
        localStorage.setItem(_xd("ODEsODQ=",0x36),recoveredNick);
        try{ await entrar(user.uid); }catch(e){}
        if(_alreadyEntered()) return;
      }
      _fallbackToLogin();
    } else {
      _fallbackToLogin();
    }
  };
  _tryLogin(0);
});

// Auto check fingerprint ban on load
checkFingerprintBan().catch(()=>{});

// ── BANDEJA DE CORREO ────────────────────────────────────────────────────
document.getElementById("inboxBtn").addEventListener("click",()=>{
  document.getElementById("inboxScreen").classList.add("show");
  _loadInbox();
});
document.getElementById("inboxClose").addEventListener("click",()=>{
  document.getElementById("inboxScreen").classList.remove("show");
});

// Listener delegado para bandeja: RECLAMAR recompensa (creadores y usuarios normales)
document.getElementById("inboxList").addEventListener("click",async e=>{
  // RECLAMAR
  const claimBtn=e.target.closest(".claim-btn");
  if(claimBtn){
    const docId=claimBtn.dataset.docid;
    const newLimit=parseInt(claimBtn.dataset.limit);
    if(!docId||!newLimit) return;
    claimBtn.disabled=true; claimBtn.textContent="⏳ Reclamando...";
    const nick=localStorage.getItem(_xd("ODEsODQ=",0x36));
    try{
      // Un solo lote: las reglas comprueban que el límite sea el del doc que creó el admin
      const _cb=writeBatch(db);
      _cb.update(doc(db,_C.u(),nick),{maxOverride:newLimit,lastClaimId:docId});
      _cb.update(doc(db,"inbox",docId),{claimed:true,read:true});
      await _cb.commit();
      claimBtn.textContent="✅ ¡Reclamado! "+newLimit+" sensis/5h";
      claimBtn.style.color="#3DFF8F";
      addMsg("bot","🎁 ¡Recompensa reclamada! Tu nuevo límite es "+newLimit+" sensis/5h.");
    }catch(err){
      claimBtn.disabled=false; claimBtn.textContent="🎁 RECLAMAR";
    }
    return;
  }
});

// Listener delegado para bandeja (entregar reto)
document.getElementById("inboxList").addEventListener("click",async e=>{
  const btn=e.target.closest(".deliver-btn");
  if(!btn) return;
  const docId=btn.dataset.docid;
  const input=btn.parentElement.querySelector(".deliver-input");
  const link=input?input.value.trim():"";
  if(!link){ alert("Pega el link de tu video completado."); return; }
  try{ new URL(link); }catch(e){ alert("El link no es válido. Debe empezar con https://"); return; }
  btn.disabled=true; btn.textContent="⏳ Enviando...";
  try{
    await setDoc(doc(db,"inbox",docId),{linkCompleted:link,read:true},{merge:true});
    btn.textContent="✅ ¡Enviado! El admin revisará tu video.";
    btn.style.color="#3DFF8F";
    btn.style.borderColor="rgba(61,255,143,0.4)";
  }catch(err){
    btn.disabled=false; btn.textContent="📤 ENTREGAR RETO";
    alert("Error al enviar. Intenta de nuevo.");
  }
});

let _unsubInbox=null;
function _loadInbox(){
  const nick=(localStorage.getItem(_xd("ODEsODQ=",0x36))||"").trim();
  if(!nick) return;
  if(_unsubInbox){ _unsubInbox(); _unsubInbox=null; }
  const list=document.getElementById("inboxList");
  _unsubInbox=onSnapshot(
    query(collection(db,"inbox"),where("to","==",nick),orderBy("ts","desc"),limit(30)),
    snap=>{
      if(!list) return;
      // Contar no leídos
      const unread=snap.docs.filter(d=>!d.data().read).length;
      const badge=document.getElementById("inboxUnreadBadge");
      const dot=document.getElementById("inboxDot");
      if(badge){ badge.textContent=unread; badge.style.display=unread>0?"inline":"none"; }
      if(dot) dot.style.display=unread>0?"block":"none";

      list.innerHTML="";
      if(snap.empty){
        list.innerHTML="<div style='font-size:12px;color:rgba(160,215,255,0.3);text-align:center;padding:30px;'>📭 Sin mensajes aún</div>";
        return;
      }
      snap.docs.forEach(d=>{
        const msg=d.data();
        const ts=msg.ts?.toDate?msg.ts.toDate():new Date();
        const timeStr=ts.toLocaleDateString([],{day:"2-digit",month:"2-digit"})+" "+ts.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
        const isReto    = msg.type==="challenge";
        const isReward  = msg.type==="reward";
        const canDeliver  = isReto && !msg.linkCompleted;
        const didDeliver  = isReto && msg.linkCompleted;
        const canClaim    = isReward && msg.newLimit && !msg.claimed;
        const didClaim    = isReward && msg.newLimit && msg.claimed;
        const labelColor  = isReward?"#3DFF8F":isReto?"#FFC800":"#38BEFF";
        const labelIconHtml = isReward?"<img src='"+CREDITS_ICON_IMG+"' style='width:14px;height:14px;vertical-align:-2px;margin-right:4px;'/>":"";
        const labelText   = isReward?"RECOMPENSA":isReto?"🏆 RETO":"📩 ADMIN";
        const card=document.createElement("div");
        card.style.cssText="padding:12px;border-radius:16px;border:1px solid rgba(var(--ac-rgb),"+(msg.read?"0.1":"0.25")+");background:rgba(var(--ac-rgb),"+(msg.read?"0.03":"0.06")+");cursor:pointer;";
        card.innerHTML="<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;'>"
          +"<span style='font-size:10px;font-weight:900;letter-spacing:1px;color:"+labelColor+"'>"+labelIconHtml+labelText+"</span>"
          +"<span style='font-size:9px;color:rgba(160,215,255,0.3);'>"+timeStr+"</span>"
          +"</div>"
          +"<div style='font-size:12px;color:rgba(160,215,255,0.8);line-height:1.7;white-space:pre-wrap;'>"+msg.msg+"</div>"
          +(isReto&&msg.linkRequired?"<div style='margin-top:8px;padding:10px;background:rgba(var(--ac-rgb),0.06);border:1px solid rgba(var(--ac-rgb),0.15);border-radius:11px;font-size:11px;color:rgba(160,215,255,0.7);line-height:1.7;white-space:pre-wrap;'>📋 <b>Instrucciones:</b>\n"+msg.linkRequired+"</div>":"")
          +(canDeliver
            ?"<div style='margin-top:10px;'><input data-docid='"+d.id+"' class='deliver-input inp' placeholder='Pega el link de tu video completado...' style='font-size:11px;margin-bottom:6px;'/>"
             +"<button data-docid='"+d.id+"' class='deliver-btn' style='width:100%;padding:9px;background:rgba(var(--ac-rgb),0.12);border:1px solid rgba(var(--ac-rgb),0.3);border-radius:14px;color:var(--ac);font-size:11px;font-weight:900;letter-spacing:1px;cursor:pointer;'>📤 ENTREGAR RETO</button></div>"
            :"")
          +(didDeliver?"<div style='margin-top:8px;font-size:10px;color:rgba(var(--ac-rgb),0.6);'>📤 Entregado · esperando recompensa</div>":"")
          +(isReward&&msg.reward?"<div style='margin-top:8px;font-size:11px;color:#FFC800;font-weight:700;'><img src='"+CREDITS_ICON_IMG+"' style='width:13px;height:13px;vertical-align:-2px;margin-right:4px;'/>"+msg.reward+"</div>":"")
          +(canClaim
            ?"<button data-docid='"+d.id+"' data-limit='"+msg.newLimit+"' class='claim-btn' style='margin-top:10px;width:100%;padding:10px;background:linear-gradient(135deg,rgba(61,255,143,0.15),rgba(0,200,100,0.08));border:1px solid rgba(61,255,143,0.35);border-radius:14px;color:#3DFF8F;font-size:11px;font-weight:900;letter-spacing:1px;cursor:pointer;'><img src='"+CREDITS_ICON_IMG+"' style='width:13px;height:13px;vertical-align:-2px;margin-right:4px;filter:brightness(0) saturate(100%) invert(70%) sepia(60%) saturate(500%) hue-rotate(80deg);'/>RECLAMAR +"+msg.newLimit+" sensis/5h</button>"
            :"")
          +(didClaim?"<div style='margin-top:8px;font-size:10px;color:rgba(61,255,143,0.6);'>✅ Reclamado · "+msg.newLimit+" sensis/5h activos</div>":"")
          +(!msg.read?"<div style='margin-top:6px;width:8px;height:8px;background:var(--ac);border-radius:50%;'></div>":"");
        // Marcar como leído al tocar la card
        card.addEventListener("click",e=>{
          if(e.target.classList.contains("claim-btn")) return; // no marcar al reclamar
          if(!msg.read) setDoc(doc(db,"inbox",d.id),{read:true},{merge:true}).catch(()=>{});
        });
        list.appendChild(card);
      });
      // Marcar todos como leídos si la bandeja está abierta
      snap.docs.filter(d=>!d.data().read).forEach(d=>{
        setDoc(doc(db,"inbox",d.id),{read:true},{merge:true}).catch(()=>{});
      });
    },
    err=>{
      // Antes este listener no tenía callback de error: si Firestore
      // fallaba (por ejemplo por un índice compuesto "to + orderBy(ts)" no
      // creado o caído) el onSnapshot moría en silencio y la bandeja se
      // quedaba vacía para siempre sin ningún aviso — así se sentían
      // recompensas que "nunca llegaban". Ahora al menos se ve el error y
      // se reintenta una vez sin recargar toda la página.
      console.error("Error cargando bandeja:",err);
      if(list) list.innerHTML="<div style='font-size:12px;color:#FF5566;text-align:center;padding:30px;'>⚠️ No se pudo cargar tu bandeja. Reintentando...</div>";
      if(_unsubInbox){ _unsubInbox(); _unsubInbox=null; }
      setTimeout(_loadInbox,2500);
    }
  );
}

// Cargar bandeja al iniciar sesión para mostrar punto rojo si hay no leídos
function _startInboxDot(){
  const nick=localStorage.getItem(_xd("ODEsODQ=",0x36));
  if(!nick) return;
  onSnapshot(
    query(collection(db,"inbox"),where("to","==",nick),where("read","==",false),limit(10)),
    snap=>{
      const dot=document.getElementById("inboxDot");
      const menuDot=document.getElementById("menuDot");
      if(dot) dot.style.display=snap.size>0?"block":"none";
      if(menuDot) menuDot.style.display=snap.size>0?"block":"none";
    }
  );
}

// ── PRESENCIA: marcar offline al cerrar/salir de la página ──────────────
window.addEventListener("beforeunload",()=>{
  const nick=localStorage.getItem(_xd("ODEsODQ=",0x36));
  if(nick) setDoc(doc(db,_C.u(),nick),{online:false,lastSeen:serverTimestamp()},{merge:true}).catch(()=>{});
});
// Marcar online al volver (foco en la pestaña)
document.addEventListener("visibilitychange",()=>{
  const nick=localStorage.getItem(_xd("ODEsODQ=",0x36));
  if(!nick) return;
  if(document.hidden){
    setDoc(doc(db,_C.u(),nick),{online:false,lastSeen:serverTimestamp()},{merge:true}).catch(()=>{});
  } else {
    setDoc(doc(db,_C.u(),nick),{online:true,lastSeen:serverTimestamp()},{merge:true}).catch(()=>{});
  }
});

// ── PROGRAMA CREADORES: JS completo ─────────────────────────────────────
let _selectedPlat=null;

function _openCreatorScreen(){
  document.getElementById("creatorScreen").classList.add("show");
  _loadCreatorStatus();
}
// Botón del header
document.getElementById("creatorBtn").addEventListener("click",_openCreatorScreen);
// Botón desde ajustes
document.getElementById("openCreatorFromCfg").addEventListener("click",()=>{
  document.getElementById("cfgModal").classList.remove("show");
  _openCreatorScreen();
});
// Cerrar pantalla
document.getElementById("creatorClose").addEventListener("click",()=>{
  document.getElementById("creatorScreen").classList.remove("show");
});

// Seleccionar plataforma
window.selectPlat=function(plat){
  _selectedPlat=plat;
  const map={tiktok:"platTT",youtube:"platYT",ambos:"platAM"};
  ["platTT","platYT","platAM"].forEach(id=>{
    const b=document.getElementById(id);
    b.style.background="rgba(0,0,0,0.3)";
    b.style.borderColor="rgba(var(--ac-rgb),0.15)";
    b.style.color="rgba(160,215,255,0.5)";
  });
  const sel=document.getElementById(map[plat]);
  sel.style.background="rgba(var(--ac-rgb),0.15)";
  sel.style.borderColor="rgba(var(--ac-rgb),0.5)";
  sel.style.color="var(--ac)";
};

// Preview foto de perfil
document.getElementById("photoFile").addEventListener("change",function(){
  const label=document.getElementById("photoLabel");
  const box=document.getElementById("photoBox");
  if(this.files[0]){ label.textContent="✅ "+this.files[0].name; box.classList.add("has-file"); }
});

// Cargar estado solicitud del usuario
let _unsubCreatorStatus=null;
function _loadCreatorStatus(){
  const nick=localStorage.getItem(_xd("ODEsODQ=",0x36));
  if(!nick) return;
  const uid=localStorage.getItem("sg_uid");
  // Cancelar listener anterior si existe
  if(_unsubCreatorStatus){ _unsubCreatorStatus(); _unsubCreatorStatus=null; }
  const _renderCreatorStatus=snap=>{
    const statusCard=document.getElementById("creatorStatusCard");
    const formContent=document.getElementById("creatorFormContent");
    const cfgStatus=document.getElementById("cfgCreatorStatus");
    const cfgBtnReq=document.getElementById("openCreatorFromCfg");
    const headerCreatorBtn=document.getElementById("creatorBtn");
    if(!statusCard) return;
    if(!snap.exists()){
      statusCard.style.display="none";
      formContent.style.display="block";
      if(cfgStatus) cfgStatus.textContent="Sin solicitud aún";
      if(cfgBtnReq) cfgBtnReq.style.display="";
      return;
    }
    const d=snap.data();
    const map={
      pending: {label:"⏳ PENDIENTE",  cls:"pending",  msg:"El admin está revisando tu solicitud. Te avisaremos pronto."},
      approved:{label:"✅ CREADOR VERIFICADO", cls:"approved", msg:"¡Felicidades! Eres parte del programa. Tus beneficios ya están activos. 🎉"},
      rejected:{label:"❌ RECHAZADO",   cls:"rejected", msg:"Tu solicitud fue rechazada."+(d.rejectReason?" Motivo: "+d.rejectReason:"")+" Puedes volver a intentarlo."},
      expelled:{label:"🚫 EXPULSADO",   cls:"rejected", msg:"Fuiste expulsado del programa."+(d.expelReason?" Motivo: "+d.expelReason:"")}
    };
    const st=map[d.status]||map.pending;
    statusCard.style.display="block";
    statusCard.innerHTML=`<div style='background:color-mix(in srgb, var(--ac) 15%, #04070f);border-radius:16px;padding:14px;margin-bottom:12px;'><span class='creator-badge ${st.cls}'>${st.label}</span><div style='font-size:12px;color:rgba(160,215,255,0.6);margin-top:8px;line-height:1.6;'>${st.msg}</div></div>`;
    formContent.style.display=(d.status==="rejected"||d.status==="expelled"?"block":"none");
    if(d.status==="approved"){
      // Ya es creador: ocultamos el botón de solicitud y el icono del header,
      // y mostramos un mensaje fijo de "Creador Verificado".
      if(cfgStatus) cfgStatus.innerHTML="<img src='"+CREATOR_BADGE_IMG+"' style='width:22px;height:22px;object-fit:contain;vertical-align:middle;margin-right:5px;'/>✅ Creador Verificado";
      if(cfgBtnReq) cfgBtnReq.style.display="none";
      if(headerCreatorBtn) headerCreatorBtn.style.display="none";
    } else {
      if(cfgStatus) cfgStatus.textContent=st.label;
      if(cfgBtnReq) cfgBtnReq.style.display="";
      if(headerCreatorBtn) headerCreatorBtn.style.display="";
    }
  };
  // Escuchar primero por UID (forma correcta/permanente)
  if(uid){
    _unsubCreatorStatus=onSnapshot(doc(db,"creators",uid),snap=>{
      if(snap.exists()){ _renderCreatorStatus(snap); }
      else{
        // Fallback: solicitud antigua guardada por nombre (antes de este arreglo)
        onSnapshot(doc(db,"creators",nick),snap2=>_renderCreatorStatus(snap2));
      }
    });
  } else {
    _unsubCreatorStatus=onSnapshot(doc(db,"creators",nick),snap=>_renderCreatorStatus(snap));
  }
}
_loadCreatorStatus();

// Enviar solicitud
document.getElementById("creatorSubmitBtn").addEventListener("click",async()=>{
  const nick=localStorage.getItem(_xd("ODEsODQ=",0x36));
  if(!nick){ alert("Inicia sesión primero."); return; }
  if(!_selectedPlat){ alert("Selecciona una plataforma."); return; }
  const url=document.getElementById("creatorChannelUrl").value.trim();
  if(!url){ alert("Ingresa el link de tu canal."); return; }
  const photo=document.getElementById("photoFile").files[0];
  const vid1Link=document.getElementById("vid1Link").value.trim();
  const vid2Link=document.getElementById("vid2Link").value.trim();
  if(!photo){ alert("Debes subir tu foto de perfil para verificar que la cuenta es tuya."); return; }
  if(!vid1Link||!vid2Link){ alert("Debes poner los links de los 2 videos de Free Fire."); return; }
  if(photo.size>8*1024*1024){ alert("La foto no puede superar 8MB."); return; }
  // Validar que sean links válidos
  try{ new URL(vid1Link); new URL(vid2Link); } catch(e){ alert("Los links no son válidos. Verifica que empiecen con https://"); return; }

  const btn=document.getElementById("creatorSubmitBtn");
  const prog=document.getElementById("creatorUploadProgress");
  btn.disabled=true;
  btn.innerHTML='<span class="loading-spinner"></span> ⏳ ENVIANDO SOLICITUD...';
  prog.style.display="block"; prog.style.color="rgba(var(--ac-rgb),0.7)";
  prog.textContent="Preparando archivos...";

  // Firestore limita cada documento a 1MB. Una foto subida "tal cual" en
  // base64 casi siempre supera ese límite y el guardado falla en silencio
  // (mensaje engañoso de "revisa tu conexión"). Por eso, igual que con el
  // avatar/banner de perfil, la comprimimos a un ancho razonable antes de
  // convertirla a base64: sigue siendo perfectamente legible para que el
  // admin verifique la identidad, pero pesa una fracción del original.
  const toCompressedB64=file=>new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>{
      const img=new Image();
      img.onload=()=>{ try{ res(_compressImage(img,1000,0.82)); }catch(e){ rej(e); } };
      img.onerror=()=>rej(new Error("La imagen está dañada."));
      img.src=r.result;
    };
    r.onerror=rej;
    r.readAsDataURL(file);
  });
  try{
    prog.textContent="📷 Procesando foto de perfil...";
    document.getElementById("sendingHint") && (document.getElementById("sendingHint").textContent="Esto solo toma unos segundos...");
    let photoB64=await toCompressedB64(photo);
    // Si aun comprimida sigue pesada (foto de resolución muy alta), la
    // recomprimimos una vez más a menor tamaño/calidad en lugar de dejar
    // que falle directo contra el límite de 1MB de Firestore.
    if(photoB64.length>700000){
      const img2=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=photoB64; });
      photoB64=_compressImage(img2,650,0.7);
    }
    prog.textContent="📤 Guardando en Firebase...";
    const _creatorUID=auth.currentUser.uid;
    await setDoc(doc(db,"creators",_creatorUID||nick),{
      nickname:nick, plataforma:_selectedPlat, channelUrl:url,
      photo:photoB64, video1:vid1Link, video2:vid2Link,
      uid:_creatorUID||null,
      status:"pending", ts:serverTimestamp()
    });
    prog.textContent="✅ ¡Solicitud enviada exitosamente! El admin la revisará pronto.";
    prog.style.color="#3DFF8F";
    prog.style.animation="none";
    btn.innerHTML="✅ SOLICITUD ENVIADA";
    document.getElementById("sendingHint") && (document.getElementById("sendingHint").textContent="Recibirás un mensaje cuando el admin revise tu solicitud.");
    setTimeout(_loadCreatorStatus,1200);
  }catch(e){
    prog.textContent="❌ Error al enviar. Revisa tu conexión e intenta de nuevo.";
    prog.style.color="#FF5566";
    prog.style.animation="none";
    btn.disabled=false; btn.innerHTML="🚀 ENVIAR SOLICITUD AL ADMIN";
  }
});

// Fix #2: bloquear clic derecho e inspeccionar SOLO en computadoras (no afecta a móviles)
if(!/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){
  document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("keydown", e => {
    const k = e.key ? e.key.toUpperCase() : "";
    if(k === "F12" ||
       (e.ctrlKey && e.shiftKey && ["I","J","C"].includes(k)) ||
       (e.ctrlKey && k === "U")){
      e.preventDefault();
    }
  });
}
