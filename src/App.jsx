import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── THEME ───────────────────────────────────────────────────
const C = {
  bg:"#08080e", surface:"#111118", card:"#181820", border:"#252535",
  accent:"#ff4d6d", aS:"rgba(255,77,109,.15)", aG:"rgba(255,77,109,.4)",
  gold:"#f5c842", gS:"rgba(245,200,66,.12)",
  text:"#eeeef8", muted:"#6868a0", green:"#3ddc84",
  purple:"#7b2fff", blue:"#4d9fff", teal:"#2dd4bf", orange:"#ff8c42",
};

// ─── TIERS ───────────────────────────────────────────────────
// radius in km, ds = daily shares, cl = char limit, maxDur = max post duration in hours
// burstMins = minimum minutes between posts (burst protection)
const TIERS = [
  { id:"free",      name:"Free",       price:"$0",     pn:"forever", r:1,       rl:"1 km",        scope:"Block",        scopeDesc:"Your immediate surroundings",  ds:5,    cl:150,  maxDur:24,    burstMins:15, color:"#6868a0", cs:"rgba(104,104,160,.12)", icon:"◎", zoom:14, tagline:"Your block",            features:["5 shares/day","150 chars/post","Block radius","Posts last 24h","Approx. locations"] },
  { id:"local",     name:"Local",      price:"$2.99",  pn:"/month",  r:5,       rl:"5 km",        scope:"Neighbourhood",scopeDesc:"Your local area",               ds:20,   cl:300,  maxDur:72,    burstMins:10, color:"#3ddc84", cs:"rgba(61,220,132,.12)",  icon:"◉", zoom:12, tagline:"Your neighbourhood",    features:["20 shares/day","300 chars/post","Neighbourhood radius","Posts last 3 days","Full analytics"] },
  { id:"city",      name:"City",       price:"$6.99",  pn:"/month",  r:50,      rl:"50 km",       scope:"City",         scopeDesc:"Your city and surroundings",    ds:100,  cl:600,  maxDur:168,   burstMins:5,  color:"#ff4d6d", cs:"rgba(255,77,109,.12)",  icon:"⬡", zoom:10, tagline:"Own your city",         features:["100 shares/day","600 chars/post","City radius","Posts last 7 days","Exact pins 📍","City badge 🏙️"], hot:true },
  { id:"country",   name:"Region",     price:"$14.99", pn:"/month",  r:500,     rl:"500 km",      scope:"Region",       scopeDesc:"Your country or region",        ds:500,  cl:1000, maxDur:720,   burstMins:3,  color:"#f5c842", cs:"rgba(245,200,66,.12)",  icon:"◈", zoom:6,  tagline:"Rule your region",      features:["500 shares/day","1,000 chars/post","Region radius","Posts last 30 days","Exact pins 📍"] },
  { id:"continent", name:"Continent",  price:"$29.99", pn:"/month",  r:5000,    rl:"5,000 km",    scope:"Continent",    scopeDesc:"Across your continent",         ds:2000, cl:2000, maxDur:720,   burstMins:2,  color:"#ff8c42", cs:"rgba(255,140,66,.12)",  icon:"◬", zoom:4,  tagline:"Across the continent",  features:["2,000 shares/day","2,000 chars/post","Continent radius","Posts last 30 days","Exact pins 📍"] },
  { id:"world",     name:"World",      price:"$59.99", pn:"/month",  r:Infinity,rl:"Unlimited",   scope:"World",        scopeDesc:"Everywhere, no limits",         ds:Infinity, cl:5000, maxDur:Infinity, burstMins:1, color:"#ff42d4", cs:"rgba(255,66,212,.12)", icon:"✦", zoom:2, tagline:"No limits. Everywhere.", features:["Unlimited shares","5,000 chars/post","Global reach","Posts stay permanently","Exact locations"] },
];
const TI = Object.fromEntries(TIERS.map((t,i)=>[t.id,i]));
const gT = id => TIERS.find(t=>t.id===id)||TIERS[0];

// ─── POST DURATION SYSTEM ─────────────────────────────────────
// Duration options in hours — each tier sees options up to its maxDur
const DUR_OPTIONS = [
  { h:24,    label:"24 hours",  desc:"Today only",              icon:"⏱️" },
  { h:72,    label:"3 days",    desc:"Short campaign",          icon:"📅" },
  { h:168,   label:"7 days",    desc:"Weekly promotion",        icon:"📆" },
  { h:720,   label:"30 days",   desc:"Monthly listing",         icon:"🗓️" },
  { h:Infinity, label:"Permanent", desc:"Stays until you remove it", icon:"♾️" },
];

// Category hard caps (hours) — some categories should never run stale
const CAT_MAX_DUR = {
  food:   24,      // specials expire end of day, always
  promo:  48,      // deals should be fresh
  sports: 48,      // match-day content
  music:  168,     // shows/tours can run a week
  events: 168,
  retail: 168,
  jobs:   720,     // job listings need a month
  social: 720,
  community: 24,   // personal posts
};

// Category-suggested default duration (hours)
const CAT_DEFAULT_DUR = {
  food:   24,
  promo:  24,
  sports: 24,
  music:  72,
  events: 72,
  retail: 72,
  jobs:   168,
  social: 72,
  community: 24,
};

// Get available duration options for a tier+category combo
const availDurations = (tierId, catId) => {
  const t = gT(tierId);
  const catMax = CAT_MAX_DUR[catId] || 24;
  const tierMax = t.maxDur;
  const cap = Math.min(catMax, tierMax === Infinity ? Infinity : tierMax);
  return DUR_OPTIONS.filter(d => d.h !== Infinity ? d.h <= cap : tierMax === Infinity);
};

// Get smart default duration for a tier+category
const defaultDuration = (tierId, catId) => {
  const t = gT(tierId);
  const catDef = CAT_DEFAULT_DUR[catId] || 24;
  if (t.maxDur === Infinity) return catDef;
  return Math.min(catDef, t.maxDur);
};

// Format remaining time nicely
const fmtExpiry = (expiresAt) => {
  if (!expiresAt) return null;
  const diff = expiresAt - Date.now();
  if (diff <= 0) return { label:"Expired", color:C.muted, urgent:false, expired:true };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 48)  return { label:`${Math.floor(h/24)}d left`, color:C.muted,   urgent:false, expired:false };
  if (h >= 2)   return { label:`${h}h left`,                color:C.gold,    urgent:false, expired:false };
  if (h >= 1)   return { label:`${h}h ${m}m left`,          color:C.orange,  urgent:true,  expired:false };
  return              { label:`${m}m left`,                  color:C.accent,  urgent:true,  expired:false };
};

// Is a post a personal (non-advertiser) post?
const isPersonal = (post) => !post.isAd;

// ─── LOCATION ZONES ──────────────────────────────────────────
// Each zone has an id, label, radius in km, and the minimum tier required to use it
const LOC_ZONES = [
  { id:"exact",  label:"Exact spot",      desc:"Pin drops precisely here",          icon:"📍", km:0,    minTier:"city"     },
  { id:"area",   label:"Area (~500m)",    desc:"Shown within a 500m neighbourhood", icon:"◎",  km:0.5,  minTier:"free"     },
  { id:"local",  label:"Neighbourhood",   desc:"Visible across ~5 km",              icon:"◉",  km:5,    minTier:"free"     },
  { id:"city",   label:"City zone",       desc:"Anchored to your city area",        icon:"⬡",  km:50,   minTier:"city"     },
  { id:"region", label:"Region / Country",desc:"Broad national reach",              icon:"◈",  km:500,  minTier:"country"  },
  { id:"global", label:"Global",          desc:"No location anchor",                icon:"✦",  km:Infinity, minTier:"world"},
];
const gZ = id => LOC_ZONES.find(z=>z.id===id) || LOC_ZONES[1]; // default = area

// Distance band helper — returns human label instead of exact km
const distBand = km => {
  if (km < 0.15) return { label:"Very close 🟢", color:C.green };
  if (km < 0.5)  return { label:"Nearby 🟡",     color:C.gold  };
  if (km < 1)    return { label:"In the area 🟠", color:C.orange};
  return               { label:"Around here 🔵", color:C.blue  };
};

// ─── CATEGORIES ──────────────────────────────────────────────
const CATS = [
  {id:"all",   l:"All",     icon:"◉",  color:C.muted},
  {id:"food",  l:"Food",    icon:"🍽️", color:"#ff8c42"},
  {id:"events",l:"Events",  icon:"🎉", color:"#ff4d6d"},
  {id:"music", l:"Music",   icon:"🎵", color:"#7b2fff"},
  {id:"jobs",  l:"Jobs",    icon:"💼", color:"#4d9fff"},
  {id:"retail",l:"Retail",  icon:"🛍️", color:"#f5c842"},
  {id:"sports",l:"Sports",  icon:"⚽", color:"#3ddc84"},
  {id:"promo", l:"Promos",  icon:"🏷️", color:"#ff42d4"},
  {id:"social",l:"Social",  icon:"📱", color:"#2dd4bf"},
];
const gC = id => CATS.find(c=>c.id===id)||CATS[0];

// ─── BOOSTS ──────────────────────────────────────────────────
const BOOSTS = [
  {id:"starter",name:"Starter",price:"$1.99",dur:"24h",mult:"2×",est:"~500 views",  color:C.green, icon:"⚡"},
  {id:"pro",    name:"Pro",    price:"$4.99",dur:"48h",mult:"5×",est:"~2,000 views", color:C.blue,  icon:"🚀", hot:true},
  {id:"viral",  name:"Viral",  price:"$9.99",dur:"72h",mult:"10×",est:"~8,000 views",color:C.accent,icon:"🔥"},
  {id:"mega",   name:"Mega",   price:"$24.99",dur:"7d",mult:"50×",est:"~50,000 views",color:"#ff42d4",icon:"✦"},
];

// ─── POSTS ───────────────────────────────────────────────────
const NOW = Date.now();
const hrs = h => h === Infinity ? null : NOW + h * 3600000;
const INIT_POSTS = [
  {id:1, user:"la_trattoria",av:"LT",type:"photo",cat:"food",   isAd:true,  durH:24,  expiresAt:hrs(18),  content:"🍝 Tonight: Truffle Rigatoni + free house wine! Book your table now →", img:"https://picsum.photos/seed/pasta88/600/400",  dist:0.1,time:"5m ago", likes:67, lO:.0009,nO:.0011,reach:.8, views:312, tags:["dinner","offer"],  boosted:true, comments:[{id:101,user:"maya_r",av:"MR",text:"Going tonight!",time:"3m ago",likes:4}]},
  {id:2, user:"alex_k",     av:"AK",type:"photo",cat:"community",isAd:false, durH:24,  expiresAt:hrs(13),  content:"Found insane street art around the corner 🎨 Artist took 3 weeks.",       img:"https://picsum.photos/seed/art1/600/400",     dist:0.3,time:"11m ago",likes:34, lO:.0021,nO:-.0013,reach:.6,views:142, tags:["art"],           comments:[{id:201,user:"jono_w",av:"JW",text:"Which street?",time:"8m ago",likes:2}]},
  {id:3, user:"warehouse_live",av:"WL",type:"link",cat:"music", isAd:true,  durH:72,  expiresAt:hrs(60),  content:"🎸 Live music TONIGHT — free entry before 9pm! Doors 7pm.",               link:"https://example.com",                         dist:0.7,time:"28m ago",likes:89, lO:-.0018,nO:.0022,reach:.9,views:534, tags:["livemusic"],    comments:[]},
  {id:4, user:"techcorp",   av:"TC",type:"text",cat:"jobs",     isAd:true,  durH:168, expiresAt:hrs(150), content:"💼 Hiring! Senior React Dev — remote-friendly, great package. DM us.",     dist:.5, time:"1h ago",  likes:23, lO:.0015,nO:.0008,reach:.5,views:201, tags:["hiring","tech"],comments:[]},
  {id:5, user:"priya_s",    av:"PS",type:"photo",cat:"community",isAd:false, durH:24,  expiresAt:hrs(1.5), content:"Sunset from my rooftop 🌇 Golden hour lasted 4 minutes.",                   img:"https://picsum.photos/seed/sunset99/600/400", dist:.9, time:"1h ago",  likes:201,lO:.0031,nO:.0028,reach:1,  views:534, tags:["sunset"],        comments:[{id:401,user:"alex_k",av:"AK",text:"Stunning 😍",time:"55m ago",likes:8}]},
  {id:6, user:"nike_store", av:"NK",type:"photo",cat:"retail",  isAd:true,  durH:72,  expiresAt:hrs(48),  content:"🔥 Flash Sale — 30% OFF all running gear this weekend!",                   img:"https://picsum.photos/seed/shoes77/600/400",  dist:1.8,time:"45m ago",likes:112,lO:-.0032,nO:-.0019,reach:1.8,views:890, tags:["sale"],         minT:"local",  comments:[]},
  {id:7, user:"city_fc",    av:"CF",type:"text",cat:"sports",   isAd:true,  durH:48,  expiresAt:hrs(36),  content:"⚽ MATCH DAY! City FC vs United — 7pm. Get tickets →",                     dist:3.2,time:"3h ago",  likes:445,lO:.004,nO:-.003,reach:3.2, views:2100,tags:["football"],    minT:"city",   comments:[]},
  {id:8, user:"global_news",av:"GN",type:"text",cat:"events",   isAd:true,  durH:168, expiresAt:hrs(100), content:"🌍 World Summit happening 400km away — live stream link inside.",           dist:400,time:"1h ago",  likes:2400,lO:.3,nO:.2,reach:400,views:88000,tags:["news","world"], minT:"country", comments:[]},
];

// ─── WORLD FEED POSTS (mock — global, randomised) ────────────
const WORLD_POSTS = [
  {id:"w1", user:"tokyo_eats",     av:"TE", type:"photo", cat:"food",    country:"🇯🇵 Tokyo",     content:"Ramen at 2am hits different 🍜 This spot has been open since 1978.",           img:"https://picsum.photos/seed/ramen11/600/400",  likes:1204, views:8400, comments:[], time:"14m ago", tags:["ramen","tokyo"],   isAd:false, expiresAt:hrs(20)},
  {id:"w2", user:"nyc_jobs",       av:"NJ", type:"text",  cat:"jobs",    country:"🇺🇸 New York",   content:"💼 Remote Frontend Engineer needed. $120-160k. React/TypeScript. DM open.",    likes:342,  views:2100, comments:[], time:"1h ago",  tags:["remote","react"],  isAd:true,  expiresAt:hrs(140)},
  {id:"w3", user:"london_live",    av:"LL", type:"link",  cat:"music",   country:"🇬🇧 London",    content:"🎸 Sold out show tonight but we just dropped 20 more tickets. Go go go!",       link:"https://example.com", likes:891, views:5600, comments:[], time:"22m ago", tags:["gigs","london"],  isAd:true,  expiresAt:hrs(8)},
  {id:"w4", user:"paris_style",    av:"PS", type:"photo", cat:"retail",  country:"🇫🇷 Paris",     content:"New collection dropped today 🧥 Sustainable fabrics, local designers only.",   img:"https://picsum.photos/seed/paris44/600/400",  likes:567,  views:3200, comments:[], time:"3h ago",  tags:["fashion","paris"], isAd:true,  expiresAt:hrs(60)},
  {id:"w5", user:"sydney_surfer",  av:"SS", type:"photo", cat:"community",country:"🇦🇺 Sydney",   content:"Dawn patrol 🌊 6am Bondi, nobody out. Worth every alarm.",                     img:"https://picsum.photos/seed/surf55/600/400",   likes:2341, views:14000,comments:[], time:"4h ago",  tags:["surf","bondi"],    isAd:false, expiresAt:hrs(20)},
  {id:"w6", user:"berlin_events",  av:"BE", type:"text",  cat:"events",  country:"🇩🇪 Berlin",    content:"🎉 Techno festival this weekend. 48h non-stop. Lineup dropped — it's insane.",  likes:1893, views:11000,comments:[], time:"2h ago",  tags:["techno","berlin"], isAd:true,  expiresAt:hrs(72)},
  {id:"w7", user:"dubai_food",     av:"DF", type:"photo", cat:"food",    country:"🇦🇪 Dubai",     content:"Iftar spread tonight at the restaurant 🌙 Walk-ins welcome until 10pm.",        img:"https://picsum.photos/seed/dubai77/600/400",  likes:445,  views:2900, comments:[], time:"35m ago", tags:["iftar","dubai"],   isAd:true,  expiresAt:hrs(12)},
  {id:"w8", user:"seoul_startup",  av:"SK", type:"text",  cat:"jobs",    country:"🇰🇷 Seoul",     content:"💼 Looking for a co-founder. AI/ML background. Equity-based. Serious inquiries only.", likes:234, views:1800, comments:[], time:"5h ago", tags:["startup","cofounder"], isAd:false, expiresAt:hrs(160)},
  {id:"w9", user:"cape_town_art",  av:"CA", type:"photo", cat:"events",  country:"🇿🇦 Cape Town", content:"Pop-up gallery open this weekend 🎨 10 local artists, free entry, live music.", img:"https://picsum.photos/seed/art99/600/400",    likes:678,  views:4100, comments:[], time:"1h ago",  tags:["art","gallery"],   isAd:true,  expiresAt:hrs(48)},
  {id:"w10",user:"amsterdam_bike", av:"AB", type:"photo", cat:"community",country:"🇳🇱 Amsterdam", content:"Found this canal view on my morning ride 🚲 The city never gets old.",          img:"https://picsum.photos/seed/amsterdam10/600/400",likes:3102,views:18000,comments:[], time:"2h ago",  tags:["amsterdam","bike"],isAd:false, expiresAt:hrs(22)},
  {id:"w11",user:"mumbai_food",    av:"MF", type:"photo", cat:"food",    country:"🇮🇳 Mumbai",    content:"Street pav bhaji at its absolute best 🍛 Corner of Marine Drive, legend spot.", img:"https://picsum.photos/seed/mumbai11/600/400", likes:1567, views:9200, comments:[], time:"6h ago",  tags:["streetfood","mumbai"],isAd:false,expiresAt:hrs(18)},
  {id:"w12",user:"toronto_sport",  av:"TS", type:"text",  cat:"sports",  country:"🇨🇦 Toronto",   content:"⚽ Watch party tonight for the match. Free entry, big screens, cold drinks. 7pm!", likes:334,  views:2200, comments:[], time:"3h ago",  tags:["watchparty","toronto"],isAd:true,expiresAt:hrs(10)},
];

// Weighted random shuffle — higher engagement = slightly higher chance of appearing
const worldFeedShuffle = () => {
  const scored = WORLD_POSTS.map(p => ({
    ...p,
    // weight: base random + small engagement bonus (capped so it doesn't dominate)
    _w: Math.random() + Math.min(p.likes / 5000, 0.3)
  }));
  return scored.sort((a,b) => b._w - a._w).map(({_w,...p}) => p);
};

// Burst protection: check if user can post (15min cooldown default)
const canPost = (lastPostTime, burstMins) => {
  if (!lastPostTime) return { ok:true, waitMins:0 };
  const elapsed = (Date.now() - lastPostTime) / 60000; // minutes
  if (elapsed >= burstMins) return { ok:true, waitMins:0 };
  return { ok:false, waitMins:Math.ceil(burstMins - elapsed) };
};

// Per-user feed cap: max posts from same user visible in one session
const FEED_CAP_PER_USER = 3;
const NEARBY_PEOPLE = [
  {id:"u1", user:"maya_r",    av:"MR", dist:0.1, status:true,  bio:"Coffee lover & street art hunter ☕",  tier:"local",    lastSeen:"now"},
  {id:"u2", user:"jono_w",    av:"JW", dist:0.3, status:true,  bio:"Music promoter. Always looking for cool spots 🎵", tier:"free", lastSeen:"now"},
  {id:"u3", user:"priya_s",   av:"PS", dist:0.5, status:false, bio:"Photographer & rooftop enthusiast 🌇", tier:"city",     lastSeen:"4m ago"},
  {id:"u4", user:"carlos_m",  av:"CM", dist:0.7, status:true,  bio:"Chef & food blogger 🍝",              tier:"local",    lastSeen:"now"},
  {id:"u5", user:"zara_l",    av:"ZL", dist:0.9, status:false, bio:"Artist. Making things happen.",       tier:"free",     lastSeen:"12m ago"},
  {id:"u6", user:"tom_b",     av:"TB", dist:0.4, status:true,  bio:"Tech founder. Remote work advocate.", tier:"country",  lastSeen:"now"},
];

// ─── MOCK CONVERSATIONS ───────────────────────────────────────
const INIT_CONVOS = [
  {
    id:"c1", with:{id:"u1",user:"maya_r",av:"MR",dist:0.1,status:true,tier:"local"},
    msgs:[
      {id:"m1",from:"maya_r",text:"Hey! Saw your post about the street art — do you know the exact location? 🎨",time:"10m ago",mine:false},
      {id:"m2",from:"me",    text:"Hey! Yeah it's on Merchant St, just past the coffee shop on the left 👋",time:"8m ago",mine:true},
      {id:"m3",from:"maya_r",text:"Amazing thank you! Are you nearby now?",time:"5m ago",mine:false},
    ],
    unread:1, graceUntil:null, active:true,
  },
  {
    id:"c2", with:{id:"u2",user:"jono_w",av:"JW",dist:0.3,status:true,tier:"free"},
    msgs:[
      {id:"m4",from:"jono_w",text:"Great event tonight right? 🎸",time:"1h ago",mine:false},
      {id:"m5",from:"me",    text:"Was incredible! Who were those guys?",time:"59m ago",mine:true},
    ],
    unread:0, graceUntil:null, active:true,
  },
];

// ─── MOCK GROUPS ─────────────────────────────────────────────
// Proximity groups — auto-expire when 0 active members for 24h
// maxMembers is tier-based: Free=10, Local=30, City=100, Region=300, Continent=1000, World=∞
const TIER_GROUP_MAX = {free:10,local:30,city:100,country:300,continent:1000,world:Infinity};

const INIT_GROUPS = [
  {
    id:"g1", name:"🎸 Warehouse Show Tonight", emoji:"🎸", type:"proximity",
    owner:"jono_w", ownerAv:"JW", dist:0.7, members:14, maxMembers:30,
    desc:"Live music chat — who else is here tonight?",
    msgs:[
      {id:"gm1",user:"jono_w",   av:"JW",text:"Doors just opened! Queue is moving fast 🎉",time:"12m ago",mine:false},
      {id:"gm2",user:"maya_r",   av:"MR",text:"Inside already, grab drinks first trust me",time:"10m ago",mine:false},
      {id:"gm3",user:"carlos_m", av:"CM",text:"Which band is on first?",time:"8m ago",mine:false},
    ],
    active:true, createdAt:Date.now()-3600000, graceUntil:null,
  },
  {
    id:"g2", name:"☕ Morning Coffee Corner", emoji:"☕", type:"proximity",
    owner:"alex_k", ownerAv:"AK", dist:0.2, members:6, maxMembers:10,
    desc:"Daily regulars at the coffee shop on 5th",
    msgs:[
      {id:"gm4",user:"alex_k",av:"AK",text:"Honey oat latte is back on the menu 🙌",time:"1h ago",mine:false},
      {id:"gm5",user:"priya_s",av:"PS",text:"Finally!! See you there at 8",time:"58m ago",mine:false},
    ],
    active:true, createdAt:Date.now()-7200000, graceUntil:null,
  },
];

// ─── MOCK CHANNELS ────────────────────────────────────────────
// Channels — persistent, business/advertiser broadcast, followers receive updates
const INIT_CHANNELS = [
  {
    id:"ch1", name:"La Trattoria 🍝", emoji:"🍝", owner:"la_trattoria", ownerAv:"LT",
    dist:0.1, followers:234, verified:true, isAd:true,
    desc:"Daily specials, reservations & offers from La Trattoria",
    lastPost:{text:"Tonight: Truffle Rigatoni + free wine 🍷",time:"5m ago"},
    following:false,
  },
  {
    id:"ch2", name:"Warehouse Live 🎵", emoji:"🎵", owner:"warehouse_live", ownerAv:"WL",
    dist:0.7, followers:891, verified:true, isAd:true,
    desc:"Upcoming shows, tickets and venue news",
    lastPost:{text:"New show announced — tickets live now 🎟️",time:"2h ago"},
    following:true,
  },
  {
    id:"ch3", name:"TechCorp Jobs 💼", emoji:"💼", owner:"techcorp", ownerAv:"TC",
    dist:0.5, followers:445, verified:false, isAd:true,
    desc:"Local job openings, tech roles and career events",
    lastPost:{text:"Senior React Dev role open — remote OK",time:"1h ago"},
    following:false,
  },
];
  {id:"m1",content:"Tonight's special 🍝",time:"2h ago",  views:312, likes:67, reach:.92,comments:8, clicks:44},
  {id:"m2",content:"Flash Sale — 30% OFF", time:"Yesterday",views:891,likes:114,reach:.98,comments:22,clicks:201},
  {id:"m3",content:"Live music tonight 🎸",time:"2d ago",  views:534, likes:89, reach:.87,comments:12,clicks:67},
];

const NOTIFS = [
  {id:1,icon:"📍",text:"New post from @la_trattoria 0.1 km away",time:"2m ago",unread:true},
  {id:2,icon:"❤️",text:"@maya_r liked your post",time:"8m ago",unread:true},
  {id:3,icon:"💬",text:"@jono_w commented on your post",time:"14m ago",unread:true},
  {id:4,icon:"📍",text:"New post from @warehouse_live 0.7 km away",time:"30m ago",unread:false},
  {id:5,icon:"✦",text:"Upgrade to City Mayor to unlock 3 more nearby posts",time:"1h ago",unread:false},
];

// ─── BROADCAST PREFS DEFAULTS ────────────────────────────────
const BCAST_CATS = [
  {id:"food",   l:"Food & Drink",  icon:"🍽️", desc:"Restaurants, cafés, daily specials, offers"},
  {id:"jobs",   l:"Jobs",          icon:"💼", desc:"Hiring, freelance, local positions"},
  {id:"events", l:"Events",        icon:"🎉", desc:"Exhibitions, meetups, shows, markets"},
  {id:"music",  l:"Music & Nightlife",icon:"🎵",desc:"Concerts, DJ nights, live acts, venues"},
  {id:"retail", l:"Retail & Shops",icon:"🛍️", desc:"Sales, new arrivals, discounts"},
  {id:"sports", l:"Sports",        icon:"⚽", desc:"Match days, scores, ticket links"},
  {id:"promo",  l:"Promotions",    icon:"🏷️", desc:"Time-limited deals and special offers"},
];
const DEFAULT_BPREFS = {
  enabled: {},        // category id → true/false — ALL off by default
  dailyCap: 3,        // 1–5 per day
  quietStart: "23:00",
  quietEnd:   "08:00",
  onboarded:  false,  // has user completed onboarding
};

// Mock broadcast notifications (simulated incoming)
const MOCK_BROADCASTS = [
  {id:"b1", cat:"food",   user:"la_trattoria", av:"LT", dist:0.4, content:"🍝 Lunch special: Truffle pasta + wine for €12. Until 3pm only!", time:"8m ago",  unread:true,  isAd:true},
  {id:"b2", cat:"jobs",   user:"techcorp",     av:"TC", dist:0.9, content:"💼 Senior React Dev wanted — remote OK, great package. Apply today.", time:"22m ago", unread:true,  isAd:true},
  {id:"b3", cat:"events", user:"warehouse_live",av:"WL",dist:0.7, content:"🎸 Doors open at 7pm tonight — free entry before 9. 3 live bands.", time:"1h ago",  unread:false, isAd:true},
  {id:"b4", cat:"retail", user:"nike_store",   av:"NK", dist:1.2, content:"🔥 Flash Sale: 30% OFF all running gear — this weekend only.", time:"2h ago",  unread:false, isAd:true},
];

function GS() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap');
      @import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      * { box-sizing:border-box; margin:0; padding:0; }
      body { background:${C.bg}; color:${C.text}; font-family:'DM Sans',sans-serif; overflow-x:hidden; }
      ::-webkit-scrollbar { width:3px; }
      ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:2px; }
      @keyframes fU { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fI { from{opacity:0} to{opacity:1} }
      @keyframes sU { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
      @keyframes fl { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
      @keyframes sp { to{transform:rotate(360deg)} }
      .ce{animation:fU .3s ease both} .mb{animation:fI .2s ease both} .ms{animation:sU .28s cubic-bezier(.34,1.4,.64,1) both}
      .pc{transition:border-color .18s,transform .15s;cursor:pointer} .pc:hover{border-color:rgba(255,77,109,.4)!important;transform:translateY(-1px)}
      .sb{transition:all .2s} .sb:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.2)!important;box-shadow:0 8px 24px rgba(0,0,0,.4)}
      .nb{transition:color .2s}
      .leaflet-container{background:${C.bg}!important}
      .leaflet-tile-pane{filter:brightness(.8) saturate(.6) hue-rotate(195deg)}
      .leaflet-control-zoom{border:1px solid ${C.border}!important;border-radius:9px!important;overflow:hidden}
      .leaflet-control-zoom a{background:${C.card}!important;color:${C.text}!important;border-color:${C.border}!important;width:26px!important;height:26px!important;line-height:26px!important}
      .leaflet-control-zoom a:hover{background:${C.surface}!important}
      .leaflet-control-attribution{background:rgba(8,8,14,.7)!important;color:${C.muted}!important;font-size:9px!important}
      .leaflet-control-attribution a{color:${C.muted}!important}
      .leaflet-popup-content-wrapper{background:${C.card}!important;border:1px solid ${C.border}!important;border-radius:12px!important;padding:0!important;box-shadow:0 8px 24px rgba(0,0,0,.6)!important}
      .leaflet-popup-content{margin:0!important}
      .leaflet-popup-tip{background:${C.card}!important}
      .leaflet-popup-close-button{color:${C.muted}!important;font-size:15px!important;top:7px!important;right:9px!important}
    `}</style>
  );
}

// ─── MINI COMPONENTS ─────────────────────────────────────────
const Spin = ({color="#fff",size=16}) => <div style={{width:size,height:size,border:`2px solid transparent`,borderTop:`2px solid ${color}`,borderRadius:"50%",animation:"sp .7s linear infinite",flexShrink:0}}/>;

const Btn = ({children,onClick,style={},disabled,ghost}) => (
  <button onClick={onClick} disabled={disabled} style={{
    background:ghost?"transparent":C.accent, color:ghost?C.muted:"#fff",
    border:ghost?`1px solid ${C.border}`:"none", borderRadius:11, padding:"11px 18px",
    fontFamily:"Syne,sans-serif", fontWeight:700, fontSize:13, cursor:disabled?"not-allowed":"pointer",
    transition:"all .2s", boxShadow:ghost?"none":`0 4px 14px ${C.aG}`, opacity:disabled?.5:1, ...style
  }}>{children}</button>
);

const Inp = ({style={}, textarea, rows=3, ...p}) => {
  const base = {background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.text,fontFamily:"DM Sans,sans-serif",fontSize:13,width:"100%",outline:"none",resize:"none",...style};
  return textarea ? <textarea style={base} rows={rows} {...p}/> : <input style={base} {...p}/>;
};

const TBadge = ({id,lg}) => { const t=gT(id); return <span style={{background:t.cs,color:t.color,border:`1px solid ${t.color}44`,borderRadius:6,padding:lg?"5px 11px":"2px 7px",fontSize:lg?12:10,fontWeight:700,fontFamily:"Syne,sans-serif",display:"inline-flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>{t.icon} {id==="free"?"FREE":id.toUpperCase()}</span>; };

const CatBadge = ({id}) => { const c=gC(id); if(!id||id==="all") return null; return <span style={{background:`${c.color}18`,color:c.color,border:`1px solid ${c.color}33`,borderRadius:5,padding:"2px 6px",fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{c.icon} {c.l}</span>; };

// ─── AUTH ─────────────────────────────────────────────────────
const GIcon=()=><svg width="19" height="19" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>;
const AIcon=()=><svg width="19" height="19" viewBox="0 0 24 24" fill={C.text}><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>;
const FBIcon=()=><svg width="19" height="19" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>;

function AuthScreen({onAuth}) {
  const [mode,setMode]=useState("social");
  const [loading,setLoading]=useState(null);
  const [em,setEm]=useState(""); const [pw,setPw]=useState(""); const [nm,setNm]=useState(""); const [md,setMd]=useState("login");
  const doSocial=p=>{setLoading(p);setTimeout(()=>{setLoading(null);onAuth({name:{google:"Alex Johnson",apple:"Alex J.",facebook:"Alex J."}[p]||"You",provider:p});},1500);};
  const doEmail=()=>{if(!em)return;onAuth({name:nm||em.split("@")[0],provider:"email"});};
  const socialRow=(id,label,icon,bg,col,bc)=>(
    <button key={id} className="sb" onClick={()=>doSocial(id)} disabled={!!loading}
      style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:13,border:`1px solid ${bc}`,background:bg,cursor:"pointer",fontFamily:"DM Sans,sans-serif",fontSize:14,fontWeight:500,color:col,opacity:loading&&loading!==id?.5:1,marginBottom:8}}>
      <span style={{display:"flex",width:20,justifyContent:"center"}}>{icon}</span>
      <span style={{flex:1}}>{label}</span>
      {loading===id&&<Spin color={col}/>}
    </button>
  );
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:`radial-gradient(ellipse at 50% -20%,rgba(255,77,109,.18) 0%,${C.bg} 60%)`}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{width:72,height:72,borderRadius:22,background:`linear-gradient(135deg,${C.accent},#c1121f)`,boxShadow:`0 10px 32px ${C.aG}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,margin:"0 auto 14px",animation:"fl 3s ease-in-out infinite"}}>◎</div>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:32,letterSpacing:-1.5}}>share<span style={{color:C.accent}}>me</span></div>
          <div style={{color:C.muted,fontSize:13,marginTop:6}}>share anything · discovered nearby</div>
        </div>
        {mode==="social"?(
          <>
            {socialRow("google","Continue with Google",<GIcon/>,"#fff","#1f1f1f","#e0e0e0")}
            {socialRow("apple","Continue with Apple",<AIcon/>,C.card,C.text,C.border)}
            {socialRow("facebook","Continue with Facebook",<FBIcon/>,"#1877F2","#fff","#1877F2")}
            <div style={{display:"flex",alignItems:"center",gap:10,margin:"12px 0"}}>
              <div style={{flex:1,height:1,background:C.border}}/><span style={{color:C.muted,fontSize:12}}>or</span><div style={{flex:1,height:1,background:C.border}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              <button className="sb" onClick={()=>setMode("email")} style={{padding:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,borderRadius:13,border:`1px solid ${C.border}`,background:C.card,cursor:"pointer",color:C.text,fontFamily:"DM Sans,sans-serif",fontSize:13}}>✉️ Email</button>
              <button className="sb" onClick={()=>doSocial("phone")} style={{padding:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,borderRadius:13,border:`1px solid ${C.border}`,background:C.card,cursor:"pointer",color:C.muted,fontFamily:"DM Sans,sans-serif",fontSize:13}}>{loading==="phone"?<Spin/>:"📱"} Phone</button>
            </div>
            <div style={{textAlign:"center",color:C.muted,fontSize:11,marginTop:18,lineHeight:1.7}}>By continuing you agree to our <span style={{color:C.accent,cursor:"pointer"}}>Terms</span> & <span style={{color:C.accent,cursor:"pointer"}}>Privacy Policy</span>. We use your location 📍</div>
          </>
        ):(
          <div style={{animation:"fU .3s ease both"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button onClick={()=>setMode("social")} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,width:32,height:32,cursor:"pointer",color:C.muted,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
              <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:17}}>{md==="login"?"Sign In":"Create Account"}</div>
            </div>
            <div style={{display:"flex",background:C.surface,borderRadius:10,padding:3,marginBottom:14,border:`1px solid ${C.border}`}}>
              {["login","signup"].map(m=><button key={m} onClick={()=>setMd(m)} style={{flex:1,padding:"8px 0",border:"none",cursor:"pointer",borderRadius:8,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:12,background:md===m?C.accent:"transparent",color:md===m?"white":C.muted}}>{m==="login"?"Sign In":"Sign Up"}</button>)}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:12}}>
              {md==="signup"&&<Inp placeholder="Full name" value={nm} onChange={e=>setNm(e.target.value)}/>}
              <Inp type="email" placeholder="Email" value={em} onChange={e=>setEm(e.target.value)}/>
              <Inp type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doEmail()}/>
            </div>
            {md==="login"&&<div style={{textAlign:"right",marginBottom:12}}><span style={{color:C.accent,fontSize:12,cursor:"pointer"}}>Forgot password?</span></div>}
            <Btn onClick={doEmail} style={{width:"100%",padding:12}}>{md==="login"?"Sign In":"Create Account"}</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CHECKOUT MODAL ───────────────────────────────────────────
function Checkout({item,onClose,onOk}) {
  const [step,setStep]=useState("review");
  const [cn,setCn]=useState(""); const [ex,setEx]=useState(""); const [cv,setCv]=useState(""); const [nm,setNm]=useState("");
  const fmtCard=v=>v.replace(/\D/g,"").slice(0,16).replace(/(\d{4})/g,"$1 ").trim();
  const fmtExp=v=>v.replace(/\D/g,"").slice(0,4).replace(/^(\d{2})/,"$1/");
  const pay=()=>{if(!cn||!ex||!cv||!nm)return;setStep("proc");setTimeout(()=>setStep("done"),1800);setTimeout(()=>{onOk();onClose();},3000);};
  const qPay=()=>{setStep("proc");setTimeout(()=>setStep("done"),1400);setTimeout(()=>{onOk();onClose();},2600);};
  return (
    <div className="mb" onClick={onClose} style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div className="ms" onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,background:C.card,borderRadius:"20px 20px 0 0",border:`1px solid ${C.border}`,padding:22,paddingBottom:34}}>
        {step==="done"&&<div style={{textAlign:"center",padding:"28px 0"}}><div style={{fontSize:48,marginBottom:10}}>✅</div><div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:19,marginBottom:5}}>Payment Successful!</div><div style={{color:C.muted,fontSize:13}}>{item.msg||"Your purchase is now active."}</div></div>}
        {step==="proc"&&<div style={{textAlign:"center",padding:"32px 0"}}><div style={{width:40,height:40,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.accent}`,borderRadius:"50%",animation:"sp .8s linear infinite",margin:"0 auto 14px"}}/><div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:15}}>Processing…</div><div style={{color:C.muted,fontSize:12,marginTop:4}}>Secured by Stripe</div></div>}
        {step==="review"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:17}}>Order Summary</div><button onClick={onClose} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,width:28,height:28,cursor:"pointer",color:C.muted,fontSize:15}}>×</button></div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:11,padding:"12px 14px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><div><div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14}}>{item.name}</div><div style={{color:C.muted,fontSize:11,marginTop:1}}>{item.desc}</div></div><div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:19,color:C.accent}}>{item.price}</div></div>
            {item.features?.map(f=><div key={f} style={{fontSize:11,color:C.muted,display:"flex",alignItems:"center",gap:5,marginTop:3}}><span style={{color:C.green}}>✓</span>{f}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[["⬛ Apple Pay"],["🔵 Google Pay"]].map(([l])=><button key={l} onClick={qPay} style={{background:"#1c1c1e",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 0",cursor:"pointer",color:C.text,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:12}}>{l}</button>)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10}}><div style={{flex:1,height:1,background:C.border}}/><span style={{color:C.muted,fontSize:11}}>or card</span><div style={{flex:1,height:1,background:C.border}}/></div>
          {step==="review"&&<button onClick={()=>setStep("card")} style={{width:"100%",padding:11,borderRadius:10,background:C.aS,color:C.accent,border:`1px solid ${C.accent}`,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>💳 Enter Card Details</button>}
        </>}
        {step==="card"&&<>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>Card Details</div>
          <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:14}}>
            <Inp placeholder="Cardholder name" value={nm} onChange={e=>setNm(e.target.value)}/>
            <Inp placeholder="Card number" value={cn} onChange={e=>setCn(fmtCard(e.target.value))}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              <Inp placeholder="MM/YY" value={ex} onChange={e=>setEx(fmtExp(e.target.value))}/>
              <Inp placeholder="CVV" value={cv} onChange={e=>setCv(e.target.value.slice(0,4))}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,color:C.muted,fontSize:11}}><span>🔒</span> Payments secured by Stripe</div>
          <Btn onClick={pay} style={{width:"100%",padding:12}}>Pay {item.price}</Btn>
        </>}
      </div>
    </div>
  );
}

// ─── REPORT MODAL ─────────────────────────────────────────────
function ReportModal({onClose}) {
  const [r,setR]=useState("");
  const opts=["Spam or advertising","Inappropriate content","Misleading info","Harassment","Other"];
  return (
    <div className="mb" onClick={onClose} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div className="ms" onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:360,background:C.card,borderRadius:18,border:`1px solid ${C.border}`,padding:22}}>
        <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:17,marginBottom:5}}>Report Content</div>
        <div style={{color:C.muted,fontSize:13,marginBottom:16}}>Help us keep ShareMe safe.</div>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:16}}>
          {opts.map(o=><button key={o} onClick={()=>setR(o)} style={{background:r===o?C.aS:C.surface,border:`1px solid ${r===o?C.accent:C.border}`,borderRadius:10,padding:"11px 14px",cursor:"pointer",color:r===o?C.accent:C.text,fontFamily:"DM Sans,sans-serif",fontSize:13,textAlign:"left",transition:"all .15s"}}>{o}</button>)}
        </div>
        <div style={{display:"flex",gap:9}}>
          <Btn ghost onClick={onClose} style={{flex:1,padding:11}}>Cancel</Btn>
          <Btn onClick={()=>{if(r)onClose();}} style={{flex:1,padding:11,opacity:r?1:.4}}>Submit</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── POST DETAIL ──────────────────────────────────────────────
function DetailModal({p,onClose,onLike,onComment}) {
  const [liked,setLiked]=useState(false);
  const [txt,setTxt]=useState("");
  const [report,setReport]=useState(false);
  const cat=gC(p.cat);
  const toggle=()=>{setLiked(l=>!l);onLike(p.id,!liked);};
  const submit=()=>{if(!txt.trim())return;onComment(p.id,txt.trim());setTxt("");};

  // ── Swipe-down-to-dismiss ─────────────────────────────────
  const sheetRef=useRef(null);
  const dragY=useRef(0);
  const startY=useRef(0);
  const [translateY,setTranslateY]=useState(0);

  const onTouchStart=e=>{
    // Only start drag if the sheet is scrolled to top
    if(sheetRef.current?.scrollTop>0) return;
    startY.current=e.touches[0].clientY;
    dragY.current=0;
  };
  const onTouchMove=e=>{
    if(sheetRef.current?.scrollTop>0) return;
    const dy=e.touches[0].clientY-startY.current;
    if(dy<0) return; // don't allow dragging up
    dragY.current=dy;
    setTranslateY(dy);
  };
  const onTouchEnd=()=>{
    if(dragY.current>100) { onClose(); return; }
    setTranslateY(0); // snap back
    dragY.current=0;
  };

  // ── Browser back button ───────────────────────────────────
  useEffect(()=>{
    window.history.pushState({modal:"detail"},"");
    const onPop=()=>onClose();
    window.addEventListener("popstate",onPop);
    return()=>{
      window.removeEventListener("popstate",onPop);
      // Only go back if we pushed a state (avoid double-pop)
      if(window.history.state?.modal==="detail") window.history.back();
    };
  },[]);

  return (
    <div className="mb" onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.85)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div
        className="ms"
        ref={sheetRef}
        onClick={e=>e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{width:"100%",maxWidth:480,background:C.card,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,maxHeight:"92vh",overflowY:"auto",
          transform:`translateY(${translateY}px)`,
          transition:translateY===0?"transform .3s cubic-bezier(.34,1.4,.64,1)":"none",
          willChange:"transform"}}>

        {/* ── Pull handle + close button row ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px 4px",flexShrink:0}}>
          {/* Close button — always visible, left side */}
          <button onClick={onClose} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:C.muted,fontSize:18,flexShrink:0}}>←</button>
          {/* Drag handle — centre */}
          <div style={{width:36,height:4,borderRadius:2,background:C.border}}/>
          {/* Report button — right side */}
          <button onClick={e=>{e.stopPropagation();setReport(true);}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 10px",cursor:"pointer",color:C.muted,fontSize:11,display:"flex",alignItems:"center",gap:4}}>⚑ Report</button>
        </div>

        {/* Header */}
        <div style={{padding:"8px 18px 12px",display:"flex",alignItems:"center",gap:11}}>
          <div style={{width:44,height:44,borderRadius:13,flexShrink:0,background:`linear-gradient(135deg,${cat.color||C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,fontFamily:"Syne,sans-serif"}}>{p.av}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:15}}>@{p.user}</span>
              {p.isAd&&<span style={{background:C.gS,color:C.gold,border:`1px solid rgba(245,200,66,.3)`,borderRadius:4,padding:"1px 5px",fontSize:9,fontWeight:700}}>AD</span>}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:2}}><span style={{color:C.muted,fontSize:11}}>{p.time}</span><CatBadge id={p.cat}/></div>
          </div>
        </div>

        {/* Image */}
        {p.img&&<div style={{margin:"0 14px 12px",borderRadius:14,overflow:"hidden"}}><img src={p.img} alt="" style={{width:"100%",display:"block",maxHeight:300,objectFit:"cover"}}/></div>}

        {/* Content */}
        <div style={{padding:"0 18px 12px"}}>
          <p style={{fontSize:15,lineHeight:1.65,marginBottom:8}}>{p.content}</p>
          {p.tags?.map(t=><span key={t} style={{display:"inline-block",background:"rgba(255,255,255,.05)",border:`1px solid ${C.border}`,borderRadius:5,padding:"1px 7px",fontSize:10,color:C.muted,marginRight:4,marginBottom:4}}>#{t}</span>)}
          {p.link&&<a href={p.link} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"10px 13px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.accent,fontSize:13,textDecoration:"none"}}>🔗 <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{p.link}</span></a>}
          {/* Stats + expiry */}
          <div style={{display:"flex",gap:16,marginTop:12,padding:"10px 0",borderTop:`1px solid ${C.border}`,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:12,color:C.muted}}>👁 {p.views}</span>
            <span style={{fontSize:12,color:C.muted}}>❤️ {p.likes+(liked?1:0)}</span>
            <span style={{fontSize:12,color:C.muted}}>💬 {p.comments?.length||0}</span>
            {(()=>{
              const exp=p.expiresAt?fmtExpiry(p.expiresAt):null;
              if(!exp) return <span style={{fontSize:12,color:C.teal}}>♾️ Permanent</span>;
              if(exp.expired) return <span style={{fontSize:12,color:C.muted}}>⏹ Expired</span>;
              return <span style={{fontSize:12,color:exp.color,fontWeight:600}}>⏱ {exp.label}</span>;
            })()}
          </div>
          {/* Bump action */}
          {p.isAd&&p.expiresAt&&(()=>{
            const exp=fmtExpiry(p.expiresAt);
            if(!exp||exp.expired) return null;
            const hoursLeft=(p.expiresAt-Date.now())/3600000;
            if(hoursLeft>48) return null;
            return(
              <div style={{background:"rgba(245,200,66,.08)",border:"1px solid rgba(245,200,66,.25)",borderRadius:10,padding:"10px 13px",display:"flex",alignItems:"center",gap:10,marginTop:8}}>
                <span style={{fontSize:16}}>🔄</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.gold}}>Expiring soon</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>Bump to push back to the top and reset duration.</div>
                </div>
                <button style={{background:C.gold,border:"none",borderRadius:8,padding:"7px 12px",cursor:"pointer",color:"#08080e",fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:12,flexShrink:0}}>Bump ↑</button>
              </div>
            );
          })()}
        </div>

        {/* Actions */}
        <div style={{padding:"10px 18px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:9}}>
          <button onClick={toggle} style={{flex:1,background:liked?C.aS:C.surface,border:`1px solid ${liked?C.accent:C.border}`,borderRadius:10,padding:"10px 0",cursor:"pointer",color:liked?C.accent:C.muted,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,transition:"all .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>{liked?"❤️":"🤍"} {p.likes+(liked?1:0)}</button>
          <button style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 0",cursor:"pointer",color:C.muted,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>↗ Share</button>
        </div>

        {/* Comments */}
        <div style={{padding:"0 18px 36px",borderTop:`1px solid ${C.border}`}}>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,margin:"12px 0 10px"}}>💬 {p.comments?.length||0} Comments</div>
          {p.comments?.map(c=>(
            <div key={c.id} style={{display:"flex",gap:9,marginBottom:12,padding:"8px 10px",background:"rgba(255,255,255,.02)",borderRadius:9}}>
              <div style={{width:30,height:30,borderRadius:9,flexShrink:0,background:`linear-gradient(135deg,${C.purple},${C.blue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{c.av}</div>
              <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,marginBottom:2}}>@{c.user} <span style={{color:C.muted,fontWeight:400}}>{c.time}</span></div><p style={{fontSize:13,lineHeight:1.5}}>{c.text}</p></div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:6}}>
            <Inp placeholder="Add a comment…" value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} style={{fontSize:13}}/>
            <button onClick={submit} style={{background:C.accent,border:"none",borderRadius:9,padding:"0 14px",color:"white",cursor:"pointer",fontSize:14,fontWeight:700,flexShrink:0,boxShadow:`0 2px 8px ${C.aG}`}}>↑</button>
          </div>
        </div>
      </div>
      {report&&<ReportModal onClose={()=>setReport(false)}/>}
    </div>
  );
}

// ─── POST CARD ────────────────────────────────────────────────
function PostCard({post,onOpen,onLike,tier,isNextLocked}) {
  const [liked,setLiked]=useState(false);
  const handleLike=e=>{e.stopPropagation();setLiked(l=>!l);onLike(post.id,!liked);};
  const cat=gC(post.cat);
  const lt=gT(post.minT||"local");

  // LOCKED CARD — shows teaser, upgrade prompt
  if(post.minT&&TI[post.minT]>TI[tier]) {
    return (
      <div style={{background:C.card,border:`1px solid ${lt.color}33`,borderRadius:16,overflow:"hidden",position:"relative",marginBottom:isNextLocked?0:undefined}}>
        {/* Blurred teaser */}
        <div style={{filter:"blur(6px)",pointerEvents:"none",opacity:.4,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:8}}>
            <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${lt.color},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700}}>{post.av}</div>
            <div><div style={{fontSize:13,fontWeight:600}}>@{post.user}</div><div style={{fontSize:11,color:C.muted}}>{post.time}</div></div>
          </div>
          <p style={{fontSize:14,lineHeight:1.5}}>{post.content.slice(0,60)}…</p>
        </div>
        {/* Unlock overlay */}
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,background:"rgba(8,8,14,.6)",backdropFilter:"blur(2px)"}}>
          <div style={{fontSize:22}}>{lt.icon}</div>
          <TBadge id={lt.id} lg/>
          <div style={{color:C.muted,fontSize:12,textAlign:"center",maxWidth:200,lineHeight:1.5}}>
            {post.dist} km away · Upgrade to <b style={{color:lt.color}}>{lt.name}</b> to unlock
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pc" onClick={()=>onOpen(post)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
      {post.isAd&&<div style={{background:`linear-gradient(90deg,${C.gS},transparent)`,borderBottom:`1px solid rgba(245,200,66,.1)`,padding:"3px 13px",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:9,color:C.gold,fontWeight:700,fontFamily:"Syne,sans-serif"}}>✦ SPONSORED</span><CatBadge id={post.cat}/>{post.boosted&&<span style={{marginLeft:"auto",fontSize:9,color:C.orange,fontWeight:700}}>🚀 BOOSTED</span>}</div>}
      {/* Header */}
      <div style={{padding:"11px 13px 9px",display:"flex",alignItems:"center",gap:9}}>
        <div style={{width:36,height:36,borderRadius:11,flexShrink:0,background:`linear-gradient(135deg,${cat.color||C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700}}>{post.av}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600}}>@{post.user}</div>
          <div style={{fontSize:11,color:C.muted}}>{post.time}</div>
        </div>
        <span style={{background:`rgba(${post.dist<.3?"61,220,132":post.dist<.7?"255,77,109":"104,104,160"},.15)`,color:post.dist<.3?C.green:post.dist<.7?C.accent:C.muted,border:`1px solid ${post.dist<.3?C.green:post.dist<.7?C.accent:C.muted}44`,borderRadius:6,padding:"2px 6px",fontSize:9,fontWeight:600,whiteSpace:"nowrap"}}>📍 {post.dist}km</span>
      </div>
      {post.img&&<div style={{margin:"0 12px 10px",borderRadius:11,overflow:"hidden"}}><img src={post.img} alt="" style={{width:"100%",display:"block",height:170,objectFit:"cover"}}/></div>}
      <div style={{padding:"0 13px 10px"}}>
        <p style={{fontSize:14,lineHeight:1.5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{post.content}</p>
        {post.link&&<div style={{marginTop:7,padding:"6px 10px",background:C.surface,borderRadius:7,border:`1px solid ${C.border}`,color:C.accent,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🔗 {post.link}</div>}
      </div>
      <div style={{padding:"7px 13px 11px",borderTop:`1px solid ${C.border}`,display:"flex",gap:12,alignItems:"center"}}>
        <button onClick={handleLike} style={{background:"none",border:"none",cursor:"pointer",color:liked?C.accent:C.muted,fontSize:12,display:"flex",alignItems:"center",gap:4,fontFamily:"DM Sans,sans-serif"}}>{liked?"❤️":"🤍"} {post.likes+(liked?1:0)}</button>
        <span style={{color:C.muted,fontSize:12}}>💬 {post.comments?.length||0}</span>
        <span style={{color:C.muted,fontSize:11}}>👁 {post.views}</span>
        {(()=>{
          const exp=post.expiresAt?fmtExpiry(post.expiresAt):null;
          if(!exp) return <span style={{marginLeft:"auto",fontSize:10,color:C.teal,background:"rgba(45,212,191,.1)",border:"1px solid rgba(45,212,191,.2)",borderRadius:5,padding:"2px 6px",fontWeight:600}}>♾️ Permanent</span>;
          if(exp.expired) return <span style={{marginLeft:"auto",fontSize:10,color:C.muted,background:`${C.border}`,border:`1px solid ${C.border}`,borderRadius:5,padding:"2px 6px"}}>⏹ Expired</span>;
          return <span style={{marginLeft:"auto",fontSize:10,color:exp.color,background:`${exp.color}12`,border:`1px solid ${exp.color}33`,borderRadius:5,padding:"2px 6px",fontWeight:600}}>⏱ {exp.label}</span>;
        })()}
      </div>
    </div>
  );
}

// ─── FEED SCREEN ──────────────────────────────────────────────
function FeedScreen({posts,onOpen,onLike,tier,lastPostTime}) {
  const [feedTab,setFeedTab]=useState("nearby"); // nearby | world
  const [cat,setCat]=useState("all");
  const [search,setSearch]=useState("");
  const [worldPosts,setWorldPosts]=useState(()=>worldFeedShuffle());
  const t=gT(tier);

  // ── Nearby feed logic ──────────────────────────────────────
  const unlocked=posts.filter(p=>!p.minT||TI[p.minT]<=TI[tier]);
  const locked=posts.filter(p=>p.minT&&TI[p.minT]>TI[tier]);
  const nextLocked=[...locked].sort((a,b)=>a.dist-b.dist)[0];
  const isExp=p=>p.expiresAt&&fmtExpiry(p.expiresAt)?.expired===true;
  const live=unlocked.filter(p=>!isExp(p));
  const expiredPosts=unlocked.filter(isExp);

  // Per-user feed cap — no single user dominates
  const applyUserCap = (arr) => {
    const counts = {};
    return arr.filter(p => {
      counts[p.user] = (counts[p.user]||0) + 1;
      return counts[p.user] <= FEED_CAP_PER_USER;
    });
  };

  const nearbyFiltered = applyUserCap(
    live.filter(p=>{
      if(cat!=="all"&&p.cat!==cat) return false;
      if(search&&!p.content.toLowerCase().includes(search.toLowerCase())&&
         !p.user.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a,b)=>a.dist-b.dist)
  );

  // ── World feed logic ───────────────────────────────────────
  const worldFiltered = worldPosts.filter(p=>{
    if(cat!=="all"&&p.cat!==cat) return false;
    if(search&&!p.content.toLowerCase().includes(search.toLowerCase())&&
       !p.user.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const burst=canPost(lastPostTime, t.burstMins);

  return (
    <div style={{padding:"12px 0 100px"}}>
      {/* Feed tab switcher */}
      <div style={{padding:"0 13px 12px"}}>
        <div style={{display:"flex",background:C.surface,borderRadius:12,padding:3,border:`1px solid ${C.border}`}}>
          {[["nearby","📍 Nearby"],["world","🌍 World"]].map(([id,label])=>(
            <button key={id} onClick={()=>setFeedTab(id)}
              style={{flex:1,padding:"9px 0",border:"none",cursor:"pointer",borderRadius:10,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,transition:"all .2s",
                background:feedTab===id?C.accent:"transparent",color:feedTab===id?"white":C.muted,
                boxShadow:feedTab===id?`0 2px 10px ${C.aG}`:"none"}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search + category filters */}
      <div style={{padding:"0 13px 10px"}}>
        <Inp placeholder="🔍 Search posts…" value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:10}}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {CATS.map(c=><button key={c.id} onClick={()=>setCat(c.id)} style={{background:cat===c.id?`${c.color}20`:C.surface,border:`1px solid ${cat===c.id?c.color:C.border}`,borderRadius:20,padding:"5px 11px",color:cat===c.id?c.color:C.muted,fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,transition:"all .2s"}}>{c.icon} {c.l}</button>)}
        </div>
      </div>

      {/* Burst protection warning */}
      {!burst.ok&&(
        <div style={{margin:"0 13px 10px",background:"rgba(255,140,66,.08)",border:"1px solid rgba(255,140,66,.25)",borderRadius:10,padding:"9px 13px",display:"flex",alignItems:"center",gap:9}}>
          <span style={{fontSize:15}}>⏱</span>
          <span style={{fontSize:12,color:C.orange}}>Next share available in <b>{burst.waitMins} min{burst.waitMins!==1?"s":""}</b> · keeps the feed fresh for everyone</span>
        </div>
      )}

      {/* ── NEARBY FEED ─────────────────────────────────────── */}
      {feedTab==="nearby"&&(
        <>
          {/* Info bar */}
          <div style={{margin:"0 13px 10px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:C.muted,fontSize:12}}>
              <span style={{color:C.green,fontWeight:600}}>{nearbyFiltered.length} posts</span>
              {" "}· {t.scope}
              <span style={{color:C.muted,fontSize:10}}> ({t.rl})</span>
            </span>
            <div style={{display:"flex",gap:10}}>
              {expiredPosts.length>0&&<span style={{color:C.muted,fontSize:11}}>⏹ {expiredPosts.length} expired</span>}
              {locked.length>0&&<span style={{color:C.muted,fontSize:11}}>🔒 {locked.length} locked</span>}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10,padding:"0 13px"}}>
            {nearbyFiltered.length===0&&(
              <div style={{textAlign:"center",padding:"40px 20px"}}>
                <div style={{fontSize:36,marginBottom:12}}>📍</div>
                <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:16,color:C.text,marginBottom:8}}>Nothing nearby yet</div>
                <div style={{color:C.muted,fontSize:13,lineHeight:1.7,marginBottom:16}}>No posts in your {t.scope} right now. Check the 🌍 World feed to stay engaged, or be the first to share something here!</div>
                <button onClick={()=>setFeedTab("world")} style={{background:C.aS,border:`1px solid ${C.accent}`,borderRadius:11,padding:"10px 22px",cursor:"pointer",color:C.accent,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13}}>Explore World Feed →</button>
              </div>
            )}
            {nearbyFiltered.map(p=><PostCard key={p.id} post={p} onOpen={onOpen} onLike={onLike} tier={tier}/>)}
            {/* Next locked teaser */}
            {nextLocked&&cat==="all"&&!search&&<>
              <div style={{display:"flex",alignItems:"center",gap:8,margin:"4px 0"}}><div style={{flex:1,height:1,background:C.border}}/><span style={{color:C.muted,fontSize:10,whiteSpace:"nowrap"}}>beyond your {t.scope}</span><div style={{flex:1,height:1,background:C.border}}/></div>
              <PostCard post={nextLocked} onOpen={()=>{}} onLike={()=>{}} tier={tier} isNextLocked/>
              {locked.length>1&&<div style={{textAlign:"center",padding:"10px 0",color:C.muted,fontSize:12}}>+ {locked.length-1} more locked · <span style={{color:C.accent,cursor:"pointer"}}>Upgrade to {TIERS[TI[tier]+1]?.scope||"World"}</span></div>}
            </>}
            {/* Expired posts dimmed */}
            {expiredPosts.length>0&&cat==="all"&&!search&&<>
              <div style={{display:"flex",alignItems:"center",gap:8,margin:"4px 0"}}><div style={{flex:1,height:1,background:C.border}}/><span style={{color:C.muted,fontSize:10,whiteSpace:"nowrap"}}>expired</span><div style={{flex:1,height:1,background:C.border}}/></div>
              {expiredPosts.map(p=><div key={p.id} style={{opacity:.4,pointerEvents:"none"}}><PostCard post={p} onOpen={()=>{}} onLike={()=>{}} tier={tier}/></div>)}
            </>}
          </div>
        </>
      )}

      {/* ── WORLD FEED ──────────────────────────────────────── */}
      {feedTab==="world"&&(
        <>
          {/* World feed header */}
          <div style={{margin:"0 13px 10px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:C.muted,fontSize:12}}><span style={{color:C.teal,fontWeight:600}}>🌍 Global stream</span> · weighted by engagement</span>
            <button onClick={()=>setWorldPosts(worldFeedShuffle())} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"3px 10px",cursor:"pointer",color:C.muted,fontSize:11,display:"flex",alignItems:"center",gap:5}}>↺ Refresh</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10,padding:"0 13px"}}>
            {worldFiltered.map(p=>(
              <WorldPostCard key={p.id} post={p} onOpen={onOpen} onLike={onLike}/>
            ))}
            {worldFiltered.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}><div style={{fontSize:32,marginBottom:10}}>🔍</div>No world posts match this filter</div>}
            {/* Refresh nudge at bottom */}
            <button onClick={()=>setWorldPosts(worldFeedShuffle())} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 0",cursor:"pointer",color:C.muted,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:4}}>↺ Load new posts from around the world</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── WORLD POST CARD ──────────────────────────────────────────
// Like PostCard but shows country flag instead of distance
function WorldPostCard({post,onOpen,onLike}) {
  const [liked,setLiked]=useState(false);
  const handleLike=e=>{e.stopPropagation();setLiked(l=>!l);onLike&&onLike(post.id,!liked);};
  const cat=gC(post.cat);
  return(
    <div className="pc" onClick={()=>onOpen&&onOpen(post)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
      {post.isAd&&<div style={{background:`linear-gradient(90deg,${C.gS},transparent)`,borderBottom:`1px solid rgba(245,200,66,.1)`,padding:"3px 13px",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:9,color:C.gold,fontWeight:700,fontFamily:"Syne,sans-serif"}}>✦ SPONSORED</span><CatBadge id={post.cat}/></div>}
      <div style={{padding:"11px 13px 9px",display:"flex",alignItems:"center",gap:9}}>
        <div style={{width:36,height:36,borderRadius:11,flexShrink:0,background:`linear-gradient(135deg,${cat.color||C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700}}>{post.av}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600}}>@{post.user}</div>
          <div style={{fontSize:11,color:C.muted}}>{post.time}</div>
        </div>
        {/* Country instead of distance */}
        <span style={{fontSize:11,color:C.muted,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"2px 7px",whiteSpace:"nowrap"}}>{post.country}</span>
      </div>
      {post.img&&<div style={{margin:"0 12px 10px",borderRadius:11,overflow:"hidden"}}><img src={post.img} alt="" style={{width:"100%",display:"block",height:170,objectFit:"cover"}}/></div>}
      <div style={{padding:"0 13px 10px"}}>
        <p style={{fontSize:14,lineHeight:1.5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{post.content}</p>
        {post.link&&<div style={{marginTop:7,padding:"6px 10px",background:C.surface,borderRadius:7,border:`1px solid ${C.border}`,color:C.accent,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🔗 {post.link}</div>}
      </div>
      <div style={{padding:"7px 13px 11px",borderTop:`1px solid ${C.border}`,display:"flex",gap:12,alignItems:"center"}}>
        <button onClick={handleLike} style={{background:"none",border:"none",cursor:"pointer",color:liked?C.accent:C.muted,fontSize:12,display:"flex",alignItems:"center",gap:4,fontFamily:"DM Sans,sans-serif"}}>{liked?"❤️":"🤍"} {post.likes+(liked?1:0)}</button>
        <span style={{color:C.muted,fontSize:12}}>💬 {post.comments?.length||0}</span>
        <span style={{color:C.muted,fontSize:11}}>👁 {post.views?.toLocaleString()}</span>
        {(()=>{
          const exp=post.expiresAt?fmtExpiry(post.expiresAt):null;
          if(!exp) return <span style={{marginLeft:"auto",fontSize:10,color:C.teal,background:"rgba(45,212,191,.1)",border:"1px solid rgba(45,212,191,.2)",borderRadius:5,padding:"2px 6px"}}>♾️</span>;
          if(exp.expired) return null;
          return <span style={{marginLeft:"auto",fontSize:10,color:exp.color,background:`${exp.color}12`,border:`1px solid ${exp.color}33`,borderRadius:5,padding:"2px 6px",fontWeight:600}}>⏱ {exp.label}</span>;
        })()}
      </div>
    </div>
  );
}

// ─── CREATE MODAL ─────────────────────────────────────────────
function CreateModal({onPost,onClose,tier,sharesUsed}) {
  const t=gT(tier);
  const [type,setType]=useState("text");
  const [cat,setCat]=useState("community");
  const [text,setText]=useState("");
  const [link,setLink]=useState("");
  const [tags,setTags]=useState("");
  const [imgSrc,setImgSrc]=useState(null);
  const fileRef=useRef(null);
  const limitReached=t.ds!==Infinity&&sharesUsed>=t.ds;
  const charsLeft=t.cl-text.length;

  // Default zone: personal = "area", businesses might prefer "exact"
  // Only zones whose minTier ≤ current tier are selectable
  const availableZones=LOC_ZONES.filter(z=>TI[z.minTier]<=TI[tier]);
  const [locZone,setLocZone]=useState(availableZones[0]?.id||"area");
  const [showZonePicker,setShowZonePicker]=useState(false);
  const [notifyNearby,setNotifyNearby]=useState(false);
  const zone=gZ(locZone);

  // Duration
  const [durH,setDurH]=useState(()=>defaultDuration(tier,cat));
  const durOptions=availDurations(tier,cat);
  const catMaxDur=CAT_MAX_DUR[cat]||24;
  const showNudge=!gT(tier).maxDur===Infinity&&catMaxDur>gT(tier).maxDur; // category wants longer than tier allows

  const handleFile=e=>{
    const f=e.target.files[0];
    if(!f)return;
    const reader=new FileReader();
    reader.onload=ev=>setImgSrc(ev.target.result);
    reader.readAsDataURL(f);
  };

  const submit=()=>{
    if(!text.trim()||limitReached||charsLeft<0)return;
    const tagArr=tags.split(",").map(t=>t.trim().replace(/^#/,"")).filter(Boolean);
    onPost({type,cat,content:text,link:type==="link"?link:undefined,img:imgSrc||undefined,tags:tagArr,isAd:false,reach:0,views:0,dist:0,locZone,durH,expiresAt:durH===Infinity?null:Date.now()+durH*3600000});
    onClose();
  };

  const types=[["text","✍️","Text"],["photo","📷","Photo"],["link","🔗","Link"],["video","🎬","Video"]];

  return (
    <div className="mb" onClick={onClose} style={{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,.75)",backdropFilter:"blur(4px)",display:"flex",alignItems:"flex-end"}}>
      <div className="ms" onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,margin:"0 auto",background:C.card,borderRadius:"20px 20px 0 0",border:`1px solid ${C.border}`,padding:20,paddingBottom:28,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:18}}>New Post</div>
          <button onClick={onClose} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,width:28,height:28,cursor:"pointer",color:C.muted,fontSize:16}}>×</button>
        </div>
        {/* Daily limit bar */}
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"9px 12px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:11,color:C.muted}}>Daily shares</span><span style={{fontSize:11,color:t.ds===Infinity||sharesUsed<t.ds*0.8?C.green:C.accent,fontWeight:600}}>{t.ds===Infinity?"∞ Unlimited":`${sharesUsed} / ${t.ds}`}</span></div>
          {t.ds!==Infinity&&<div style={{height:3,background:C.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",borderRadius:2,background:sharesUsed/t.ds>.8?C.accent:C.green,width:`${Math.min(100,(sharesUsed/t.ds)*100)}%`,transition:"width .3s"}}/></div>}
        </div>
        {limitReached&&<div style={{background:`${C.accent}15`,border:`1px solid ${C.accent}44`,borderRadius:9,padding:"10px 13px",marginBottom:12,fontSize:12,color:C.accent}}>⚠️ Daily limit reached. Upgrade for more shares.</div>}
        {/* Type selector */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:7,marginBottom:12}}>
          {types.map(([id,ico,lbl])=><button key={id} onClick={()=>{setType(id);setImgSrc(null);}} style={{padding:"8px 4px",borderRadius:9,cursor:"pointer",border:`1px solid ${type===id?C.accent:C.border}`,background:type===id?C.aS:C.surface,color:type===id?C.accent:C.muted,fontSize:10,fontWeight:600,fontFamily:"Syne,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span style={{fontSize:14}}>{ico}</span>{lbl}</button>)}
        </div>
        {/* Category */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:600}}>CATEGORY</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {CATS.filter(c=>c.id!=="all").map(c=><button key={c.id} onClick={()=>{setCat(c.id);setDurH(defaultDuration(tier,c.id));}} style={{padding:"4px 9px",borderRadius:16,cursor:"pointer",border:`1px solid ${cat===c.id?c.color:C.border}`,background:cat===c.id?`${c.color}18`:C.surface,color:cat===c.id?c.color:C.muted,fontSize:10,fontWeight:600,transition:"all .15s"}}>{c.icon} {c.l}</button>)}
          </div>
        </div>
        {/* Photo upload */}
        {type==="photo"&&(
          <div style={{marginBottom:12}}>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
            {imgSrc?(
              <div style={{position:"relative",borderRadius:11,overflow:"hidden",marginBottom:8}}>
                <img src={imgSrc} alt="preview" style={{width:"100%",display:"block",maxHeight:200,objectFit:"cover"}}/>
                <button onClick={()=>setImgSrc(null)} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.6)",border:"none",borderRadius:"50%",width:26,height:26,cursor:"pointer",color:"white",fontSize:14}}>×</button>
              </div>
            ):(
              <button onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:"18px 0",borderRadius:11,border:`2px dashed ${C.border}`,background:C.surface,cursor:"pointer",color:C.muted,fontSize:13,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <span style={{fontSize:24}}>📷</span>
                <span>Tap to upload photo from device</span>
                <span style={{fontSize:11,color:C.muted}}>JPG, PNG, HEIC supported</span>
              </button>
            )}
          </div>
        )}
        {/* Text area with char counter */}
        <div style={{position:"relative",marginBottom:10}}>
          <Inp textarea rows={3} placeholder="What do you want to share?" value={text} onChange={e=>setText(e.target.value.slice(0,t.cl))} style={{paddingBottom:22}}/>
          <span style={{position:"absolute",bottom:8,right:10,fontSize:10,color:charsLeft<20?C.accent:C.muted}}>{charsLeft} left</span>
        </div>
        {type==="link"&&<Inp placeholder="URL / Link…" value={link} onChange={e=>setLink(e.target.value)} style={{marginBottom:10}}/>}
        <Inp placeholder="Tags (comma separated)" value={tags} onChange={e=>setTags(e.target.value)} style={{marginBottom:12}}/>

        {/* ── LOCATION ZONE PICKER ─────────────────────────── */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:7,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            📍 POST LOCATION ANCHOR
            <span style={{color:C.green,fontSize:10,fontWeight:400}}>· your real-time position is never shared</span>
          </div>
          {/* Selected zone button */}
          <button onClick={()=>setShowZonePicker(s=>!s)} style={{width:"100%",background:C.surface,border:`1px solid ${C.teal}55`,borderRadius:11,padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:11,transition:"all .2s"}}>
            <div style={{width:36,height:36,borderRadius:10,background:"rgba(45,212,191,.12)",border:`1px solid ${C.teal}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{zone.icon}</div>
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text}}>{zone.label}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>{zone.desc}</div>
            </div>
            <span style={{color:C.teal,fontSize:13}}>{showZonePicker?"▲":"▼"}</span>
          </button>

          {/* Zone picker dropdown */}
          {showZonePicker&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginTop:6,overflow:"hidden"}}>
              {LOC_ZONES.map(z=>{
                const available=TI[z.minTier]<=TI[tier];
                const tierNeeded=gT(z.minTier);
                const isSelected=locZone===z.id;
                return(
                  <div key={z.id} onClick={()=>{if(!available)return;setLocZone(z.id);setShowZonePicker(false);}}
                    style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:11,cursor:available?"pointer":"not-allowed",
                      background:isSelected?"rgba(45,212,191,.08)":available?"transparent":"rgba(0,0,0,.1)",
                      borderBottom:`1px solid ${C.border}`,opacity:available?1:.45,transition:"background .15s"}}>
                    <span style={{fontSize:18,width:24,textAlign:"center",flexShrink:0}}>{z.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:isSelected?C.teal:C.text}}>{z.label}</div>
                      <div style={{fontSize:11,color:C.muted}}>{z.desc}</div>
                    </div>
                    {!available&&(
                      <span style={{fontSize:10,color:tierNeeded.color,background:tierNeeded.cs,border:`1px solid ${tierNeeded.color}44`,borderRadius:5,padding:"1px 7px",fontWeight:700,fontFamily:"Syne,sans-serif",flexShrink:0}}>
                        {tierNeeded.icon} {tierNeeded.name}+
                      </span>
                    )}
                    {isSelected&&available&&<span style={{color:C.teal,fontSize:14,flexShrink:0}}>✓</span>}
                  </div>
                );
              })}
              {/* Privacy reminder */}
              <div style={{padding:"9px 14px",background:"rgba(61,220,132,.04)",display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{fontSize:13,flexShrink:0}}>🔒</span>
                <span style={{fontSize:11,color:C.muted,lineHeight:1.5}}>
                  Your <b style={{color:C.text}}>real-time GPS position</b> is never sent to anyone. Only this anchor zone is used — and only when you choose to share.
                </span>
              </div>
            </div>
          )}
        </div>
        {/* ── POST DURATION ──────────────────────────────────── */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:7,fontWeight:600}}>⏱ POST DURATION</div>
          {/* Category nudge for free users */}
          {(cat==="jobs"||cat==="retail"||cat==="music")&&gT(tier).maxDur===24&&(
            <div style={{background:"rgba(245,200,66,.08)",border:"1px solid rgba(245,200,66,.25)",borderRadius:9,padding:"9px 12px",marginBottom:9,display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{fontSize:13,flexShrink:0}}>💡</span>
              <div style={{fontSize:11,color:C.gold,lineHeight:1.5}}>
                <b>{CATS.find(c=>c.id===cat)?.l}</b> posts typically need more than 24 hours. Upgrade to Local+ to keep this post active for up to 3 days.
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {durOptions.map(d=>{
              const selected=durH===d.h;
              return(
                <button key={d.h} onClick={()=>setDurH(d.h)}
                  style={{padding:"8px 12px",borderRadius:10,cursor:"pointer",border:`1px solid ${selected?C.teal:C.border}`,background:selected?"rgba(45,212,191,.12)":C.surface,color:selected?C.teal:C.muted,fontSize:12,fontWeight:selected?700:400,transition:"all .2s",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <span style={{fontSize:14}}>{d.icon}</span>
                  <span style={{fontWeight:600,fontSize:11}}>{d.label}</span>
                  <span style={{fontSize:10,color:C.muted}}>{d.desc}</span>
                </button>
              );
            })}
          </div>
          {/* Personal post 24h note */}
          {!isPersonal({isAd:false})===false&&durH===24&&(
            <div style={{fontSize:11,color:C.muted,marginTop:7,display:"flex",gap:6,alignItems:"center"}}>
              <span>👻</span><span>Personal posts disappear after 24h — keeping your feed fresh and clutter-free.</span>
            </div>
          )}
        </div>
        {/* Notify nearby people — City Mayor+ only */}
        {TI[tier]>=TI["city"]&&(
          <div style={{background:notifyNearby?"rgba(245,200,66,.08)":C.surface,border:`1px solid ${notifyNearby?"rgba(245,200,66,.3)":C.border}`,borderRadius:11,padding:"11px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:12,transition:"all .2s"}}>
            <span style={{fontSize:18,flexShrink:0}}>📡</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:notifyNearby?C.gold:C.text}}>Notify nearby people</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2,lineHeight:1.5}}>Broadcast to Free/Local users in your anchor zone who opted into this category. Max once per recipient per 24h.</div>
            </div>
            <div onClick={()=>setNotifyNearby(n=>!n)} style={{width:44,height:26,borderRadius:13,background:notifyNearby?C.gold:C.border,cursor:"pointer",position:"relative",transition:"background .25s",flexShrink:0}}>
              <div style={{position:"absolute",top:3,left:notifyNearby?20:3,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .25s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
            </div>
          </div>
        )}
        <Btn onClick={submit} disabled={limitReached||!text.trim()||charsLeft<0} style={{width:"100%",padding:12}}>Share Now ◎</Btn>
      </div>
    </div>
  );
}

// ─── MAP VIEW ─────────────────────────────────────────────────
function MapView({posts,loc,tier}) {
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const markersRef=useRef([]);
  const [ready,setReady]=useState(!!window.L);

  useEffect(()=>{
    if(window.L){setReady(true);return;}
    const s=document.createElement("script");
    s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload=()=>setReady(true);
    document.head.appendChild(s);
  },[]);

  useEffect(()=>{
    if(!ready||!mapRef.current||!loc)return;
    const L=window.L;
    const t=gT(tier);
    if(mapInst.current){mapInst.current.remove();mapInst.current=null;}
    const map=L.map(mapRef.current,{center:[loc.lat,loc.lng],zoom:t.zoom,zoomControl:true,attributionControl:true});
    mapInst.current=map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'© <a href="https://openstreetmap.org">OSM</a>',maxZoom:19}).addTo(map);
    // Radius ring
    const rkm=t.r===Infinity?20000:t.r;
    L.circle([loc.lat,loc.lng],{radius:rkm*1000,color:t.color,weight:1.5,opacity:.5,fillColor:t.color,fillOpacity:.05,dashArray:"6 4"}).addTo(map);
    // You marker
    const youEl=document.createElement("div");
    youEl.style.cssText=`width:14px;height:14px;border-radius:50%;background:${C.green};border:3px solid ${C.bg};box-shadow:0 0 0 3px rgba(61,220,132,.3),0 0 12px ${C.green}`;
    L.marker([loc.lat,loc.lng],{icon:L.divIcon({html:youEl,className:"",iconSize:[14,14],iconAnchor:[7,7]}),zIndexOffset:1000}).addTo(map);
    // Post markers
    markersRef.current.forEach(m=>m.remove());markersRef.current=[];
    posts.forEach(post=>{
      const isLocked=post.minT&&TI[post.minT]>TI[tier];
      const lat=(loc.lat+post.lO)+(Math.random()-.5)*.003;
      const lng=(loc.lng+post.nO)+(Math.random()-.5)*.003;
      const cat=gC(post.cat);
      const color=isLocked?C.muted:cat.color||C.accent;
      const size=isLocked?9:13;
      const el=document.createElement("div");
      el.style.cssText=`width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid ${C.bg};opacity:${isLocked?.35:.95};box-shadow:0 0 0 2px ${color}44,0 2px 6px rgba(0,0,0,.4);${isLocked?"":"cursor:pointer;"}transition:transform .15s;`;
      if(!isLocked)el.addEventListener("mouseenter",()=>{el.style.transform="scale(1.4)";});
      if(!isLocked)el.addEventListener("mouseleave",()=>{el.style.transform="scale(1)";});
      const pop=L.popup({closeButton:true,maxWidth:210,offset:[0,-4]}).setContent(`
        <div style="padding:11px 13px;font-family:'DM Sans',sans-serif">
          <div style="font-weight:700;font-size:13px;color:${C.text};margin-bottom:2px">@${post.user}</div>
          <div style="color:${C.muted};font-size:11px;margin-bottom:7px">${post.dist}km · ${post.time}</div>
          <div style="font-size:12px;color:${C.text};line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${post.content}</div>
          <div style="margin-top:7px;font-size:10px;color:${isLocked?C.muted:C.teal}">${isLocked?"🔒 Upgrade to unlock":"◉ approx. location · tap to view"}</div>
        </div>`);
      const m=L.marker([lat,lng],{icon:L.divIcon({html:el,className:"",iconSize:[size,size],iconAnchor:[size/2,size/2]})}).bindPopup(pop).addTo(map);
      markersRef.current.push(m);
    });
    return()=>{if(mapInst.current){mapInst.current.remove();mapInst.current=null;}};
  },[ready,loc,tier,posts]);

  const t=gT(tier);
  const isReady=ready&&!!loc;
  return (
    <div style={{position:"relative",height:"calc(100vh - 125px)"}}>
      {!isReady&&<div style={{position:"absolute",inset:0,zIndex:20,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
        <div style={{position:"relative",width:50,height:50}}><div style={{position:"absolute",inset:0,borderRadius:"50%",border:`3px solid ${C.border}`,borderTop:`3px solid ${C.accent}`,animation:"sp .8s linear infinite"}}/><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>📍</div></div>
        <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:15}}>{!ready?"Loading map…":"Getting your location…"}</div>
        <div style={{color:C.muted,fontSize:12}}>Allow location access to continue</div>
      </div>}
      <div ref={mapRef} style={{width:"100%",height:"100%"}}/>
      {isReady&&<div style={{position:"absolute",top:12,left:12,zIndex:500,background:"rgba(8,8,14,.93)",backdropFilter:"blur(10px)",border:`1px solid ${t.color}55`,borderRadius:10,padding:"7px 12px",display:"flex",alignItems:"center",gap:7}}>
        <span style={{fontSize:13,color:t.color}}>{t.icon}</span>
        <span style={{fontSize:11,fontWeight:700,fontFamily:"Syne,sans-serif",color:t.color}}>{t.rl} radius</span>
      </div>}
      {isReady&&<div style={{position:"absolute",bottom:14,left:12,zIndex:500,background:"rgba(8,8,14,.93)",backdropFilter:"blur(8px)",border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 12px"}}>
        {[[C.green,"You"],[C.accent,"Visible post"],[C.muted,"Beyond radius"]].map(([col,l])=><div key={l} style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:C.muted,marginBottom:4}}><span style={{width:7,height:7,borderRadius:"50%",background:col,display:"inline-block",flexShrink:0}}/>{l}</div>)}
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:3,paddingTop:5,fontSize:10,color:C.gold}}>✦ Exact pins = Premium</div>
      </div>}
    </div>
  );
}

// ─── BOOST SCREEN ─────────────────────────────────────────────
function BoostScreen({posts,tier}) {
  const [checkout,setCheckout]=useState(null);
  const [boosted,setBoosted]=useState({});
  const [selectedPost,setSelectedPost]=useState(null);
  const unlocked=posts.filter(p=>!p.minT||TI[p.minT]<=TI[tier]);

  return (
    <div style={{padding:"18px 14px 100px"}}>
      <div style={{marginBottom:18}}>
        <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:20,marginBottom:4}}>Boost Posts</div>
        <div style={{color:C.muted,fontSize:13}}>Amplify your reach · Pay once, see results fast</div>
      </div>
      {/* Select post to boost */}
      <div style={{marginBottom:18}}>
        <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:8}}>SELECT POST TO BOOST</div>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {unlocked.slice(0,4).map(p=>(
            <button key={p.id} onClick={()=>setSelectedPost(selectedPost===p.id?null:p.id)} style={{background:selectedPost===p.id?C.aS:C.surface,border:`1px solid ${selectedPost===p.id?C.accent:C.border}`,borderRadius:10,padding:"10px 13px",cursor:"pointer",textAlign:"left",transition:"all .2s",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{p.av}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.content.slice(0,50)}…</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>👁 {p.views} · ❤️ {p.likes} {boosted[p.id]?<span style={{color:C.orange}}>🚀 Active boost</span>:""}</div>
              </div>
              {selectedPost===p.id&&<span style={{color:C.accent,fontSize:16}}>✓</span>}
            </button>
          ))}
        </div>
      </div>
      {/* Boost packages */}
      <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:10}}>BOOST PACKAGE</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {BOOSTS.map(b=>(
          <div key={b.id} style={{background:b.hot?C.aS:C.card,border:`1px solid ${b.hot?C.accent:C.border}`,borderRadius:14,padding:"14px 16px",position:"relative",boxShadow:b.hot?`0 0 24px ${C.aG}`:""}} >
            {b.hot&&<div style={{position:"absolute",top:-1,right:14,background:C.accent,color:"#08080e",borderRadius:"0 0 7px 7px",padding:"2px 10px",fontSize:9,fontWeight:700,fontFamily:"Syne,sans-serif"}}>POPULAR</div>}
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <div style={{width:38,height:38,borderRadius:10,background:`${b.color}20`,border:`1px solid ${b.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{b.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14}}>{b.name} <span style={{color:b.color,fontSize:12}}>· {b.mult} reach</span></div>
                <div style={{color:C.muted,fontSize:12,marginTop:2}}>{b.dur} active · {b.est}</div>
              </div>
              <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:17,color:b.hot?C.accent:C.text}}>{b.price}</div>
            </div>
            <button onClick={()=>{if(!selectedPost)return;setCheckout({name:`${b.name} Boost`,desc:`${b.mult} reach · ${b.dur}`,price:b.price,msg:`Your post is now boosted ${b.mult} for ${b.dur}!`,features:[`${b.mult} visibility multiplier`,`${b.est} estimated`,`Active for ${b.dur}`]});}}
              style={{width:"100%",padding:"9px 0",border:"none",borderRadius:9,cursor:selectedPost?"pointer":"not-allowed",background:selectedPost?b.color:`${b.color}50`,color:"#08080e",fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,transition:"all .2s",opacity:selectedPost?1:.6}}>
              {selectedPost?"Boost Now →":"Select a post first"}
            </button>
          </div>
        ))}
      </div>
      {checkout&&<Checkout item={checkout} onClose={()=>setCheckout(null)} onOk={()=>{setBoosted(b=>({...b,[selectedPost]:true}));}}/>}
    </div>
  );
}

// ─── NOTIFICATIONS SCREEN ────────────────────────────────────
function NotifsScreen({bprefs,onOpenBroadcastSettings}) {
  const [notifs,setNotifs]=useState(NOTIFS);
  const [activeTab,setActiveTab]=useState("activity"); // activity | broadcasts
  const unreadActivity=notifs.filter(n=>n.unread).length;
  // Filter broadcasts to only enabled categories
  const broadcasts=MOCK_BROADCASTS.filter(b=>!!bprefs.enabled[b.cat]);
  const unreadBroadcasts=broadcasts.filter(b=>b.unread).length;

  return(
    <div style={{padding:"0 0 100px"}}>
      {/* Tab switcher */}
      <div style={{padding:"14px 14px 0"}}>
        <div style={{display:"flex",background:C.surface,borderRadius:11,padding:3,border:`1px solid ${C.border}`,marginBottom:16}}>
          {[["activity","🔔 Activity",unreadActivity],["broadcasts","📡 Broadcasts",unreadBroadcasts]].map(([id,label,badge])=>(
            <button key={id} onClick={()=>setActiveTab(id)} style={{flex:1,padding:"9px 0",border:"none",cursor:"pointer",borderRadius:9,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:12,transition:"all .2s",background:activeTab===id?C.accent:"transparent",color:activeTab===id?"white":C.muted,boxShadow:activeTab===id?`0 2px 10px ${C.aG}`:"none",position:"relative"}}>
              {label}
              {badge>0&&activeTab!==id&&<span style={{marginLeft:5,background:"rgba(255,255,255,.25)",borderRadius:5,padding:"1px 5px",fontSize:10}}>{badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {activeTab==="activity"&&(
        <div style={{padding:"0 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{color:C.muted,fontSize:12}}>{unreadActivity} unread</span>
            {unreadActivity>0&&<button onClick={()=>setNotifs(n=>n.map(x=>({...x,unread:false})))} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"4px 10px",color:C.muted,cursor:"pointer",fontSize:11}}>Mark all read</button>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {notifs.map(n=>(
              <div key={n.id} onClick={()=>setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,unread:false}:x))}
                style={{background:n.unread?C.aS:C.card,border:`1px solid ${n.unread?C.aG:C.border}`,borderRadius:12,padding:"11px 14px",display:"flex",alignItems:"flex-start",gap:11,cursor:"pointer",transition:"all .2s"}}>
                <div style={{width:34,height:34,borderRadius:9,background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{n.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,lineHeight:1.5,color:n.unread?C.text:C.muted}}>{n.text}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:3}}>{n.time}</div>
                </div>
                {n.unread&&<div style={{width:7,height:7,borderRadius:"50%",background:C.accent,flexShrink:0,marginTop:5}}/>}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab==="broadcasts"&&(
        <div style={{padding:"0 14px"}}>
          {/* Settings shortcut */}
          <button onClick={onOpenBroadcastSettings} style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:11,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,transition:"all .2s"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>🎛️</span>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>Broadcast Preferences</div>
                <div style={{fontSize:11,color:C.muted,marginTop:1}}>
                  {Object.values(bprefs.enabled).filter(Boolean).length} categories · max {bprefs.dailyCap}/day · quiet {bprefs.quietStart}–{bprefs.quietEnd}
                </div>
              </div>
            </div>
            <span style={{color:C.muted,fontSize:14}}>→</span>
          </button>

          {broadcasts.length===0?(
            <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
              <div style={{fontSize:36,marginBottom:12}}>📡</div>
              <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:15,marginBottom:6}}>No broadcasts yet</div>
              <div style={{fontSize:13,lineHeight:1.6,marginBottom:16}}>
                {Object.values(bprefs.enabled).filter(Boolean).length===0
                  ?"Enable categories in Broadcast Preferences to start receiving nearby business notifications."
                  :"Broadcasts from nearby businesses in your selected categories will appear here."}
              </div>
              <Btn onClick={onOpenBroadcastSettings} style={{fontSize:13,padding:"10px 20px"}}>Set Preferences</Btn>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {broadcasts.map(b=>{
                const cat=BCAST_CATS.find(c=>c.id===b.cat)||BCAST_CATS[0];
                const band=distBand(b.dist);
                return(
                  <div key={b.id} style={{background:b.unread?`${C.accent}08`:C.card,border:`1px solid ${b.unread?C.accent+"33":C.border}`,borderRadius:14,overflow:"hidden",transition:"all .2s"}}>
                    {/* Broadcast type label */}
                    <div style={{background:`linear-gradient(90deg,${C.gS},transparent)`,borderBottom:`1px solid rgba(245,200,66,.1)`,padding:"4px 14px",display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontSize:10,color:C.gold,fontWeight:700,fontFamily:"Syne,sans-serif"}}>📡 NEARBY BROADCAST</span>
                      <span style={{fontSize:10,color:C.muted}}>·</span>
                      <span style={{fontSize:10,color:cat.color||C.muted,fontWeight:600}}>{cat.icon} {cat.l}</span>
                      <span style={{marginLeft:"auto",fontSize:10,color:band.color,fontWeight:600}}>{band.label}</span>
                    </div>
                    {/* Content */}
                    <div style={{padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:11}}>
                      <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(135deg,${C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0}}>{b.av}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                          <span style={{fontSize:13,fontWeight:600}}>@{b.user}</span>
                          <span style={{fontSize:10,color:C.gold,background:"rgba(245,200,66,.12)",border:"1px solid rgba(245,200,66,.25)",borderRadius:4,padding:"1px 5px",fontWeight:700}}>AD</span>
                          <span style={{fontSize:10,color:C.muted,marginLeft:"auto"}}>{b.time}</span>
                        </div>
                        <p style={{fontSize:13,lineHeight:1.5,color:C.text,marginBottom:10}}>{b.content}</p>
                        <div style={{display:"flex",gap:8}}>
                          <button style={{flex:1,background:C.aS,border:`1px solid ${C.accent}44`,borderRadius:8,padding:"8px 0",cursor:"pointer",color:C.accent,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:12}}>View Post →</button>
                          <button style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",cursor:"pointer",color:C.muted,fontSize:12}}>Dismiss</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{textAlign:"center",padding:"8px 0",fontSize:11,color:C.muted}}>
                Showing {broadcasts.length} of today's broadcasts · {bprefs.dailyCap} max per day
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── UPGRADE SCREEN ───────────────────────────────────────────
function UpgradeScreen({tier,onSelect}) {
  const [sel,setSel]=useState(null);
  const [checkout,setCheckout]=useState(null);
  const ci=TI[tier]||0;
  const rings=[{label:"1km",r:14,tid:"free"},{label:"5km",r:24,tid:"local"},{label:"50km",r:35,tid:"city"},{label:"500km",r:46,tid:"country"},{label:"5Kkm",r:57,tid:"continent"},{label:"🌍",r:68,tid:"world"}];
  return (
    <div style={{paddingBottom:100}}>
      <div style={{background:`linear-gradient(180deg,rgba(255,66,212,.07) 0%,${C.bg} 100%)`,padding:"24px 16px 18px",textAlign:"center",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:24,marginBottom:5,letterSpacing:-.5}}>How far will you <span style={{color:C.accent}}>reach?</span></div>
        <div style={{color:C.muted,fontSize:13,marginBottom:20}}>Walk into a radius → posts appear. Walk out → they disappear.</div>
        {/* Radar */}
        <div style={{position:"relative",width:150,height:150,margin:"0 auto 10px"}}>
          <svg viewBox="0 0 150 150" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
            {rings.map(r=>{const t=gT(r.tid);const active=TI[r.tid]<=ci;return <circle key={r.tid} cx={75} cy={75} r={r.r} fill="none" stroke={active?t.color:C.border} strokeWidth={active?1.5:.6} opacity={active?.7:.3} strokeDasharray={active?"none":"4 3"}/>;} )}
          </svg>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:12,height:12,borderRadius:"50%",background:C.green,boxShadow:`0 0 10px ${C.green}`}}/>
          {rings.map(r=>{const angle=-48+(TI[r.tid]*22);const rad=angle*(Math.PI/180);const x=75+r.r*Math.cos(rad);const y=75+r.r*Math.sin(rad);const t=gT(r.tid);const active=TI[r.tid]<=ci;return <div key={r.tid} style={{position:"absolute",left:x,top:y,transform:"translate(-50%,-50%)",fontSize:7,color:active?t.color:C.muted,fontWeight:700,fontFamily:"Syne,sans-serif",whiteSpace:"nowrap",opacity:active?1:.4}}>{r.label}</div>;})}
        </div>
        <div style={{fontSize:11,color:C.muted}}>Current: <span style={{color:gT(tier).color,fontWeight:700}}>{gT(tier).name}</span> · {gT(tier).rl}</div>
      </div>
      <div style={{padding:"16px 14px",display:"flex",flexDirection:"column",gap:10}}>
        {TIERS.map((t,i)=>{
          const isCur=t.id===tier,isSel=sel===t.id,isPast=i<ci;
          return (
            <div key={t.id} onClick={()=>!isCur&&!isPast&&setSel(isSel?null:t.id)}
              style={{background:isCur||isSel?t.cs:C.card,border:`1px solid ${isCur||isSel?t.color:C.border}`,borderRadius:18,padding:18,cursor:isCur||isPast?"default":"pointer",position:"relative",overflow:"hidden",opacity:isPast?.4:1,boxShadow:isSel?`0 0 28px ${t.color}44`:isCur?`0 0 18px ${t.color}22`:""}}>
              {(isCur||isSel)&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${t.color},transparent)`}}/>}
              {t.hot&&!isCur&&<div style={{position:"absolute",top:-1,right:13,background:t.color,color:"#08080e",borderRadius:"0 0 7px 7px",padding:"2px 10px",fontSize:9,fontWeight:700,fontFamily:"Syne,sans-serif"}}>POPULAR</div>}
              <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:(isSel||isCur)?12:0}}>
                <div style={{width:42,height:42,borderRadius:12,flexShrink:0,background:t.cs,border:`1px solid ${t.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:t.color}}>{t.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:16}}>{t.name}</span>
                    {isCur&&<span style={{background:t.cs,color:t.color,border:`1px solid ${t.color}44`,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700,fontFamily:"Syne,sans-serif"}}>CURRENT</span>}
                  </div>
                  <div style={{color:C.muted,fontSize:11}}>{t.tagline}</div>
                  <div style={{display:"flex",gap:9,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{color:t.color,fontSize:12,fontWeight:700}}>{t.icon} {t.scope}</span>
                    <span style={{color:C.muted,fontSize:10}}>· {t.rl}</span>
                    <span style={{color:C.muted,fontSize:11}}>· {t.ds===Infinity?"∞":t.ds} shares/day</span>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:18,color:isCur?t.color:C.text}}>{t.price}</div>
                  <div style={{color:C.muted,fontSize:10}}>{t.pn}</div>
                </div>
              </div>
              {(isSel||isCur)&&<div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:12,borderTop:`1px solid ${t.color}22`,paddingTop:12}}>{t.features.map(f=><div key={f} style={{fontSize:12,color:C.muted,display:"flex",alignItems:"flex-start",gap:8}}><span style={{color:t.color,flexShrink:0,marginTop:1}}>✓</span>{f}</div>)}</div>}
              {!isCur&&!isPast&&<button onClick={e=>{e.stopPropagation();setCheckout({name:`ShareMe ${t.name}`,desc:`${t.rl} radius · ${t.ds===Infinity?"Unlimited":t.ds+" shares"}/day`,price:t.price,msg:`Welcome to ${t.name}! Your new radius is ${t.rl}.`,features:t.features});}}
                style={{width:"100%",padding:"10px 0",border:"none",borderRadius:10,cursor:"pointer",background:isSel?t.color:t.cs,color:isSel?"#08080e":t.color,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,transition:"all .2s",boxShadow:isSel?`0 4px 16px ${t.color}55`:""}}>{isSel?"Confirm Upgrade →":`Upgrade to ${t.name}`}</button>}
              {isCur&&<div style={{textAlign:"center",color:t.color,fontSize:12,fontWeight:600,fontFamily:"Syne,sans-serif",padding:"5px 0"}}>✓ Your current plan</div>}
            </div>
          );
        })}
      </div>
      {checkout&&<Checkout item={checkout} onClose={()=>setCheckout(null)} onOk={()=>{const t=TIERS.find(t=>t.price===checkout.price);if(t)onSelect(t.id);}}/>}
    </div>
  );
}

// ─── PROFILE SCREEN ───────────────────────────────────────────
function ProfileScreen({user,tier,onTab,sharesUsed,myStatus,onStatusToggle,privacySettings,onPrivacyUpdate}) {
  const t=gT(tier);
  const [editing,setEditing]=useState(false);
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [bio,setBio]=useState("Sharing the best of my city 📍");
  const [website,setWebsite]=useState("");
  const [instagram,setInstagram]=useState("");
  const [twitter,setTwitter]=useState("");
  const [facebook,setFacebook]=useState("");
  // Verification
  const [verifyStep,setVerifyStep]=useState("idle"); // idle | form | pending | verified
  const [docFile,setDocFile]=useState(null);
  const docRef=useRef(null);
  const pi={google:"🔵",apple:"⚫",facebook:"🔷",twitter:"✖",email:"✉️",phone:"📱"};
  const pl={google:"Google",apple:"Apple ID",facebook:"Facebook",twitter:"X",email:"Email",phone:"Phone"};
  return (
    <div style={{padding:"18px 14px 100px"}}>
      {/* Card */}
      <div style={{background:C.card,border:`1px solid ${t.color}44`,borderRadius:18,padding:20,marginBottom:14,boxShadow:`0 0 28px ${t.color}22`}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:14}}>
          <div style={{width:66,height:66,borderRadius:18,flexShrink:0,background:`linear-gradient(135deg,${t.color},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:700,fontFamily:"Syne,sans-serif",boxShadow:`0 4px 18px ${t.color}55`}}>{user.name.slice(0,2).toUpperCase()}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
              <span style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:18}}>{user.name}</span>
              {verifyStep==="verified"&&<span style={{background:"rgba(61,220,132,.15)",color:C.green,border:"1px solid rgba(61,220,132,.3)",borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:700}}>✓ Verified</span>}
            </div>
            <div style={{color:C.muted,fontSize:12,marginTop:2,display:"flex",alignItems:"center",gap:5}}><span>{pi[user.provider]||"👤"}</span><span>via {pl[user.provider]||"Social"}</span></div>
            <div style={{marginTop:8}}><TBadge id={tier} lg/></div>
          </div>
          <button onClick={()=>setEditing(!editing)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px",cursor:"pointer",color:C.muted,fontSize:11,fontFamily:"Syne,sans-serif",fontWeight:600}}>{editing?"Done":"Edit"}</button>
        </div>
        {editing?(
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <Inp textarea rows={2} placeholder="Bio…" value={bio} onChange={e=>setBio(e.target.value)}/>
            <Inp placeholder="🌐 Website URL" value={website} onChange={e=>setWebsite(e.target.value)}/>
            <Inp placeholder="📸 Instagram handle" value={instagram} onChange={e=>setInstagram(e.target.value)}/>
            <Inp placeholder="✖ X handle" value={twitter} onChange={e=>setTwitter(e.target.value)}/>
            <Inp placeholder="🔷 Facebook URL" value={facebook} onChange={e=>setFacebook(e.target.value)}/>
          </div>
        ):(
          <div>
            {bio&&<p style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:8}}>{bio}</p>}
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {website&&<a href={website} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:C.blue,textDecoration:"none"}}>🌐 Website</a>}
              {instagram&&<span style={{fontSize:12,color:"#e1306c"}}>📸 @{instagram}</span>}
              {twitter&&<span style={{fontSize:12,color:C.text}}>✖ @{twitter}</span>}
              {facebook&&<span style={{fontSize:12,color:"#1877F2"}}>🔷 Facebook</span>}
            </div>
          </div>
        )}
      </div>

      {/* Stats grid — 8 metrics */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:8}}>YOUR STATS</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          {[
            {icon:"📝",label:"Posts shared",   value:"3",     color:t.color},
            {icon:"❤️",label:"Total likes",    value:"402",   color:C.accent},
            {icon:"💬",label:"Comments",        value:"42",    color:C.purple},
            {icon:"👁", label:"Total views",    value:"1,886", color:C.blue},
            {icon:"🔗",label:"Link clicks",    value:"312",   color:C.teal},
            {icon:"◉", label:"Max reach",      value:t.r===Infinity?"∞ World":`${t.r} km`, color:C.green},
            {icon:"⚡",label:"Active posts",   value:"2",     color:C.orange},
            {icon:"🏆",label:"Longest post",   value:"6 days",color:C.gold},
          ].map(s=>(
            <div key={s.label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:13,padding:"13px 14px",display:"flex",alignItems:"center",gap:11}}>
              <div style={{width:36,height:36,borderRadius:10,background:`${s.color}15`,border:`1px solid ${s.color}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{s.icon}</div>
              <div style={{minWidth:0}}>
                <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:16,color:s.color,lineHeight:1}}>{s.value}</div>
                <div style={{color:C.muted,fontSize:11,marginTop:3}}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily share counter */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:C.muted}}>Daily shares used</span><span style={{fontSize:12,color:t.ds===Infinity||sharesUsed<t.ds*0.8?C.green:C.accent,fontWeight:600}}>{t.ds===Infinity?"∞ Unlimited":`${sharesUsed} / ${t.ds}`}</span></div>
        {t.ds!==Infinity&&<div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",borderRadius:2,background:sharesUsed/t.ds>.8?C.accent:C.green,width:`${Math.min(100,(sharesUsed/t.ds)*100)}%`,transition:"width .3s"}}/></div>}
        <div style={{fontSize:11,color:C.muted,marginTop:6}}>Char limit per post: <span style={{color:t.color,fontWeight:600}}>{t.cl.toLocaleString()} chars</span></div>
      </div>

      {/* Free to Chat toggle */}
      <div style={{background:myStatus?`linear-gradient(135deg,rgba(61,220,132,.1),rgba(61,220,132,.05))`:`${C.card}`,border:`1px solid ${myStatus?C.green:C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14,transition:"all .3s"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:12,background:myStatus?"rgba(61,220,132,.15)":C.surface,border:`1px solid ${myStatus?C.green:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,transition:"all .3s"}}>💬</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:7}}>
              Free to Chat
              {myStatus&&<span style={{background:"rgba(61,220,132,.15)",color:C.green,border:"1px solid rgba(61,220,132,.3)",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700,fontFamily:"Syne,sans-serif"}}>● ON</span>}
            </div>
            <div style={{color:C.muted,fontSize:12,marginTop:2,lineHeight:1.5}}>
              {myStatus?"You're visible to nearby people. They can message you.":"Off — you won't appear on nearby people's list."}
            </div>
          </div>
          {/* Toggle switch */}
          <div onClick={onStatusToggle} style={{width:46,height:26,borderRadius:13,background:myStatus?C.green:C.border,cursor:"pointer",position:"relative",transition:"background .3s",flexShrink:0}}>
            <div style={{position:"absolute",top:3,left:myStatus?22:3,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .3s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
          </div>
        </div>
        {myStatus&&(
          <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid rgba(61,220,132,.15)",display:"flex",gap:16}}>
            <span style={{fontSize:12,color:C.muted}}>👥 {NEARBY_PEOPLE.filter(p=>p.status).length} nearby can see you</span>
            <span style={{fontSize:12,color:C.muted}}>📍 Within {gT(tier).rl}</span>
          </div>
        )}
      </div>

      {/* Verification */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px",marginBottom:14}}>
        <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14,marginBottom:4,display:"flex",alignItems:"center",gap:7}}>
          Account Verification {verifyStep==="verified"&&<span style={{color:C.green,fontSize:12}}>✓ Verified</span>}
        </div>
        <div style={{color:C.muted,fontSize:12,marginBottom:12,lineHeight:1.6}}>Get a free ✓ verified checkmark by providing a valid ID or business document. <span style={{color:C.green}}>Free for all users.</span></div>
        {verifyStep==="idle"&&<Btn onClick={()=>setVerifyStep("form")} style={{width:"100%",padding:10,fontSize:12}}>Get Verified — Free ✓</Btn>}
        {verifyStep==="form"&&<>
          <input ref={docRef} type="file" accept="image/*,.pdf" onChange={e=>{setDocFile(e.target.files[0]?.name);}} style={{display:"none"}}/>
          <button onClick={()=>docRef.current?.click()} style={{width:"100%",padding:"13px 0",borderRadius:10,border:`2px dashed ${C.border}`,background:C.surface,cursor:"pointer",color:C.muted,fontSize:12,marginBottom:10,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
            <span style={{fontSize:22}}>📄</span>
            {docFile?<span style={{color:C.green}}>✓ {docFile}</span>:<span>Upload ID or Business Document</span>}
          </button>
          <Btn onClick={()=>{if(docFile)setVerifyStep("pending");}} disabled={!docFile} style={{width:"100%",padding:10,fontSize:12}}>Submit for Review</Btn>
        </>}
        {verifyStep==="pending"&&<div style={{background:"rgba(245,200,66,.1)",border:`1px solid rgba(245,200,66,.3)`,borderRadius:9,padding:"10px 13px",fontSize:12,color:C.gold}}>⏳ Your document is under review. Usually takes 24–48 hours.</div>}
        {verifyStep==="verified"&&<div style={{background:"rgba(61,220,132,.1)",border:"1px solid rgba(61,220,132,.3)",borderRadius:9,padding:"10px 13px",fontSize:12,color:C.green}}>✓ Your account is verified! The checkmark now appears on all your posts.</div>}
        {/* Dev shortcut */}
        {verifyStep==="pending"&&<button onClick={()=>setVerifyStep("verified")} style={{marginTop:8,background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:11,textDecoration:"underline"}}>Simulate approval (demo)</button>}
      </div>

      <button onClick={()=>setShowPrivacy(true)} style={{width:"100%",padding:13,borderRadius:11,background:C.card,border:`1px solid ${C.teal}`,color:C.teal,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:10}}>
        👻 Location Privacy Settings
      </button>
      <button onClick={()=>onTab("upgrade")} className="btn-primary" style={{width:"100%",padding:13,borderRadius:11,background:`linear-gradient(135deg,${C.accent},${C.purple})`,border:"none",color:"white",fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:`0 4px 14px ${C.aG}`}}>Upgrade Plan ✦</button>
    </div>
  );
}

// ─── METRICS SCREEN ───────────────────────────────────────────
function MetricsScreen({tier}) {
  const t=gT(tier);
  const tv=MY_METRICS.reduce((a,p)=>a+p.views,0),tl=MY_METRICS.reduce((a,p)=>a+p.likes,0),tc=MY_METRICS.reduce((a,p)=>a+p.comments,0),tk=MY_METRICS.reduce((a,p)=>a+p.clicks,0);
  const stats=[{l:"Views",v:tv,i:"👁",c:C.blue},{l:"Likes",v:tl,i:"❤️",c:C.accent},{l:"Comments",v:tc,i:"💬",c:C.purple},{l:"Clicks",v:tk,i:"🔗",c:C.teal}];
  return (
    <div style={{padding:"18px 14px 100px"}}>
      <div style={{marginBottom:18}}><div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:20,marginBottom:3}}>Analytics</div><div style={{color:C.muted,fontSize:12,display:"flex",alignItems:"center",gap:7}}>Content performance · <TBadge id={tier}/></div></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
        {stats.map(s=><div key={s.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 13px",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:-7,right:-7,fontSize:34,opacity:.06}}>{s.i}</div><div style={{fontSize:18,marginBottom:5}}>{s.i}</div><div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:22,color:s.c}}>{s.v}</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>{s.l}</div></div>)}
      </div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:16,marginBottom:14}}>
        <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14,marginBottom:14,display:"flex",alignItems:"center",gap:7}}><span style={{color:C.teal}}>◉</span> Reach per Post</div>
        {MY_METRICS.map((p,i)=>{const pct=t.r===Infinity?90:Math.min(98,(p.reach/t.r)*100);const col=pct>80?C.accent:pct>50?C.gold:C.teal;return(
          <div key={p.id} style={{marginBottom:i<MY_METRICS.length-1?16:0}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,maxWidth:"65%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.content}</span><span style={{fontSize:11,color:col,fontWeight:700,fontFamily:"Syne,sans-serif"}}>{p.reach}km</span></div>
            <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",borderRadius:2,background:`linear-gradient(90deg,${col},${col}88)`,width:`${pct}%`,transition:"width 1.2s cubic-bezier(.4,0,.2,1)"}}/></div>
            <div style={{display:"flex",gap:12,marginTop:4}}><span style={{fontSize:10,color:C.muted}}>👁 {p.views}</span><span style={{fontSize:10,color:C.muted}}>❤️ {p.likes}</span><span style={{fontSize:10,color:C.muted}}>🔗 {p.clicks} clicks</span><span style={{fontSize:10,color:C.muted,marginLeft:"auto"}}>{p.time}</span></div>
          </div>
        );})}
      </div>
      {tier==="free"&&<div style={{background:`linear-gradient(135deg,${C.gS},rgba(123,47,255,.08))`,border:"1px solid rgba(245,200,66,.2)",borderRadius:14,padding:14,display:"flex",gap:11}}><span style={{fontSize:20,flexShrink:0}}>✦</span><div><div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,color:C.gold,marginBottom:3}}>Unlock advanced analytics</div><div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>Upgrade to see demographic data, hourly reach, and click-through rates.</div></div></div>}
    </div>
  );
}

// ─── PRIVACY SETTINGS SCREEN ─────────────────────────────────
function PrivacySettingsScreen({tier,privacySettings,onUpdate,onBack}) {
  const t=gT(tier);
  const [settings,setSettings]=useState(privacySettings);
  const save=key=>val=>{
    const updated={...settings,[key]:val};
    setSettings(updated);
    onUpdate(updated);
  };

  const Toggle=({value,onChange})=>(
    <div onClick={()=>onChange(!value)} style={{width:44,height:26,borderRadius:13,background:value?C.green:C.border,cursor:"pointer",position:"relative",transition:"background .25s",flexShrink:0}}>
      <div style={{position:"absolute",top:3,left:value?22:3,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .25s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
    </div>
  );

  const Row=({icon,title,desc,value,onChange,warn})=>(
    <div style={{background:C.card,border:`1px solid ${warn&&value?C.accent:C.border}`,borderRadius:13,padding:"14px 15px",marginBottom:10,transition:"border-color .2s"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:38,height:38,borderRadius:11,background:warn&&value?C.aS:C.surface,border:`1px solid ${warn&&value?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0,transition:"all .2s"}}>{icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{title}</div>
          <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{desc}</div>
        </div>
        <Toggle value={value} onChange={onChange}/>
      </div>
      {warn&&value&&(
        <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.accent}22`,fontSize:11,color:C.accent,display:"flex",gap:7,alignItems:"flex-start"}}>
          <span style={{flexShrink:0}}>⚠️</span>
          <span>{warn}</span>
        </div>
      )}
    </div>
  );

  return(
    <div style={{padding:"18px 14px 100px"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:20,padding:"0 4px",display:"flex",alignItems:"center"}}>←</button>
        <div>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:20}}>Location Privacy</div>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>You are invisible by default · control what you share</div>
        </div>
      </div>

      {/* Ghost mode explainer */}
      <div style={{background:`linear-gradient(135deg,rgba(61,220,132,.08),rgba(61,220,132,.03))`,border:"1px solid rgba(61,220,132,.2)",borderRadius:14,padding:"13px 15px",marginBottom:20,display:"flex",gap:11,alignItems:"flex-start"}}>
        <span style={{fontSize:22,flexShrink:0}}>👻</span>
        <div>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,color:C.green,marginBottom:4}}>Ghost Mode is always on by default</div>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>
            Browsing the feed and map <b style={{color:C.text}}>never reveals your position</b> to anyone. Your GPS is used only on your device to determine what's nearby. You become visible only when you choose to share a post or turn on Free to Chat.
          </div>
        </div>
      </div>

      {/* Default post location */}
      <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:8}}>DEFAULT POST LOCATION ANCHOR</div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:13,overflow:"hidden",marginBottom:16}}>
        {LOC_ZONES.map((z,i)=>{
          const available=TI[z.minTier]<=TI[tier];
          const isSelected=settings.defaultZone===z.id;
          const tierNeeded=gT(z.minTier);
          return(
            <div key={z.id} onClick={()=>{if(!available)return;save("defaultZone")(z.id);}}
              style={{padding:"12px 15px",display:"flex",alignItems:"center",gap:11,cursor:available?"pointer":"not-allowed",
                background:isSelected?"rgba(45,212,191,.08)":"transparent",
                borderBottom:i<LOC_ZONES.length-1?`1px solid ${C.border}`:"none",
                opacity:available?1:.4,transition:"background .15s"}}>
              <span style={{fontSize:18,width:24,textAlign:"center",flexShrink:0}}>{z.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:isSelected?C.teal:C.text}}>{z.label}</div>
                <div style={{fontSize:11,color:C.muted}}>{z.desc}</div>
              </div>
              {!available&&<span style={{fontSize:10,color:tierNeeded.color,background:tierNeeded.cs,border:`1px solid ${tierNeeded.color}44`,borderRadius:5,padding:"1px 7px",fontWeight:700,fontFamily:"Syne,sans-serif",flexShrink:0}}>{tierNeeded.icon} {tierNeeded.name}+</span>}
              {isSelected&&available&&<div style={{width:18,height:18,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:10,color:"#08080e",fontWeight:700}}>✓</span></div>}
            </div>
          );
        })}
      </div>

      {/* Privacy toggles */}
      <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:8}}>SHARING CONTROLS</div>

      <Row icon="💬" title="Free to Chat visibility"
        desc="When on, you appear in nearby people's Chat tab. Turn off to be completely invisible while still browsing."
        value={settings.freeToChat} onChange={save("freeToChat")}/>

      <Row icon="📍" title="Show post location zone"
        desc="Display the location zone (e.g. 'City area') on your posts. Turning off shows posts with no location hint."
        value={settings.showZoneOnPost} onChange={save("showZoneOnPost")}/>

      <Row icon="🕐" title="Round post timestamps"
        desc="Show 'this morning' instead of exact times to prevent routine pattern tracking."
        value={settings.roundTimestamps} onChange={save("roundTimestamps")}/>

      <Row icon="👤" title="Personal account mode"
        desc="Posts default to broad location zones. Businesses may want this off for precise venue pinning."
        value={settings.personalMode} onChange={save("personalMode")}/>

      <Row icon="⚠️" title="Exact pin (City Mayor+)"
        desc="Allow your post to be pinned to an exact spot on the map. Only available on City Mayor tier and above."
        value={settings.allowExactPin && TI[tier]>=TI["city"]}
        onChange={v=>{if(TI[tier]<TI["city"])return;save("allowExactPin")(v);}}
        warn="Exact pins reveal a specific location. Consider whether this is safe for personal posts."/>

      {/* Data note */}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginTop:6,display:"flex",gap:9,alignItems:"flex-start"}}>
        <span style={{fontSize:15,flexShrink:0}}>🔒</span>
        <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>
          Your real-time GPS coordinates are <b style={{color:C.text}}>processed locally on your device</b> and are never transmitted to ShareMe servers or other users. Only the zone you select when posting is stored.
        </div>
      </div>
    </div>
  );
}

// ─── UNIFIED CHAT TAB ─────────────────────────────────────────
function ChatTab({myStatus,onStatusToggle,convos,onOpenDM,onOpenGroup,onOpenChannel,groups,channels,tier,user,onCreateGroup,onDeleteGroup}) {
  const [section,setSection]=useState("people"); // people | groups | channels | dms
  const t=gT(tier);
  const myGroup=groups.find(g=>g.owner===user?.name?.toLowerCase().replace(/ /g,"_"));
  const totalUnread=convos.reduce((a,c)=>a+(c.unread||0),0);
  const unreadGroups=groups.reduce((a,g)=>a+(g.unread||0),0);

  // Check if convo is expired (grace ended) vs just out of range
  const convoState=(c)=>{
    if(c.graceUntil&&Date.now()>c.graceUntil) return "history"; // read-only history
    if(c.graceUntil&&Date.now()<c.graceUntil) return "grace";
    if(!c.active) return "inactive";
    return "active";
  };

  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 125px)"}}>
      {/* My status strip */}
      <div onClick={onStatusToggle} style={{background:myStatus?"rgba(61,220,132,.08)":C.surface,borderBottom:`1px solid ${myStatus?"rgba(61,220,132,.2)":C.border}`,padding:"10px 14px",display:"flex",alignItems:"center",gap:11,cursor:"pointer",transition:"all .2s",flexShrink:0}}>
        <div style={{width:36,height:36,borderRadius:11,background:myStatus?"rgba(61,220,132,.15)":C.card,border:`1px solid ${myStatus?C.green:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,transition:"all .2s"}}>💬</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:myStatus?C.green:C.text,fontFamily:"Syne,sans-serif"}}>Free to Chat {myStatus&&<span style={{fontSize:9,background:"rgba(61,220,132,.2)",color:C.green,borderRadius:4,padding:"1px 5px",fontWeight:700}}>● ON</span>}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:1}}>{myStatus?"Visible to people nearby · tap to turn off":"Off — tap to become visible nearby"}</div>
        </div>
        <div style={{width:40,height:24,borderRadius:12,background:myStatus?C.green:C.border,position:"relative",flexShrink:0,transition:"background .25s"}}>
          <div style={{position:"absolute",top:2,left:myStatus?18:2,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .25s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.bg}}>
        {[
          ["people","👥 People"],
          ["groups","🏠 Groups",unreadGroups],
          ["channels","📢 Channels"],
          ["dms","💬 DMs",totalUnread],
        ].map(([id,label,badge])=>(
          <button key={id} onClick={()=>setSection(id)} style={{flex:1,padding:"10px 0",border:"none",background:"none",cursor:"pointer",fontSize:11,fontWeight:section===id?700:400,fontFamily:"Syne,sans-serif",color:section===id?C.accent:C.muted,borderBottom:section===id?`2px solid ${C.accent}`:"2px solid transparent",transition:"all .2s",position:"relative"}}>
            {label}
            {badge>0&&<span style={{marginLeft:4,background:C.accent,color:"white",borderRadius:5,padding:"0 4px",fontSize:9,fontWeight:700}}>{badge}</span>}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"12px 14px 100px"}}>

        {/* ── PEOPLE ── */}
        {section==="people"&&(
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            {!myStatus&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 15px",textAlign:"center"}}>
              <div style={{fontSize:24,marginBottom:8}}>👻</div>
              <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14,marginBottom:4}}>You're in ghost mode</div>
              <div style={{color:C.muted,fontSize:12,lineHeight:1.6}}>Turn on Free to Chat above to see and be seen by people nearby.</div>
            </div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:C.muted,fontWeight:600}}>NEARBY · {t.scope}</span>
              <span style={{fontSize:11,color:C.green}}>{NEARBY_PEOPLE.filter(p=>p.status).length} free to chat</span>
            </div>
            {NEARBY_PEOPLE.sort((a,b)=>a.dist-b.dist).map(person=>{
              const canMsg=myStatus&&person.status;
              const band=distBand(person.dist);
              return(
                <div key={person.id} onClick={()=>canMsg&&onOpenDM(person)}
                  style={{background:C.card,border:`1px solid ${canMsg?"rgba(61,220,132,.25)":C.border}`,borderRadius:13,padding:"12px 13px",display:"flex",alignItems:"center",gap:11,cursor:canMsg?"pointer":"default",transition:"all .2s",opacity:!myStatus&&!person.status?.5:1}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:42,height:42,borderRadius:12,background:`linear-gradient(135deg,${person.status?C.green:C.muted},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,opacity:person.status?1:.6}}>{person.av}</div>
                    <div style={{position:"absolute",bottom:-2,right:-2,width:10,height:10,borderRadius:"50%",background:person.status?C.green:C.border,border:`2px solid ${C.bg}`,boxShadow:person.status?`0 0 5px ${C.green}`:""}}/> 
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontWeight:600,fontSize:13}}>@{person.user}</span>
                      {person.status&&<span style={{background:"rgba(61,220,132,.1)",color:C.green,fontSize:9,fontWeight:700,borderRadius:4,padding:"1px 5px"}}>Free to chat</span>}
                    </div>
                    <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{person.bio}</div>
                    <span style={{fontSize:10,color:band.color}}>{band.label}</span>
                  </div>
                  {canMsg&&<div style={{background:"rgba(61,220,132,.12)",border:"1px solid rgba(61,220,132,.25)",borderRadius:7,padding:"5px 9px",color:C.green,fontSize:11,fontWeight:700,flexShrink:0}}>DM</div>}
                </div>
              );
            })}
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 13px",display:"flex",gap:8,alignItems:"flex-start",marginTop:4}}>
              <span style={{fontSize:13,flexShrink:0}}>📍</span>
              <span style={{fontSize:11,color:C.muted,lineHeight:1.5}}>Both must have Free to Chat on · Messages stay as read-only history when out of range · New replies need proximity again</span>
            </div>
          </div>
        )}

        {/* ── GROUPS ── */}
        {section==="groups"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* Create / manage group */}
            {myGroup?(
              <div style={{background:"rgba(61,220,132,.06)",border:"1px solid rgba(61,220,132,.2)",borderRadius:13,padding:"12px 14px",display:"flex",alignItems:"center",gap:11}}>
                <div style={{width:38,height:38,borderRadius:11,background:"rgba(61,220,132,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{myGroup.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.green}}>Your group: {myGroup.name}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:1}}>{myGroup.members} members · active</div>
                </div>
                <button onClick={()=>onDeleteGroup(myGroup.id)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 9px",cursor:"pointer",color:C.muted,fontSize:11}}>Delete</button>
              </div>
            ):(
              <button onClick={onCreateGroup} style={{background:C.aS,border:`1px solid ${C.accent}44`,borderRadius:13,padding:"13px 15px",cursor:"pointer",display:"flex",alignItems:"center",gap:11,width:"100%",transition:"all .2s"}}>
                <div style={{width:38,height:38,borderRadius:11,background:C.aS,border:`1px solid ${C.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>+</div>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.accent}}>Create a Group</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:1}}>One group per user · auto-expires when empty 24h</div>
                </div>
              </button>
            )}

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:C.muted,fontWeight:600}}>NEARBY GROUPS · {t.scope}</span>
              <span style={{fontSize:11,color:C.muted}}>{groups.length} active</span>
            </div>

            {groups.map(g=>(
              <div key={g.id} onClick={()=>onOpenGroup(g)}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:13,overflow:"hidden",cursor:"pointer",transition:"all .2s"}}>
                <div style={{padding:"12px 13px",display:"flex",alignItems:"center",gap:11}}>
                  <div style={{width:42,height:42,borderRadius:12,background:`linear-gradient(135deg,${C.purple},${C.blue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{g.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{g.name}</div>
                    <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.desc}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:11,color:C.green,fontWeight:600}}>{g.members}/{g.maxMembers}</div>
                    <div style={{fontSize:10,color:C.muted}}>members</div>
                    {(()=>{const band=distBand(g.dist);return <div style={{fontSize:9,color:band.color,marginTop:2}}>{band.label}</div>})()}
                  </div>
                </div>
                {g.msgs?.length>0&&<div style={{padding:"8px 13px 11px",borderTop:`1px solid ${C.border}`,fontSize:12,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  <b style={{color:C.text}}>@{g.msgs[g.msgs.length-1].user}:</b> {g.msgs[g.msgs.length-1].text}
                </div>}
              </div>
            ))}
            {groups.length===0&&<div style={{textAlign:"center",padding:"30px 20px",color:C.muted}}><div style={{fontSize:32,marginBottom:10}}>🏠</div><div>No groups in your {t.scope} yet — create one!</div></div>}
          </div>
        )}

        {/* ── CHANNELS ── */}
        {section==="channels"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4,lineHeight:1.6}}>
              Channels are one-way broadcasts from local businesses. Follow to receive their updates.
            </div>
            {channels.map(ch=>(
              <div key={ch.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:13,padding:"13px 14px",display:"flex",alignItems:"center",gap:11,transition:"all .2s"}}>
                <div style={{width:44,height:44,borderRadius:13,background:`linear-gradient(135deg,${C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{ch.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{fontWeight:600,fontSize:13}}>{ch.name}</span>
                    {ch.verified&&<span style={{color:C.green,fontSize:11}}>✓</span>}
                    <span style={{fontSize:9,color:C.gold,background:C.gS,borderRadius:4,padding:"1px 5px",fontWeight:700}}>AD</span>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ch.lastPost.text}</div>
                  <div style={{display:"flex",gap:10}}>
                    <span style={{fontSize:10,color:C.muted}}>👥 {ch.followers.toLocaleString()}</span>
                    <span style={{fontSize:10,color:C.muted}}>{ch.lastPost.time}</span>
                    {(()=>{const b=distBand(ch.dist);return <span style={{fontSize:10,color:b.color}}>{b.label}</span>})()}
                  </div>
                </div>
                <button onClick={()=>onOpenChannel(ch)} style={{background:ch.following?C.surface:C.aS,border:`1px solid ${ch.following?C.border:C.accent}`,borderRadius:8,padding:"6px 11px",cursor:"pointer",color:ch.following?C.muted:C.accent,fontSize:11,fontWeight:700,fontFamily:"Syne,sans-serif",flexShrink:0,whiteSpace:"nowrap"}}>
                  {ch.following?"Following":"Follow"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── DMs ── */}
        {section==="dms"&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {convos.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}><div style={{fontSize:32,marginBottom:10}}>💬</div><div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:15,marginBottom:5}}>No messages yet</div><div style={{fontSize:12,lineHeight:1.6}}>Go to People, turn on Free to Chat, and tap DM on someone nearby.</div></div>}
            {convos.map(c=>{
              const state=convoState(c);
              const last=c.msgs[c.msgs.length-1];
              return(
                <div key={c.id} onClick={()=>onOpenDM(c.with,c)}
                  style={{background:c.unread>0?C.aS:C.card,border:`1px solid ${c.unread>0?C.aG:C.border}`,borderRadius:13,padding:"11px 13px",display:"flex",alignItems:"center",gap:11,cursor:"pointer",opacity:state==="history"?.6:1,transition:"all .2s"}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:42,height:42,borderRadius:12,background:`linear-gradient(135deg,${state==="active"?C.green:C.muted},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700}}>{c.with.av}</div>
                    <div style={{position:"absolute",bottom:-2,right:-2,width:10,height:10,borderRadius:"50%",background:state==="active"?C.green:C.muted,border:`2px solid ${C.bg}`}}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontWeight:600,fontSize:13}}>@{c.with.user}</span>
                      <span style={{fontSize:10,color:C.muted}}>{last?.time}</span>
                    </div>
                    <div style={{fontSize:12,color:c.unread>0?C.text:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last?.mine?"You: ":""}{last?.text}</div>
                    <div style={{fontSize:10,marginTop:3,color:state==="active"?C.green:state==="grace"?C.gold:state==="history"?C.muted:C.muted}}>
                      {state==="active"&&"● In range · active"}
                      {state==="grace"&&"⏳ Grace period · replying soon"}
                      {state==="history"&&"📖 Read-only history · meet again to continue"}
                      {state==="inactive"&&"⚫ Out of range"}
                    </div>
                  </div>
                  {c.unread>0&&<div style={{width:18,height:18,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"white",fontWeight:700,flexShrink:0}}>{c.unread}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GROUP CHAT SCREEN ────────────────────────────────────────
function GroupChatScreen({group,onBack,user,onLeave}) {
  const [msgs,setMsgs]=useState(group.msgs||[]);
  const [txt,setTxt]=useState("");
  const bottomRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  const send=()=>{
    if(!txt.trim())return;
    const m={id:Date.now(),user:user.name.toLowerCase().replace(/ /g,"_"),av:user.name.slice(0,2).toUpperCase(),text:txt.trim(),time:"just now",mine:true};
    setMsgs(p=>[...p,m]);setTxt("");
  };
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 125px)"}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:11,background:C.bg,flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:20,padding:"0 4px"}}>←</button>
        <div style={{width:36,height:36,borderRadius:11,background:`linear-gradient(135deg,${C.purple},${C.blue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{group.emoji}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:14,fontFamily:"Syne,sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{group.name}</div>
          <div style={{fontSize:11,color:C.green}}>● {group.members} members · proximity group</div>
        </div>
        <button onClick={onLeave} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 9px",cursor:"pointer",color:C.muted,fontSize:11}}>Leave</button>
      </div>
      <div style={{background:"rgba(104,104,160,.06)",borderBottom:`1px solid ${C.border}`,padding:"7px 14px",fontSize:11,color:C.muted,display:"flex",gap:7,alignItems:"center",flexShrink:0}}>
        <span>📍</span><span>Group disappears when everyone leaves · 24h grace period after last member exits</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px 8px",display:"flex",flexDirection:"column",gap:7}}>
        <div style={{textAlign:"center",marginBottom:6}}><span style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 11px",fontSize:11,color:C.muted}}>You joined · {group.members} people here</span></div>
        {msgs.map(m=>(
          <div key={m.id} style={{display:"flex",justifyContent:m.mine?"flex-end":"flex-start",gap:7,alignItems:"flex-end"}}>
            {!m.mine&&<div style={{width:26,height:26,borderRadius:8,background:`linear-gradient(135deg,${C.purple},${C.blue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0}}>{m.av}</div>}
            <div style={{maxWidth:"72%"}}>
              {!m.mine&&<div style={{fontSize:10,color:C.muted,marginBottom:2}}>@{m.user}</div>}
              <div style={{background:m.mine?C.accent:C.card,border:m.mine?"none":`1px solid ${C.border}`,borderRadius:m.mine?"13px 13px 3px 13px":"13px 13px 13px 3px",padding:"8px 12px",boxShadow:m.mine?`0 2px 8px ${C.aG}`:""}}>
                <div style={{fontSize:13,lineHeight:1.5,color:m.mine?"white":C.text}}>{m.text}</div>
                <div style={{fontSize:9,color:m.mine?"rgba(255,255,255,.55)":C.muted,marginTop:3,textAlign:m.mine?"right":"left"}}>{m.time}</div>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,background:C.bg,flexShrink:0}}>
        <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={`Message ${group.name}…`}
          style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:22,padding:"10px 16px",color:C.text,fontFamily:"DM Sans,sans-serif",fontSize:13,outline:"none"}}/>
        <button onClick={send} disabled={!txt.trim()} style={{background:C.accent,border:"none",borderRadius:"50%",width:40,height:40,cursor:"pointer",fontSize:16,color:"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 2px 9px ${C.aG}`,opacity:txt.trim()?1:.4}}>↑</button>
      </div>
    </div>
  );
}

// ─── CREATE GROUP MODAL ───────────────────────────────────────
function CreateGroupModal({onClose,onCreate,tier}) {
  const t=gT(tier);
  const maxM=TIER_GROUP_MAX[tier]||10;
  const [name,setName]=useState("");
  const [emoji,setEmoji]=useState("💬");
  const [desc,setDesc]=useState("");
  const emojis=["💬","🎵","🍽️","⚽","🎉","☕","🎸","🏃","📚","🎮","🌿","✨"];
  return(
    <div className="mb" onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.8)",backdropFilter:"blur(5px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div className="ms" onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,background:C.card,borderRadius:"20px 20px 0 0",border:`1px solid ${C.border}`,padding:22,paddingBottom:32}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:18}}>Create Group</div>
          <button onClick={onClose} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,width:28,height:28,cursor:"pointer",color:C.muted,fontSize:16}}>×</button>
        </div>
        <div style={{background:"rgba(104,104,160,.08)",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 13px",marginBottom:14,fontSize:12,color:C.muted,display:"flex",gap:8}}>
          <span>💡</span><span>You can only have <b style={{color:C.text}}>one active group</b> at a time. Delete it to create a new one. Max <b style={{color:t.color}}>{maxM=== Infinity?"unlimited":maxM} members</b> on your {t.name} plan.</span>
        </div>
        {/* Emoji picker */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:7,fontWeight:600}}>GROUP ICON</div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {emojis.map(e=><button key={e} onClick={()=>setEmoji(e)} style={{width:38,height:38,borderRadius:10,border:`1px solid ${emoji===e?C.accent:C.border}`,background:emoji===e?C.aS:C.surface,cursor:"pointer",fontSize:18}}>{e}</button>)}
          </div>
        </div>
        <Inp placeholder="Group name (e.g. 🎸 Tonight's Show)" value={name} onChange={e=>setName(e.target.value)} style={{marginBottom:10}}/>
        <Inp placeholder="Short description (optional)" value={desc} onChange={e=>setDesc(e.target.value)} style={{marginBottom:16}}/>
        <Btn onClick={()=>{if(!name.trim())return;onCreate({name:name.trim(),emoji,desc:desc.trim()});onClose();}} disabled={!name.trim()} style={{width:"100%",padding:13}}>Create Group</Btn>
      </div>
    </div>
  );
}

// ─── CHANNEL SCREEN ───────────────────────────────────────────
function ChannelScreen({channel,onBack,onToggleFollow}) {
  const [following,setFollowing]=useState(channel.following);
  const posts=[
    {id:1,text:channel.lastPost.text,time:channel.lastPost.time,likes:234},
    {id:2,text:"Join us this Friday for a special evening 🌟",time:"Yesterday",likes:89},
    {id:3,text:"New menu items added — come try them!",time:"3 days ago",likes:156},
  ];
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 125px)"}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:11,background:C.bg,flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:20,padding:"0 4px"}}>←</button>
        <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(135deg,${C.accent},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{channel.emoji}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,fontFamily:"Syne,sans-serif",display:"flex",alignItems:"center",gap:6}}>{channel.name}{channel.verified&&<span style={{color:C.green,fontSize:12}}>✓</span>}</div>
          <div style={{fontSize:11,color:C.muted}}>👥 {channel.followers.toLocaleString()} followers · {(()=>{const b=distBand(channel.dist);return <span style={{color:b.color}}>{b.label}</span>})()}</div>
        </div>
        <button onClick={()=>{setFollowing(f=>!f);onToggleFollow(channel.id);}}
          style={{background:following?C.surface:C.aS,border:`1px solid ${following?C.border:C.accent}`,borderRadius:9,padding:"7px 13px",cursor:"pointer",color:following?C.muted:C.accent,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:12,flexShrink:0}}>
          {following?"Following ✓":"Follow"}
        </button>
      </div>
      <div style={{background:"rgba(245,200,66,.04)",borderBottom:"1px solid rgba(245,200,66,.1)",padding:"7px 14px",fontSize:11,color:C.muted,display:"flex",gap:7,flexShrink:0}}>
        <span>📢</span><span>Channel — one-way broadcast. Follow to receive updates when nearby.</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px 100px",display:"flex",flexDirection:"column",gap:10}}>
        {posts.map(p=>(
          <div key={p.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 14px"}}>
            <p style={{fontSize:14,lineHeight:1.6,marginBottom:8}}>{p.text}</p>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:11,color:C.muted}}>❤️ {p.likes}</span>
              <span style={{fontSize:11,color:C.muted}}>{p.time}</span>
              <span style={{marginLeft:"auto",fontSize:9,color:C.gold,background:C.gS,borderRadius:4,padding:"1px 6px",fontWeight:700}}>BROADCAST</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DM CHAT SCREEN ───────────────────────────────────────────
function ChatScreen({convo,onBack,onSend,myStatus}) {
  const [txt,setTxt]=useState("");
  const [msgs,setMsgs]=useState(convo.msgs);
  const bottomRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const isHistory=convo.graceUntil&&Date.now()>convo.graceUntil;
  const inGrace=convo.graceUntil&&Date.now()<convo.graceUntil;
  const canSend=!isHistory&&myStatus&&convo.with.status&&convo.active;

  const send=()=>{
    if(!txt.trim()||!canSend)return;
    const m={id:Date.now(),from:"me",text:txt.trim(),time:"just now",mine:true};
    setMsgs(prev=>[...prev,m]);
    onSend(convo.id,m);
    setTxt("");
  };

  const person=convo.with;
  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 125px)"}}>
      {/* Header */}
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:11,background:C.bg,flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:20,padding:"0 4px"}}>←</button>
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(135deg,${isHistory?C.muted:person.status?C.green:C.muted},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700}}>{person.av}</div>
          <div style={{position:"absolute",bottom:-2,right:-2,width:10,height:10,borderRadius:"50%",background:isHistory?C.muted:canSend?C.green:C.muted,border:`2px solid ${C.bg}`}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,fontSize:14,fontFamily:"Syne,sans-serif"}}>@{person.user}</div>
          <div style={{fontSize:11,color:isHistory?C.muted:canSend?C.green:C.gold}}>
            {isHistory?"📖 Read-only history":inGrace?"⏳ Grace period active":canSend?(()=>{const b=distBand(person.dist);return `● ${b.label}`;})():"Out of range"}
          </div>
        </div>
        {!isHistory&&(()=>{const b=distBand(person.dist);return(
          <div style={{background:`${b.color}18`,border:`1px solid ${b.color}33`,borderRadius:8,padding:"5px 10px",textAlign:"center",flexShrink:0}}>
            <div style={{fontSize:10,color:b.color,fontWeight:700,whiteSpace:"nowrap"}}>{b.label}</div>
          </div>
        );})()}
      </div>

      {/* Status banners */}
      {isHistory&&(
        <div style={{background:"rgba(104,104,160,.06)",borderBottom:`1px solid ${C.border}`,padding:"9px 14px",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <span>📖</span>
          <span style={{fontSize:12,color:C.muted}}>This conversation is <b style={{color:C.text}}>read-only history</b>. Get back in range together to continue chatting.</span>
        </div>
      )}
      {inGrace&&!isHistory&&(
        <div style={{background:"rgba(245,200,66,.06)",borderBottom:"1px solid rgba(245,200,66,.2)",padding:"8px 14px",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <span>⏳</span><span style={{fontSize:12,color:C.gold}}>Grace period active — chat stays open 24h after leaving range</span>
        </div>
      )}
      {!canSend&&!inGrace&&!isHistory&&(
        <div style={{background:"rgba(104,104,160,.06)",borderBottom:`1px solid ${C.border}`,padding:"8px 14px",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <span>🔒</span>
          <span style={{fontSize:12,color:C.muted}}>
            {!myStatus?"Turn on Free to Chat to reply":!person.status?"@"+person.user+" has their status off":"Out of range · 24h grace starts now"}
          </span>
        </div>
      )}

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px 8px",display:"flex",flexDirection:"column",gap:8}}>
        <div style={{textAlign:"center",marginBottom:6}}>
          <span style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 11px",fontSize:11,color:C.muted}}>
            {isHistory?"📖 Chat history — you were in range":"💬 You matched in range · both had Free to Chat on"}
          </span>
        </div>
        {msgs.map(m=>(
          <div key={m.id} style={{display:"flex",justifyContent:m.mine?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"75%",background:m.mine?C.accent:C.card,border:m.mine?"none":`1px solid ${C.border}`,borderRadius:m.mine?"14px 14px 3px 14px":"14px 14px 14px 3px",padding:"9px 13px",boxShadow:m.mine?`0 2px 10px ${C.aG}`:"",opacity:isHistory?.75:1}}>
              <div style={{fontSize:14,lineHeight:1.5,color:m.mine?"white":C.text}}>{m.text}</div>
              <div style={{fontSize:10,color:m.mine?"rgba(255,255,255,.55)":C.muted,marginTop:4,textAlign:m.mine?"right":"left"}}>{m.time}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,background:C.bg,flexShrink:0}}>
        {isHistory?(
          <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:22,padding:"10px 16px",fontSize:13,color:C.muted,display:"flex",alignItems:"center",gap:8}}>
            <span>📖</span><span>Read-only · get back in range to continue</span>
          </div>
        ):(
          <>
            <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
              disabled={!canSend&&!inGrace}
              placeholder={canSend||inGrace?"Message @"+person.user+"…":"Messaging unavailable"}
              style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:22,padding:"10px 16px",color:C.text,fontFamily:"DM Sans,sans-serif",fontSize:13,outline:"none",opacity:canSend||inGrace?1:.5}}/>
            <button onClick={send} disabled={(!canSend&&!inGrace)||!txt.trim()}
              style={{background:C.accent,border:"none",borderRadius:"50%",width:40,height:40,cursor:"pointer",fontSize:16,color:"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 2px 9px ${C.aG}`,opacity:(canSend||inGrace)&&txt.trim()?1:.4}}>↑</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ONBOARDING SCREEN ───────────────────────────────────────
function OnboardingScreen({onDone}) {
  const [step,setStep]=useState(0); // 0=welcome 1=categories 2=quiethours 3=cap
  const [prefs,setPrefs]=useState({...DEFAULT_BPREFS});
  const toggleCat=id=>setPrefs(p=>({...p,enabled:{...p.enabled,[id]:!p.enabled[id]}}));
  const selCount=Object.values(prefs.enabled).filter(Boolean).length;

  const steps=[
    // ── Step 0: Welcome ──────────────────────────────────────
    <div key="welcome" style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",padding:"0 8px"}}>
      <div style={{fontSize:56,marginBottom:20}}>📡</div>
      <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:24,marginBottom:10,letterSpacing:-.5}}>
        Nearby <span style={{color:C.accent}}>Broadcasts</span>
      </div>
      <div style={{color:C.muted,fontSize:14,lineHeight:1.7,marginBottom:28,maxWidth:300}}>
        Businesses and advertisers near you can send you one-tap previews of their offers, events and job listings — even if they're beyond your current radius.
      </div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:24,textAlign:"left",width:"100%"}}>
        {[
          ["🔒","You're invisible by default — browsing never reveals your location"],
          ["🎛️","You choose exactly which categories you want"],
          ["📊","Maximum 3 per day — we filter for relevance, not volume"],
          ["🔕","Quiet hours respected — nothing during sleep"],
        ].map(([ico,txt])=>(
          <div key={txt} style={{display:"flex",gap:11,alignItems:"flex-start",marginBottom:10}}>
            <span style={{fontSize:16,flexShrink:0}}>{ico}</span>
            <span style={{fontSize:13,color:C.muted,lineHeight:1.5}}>{txt}</span>
          </div>
        ))}
      </div>
      <Btn onClick={()=>setStep(1)} style={{width:"100%",padding:14,fontSize:15}}>Get Started →</Btn>
      <button onClick={()=>onDone({...DEFAULT_BPREFS,onboarded:true})} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:13,marginTop:14}}>Skip for now</button>
    </div>,

    // ── Step 1: Category picker ───────────────────────────────
    <div key="cats" style={{width:"100%"}}>
      <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:22,marginBottom:6}}>What interests you?</div>
      <div style={{color:C.muted,fontSize:13,marginBottom:20,lineHeight:1.6}}>
        Only receive broadcasts in categories you care about. You can change this anytime in settings.
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
        {BCAST_CATS.map(cat=>{
          const on=!!prefs.enabled[cat.id];
          return(
            <div key={cat.id} onClick={()=>toggleCat(cat.id)}
              style={{background:on?`${C.accent}12`:C.card,border:`1px solid ${on?C.accent:C.border}`,borderRadius:13,padding:"13px 15px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all .2s"}}>
              <div style={{width:40,height:40,borderRadius:11,background:on?C.aS:C.surface,border:`1px solid ${on?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,transition:"all .2s",flexShrink:0}}>{cat.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:on?C.text:C.muted,marginBottom:2}}>{cat.l}</div>
                <div style={{fontSize:11,color:C.muted}}>{cat.desc}</div>
              </div>
              <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${on?C.accent:C.border}`,background:on?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
                {on&&<span style={{color:"white",fontSize:12,fontWeight:700}}>✓</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn ghost onClick={()=>setStep(0)} style={{flex:1,padding:12}}>← Back</Btn>
        <Btn onClick={()=>setStep(2)} style={{flex:2,padding:12}}>{selCount===0?"Skip categories →":`Next → (${selCount} selected)`}</Btn>
      </div>
    </div>,

    // ── Step 2: Quiet hours ──────────────────────────────────
    <div key="quiet" style={{width:"100%"}}>
      <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:22,marginBottom:6}}>Quiet Hours</div>
      <div style={{color:C.muted,fontSize:13,marginBottom:20,lineHeight:1.6}}>
        No broadcasts during these hours. Posts sent in quiet hours expire — they don't stack up and hit you in the morning.
      </div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:600}}>QUIET FROM</div>
            <select value={prefs.quietStart} onChange={e=>setPrefs(p=>({...p,quietStart:e.target.value}))}
              style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 12px",color:C.text,fontFamily:"DM Sans,sans-serif",fontSize:14,outline:"none"}}>
              {["20:00","21:00","22:00","23:00","00:00"].map(h=><option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div style={{color:C.muted,fontSize:14,paddingTop:20}}>→</div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:600}}>QUIET UNTIL</div>
            <select value={prefs.quietEnd} onChange={e=>setPrefs(p=>({...p,quietEnd:e.target.value}))}
              style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 12px",color:C.text,fontFamily:"DM Sans,sans-serif",fontSize:14,outline:"none"}}>
              {["06:00","07:00","08:00","09:00","10:00"].map(h=><option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
        <div style={{background:C.surface,borderRadius:9,padding:"10px 13px",display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:14}}>🔕</span>
          <span style={{fontSize:12,color:C.muted}}>Quiet {prefs.quietStart} → {prefs.quietEnd} · broadcasts during this window are silently dropped</span>
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn ghost onClick={()=>setStep(1)} style={{flex:1,padding:12}}>← Back</Btn>
        <Btn onClick={()=>setStep(3)} style={{flex:2,padding:12}}>Next →</Btn>
      </div>
    </div>,

    // ── Step 3: Daily cap ────────────────────────────────────
    <div key="cap" style={{width:"100%"}}>
      <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:22,marginBottom:6}}>Daily Limit</div>
      <div style={{color:C.muted,fontSize:13,marginBottom:24,lineHeight:1.6}}>
        How many broadcast notifications do you want per day? We always pick the most relevant ones for you.
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:24}}>
        {[
          [1,"Minimal","Just the single most relevant thing near you today"],
          [2,"Low","A couple of the best picks"],
          [3,"Default","Balanced — our recommended setting"],
          [5,"Open","Up to 5 — for people who love local discovery"],
        ].map(([val,label,desc])=>(
          <div key={val} onClick={()=>setPrefs(p=>({...p,dailyCap:val}))}
            style={{background:prefs.dailyCap===val?C.aS:C.card,border:`1px solid ${prefs.dailyCap===val?C.accent:C.border}`,borderRadius:13,padding:"13px 15px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all .2s"}}>
            <div style={{width:36,height:36,borderRadius:"50%",border:`2px solid ${prefs.dailyCap===val?C.accent:C.border}`,background:prefs.dailyCap===val?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:15,color:prefs.dailyCap===val?"white":C.muted,flexShrink:0,transition:"all .2s"}}>{val}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:prefs.dailyCap===val?C.text:C.muted}}>{label} {val===3&&<span style={{fontSize:10,color:C.accent,fontWeight:700,fontFamily:"Syne,sans-serif"}}>RECOMMENDED</span>}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn ghost onClick={()=>setStep(2)} style={{flex:1,padding:12}}>← Back</Btn>
        <Btn onClick={()=>onDone({...prefs,onboarded:true})} style={{flex:2,padding:14,fontSize:15}}>All done ✓</Btn>
      </div>
    </div>,
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,
      background:`radial-gradient(ellipse at 50% -10%,rgba(255,77,109,.12) 0%,${C.bg} 60%)`}}>
      <div style={{width:"100%",maxWidth:400}}>
        {/* Progress dots */}
        <div style={{display:"flex",justifyContent:"center",gap:7,marginBottom:32}}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{height:4,borderRadius:2,background:i<=step?C.accent:C.border,width:i===step?28:14,transition:"all .3s"}}/>
          ))}
        </div>
        {steps[step]}
      </div>
    </div>
  );
}

// ─── BROADCAST SETTINGS SCREEN ────────────────────────────────
function BroadcastSettingsScreen({bprefs,onUpdate,onBack,tier}) {
  const [prefs,setPrefs]=useState(bprefs);
  const save=updates=>{const n={...prefs,...updates};setPrefs(n);onUpdate(n);};
  const toggleCat=id=>save({enabled:{...prefs.enabled,[id]:!prefs.enabled[id]}});
  const selCount=Object.values(prefs.enabled).filter(Boolean).length;
  const masterOn=selCount>0;

  return(
    <div style={{padding:"18px 14px 100px"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:20,padding:"0 4px"}}>←</button>
        <div>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:20}}>Broadcast Preferences</div>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>Control what businesses can notify you about</div>
        </div>
      </div>

      {/* Master toggle */}
      <div style={{background:masterOn?`linear-gradient(135deg,rgba(255,77,109,.1),rgba(255,77,109,.04))`:C.card,border:`1px solid ${masterOn?C.accent:C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:12,transition:"all .3s"}}>
        <div style={{width:40,height:40,borderRadius:12,background:masterOn?C.aS:C.surface,border:`1px solid ${masterOn?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📡</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14}}>Nearby Broadcasts</div>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>{masterOn?`${selCount} categor${selCount===1?"y":"ies"} active · max ${prefs.dailyCap}/day`:"All broadcasts off"}</div>
        </div>
        <div onClick={()=>{
          if(masterOn) save({enabled:{}});
          else save({enabled:Object.fromEntries(BCAST_CATS.map(c=>[c.id,true]))});
        }} style={{width:46,height:26,borderRadius:13,background:masterOn?C.accent:C.border,cursor:"pointer",position:"relative",transition:"background .25s",flexShrink:0}}>
          <div style={{position:"absolute",top:3,left:masterOn?22:3,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .25s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
        </div>
      </div>

      {/* Categories */}
      <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:8}}>CATEGORIES</div>
      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:20}}>
        {BCAST_CATS.map(cat=>{
          const on=!!prefs.enabled[cat.id];
          return(
            <div key={cat.id} onClick={()=>toggleCat(cat.id)}
              style={{background:on?`${C.accent}08`:C.card,border:`1px solid ${on?C.accent+"44":C.border}`,borderRadius:12,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:11,transition:"all .2s"}}>
              <span style={{fontSize:20,width:28,textAlign:"center",flexShrink:0}}>{cat.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:on?C.text:C.muted}}>{cat.l}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:1}}>{cat.desc}</div>
              </div>
              <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${on?C.accent:C.border}`,background:on?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
                {on&&<span style={{color:"white",fontSize:10,fontWeight:700}}>✓</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily cap */}
      <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:8}}>DAILY LIMIT</div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:13,padding:"14px 16px",marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:13,color:C.text}}>Max broadcasts per day</span>
          <span style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:18,color:C.accent}}>{prefs.dailyCap}</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          {[1,2,3,5].map(v=>(
            <button key={v} onClick={()=>save({dailyCap:v})} style={{flex:1,padding:"8px 0",borderRadius:9,border:`1px solid ${prefs.dailyCap===v?C.accent:C.border}`,background:prefs.dailyCap===v?C.aS:"transparent",color:prefs.dailyCap===v?C.accent:C.muted,fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",transition:"all .2s"}}>{v}</button>
          ))}
        </div>
        <div style={{fontSize:11,color:C.muted,marginTop:10,lineHeight:1.5}}>
          We always pick the most relevant {prefs.dailyCap} for you — closest, freshest, best matched to your categories. Same sender max once per 24h.
        </div>
      </div>

      {/* Quiet hours */}
      <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:8}}>QUIET HOURS</div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:13,padding:"14px 16px",marginBottom:6}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>FROM</div>
            <select value={prefs.quietStart} onChange={e=>save({quietStart:e.target.value})}
              style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 11px",color:C.text,fontFamily:"DM Sans,sans-serif",fontSize:13,outline:"none"}}>
              {["19:00","20:00","21:00","22:00","23:00","00:00"].map(h=><option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div style={{color:C.muted,fontSize:14,paddingTop:18}}>→</div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>UNTIL</div>
            <select value={prefs.quietEnd} onChange={e=>save({quietEnd:e.target.value})}
              style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 11px",color:C.text,fontFamily:"DM Sans,sans-serif",fontSize:13,outline:"none"}}>
              {["06:00","07:00","08:00","09:00","10:00"].map(h=><option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
        <div style={{background:C.surface,borderRadius:8,padding:"9px 12px",display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:13}}>🔕</span>
          <span style={{fontSize:11,color:C.muted}}>No broadcasts {prefs.quietStart}–{prefs.quietEnd}. Posts sent during quiet hours expire silently.</span>
        </div>
      </div>

      {/* Sender cooldown note */}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:11,padding:"11px 14px",display:"flex",gap:9,alignItems:"flex-start",marginTop:6}}>
        <span style={{fontSize:14,flexShrink:0}}>⏱️</span>
        <span style={{fontSize:11,color:C.muted,lineHeight:1.6}}>The same business can only notify you <b style={{color:C.text}}>once every 24 hours</b>, regardless of how many posts they make.</span>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────
export default function App() {
  const [authed,setAuthed]=useState(false);
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("feed");
  const [tier,setTier]=useState("free");
  const [posts,setPosts]=useState(INIT_POSTS);
  const [showCreate,setSC]=useState(false);
  const [detail,setDetail]=useState(null);
  const [loc,setLoc]=useState(null);
  const [upConf,setUpConf]=useState(null);
  const [sharesUsed,setSU]=useState(2);
  const [unread,setUnread]=useState(3);
  const [lastPostTime,setLastPostTime]=useState(null); // burst protection
  // Messaging + groups state
  const [myStatus,setMyStatus]=useState(false);
  const [convos,setConvos]=useState(INIT_CONVOS);
  const [groups,setGroups]=useState(INIT_GROUPS);
  const [channels,setChannels]=useState(INIT_CHANNELS);
  const [activeChat,setActiveChat]=useState(null); // {type:"dm"|"group"|"channel", data}
  const [showCreateGroup,setShowCreateGroup]=useState(false);
  const [msgUnread,setMsgUnread]=useState(1);
  // Privacy — ghost by default
  const [privacySettings,setPrivacySettings]=useState({
    defaultZone:"area", freeToChat:false, showZoneOnPost:true,
    roundTimestamps:true, personalMode:true, allowExactPin:false,
  });
  const [bprefs,setBprefs]=useState({...DEFAULT_BPREFS});
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [showBcastSettings,setShowBcastSettings]=useState(false);

  useEffect(()=>{
    if(!authed)return;
    if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>setLoc({lat:p.coords.latitude,lng:p.coords.longitude}),()=>setLoc({lat:40.7128,lng:-74.006}),{enableHighAccuracy:true,timeout:8000});
    else setLoc({lat:40.7128,lng:-74.006});
  },[authed]);

  const like=(id,l)=>setPosts(ps=>ps.map(p=>p.id===id?{...p,likes:p.likes+(l?1:-1)}:p));
  const comment=(pid,txt)=>{
    const c={id:Date.now(),user:user.name.toLowerCase().replace(/ /g,"_"),av:user.name.slice(0,2).toUpperCase(),text:txt,time:"just now",likes:0};
    setPosts(ps=>ps.map(p=>p.id===pid?{...p,comments:[...p.comments,c]}:p));
    setDetail(prev=>prev?.id===pid?{...prev,comments:[...prev.comments,c]}:prev);
  };
  const newPost=p=>{
    const t=gT(tier);
    const burst=canPost(lastPostTime,t.burstMins);
    if(!burst.ok) return;
    setPosts(ps=>[{id:Date.now(),user:user.name.toLowerCase().replace(/ /g,"_"),av:user.name.slice(0,2).toUpperCase(),dist:0,time:"just now",likes:0,reach:0,views:0,comments:[],lO:(Math.random()-.5)*.002,nO:(Math.random()-.5)*.002,...p},...ps]);
    setSU(s=>s+1); setLastPostTime(Date.now());
  };
  const selectTier=id=>{setTier(id);setUpConf(id);setTimeout(()=>setUpConf(null),3000);};

  // DM handlers
  const openDM=(person,existingConvo)=>{
    if(existingConvo){
      setActiveChat({type:"dm",data:existingConvo});
      setConvos(cs=>cs.map(c=>c.id===existingConvo.id?{...c,unread:0}:c));
      setMsgUnread(0);
    } else {
      if(!myStatus||!person.status)return;
      const existing=convos.find(c=>c.with.id===person.id);
      if(existing){
        setActiveChat({type:"dm",data:existing});
        setConvos(cs=>cs.map(c=>c.id===existing.id?{...c,unread:0}:c));
      } else {
        const nc={id:"c"+Date.now(),with:person,msgs:[],unread:0,graceUntil:null,active:true};
        setConvos(cs=>[nc,...cs]);
        setActiveChat({type:"dm",data:nc});
      }
    }
    setTab("chat");
  };
  const sendMsg=(convoId,msg)=>{
    setConvos(cs=>cs.map(c=>c.id===convoId?{...c,msgs:[...c.msgs,msg]}:c));
    setActiveChat(prev=>prev?.data?.id===convoId?{...prev,data:{...prev.data,msgs:[...prev.data.msgs,msg]}}:prev);
  };

  // Group handlers
  const openGroup=g=>{setActiveChat({type:"group",data:g});setTab("chat");};
  const createGroup=({name,emoji,desc})=>{
    const myName=user.name.toLowerCase().replace(/ /g,"_");
    const g={id:"g"+Date.now(),name,emoji,desc,owner:myName,ownerAv:user.name.slice(0,2).toUpperCase(),
      dist:0,members:1,maxMembers:TIER_GROUP_MAX[tier]||10,msgs:[],active:true,createdAt:Date.now(),graceUntil:null};
    setGroups(gs=>[g,...gs]);
  };
  const deleteGroup=id=>setGroups(gs=>gs.filter(g=>g.id!==id));

  // Channel handlers
  const openChannel=ch=>{setActiveChat({type:"channel",data:ch});setTab("chat");};
  const toggleFollow=id=>setChannels(cs=>cs.map(c=>c.id===id?{...c,following:!c.following}:c));

  const t=gT(tier);
  const totalChatUnread=convos.reduce((a,c)=>a+(c.unread||0),0)+groups.reduce((a,g)=>a+(g.unread||0),0);

  const tabs=[
    {id:"feed",    icon:"◉",  label:"Feed"},
    {id:"map",     icon:"◎",  label:"Map"},
    {id:"chat",    icon:"💬", label:"Chat",  badge:totalChatUnread, badgeColor:C.green},
    {id:"upgrade", icon:"✦",  label:"Upgrade"},
    {id:"profile", icon:"○",  label:"Profile"},
  ];

  if(!authed) return <><GS/><AuthScreen onAuth={u=>{setUser(u);setAuthed(true);setShowOnboarding(true);}}/></>;
  if(showOnboarding) return <><GS/><OnboardingScreen onDone={p=>{setBprefs(p);setShowOnboarding(false);}}/></>;

  // Determine if we're showing an active chat/group/channel thread
  const showThread=activeChat&&tab==="chat";

  return (
    <>
      <GS/>
      <div style={{minHeight:"100vh",background:C.bg,maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column"}}>
        {upConf&&<div style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",zIndex:300,background:gT(upConf).cs,border:`1px solid ${gT(upConf).color}`,borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:7,boxShadow:`0 8px 22px ${gT(upConf).color}44`,animation:"fU .4s ease both",whiteSpace:"nowrap"}}>
          <span style={{fontSize:14}}>{gT(upConf).icon}</span>
          <span style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:12,color:gT(upConf).color}}>Upgraded to {gT(upConf).name}!</span>
          <span style={{color:C.muted,fontSize:10}}>{gT(upConf).icon} {gT(upConf).scope}</span>
        </div>}

        {/* Header — hidden when thread is open */}
        {!showThread&&<div style={{padding:"10px 13px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:C.bg,position:"sticky",top:0,zIndex:50}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:20,letterSpacing:-1}}>share<span style={{color:C.accent}}>me</span></div>
            {myStatus&&<div style={{background:"rgba(61,220,132,.12)",border:"1px solid rgba(61,220,132,.3)",borderRadius:6,padding:"2px 8px",display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:C.green,boxShadow:`0 0 4px ${C.green}`}}/>
              <span style={{fontSize:9,color:C.green,fontWeight:700,fontFamily:"Syne,sans-serif"}}>FREE TO CHAT</span>
            </div>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <div onClick={()=>setTab("upgrade")} style={{cursor:"pointer",background:t.cs,border:`1px solid ${t.color}55`,borderRadius:7,padding:"3px 8px",fontSize:10,color:t.color,fontWeight:700,fontFamily:"Syne,sans-serif",display:"flex",alignItems:"center",gap:3}}>{t.icon} {t.scope}</div>
            <button onClick={()=>setSC(true)} style={{background:C.accent,border:"none",borderRadius:9,width:30,height:30,cursor:"pointer",fontSize:17,color:"white",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 2px 9px ${C.aG}`}}>+</button>
          </div>
        </div>}

        {/* Content */}
        <div style={{flex:1,overflowY:tab==="map"||showThread?"hidden":"auto"}}>
          {/* Active thread screens */}
          {showThread&&activeChat.type==="dm"&&(
            <ChatScreen convo={activeChat.data} onBack={()=>setActiveChat(null)} onSend={sendMsg} myStatus={myStatus}/>
          )}
          {showThread&&activeChat.type==="group"&&(
            <GroupChatScreen group={activeChat.data} onBack={()=>setActiveChat(null)} user={user} onLeave={()=>setActiveChat(null)}/>
          )}
          {showThread&&activeChat.type==="channel"&&(
            <ChannelScreen channel={activeChat.data} onBack={()=>setActiveChat(null)} onToggleFollow={toggleFollow}/>
          )}
          {/* Main screens */}
          {!showThread&&<>
            {tab==="feed"    &&<FeedScreen    posts={posts} onOpen={setDetail} onLike={like} tier={tier} lastPostTime={lastPostTime}/>}
            {tab==="map"     &&<MapView       posts={posts} loc={loc} tier={tier}/>}
            {tab==="chat"    &&<ChatTab
              myStatus={myStatus} onStatusToggle={()=>{setMyStatus(s=>!s);setPrivacySettings(p=>({...p,freeToChat:!p.freeToChat}));}}
              convos={convos} onOpenDM={openDM}
              groups={groups} onOpenGroup={openGroup} onCreateGroup={()=>setShowCreateGroup(true)} onDeleteGroup={deleteGroup}
              channels={channels} onOpenChannel={openChannel}
              tier={tier} user={user}
            />}
            {tab==="boost"   &&<BoostScreen   posts={posts} tier={tier}/>}
            {tab==="notifs"  &&(showBcastSettings
              ?<BroadcastSettingsScreen bprefs={bprefs} onUpdate={setBprefs} onBack={()=>setShowBcastSettings(false)} tier={tier}/>
              :<NotifsScreen bprefs={bprefs} onOpenBroadcastSettings={()=>setShowBcastSettings(true)}/>
            )}
            {tab==="upgrade" &&<UpgradeScreen tier={tier} onSelect={selectTier}/>}
            {tab==="profile" &&<ProfileScreen user={user} tier={tier} onTab={setTab} sharesUsed={sharesUsed} myStatus={myStatus}
              onStatusToggle={()=>{setMyStatus(s=>!s);setPrivacySettings(p=>({...p,freeToChat:!p.freeToChat}));}}
              privacySettings={privacySettings} onPrivacyUpdate={s=>{setPrivacySettings(s);setMyStatus(s.freeToChat);}}/>}
            {tab==="metrics" &&<MetricsScreen tier={tier}/>}
          </>}
        </div>

        {/* Nav — hidden when thread open */}
        {!showThread&&<div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(8,8,14,.97)",borderTop:`1px solid ${C.border}`,display:"flex",padding:"5px 0 13px",backdropFilter:"blur(16px)",zIndex:49}}>
          {tabs.map(tb=>{
            const active=tab===tb.id;
            const col=tb.id==="upgrade"?C.gold:tb.id==="chat"?C.green:C.accent;
            const bc=tb.badgeColor||C.accent;
            return(
              <button key={tb.id} className="nb" onClick={()=>{setTab(tb.id);if(tb.id!=="chat")setActiveChat(null);}} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 0",color:active?col:C.muted,position:"relative"}}>
                <span style={{fontSize:14}}>{tb.icon}</span>
                <span style={{fontSize:9,fontFamily:"Syne,sans-serif",fontWeight:600}}>{tb.label}</span>
                {tb.badge>0&&!active&&<div style={{position:"absolute",top:0,right:"10%",minWidth:14,height:14,borderRadius:7,background:bc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"white",fontWeight:700,padding:"0 3px"}}>{tb.badge}</div>}
              </button>
            );
          })}
        </div>}
      </div>
      {showCreate&&<CreateModal onPost={p=>{newPost(p);setSC(false);}} onClose={()=>setSC(false)} tier={tier} sharesUsed={sharesUsed}/>}
      {showCreateGroup&&<CreateGroupModal onClose={()=>setShowCreateGroup(false)} onCreate={createGroup} tier={tier}/>}
      {detail&&<DetailModal p={detail} onClose={()=>setDetail(null)} onLike={like} onComment={comment}/>}
    </>
  );
}
