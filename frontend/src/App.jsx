
import { useState, useMemo, useCallback, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════
   CLAUDE AI INTEGRATION LAYER
   Model: claude-sonnet-4-20250514
   Features: Chat · Matching · Profile · Cover Letter · Interview Prep
═══════════════════════════════════════════════════════ */
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const API_BASE = import.meta?.env?.VITE_API_URL || "/api/v1";

/* ── Call backend AI endpoints (which call Claude internally) ── */
async function callBackendAI(endpoint, data) {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API_BASE}/matching${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return json.text || "";
}

/* ── Fallback: call Anthropic directly (demo/standalone mode) ── */
async function callClaude(systemPrompt, userMessage, maxTokens = 1000) {
  // Try backend first
  try {
    const token = localStorage.getItem("access_token");
    if (token) {
      // Route through backend
      const res = await fetch(`${API_BASE}/matching/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ message: userMessage, system: systemPrompt }),
      });
      if (res.ok) { const d = await res.json(); return d.text || ""; }
    }
  } catch {}
  // Fallback: direct Anthropic call (standalone artifact mode)
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

const AI = {
  explainMatch: (workerSkills, jobSkills, jobTitle, score) =>
    callBackendAI("/ai/explain-match", { workerSkills, jobSkills, jobTitle, score })
      .catch(() => callClaude(
        "Ban la AI tuyen dung chuyen nghiep cua WorkLearn. Phan tich ngan gon (3-4 dong) tai sao ung vien phu hop voi vi tri nay. Su dung tieng Viet.",
        `Ung vien co: ${workerSkills.join(", ")}. Vi tri ${jobTitle} yeu cau: ${jobSkills.join(", ")}. Score: ${score}%.`
      )),
  coverLetter: (workerName, jobTitle, company, workerSkills, matchedSkills) =>
    callBackendAI("/ai/cover-letter", { workerName, jobTitle, company, workerSkills, matchedSkills })
      .catch(() => callClaude(
        "Ban la chuyen gia viet thu xin viec. Viet thu ung tuyen chuyen nghiep bang tieng Viet, ngan gon (3 doan), than thien va tu tin.",
        `Ung vien: ${workerName}. Vi tri: ${jobTitle} tai ${company}. Ky nang: ${workerSkills.join(", ")}.`
      )),
  profileAnalysis: (name, skills, experiences, headline) =>
    callBackendAI("/ai/profile-analysis", { name, skills, experiences, headline })
      .catch(() => callClaude(
        "Ban la career coach cua WorkLearn. Phan tich ho so va dua ra 3 goi y cu the de tang matching score. Tieng Viet.",
        `Ho so: ${name}, ${headline}. Ky nang: ${skills.join(", ")}.`
      )),
  interviewPrep: (jobTitle, requiredSkills) =>
    callBackendAI("/ai/interview-prep", { jobTitle, requiredSkills })
      .catch(() => callClaude(
        "Ban la nguoi phong van chuyen nghiep. Tao 5 cau hoi phong van thuc te. Tieng Viet, danh so 1-5.",
        `Vi tri: ${jobTitle}. Ky nang: ${requiredSkills.join(", ")}.`, 600
      )),
  chat: (userMsg, profile) =>
    callBackendAI("/ai/chat", { message: userMsg })
      .catch(() => callClaude(
        `Ban la AI tro ly nghe nghiep WorkLearn. Ho so: ${profile.name}, ky nang: ${profile.skills?.join(", ")}. Tieng Viet, ngan gon.`,
        userMsg, 800
      )),
  learningPath: (targetJob, currentSkills, missingSkills) =>
    callBackendAI("/ai/learning-path", { targetJob, currentSkills, missingSkills })
      .catch(() => callClaude(
        "Ban la AI tu van hoc tap WorkLearn. Dua ra lo trinh hoc 3-4 buoc. Tieng Viet, thiet thuc.",
        `Muc tieu: ${targetJob}. Hien co: ${currentSkills.join(", ")}. Con thieu: ${missingSkills.join(", ")}.`, 600
      )),
};

/* ═══════════════════════════════════════════════════════
   DESIGN TOKENS — inspired by AIViec / iVIEC
   Deep navy sidebar · Vivid orange primary · Clean cards
═══════════════════════════════════════════════════════ */
const DS = {
  // Brand – AIViec/iVIEC orange-amber
  orange:    "#F97316",   // primary – vivid orange like AIViec
  orangeD:   "#D97706",   // darker hover
  orangeL:   "#FEF3C7",   // light tint
  orangeSoft:"#FFFBEB",   // very light bg
  // Sidebar
  dark:      "#0E0A23",   // deep navy dark
  darkL:     "#1A1438",   // lighter sidebar row
  darkHL:    "#251B4B",   // hover
  // Surface
  bg:        "#FAF5F0",   // page bg – very subtle warm tint
  card:      "#FFFFFF",
  border:    "#FDE8D0",   // warm-tinted border
  // Semantic
  green:     "#00C853",
  greenL:    "#E6FAF0",
  amber:     "#FF8800",
  amberL:    "#FFF3E0",
  red:       "#F23535",
  redL:      "#FFF0F0",
  // Text
  text:      "#0E0A23",
  sub:       "#6B7280",
  ghost:     "#9CA3AF",
  // Pill tags
  tag:       "#FFF7ED",
  tagText:   "#C2410C",
};

const gOrange = `linear-gradient(135deg, #F97316, #FBBF24)`;
const gDark   = `linear-gradient(180deg, #0C1222 0%, #162032 100%)`;
const gCard   = `linear-gradient(135deg, #F97316 0%, #FBBF24 100%)`;

/* ═══════════════════════════════════════════════════════
   MOCK DATA
═══════════════════════════════════════════════════════ */
const SKILLS_ALL = ["SQL","Python","Excel","Power BI","Tableau","DAX","Azure",
  "Google Analytics","Pandas","Machine Learning","Financial Modeling","R",
  "Data Visualization","JavaScript","React","TypeScript","A/B Testing"];

const USERS = {
  worker:   { id:"w1", name:"Nguyễn Văn Minh",  type:"WORKER",   avatar:"M", credit:350, skills:["Excel","SQL","Power BI"], exp:2, location:"TP.HCM", headline:"Kế toán → Data Analyst", pct:75, bio:"Chuyên viên kế toán 2 năm đang chuyển hướng sang Data Analytics." },
  employer: { id:"e1", name:"Trần Thị Hoa",      type:"EMPLOYER", avatar:"H", credit:1200, company:"TechCorp VN", verified:true },
  trainer:  { id:"t1", name:"Lê Văn Tuấn",       type:"TRAINER",  avatar:"T", credit:2840, bio:"Giảng viên Data Science 8 năm" },
  admin:    { id:"a1", name:"Admin WorkLearn",    type:"ADMIN",    avatar:"A", credit:0 },
};

const JOBS = [
  { id:"j1", title:"Data Analyst", company:"TechCorp VN",    logo:"TC", salary:"15–20tr", loc:"TP.HCM", type:"Full-time", skills:["SQL","Python","Tableau","Excel"],        posted:"2 ngày", apps:24, status:"ACTIVE", boosted:false, eid:"e1",
    desc:"Phân tích dữ liệu kinh doanh, xây dựng dashboard KPI hàng tuần." },
  { id:"j2", title:"BI Developer",  company:"FPT Software",   logo:"FS", salary:"20–28tr", loc:"Hà Nội", type:"Full-time", skills:["Power BI","SQL","DAX","Azure"],           posted:"1 ngày", apps:18, status:"ACTIVE", boosted:true, eid:"e2",
    desc:"Xây dựng hệ thống BI, data warehouse và báo cáo quản trị cho khách hàng enterprise." },
  { id:"j3", title:"Data Scientist", company:"VNG Corp",      logo:"VN", salary:"18–25tr", loc:"TP.HCM", type:"Full-time", skills:["Python","Machine Learning","SQL"],        posted:"3 ngày", apps:42, status:"ACTIVE", boosted:false, eid:"e3",
    desc:"Xây dựng mô hình ML cho sản phẩm game và ứng dụng." },
  { id:"j4", title:"Marketing Analyst", company:"Shopee VN",  logo:"SH", salary:"12–18tr", loc:"TP.HCM", type:"Full-time", skills:["Excel","SQL","Google Analytics","Python"], posted:"5 ngày", apps:31, status:"ACTIVE", boosted:false, eid:"e4",
    desc:"Phân tích hiệu quả chiến dịch marketing và tối ưu ROI." },
  { id:"j5", title:"Financial Analyst",  company:"MB Bank",   logo:"MB", salary:"14–20tr", loc:"Hà Nội", type:"Full-time", skills:["Excel","SQL","Financial Modeling"],      posted:"1 tuần", apps:15, status:"ACTIVE", boosted:false, eid:"e5",
    desc:"Phân tích tài chính, lập báo cáo quản trị." },
];

const COURSES = [
  { id:"c1", title:"Python for Data Analysis",     trainer:"Lê Văn Tuấn",    price:150, rating:4.8, students:1240, skills:["Python","Pandas"],       dur:"24h", lvl:"Beginner",      emoji:"🐍", tid:"t1", status:"ACTIVE",
    lessons:[{id:"l1",title:"Giới thiệu Python",dur:"45p",free:true},{id:"l2",title:"Biến & kiểu dữ liệu",dur:"60p",free:false},{id:"l3",title:"Pandas cơ bản",dur:"90p",free:false},{id:"l4",title:"NumPy arrays",dur:"70p",free:false},{id:"l5",title:"Data cleaning",dur:"85p",free:false}]},
  { id:"c2", title:"SQL Mastery – Cơ bản đến nâng cao", trainer:"Phạm Thu Hà", price:120, rating:4.7, students:2100, skills:["SQL","PostgreSQL"],     dur:"18h", lvl:"Beginner",      emoji:"🗃️", tid:"t2", status:"ACTIVE",
    lessons:[{id:"l1",title:"SQL là gì?",dur:"30p",free:true},{id:"l2",title:"SELECT & WHERE",dur:"60p",free:false},{id:"l3",title:"JOIN các bảng",dur:"75p",free:false},{id:"l4",title:"Window Functions",dur:"80p",free:false}]},
  { id:"c3", title:"Power BI Master",              trainer:"Trần Minh Khoa",  price:160, rating:4.9, students:1560, skills:["Power BI","DAX"],         dur:"20h", lvl:"Intermediate",  emoji:"📈", tid:"t4", status:"ACTIVE", lessons:[]},
  { id:"c4", title:"Tableau – Data Viz Pro",       trainer:"Nguyễn Đức Nam",  price:180, rating:4.6, students:890,  skills:["Tableau"],               dur:"16h", lvl:"Intermediate",  emoji:"📊", tid:"t3", status:"ACTIVE", lessons:[]},
  { id:"c5", title:"Machine Learning Python",      trainer:"Lê Văn Tuấn",    price:250, rating:4.7, students:720,  skills:["Machine Learning","Python"],dur:"40h", lvl:"Advanced",    emoji:"🤖", tid:"t1", status:"ACTIVE", lessons:[]},
  { id:"c6", title:"Excel Nâng Cao",               trainer:"Bùi Thị Lan",    price:80,  rating:4.5, students:3200, skills:["Excel"],                  dur:"12h", lvl:"Beginner",      emoji:"📉", tid:"t6", status:"ACTIVE", lessons:[]},
  { id:"c7", title:"Google Analytics 4",           trainer:"Hoàng Minh Đức", price:130, rating:4.3, students:0,    skills:["Google Analytics"],       dur:"14h", lvl:"Intermediate",  emoji:"📌", tid:"t7", status:"PENDING_REVIEW", lessons:[]},
  { id:"c8", title:"R cho Data Science",           trainer:"Nguyễn Thị Bích",price:140, rating:0,   students:0,    skills:["R"],                      dur:"22h", lvl:"Intermediate",  emoji:"📋", tid:"t8", status:"PENDING_REVIEW", lessons:[]},
];

const WORKERS = [
  { id:"w1", name:"Nguyễn Văn Minh",  skills:["Excel","SQL","Power BI"],          exp:2, loc:"TP.HCM", avail:true,  head:"Data Analyst wannabe" },
  { id:"w2", name:"Phạm Thị Lan",     skills:["Python","Machine Learning","SQL"],  exp:3, loc:"TP.HCM", avail:true,  head:"Data Scientist" },
  { id:"w3", name:"Trần Quốc Bảo",    skills:["Power BI","DAX","Azure","SQL"],     exp:5, loc:"Hà Nội", avail:false, head:"Senior BI Developer" },
  { id:"w4", name:"Lê Thị Hương",     skills:["Excel","Financial Modeling","SQL"], exp:4, loc:"Hà Nội", avail:true,  head:"Financial Analyst" },
  { id:"w5", name:"Võ Minh Khoa",     skills:["Python","Tableau","SQL"],           exp:2, loc:"TP.HCM", avail:true,  head:"Marketing Analyst" },
];

const INIT_APPS = [
  { id:"a1", jobId:"j4", status:"INTERVIEW", date:"15/04", score:85 },
  { id:"a2", jobId:"j2", status:"NEW",       date:"17/04", score:62 },
];
const INIT_ENROLL = [
  { id:"e1", cId:"c2", pct:100, cert:true,  done:["l1","l2","l3","l4"] },
  { id:"e2", cId:"c3", pct:65,  cert:false, done:[] },
];
const INIT_LEDGER = [
  { id:"t1", type:"TOPUP",  amt:500,  after:500,  desc:"Nạp credit qua Foxpay (FPAY)",      date:"10/04" },
  { id:"t2", type:"SPEND",  amt:-50,  after:450,  desc:"Đăng ký Power BI",      date:"12/04" },
  { id:"t3", type:"REWARD", amt:50,   after:400,  desc:"Thưởng hoàn thiện hồ sơ", date:"13/04" },
  { id:"t4", type:"SPEND",  amt:-100, after:300,  desc:"Đăng ký SQL Mastery",   date:"15/04" },
  { id:"t5", type:"REWARD", amt:50,   after:350,  desc:"Thưởng hoàn thành SQL", date:"18/04" },
];
const INIT_NOTIFS = [
  { id:"n1", type:"job",    title:"Shopee mời phỏng vấn",     body:"Hồ sơ Marketing Analyst được xét duyệt",  time:"2h trước", read:false },
  { id:"n2", type:"course", title:"Hoàn thành khóa SQL! 🎓",  body:"+50 credit thưởng, chứng chỉ đã cấp",     time:"6h trước", read:false },
  { id:"n3", type:"credit", title:"Nạp credit thành công",    body:"+500 credit đã vào ví",                    time:"10/04",    read:true  },
];

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
const calcMatch = (ws, js) => {
  if (!js.length) return 0;
  const w = ws.map(s => s.toLowerCase());
  return Math.round((js.filter(s => w.includes(s.toLowerCase())).length / js.length) * 100);
};
const scoreColor = s => s >= 70 ? DS.green : s >= 40 ? DS.amber : DS.red;
const scoreBg    = s => s >= 70 ? DS.greenL : s >= 40 ? DS.amberL : DS.redL;

/* ═══════════════════════════════════════════════════════
   PRIMITIVES
═══════════════════════════════════════════════════════ */
const Chip = ({ label, matched }) => (
  <span style={{
    padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600,
    background: matched === undefined ? DS.tag : matched ? DS.greenL : DS.redL,
    color:       matched === undefined ? DS.tagText : matched ? "#00663B" : "#C81E1E",
  }}>
    {matched !== undefined && (matched ? "✓ " : "✗ ")}{label}
  </span>
);

const Badge = ({ children, color = "orange" }) => {
  const map = { orange:[DS.orangeL, DS.orange], purple:[DS.orangeL, DS.orange], green:[DS.greenL,"#00663B"], amber:[DS.amberL,"#CC5500"], red:[DS.redL,DS.red], dark:["rgba(255,255,255,.12)","rgba(255,255,255,.85)"] };
  const [bg, tc] = map[color] || map.orange;
  return <span style={{ background:bg, color:tc, padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{children}</span>;
};

const MatchRing = ({ score, size = 52 }) => {
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  const col = scoreColor(score);
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)", position:"absolute" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E8E4F4" strokeWidth={5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={5}
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c*(1-score/100)} strokeLinecap="round"/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
        <span style={{ fontSize:13, fontWeight:800, color:col, lineHeight:1 }}>{score}</span>
        <span style={{ fontSize:8, color:DS.sub, fontWeight:600 }}>%</span>
      </div>
    </div>
  );
};

const Btn = ({ children, onClick, variant="primary", sm, full, disabled, loading }) => {
  const styles = {
    primary:  { background:gOrange,         color:"#fff", border:"none" },
    outline:  { background:"transparent",   color:DS.orange, border:`1.5px solid ${DS.orange}` },
    ghost:    { background:"transparent",   color:DS.sub, border:"none" },
    danger:   { background:DS.red,          color:"#fff", border:"none" },
    success:  { background:DS.green,        color:"#fff", border:"none" },
    dark:     { background:DS.darkL,        color:"#fff", border:"none" },
    white:    { background:"rgba(255,255,255,.15)", color:"#fff", border:"1px solid rgba(255,255,255,.3)" },
  };
  const s = styles[variant] || styles.primary;
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      ...s, padding: sm ? "5px 12px" : "9px 20px", borderRadius:10, fontSize: sm ? 12 : 13,
      fontWeight:700, cursor:(disabled||loading) ? "not-allowed" : "pointer",
      opacity:(disabled||loading) ? .5 : 1, display:"inline-flex", alignItems:"center",
      gap:5, width:full?"100%":undefined, justifyContent:"center", whiteSpace:"nowrap", fontFamily:"inherit",
    }}>
      {loading ? "⏳" : children}
    </button>
  );
};

const Card = ({ children, style={} }) => (
  <div style={{ background:DS.card, borderRadius:14, padding:20, border:`1px solid ${DS.border}`, boxShadow:"0 2px 12px rgba(249,115,22,.06)", ...style }}>{children}</div>
);

const Modal = ({ title, children, onClose, width=460 }) => (
  <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(12,18,34,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16, backdropFilter:"blur(4px)" }}>
    <div onClick={e=>e.stopPropagation()} style={{ background:DS.card, borderRadius:18, width:"100%", maxWidth:width, maxHeight:"90vh", overflow:"auto", boxShadow:"0 24px 80px rgba(249,115,22,.22)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 22px", borderBottom:`1px solid ${DS.border}`, position:"sticky", top:0, background:DS.card, zIndex:1 }}>
        <span style={{ fontWeight:800, fontSize:15, color:DS.text }}>{title}</span>
        <button onClick={onClose} style={{ background:DS.orangeSoft, border:"none", cursor:"pointer", width:28, height:28, borderRadius:"50%", fontSize:14, color:DS.orange, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
      </div>
      <div style={{ padding:22 }}>{children}</div>
    </div>
  </div>
);

const Inp = ({ label, value, onChange, placeholder, type="text", multi, rows=3, error }) => (
  <div>
    {label && <div style={{ fontWeight:700, fontSize:12, marginBottom:5, color:DS.text }}>{label}</div>}
    {multi
      ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ width:"100%", padding:"10px 13px", borderRadius:10, fontSize:13, border:`1.5px solid ${error?DS.red:DS.border}`, outline:"none", resize:"vertical", fontFamily:"inherit" }} onFocus={e=>e.target.style.borderColor=DS.orange} onBlur={e=>e.target.style.borderColor=error?DS.red:DS.border}/>
      : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{ width:"100%", padding:"10px 13px", borderRadius:10, fontSize:13, border:`1.5px solid ${error?DS.red:DS.border}`, outline:"none", fontFamily:"inherit" }} onFocus={e=>e.target.style.borderColor=DS.orange} onBlur={e=>e.target.style.borderColor=error?DS.red:DS.border}/>
    }
    {error && <div style={{ fontSize:11, color:DS.red, marginTop:3 }}>{error}</div>}
  </div>
);

const Sel = ({ label, value, onChange, options }) => (
  <div>
    {label && <div style={{ fontWeight:700, fontSize:12, marginBottom:5, color:DS.text }}>{label}</div>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{ width:"100%", padding:"10px 13px", borderRadius:10, fontSize:13, border:`1.5px solid ${DS.border}`, outline:"none", background:DS.card, cursor:"pointer", fontFamily:"inherit" }}>
      {options.map(o => <option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
    </select>
  </div>
);

const Empty = ({ icon, text, sub, action, onAction }) => (
  <div style={{ textAlign:"center", padding:"52px 20px", color:DS.sub }}>
    <div style={{ fontSize:46, marginBottom:12 }}>{icon}</div>
    <div style={{ fontWeight:800, color:DS.text, fontSize:15, marginBottom:6 }}>{text}</div>
    <div style={{ fontSize:13, marginBottom: action ? 16 : 0 }}>{sub}</div>
    {action && <Btn onClick={onAction}>{action}</Btn>}
  </div>
);

const StatCard = ({ icon, label, value, sub, onClick }) => (
  <Card style={{ cursor:onClick?"pointer":"default", padding:"16px 18px" }} onClick={onClick}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
      <div>
        <div style={{ fontSize:10, color:DS.sub, fontWeight:700, marginBottom:3, textTransform:"uppercase", letterSpacing:.4 }}>{label}</div>
        <div style={{ fontSize:24, fontWeight:900, color:DS.text, lineHeight:1.1 }}>{value}</div>
        {sub && <div style={{ fontSize:11, color:DS.sub, marginTop:3 }}>{sub}</div>}
      </div>
      <div style={{ background:DS.orangeSoft, borderRadius:10, padding:10, fontSize:18 }}>{icon}</div>
    </div>
  </Card>
);

/* ═══════════════════════════════════════════════════════
   NOTIFICATION BELL
═══════════════════════════════════════════════════════ */
function NotifBell({ notifs, setNotifs }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const unread = notifs.filter(n=>!n.read).length;
  useEffect(() => {
    const h = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const icons = { job:"💼", course:"📚", credit:"💳", reward:"🎁" };
  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ position:"relative", background:"rgba(255,255,255,.1)", border:"none", cursor:"pointer", width:36, height:36, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>
        🔔
        {unread > 0 && <span style={{ position:"absolute", top:5, right:5, width:8, height:8, background:DS.red, borderRadius:"50%", border:"2px solid #0E0A23" }}/>}
      </button>
      {open && (
        <div style={{ position:"absolute", right:0, top:44, width:320, background:DS.card, borderRadius:16, boxShadow:"0 12px 48px rgba(12,18,34,.2)", border:`1px solid ${DS.border}`, zIndex:600 }}>
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${DS.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontWeight:800, fontSize:14 }}>Thông báo {unread>0 && <Badge>{unread}</Badge>}</span>
            {unread>0 && <span onClick={()=>setNotifs(ns=>ns.map(n=>({...n,read:true})))} style={{ fontSize:11, color:DS.orange, cursor:"pointer", fontWeight:600 }}>Đọc tất cả</span>}
          </div>
          <div style={{ maxHeight:300, overflowY:"auto" }}>
            {notifs.map(n=>(
              <div key={n.id} onClick={()=>setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,read:true}:x))} style={{ padding:"11px 16px", borderBottom:`1px solid ${DS.border}`, cursor:"pointer", background:n.read?"#fff":DS.orangeSoft }}>
                <div style={{ display:"flex", gap:10 }}>
                  <span style={{ fontSize:17, flexShrink:0 }}>{icons[n.type]||"📢"}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:n.read?500:700, fontSize:13 }}>{n.title}</div>
                    <div style={{ fontSize:11, color:DS.sub, marginTop:2 }}>{n.body}</div>
                    <div style={{ fontSize:10, color:DS.ghost, marginTop:3 }}>{n.time}</div>
                  </div>
                  {!n.read && <div style={{ width:7, height:7, borderRadius:"50%", background:DS.orange, flexShrink:0, marginTop:5 }}/>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════════════ */
function Sidebar({ role, page, setPage }) {
  const navs = {
    worker:   [{ id:"dashboard",icon:"⚡",label:"Tổng quan" },{ id:"profile",icon:"👤",label:"Hồ sơ" },{ id:"jobs",icon:"💼",label:"Việc làm" },{ id:"courses",icon:"📚",label:"Khóa học" },{ id:"applications",icon:"📋",label:"Ứng tuyển" },{ id:"wallet",icon:"💳",label:"Ví credit" }],
    employer: [{ id:"dashboard",icon:"⚡",label:"Tổng quan" },{ id:"post-job",icon:"➕",label:"Đăng tin" },{ id:"my-jobs",icon:"📌",label:"Tin của tôi" },{ id:"pipeline",icon:"🔀",label:"Ứng viên" },{ id:"candidates",icon:"🔍",label:"Tìm ứng viên" },{ id:"wallet",icon:"💳",label:"Ví credit" }],
    trainer:  [{ id:"dashboard",icon:"⚡",label:"Tổng quan" },{ id:"my-courses",icon:"🎓",label:"Khóa học" },{ id:"create-course",icon:"✏️",label:"Tạo khóa học" },{ id:"analytics",icon:"📈",label:"Analytics" },{ id:"wallet",icon:"💳",label:"Doanh thu" }],
    admin:    [{ id:"dashboard",icon:"⚡",label:"Tổng quan" },{ id:"course-approval",icon:"✅",label:"Duyệt khóa học" },{ id:"users",icon:"👥",label:"Người dùng" },{ id:"credits",icon:"💰",label:"Credit" },{ id:"analytics",icon:"📊",label:"Analytics" }],
  };
  const roleName = { worker:"Người lao động", employer:"Nhà tuyển dụng", trainer:"Đối tác đào tạo", admin:"Admin" };
  return (
    <div style={{ width:210, background:gDark, display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>
      {/* Logo */}
      <div style={{ padding:"20px 18px 16px", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
          <div style={{ background:gCard, borderRadius:10, width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:14, color:"#fff" }}>WL</div>
          <div>
            <div style={{ color:"#fff", fontWeight:800, fontSize:15 }}>WorkLearn</div>
            <div style={{ color:"rgba(255,255,255,.4)", fontSize:10 }}>v5.0</div>
          </div>
        </div>
      </div>
      {/* Role label */}
      <div style={{ padding:"10px 18px", marginBottom:4 }}>
        <div style={{ background:"rgba(249,115,22,.3)", borderRadius:8, padding:"5px 10px", fontSize:10, fontWeight:700, color:"rgba(255,255,255,.7)", textTransform:"uppercase", letterSpacing:.5 }}>
          {roleName[role]}
        </div>
      </div>
      {/* Nav items */}
      <div style={{ flex:1, padding:"0 10px", display:"flex", flexDirection:"column", gap:2 }}>
        {(navs[role]||[]).map(nav => {
          const active = page === nav.id;
          return (
            <button key={nav.id} onClick={()=>setPage(nav.id)} style={{
              display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:10,
              border:"none", cursor:"pointer", textAlign:"left", fontFamily:"inherit",
              background: active ? "rgba(249,115,22,.4)" : "transparent",
              color: active ? "#fff" : "rgba(255,255,255,.5)",
              fontWeight: active ? 700 : 400, fontSize:13,
              borderLeft: active ? `3px solid ${DS.orange}` : "3px solid transparent",
              transition:"all .12s",
            }}>
              <span style={{ fontSize:15, minWidth:18, textAlign:"center" }}>{nav.icon}</span>
              {nav.label}
            </button>
          );
        })}
      </div>
      {/* Footer */}
      <div style={{ padding:"14px 18px", borderTop:"1px solid rgba(255,255,255,.08)", fontSize:10, color:"rgba(255,255,255,.3)" }}>
        WorkLearn Platform © 2026
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   AUTH SCREEN
═══════════════════════════════════════════════════════ */
function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ name:"", email:"", password:"", type:"WORKER" });
  const [loading, setLoading] = useState(false);
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));

  const doLogin = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const t = form.email.includes("employer") ? "employer" : form.email.includes("trainer") ? "trainer" : form.email.includes("admin") ? "admin" : "worker";
      onLogin(t);
    }, 700);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      {/* Left – hero */}
      <div style={{ flex:"0 0 48%", background:gDark, display:"flex", flexDirection:"column", justifyContent:"center", padding:"60px 56px", position:"relative", overflow:"hidden" }}>
        {/* bg circles */}
        <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%", background:"rgba(249,115,22,.2)", top:-100, right:-100, pointerEvents:"none" }}/>
        <div style={{ position:"absolute", width:250, height:250, borderRadius:"50%", background:"rgba(155,89,245,.12)", bottom:80, left:-60, pointerEvents:"none" }}/>
        <div style={{ position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:52 }}>
            <div style={{ background:gCard, borderRadius:12, width:44, height:44, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:18, color:"#fff" }}>WL</div>
            <span style={{ color:"#fff", fontWeight:800, fontSize:22 }}>WorkLearn</span>
          </div>
          <div style={{ fontWeight:900, fontSize:36, color:"#fff", lineHeight:1.2, marginBottom:18 }}>
            Việc làm ngon –<br/>
            <span style={{ background:gCard, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Gọn trên tay</span>
          </div>
          <div style={{ fontSize:14, color:"rgba(255,255,255,.6)", lineHeight:1.8, marginBottom:40 }}>
            AI phân tích kỹ năng · Gợi ý việc làm phù hợp<br/>
            Đề xuất khóa học · Credit economy thống nhất
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {[["💼","Việc làm","10.000+ tin"],["📚","Khóa học","1.000+ khoá"],["🤖","AI Match","Top 10 gợi ý"],["💳","Credit","Tích điểm mỗi ngày"]].map(([ic,t,s])=>(
              <div key={t} style={{ background:"rgba(255,255,255,.07)", borderRadius:12, padding:"12px 14px", border:"1px solid rgba(255,255,255,.1)" }}>
                <div style={{ fontSize:22, marginBottom:4 }}>{ic}</div>
                <div style={{ color:"#fff", fontWeight:700, fontSize:13 }}>{t}</div>
                <div style={{ color:"rgba(255,255,255,.45)", fontSize:11 }}>{s}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:40, fontSize:11, color:"rgba(255,255,255,.3)", lineHeight:1.8 }}>
            Demo: email bất kỳ → NLĐ · "employer..." → NTD<br/>"trainer..." → ĐTĐT · "admin..." → Admin
          </div>
        </div>
      </div>

      {/* Right – form */}
      <div style={{ flex:1, background:"#FAFAFE", display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
        <div style={{ width:"100%", maxWidth:400 }}>
          <div style={{ fontWeight:900, fontSize:26, color:DS.text, marginBottom:4 }}>
            {tab==="login" ? "Đăng nhập" : "Tạo tài khoản"}
          </div>
          <div style={{ fontSize:13, color:DS.sub, marginBottom:28 }}>
            {tab==="login" ? "Chào mừng trở lại WorkLearn!" : "Tham gia cộng đồng 50.000+ người dùng"}
          </div>

          {/* Tab switcher */}
          <div style={{ display:"flex", background:DS.bg, borderRadius:12, padding:4, marginBottom:24, border:`1px solid ${DS.border}` }}>
            {[["login","Đăng nhập"],["register","Đăng ký"]].map(([t,l]) => (
              <button key={t} onClick={()=>setTab(t)} style={{
                flex:1, padding:"8px 0", borderRadius:9, border:"none", cursor:"pointer",
                fontFamily:"inherit", fontWeight:700, fontSize:13,
                background: tab===t ? DS.card : "transparent",
                color: tab===t ? DS.text : DS.sub,
                boxShadow: tab===t ? "0 1px 6px rgba(12,18,34,.08)" : "none",
              }}>{l}</button>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {tab==="register" && <Inp label="Họ và tên" value={form.name} onChange={v=>upd("name",v)} placeholder="Nguyễn Văn A"/>}
            <Inp label="Email" value={form.email} onChange={v=>upd("email",v)} type="email" placeholder="email@example.com"/>
            <Inp label="Mật khẩu" value={form.password} onChange={v=>upd("password",v)} type="password" placeholder="••••••••"/>
            {tab==="register" && (
              <Sel label="Loại tài khoản" value={form.type} onChange={v=>upd("type",v)}
                options={[{v:"WORKER",l:"👤 Người lao động"},{v:"EMPLOYER",l:"🏢 Nhà tuyển dụng"},{v:"TRAINER",l:"🎓 Đối tác đào tạo"}]}/>
            )}
            <button onClick={doLogin} disabled={loading} style={{
              background:gOrange, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontSize:14,
              fontWeight:800, cursor:"pointer", width:"100%", fontFamily:"inherit",
              boxShadow:"0 4px 16px rgba(249,115,22,.35)", transition:"opacity .15s",
              opacity: loading ? .65 : 1,
            }}>{loading ? "Đang xử lý..." : (tab==="login" ? "Đăng nhập →" : "Tạo tài khoản →")}</button>
          </div>

          <div style={{ textAlign:"center", marginTop:18, fontSize:13 }}>
            {tab==="login"
              ? <>Chưa có tài khoản? <span onClick={()=>setTab("register")} style={{ color:DS.orange, cursor:"pointer", fontWeight:700 }}>Đăng ký miễn phí</span></>
              : <>Đã có tài khoản? <span onClick={()=>setTab("login")} style={{ color:DS.orange, cursor:"pointer", fontWeight:700 }}>Đăng nhập</span></>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   JOB CARD (reusable)
═══════════════════════════════════════════════════════ */
function JobCard({ job, userSkills, applied, onClick, compact }) {
  const score = calcMatch(userSkills || [], job.skills);
  const logoColors = ["#F97316","#F23535","#00C853","#FF8800","#0099FF","#FBBF24"];
  const bg = logoColors[job.id.charCodeAt(1) % logoColors.length];
  return (
    <div onClick={onClick} style={{ background:DS.card, borderRadius:14, padding: compact ? "14px 16px" : "18px 20px", border:`1px solid ${DS.border}`, cursor:"pointer", boxShadow:"0 2px 8px rgba(12,18,34,.05)", transition:"box-shadow .15s, transform .15s" }}
      onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 8px 28px rgba(249,115,22,.14)"; e.currentTarget.style.transform="translateY(-1px)"; }}
      onMouseLeave={e=>{ e.currentTarget.style.boxShadow="0 2px 8px rgba(12,18,34,.05)"; e.currentTarget.style.transform="translateY(0)"; }}>
      <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
        {/* Logo */}
        <div style={{ width:44, height:44, borderRadius:12, background:bg, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:14, flexShrink:0 }}>{job.logo}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2, flexWrap:"wrap" }}>
            {job.boosted && <Badge color="amber">⚡ Nổi bật</Badge>}
            <span style={{ fontWeight:800, fontSize:14, color:DS.text }}>{job.title}</span>
            {applied && <Badge color="green">✓ Đã ứng tuyển</Badge>}
          </div>
          <div style={{ fontSize:12, color:DS.sub, marginBottom:8 }}>{job.company} · 📍 {job.loc} · {job.type}</div>
          {!compact && <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
            {job.skills.map(s => {
              const m = (userSkills||[]).map(w=>w.toLowerCase()).includes(s.toLowerCase());
              return <Chip key={s} label={s} matched={userSkills ? m : undefined}/>;
            })}
          </div>}
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontWeight:800, fontSize:13, color:DS.orange }}>{job.salary}/tháng</span>
            <span style={{ fontSize:11, color:DS.ghost }}>·</span>
            <span style={{ fontSize:11, color:DS.sub }}>{job.apps} ứng viên · {job.posted}</span>
          </div>
        </div>
        {/* Match ring */}
        {userSkills && <MatchRing score={score}/>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   JOB DETAIL MODAL
═══════════════════════════════════════════════════════ */
function JobDetailModal({ job, user, courses, apps, onClose, onApply }) {
  const score = calcMatch(user.skills||[], job.skills);
  const matched = job.skills.filter(s=>(user.skills||[]).map(w=>w.toLowerCase()).includes(s.toLowerCase()));
  const missing = job.skills.filter(s=>!(user.skills||[]).map(w=>w.toLowerCase()).includes(s.toLowerCase()));
  const suggested = courses.filter(c=>c.status==="ACTIVE"&&c.skills.some(cs=>missing.map(m=>m.toLowerCase()).includes(cs.toLowerCase())));
  const already = apps.find(a=>a.jobId===job.id);
  const [cover, setCover] = useState("");
  const [loading, setLoading] = useState(false);
  const apply = () => { setLoading(true); setTimeout(()=>{setLoading(false);onApply(job.id,cover);},700); };

  return (
    <Modal title={job.title} onClose={onClose} width={520}>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {/* Header info */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:DS.orangeSoft, borderRadius:12, padding:"14px 16px" }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>🏢 {job.company}</div>
            <div style={{ fontSize:12, color:DS.sub }}>📍 {job.loc} · 💰 {job.salary} · {job.type}</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <MatchRing score={score} size={60}/>
            <div style={{ fontSize:10, color:DS.sub, marginTop:2 }}>AI match</div>
          </div>
        </div>

        <div>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}>📝 Mô tả công việc</div>
          <div style={{ fontSize:13, color:DS.sub, lineHeight:1.7 }}>{job.desc}</div>
        </div>

        <div>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>🎯 Phân tích kỹ năng</div>
          {matched.length > 0 && <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:11, color:DS.green, fontWeight:700, marginBottom:5 }}>✅ Đã có ({matched.length}/{job.skills.length})</div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{matched.map(s=><Chip key={s} label={s} matched/>)}</div>
          </div>}
          {missing.length > 0 && <div>
            <div style={{ fontSize:11, color:DS.red, fontWeight:700, marginBottom:5 }}>❌ Còn thiếu ({missing.length})</div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{missing.map(s=><Chip key={s} label={s} matched={false}/>)}</div>
          </div>}
        </div>

        {suggested.length > 0 && (
          <div style={{ background:DS.amberL, borderRadius:12, padding:"12px 14px", border:`1px solid #FFCC80` }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:7, color:"#CC5500" }}>💡 Học thêm để tăng cơ hội</div>
            {suggested.slice(0,3).map(c=>(
              <div key={c.id} style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                <span>{c.emoji} {c.title}</span>
                <span style={{ fontWeight:700, color:DS.orange }}>{c.price}cr</span>
              </div>
            ))}
          </div>
        )}

        {!already && <Inp label="Thư ứng tuyển (tuỳ chọn)" value={cover} onChange={setCover} multi rows={3} placeholder="Giới thiệu lý do bạn phù hợp..."/>}

        <div style={{ display:"flex", gap:9 }}>
          {already
            ? <button disabled style={{ flex:1, background:DS.greenL, color:DS.green, border:"none", borderRadius:10, padding:"11px", fontWeight:700, fontSize:13, fontFamily:"inherit" }}>✓ Đã ứng tuyển ({already.status})</button>
            : <Btn full onClick={apply} loading={loading}>📤 Ứng tuyển ngay</Btn>
          }
          <Btn variant="outline" onClick={onClose}>Đóng</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   WORKER DASHBOARD
═══════════════════════════════════════════════════════ */
function WorkerDashboard({ user, jobs, courses, apps, enrolls, credit, setPage, setJobModal }) {
  const top4 = useMemo(()=>jobs.map(j=>({...j,score:calcMatch(user.skills||[],j.skills)})).sort((a,b)=>b.score-a.score).slice(0,4),[jobs,user.skills]);
  const ongoing = enrolls.filter(e=>!e.cert).map(e=>{const c=courses.find(x=>x.id===e.cId);return c?{...c,...e}:null;}).filter(Boolean);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      {/* Hero banner */}
      <div style={{ background:gDark, borderRadius:16, padding:"24px 28px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", width:300, height:300, borderRadius:"50%", background:"rgba(249,115,22,.25)", right:-60, top:-80, pointerEvents:"none" }}/>
        <div style={{ position:"relative" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", marginBottom:2, fontWeight:600, textTransform:"uppercase", letterSpacing:.5 }}>Xin chào,</div>
          <div style={{ fontSize:22, fontWeight:900, color:"#fff", marginBottom:4 }}>{user.name} 👋</div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,.6)", marginBottom:14 }}>{user.headline}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:18 }}>
            {(user.skills||[]).map(s=><span key={s} style={{ background:"rgba(249,115,22,.35)", color:"rgba(255,255,255,.9)", padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>{s}</span>)}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <Btn variant="white" onClick={()=>setPage("jobs")}>Tìm việc ngay →</Btn>
            <Btn variant="white" onClick={()=>setPage("courses")}>Khóa học</Btn>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
        <StatCard icon="💳" label="Credit" value={credit} sub="1cr = 1.000đ"/>
        <StatCard icon="📋" label="Ứng tuyển" value={apps.length} sub={`${apps.filter(a=>a.status==="INTERVIEW").length} phỏng vấn`}/>
        <StatCard icon="📚" label="Đang học" value={ongoing.length} sub={`${enrolls.filter(e=>e.cert).length} hoàn thành`}/>
        <StatCard icon="🎯" label="Match cao nhất" value={(top4[0]?.score||0)+"%"} sub="AI recommend"/>
      </div>

      {/* Job suggestions */}
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontWeight:800, fontSize:15 }}>⚡ Việc làm AI gợi ý cho bạn</div>
          <button onClick={()=>setPage("jobs")} style={{ background:"none", border:"none", color:DS.orange, fontSize:12, cursor:"pointer", fontWeight:700 }}>Xem tất cả →</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {top4.map(job=>(
            <JobCard key={job.id} job={job} userSkills={user.skills} applied={!!apps.find(a=>a.jobId===job.id)} onClick={()=>setJobModal(job)} compact/>
          ))}
        </div>
      </Card>

      {/* Ongoing courses */}
      {ongoing.length > 0 && (
        <Card>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:12 }}>📖 Tiếp tục học</div>
          {ongoing.map(c=>(
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:DS.orangeSoft, borderRadius:12, marginBottom:8, border:`1px solid ${DS.border}` }}>
              <div style={{ fontSize:26 }}>{c.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{c.title}</div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:5 }}>
                  <div style={{ flex:1, background:DS.border, borderRadius:10, height:5, overflow:"hidden" }}>
                    <div style={{ width:`${c.pct}%`, background:gOrange, height:"100%", borderRadius:10, transition:"width .5s" }}/>
                  </div>
                  <span style={{ fontSize:11, color:DS.sub, fontWeight:700 }}>{c.pct}%</span>
                </div>
              </div>
              <Btn sm variant="outline" onClick={()=>setPage("courses")}>Học tiếp</Btn>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   WORKER PROFILE — LinkedIn-style full page
   Sections: Header · About · Experience · Education ·
   Skills · Certificates · AI Recommendations
═══════════════════════════════════════════════════════ */

// Static extended profile data (would come from API in production)
const PROFILE_EXT = {
  experiences: [
    { id:"e1", title:"Chuyên viên Kế toán", company:"ABC Finance Corp", companyLogo:"AF", startDate:"03/2024", endDate:"Hiện tại", desc:"Quản lý sổ sách kế toán tổng hợp, lập báo cáo tài chính tháng/quý/năm. Xây dựng dashboard theo dõi dòng tiền bằng Excel.", skills:["Excel","Financial Modeling","SQL"] },
    { id:"e2", title:"Kế toán viên",        company:"XYZ Trading Co.",   companyLogo:"XT", startDate:"07/2022", endDate:"02/2024", desc:"Phụ trách kế toán bán hàng, đối chiếu công nợ, hỗ trợ kiểm toán nội bộ.", skills:["Excel","PowerPoint"] },
    { id:"e3", title:"Thực tập kế toán",    company:"DEF Auditing",      companyLogo:"DA", startDate:"01/2022", endDate:"06/2022", desc:"Hỗ trợ team kiểm toán thu thập và kiểm tra chứng từ, đối chiếu số liệu.", skills:["Excel"] },
  ],
  education: [
    { id:"ed1", school:"Đại học Kinh tế TP.HCM (UEH)", degree:"Cử nhân Kế toán – Kiểm toán", year:"2018 – 2022", gpa:"3.4/4.0", logo:"UEH" },
    { id:"ed2", school:"ACCA – Association of Chartered Certified Accountants", degree:"ACCA Foundation (F1, F2, F3)", year:"2023", gpa:null, logo:"AC" },
  ],
  certs: [
    { id:"c1", name:"SQL Mastery Certificate",        issuer:"WorkLearn Platform", date:"18/04/2026", logo:"WL", credId:"WL-SQL-2026-001" },
    { id:"c2", name:"Power BI Fundamentals",          issuer:"Microsoft Learn",    date:"01/2026",    logo:"MS", credId:"MS-PBI-2024" },
    { id:"c3", name:"Google Analytics 4 Certified",   issuer:"Google",             date:"11/2025",    logo:"GG", credId:"GA4-VN-8823" },
  ],
  contacts: { phone:"090x xxx xxx", email:"minh@email.com", linkedin:"linkedin.com/in/minh-nguyen", github:"github.com/minhdata" },
  stats: { profileViews:128, searchApps:43, jobApps:7 },
};

function WorkerProfile({ user, setUser, jobs, courses, enrolls, apps, showToast, onViewJob, onViewCourse }) {
  const [editing,    setEditing]    = useState(false);
  const [activeTab,  setActiveTab]  = useState("about");
  const [showAddExp, setShowAddExp] = useState(false);
  const [showAddEdu, setShowAddEdu] = useState(false);
  const [form,       setForm]       = useState({ name:user.name, headline:user.headline, bio:user.bio||"", location:user.location||"TP.HCM", skills:[...user.skills] });
  const [profileData,setProfileData]= useState(PROFILE_EXT);

  const pct   = user.pct || 75;
  const score = s => scoreColor(s);

  const toggleSkill = s => setForm(f=>({...f, skills:f.skills.includes(s)?f.skills.filter(x=>x!==s):[...f.skills,s]}));
  const save = () => {
    setUser(u=>({...u,...form, pct:form.bio&&form.skills.length>=4?100:form.skills.length>=2?80:60}));
    setEditing(false);
    showToast("✅ Hồ sơ đã cập nhật!");
  };

  // AI recommendations
  const allSkills   = user.skills || [];
  const missingSkillsForJobs = useMemo(() => {
    const needed = new Set();
    jobs.forEach(j => j.skills.forEach(s => { if(!allSkills.map(x=>x.toLowerCase()).includes(s.toLowerCase())) needed.add(s); }));
    return [...needed].slice(0,8);
  }, [jobs, allSkills]);

  const recCourses = useMemo(() => courses.filter(c=>c.status==="ACTIVE"&&c.skills.some(cs=>missingSkillsForJobs.map(m=>m.toLowerCase()).includes(cs.toLowerCase()))).slice(0,4), [courses, missingSkillsForJobs]);
  const recJobs    = useMemo(() => jobs.map(j=>({...j,score:calcMatch(allSkills,j.skills)})).sort((a,b)=>b.score-a.score).slice(0,4), [jobs, allSkills]);
  const appliedIds = new Set(apps.map(a=>a.jobId));

  // Helpers
  const LogoBubble = ({text,bg="#F97316",size=36}) => (
    <div style={{width:size,height:size,borderRadius:Math.round(size*0.28),background:bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:Math.round(size*0.35),flexShrink:0}}>{text}</div>
  );
  const SectionHeader = ({icon,title,onAdd}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontWeight:800,fontSize:15,color:DS.text}}>{icon} {title}</div>
      {onAdd&&<button onClick={onAdd} style={{background:DS.orangeSoft,border:`1px solid ${DS.orange}30`,borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,color:DS.orange,cursor:"pointer",fontFamily:"inherit"}}>+ Thêm</button>}
    </div>
  );
  const TABS = [["about","👤 Tổng quan"],["experience","💼 Kinh nghiệm"],["education","🎓 Học vấn"],["skills","🎯 Kỹ năng"],["certs","🏆 Chứng chỉ"],["recommend","✨ Gợi ý cho bạn"]];

  return (
    <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
      {/* ── LEFT COLUMN (main profile) ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:14,minWidth:0}}>

        {/* ── HERO CARD ── */}
        <Card style={{padding:0,overflow:"hidden"}}>
          {/* Cover banner */}
          <div style={{height:100,background:`linear-gradient(135deg,#0C1222 0%,${DS.orange}40 60%,#1C4DC5 100%)`,position:"relative"}}>
            <div style={{position:"absolute",inset:0,backgroundImage:"repeating-linear-gradient(45deg,rgba(255,255,255,.03) 0,rgba(255,255,255,.03) 1px,transparent 0,transparent 50%)",backgroundSize:"14px 14px"}}/>
            {!editing && (
              <button onClick={()=>setEditing(true)} style={{position:"absolute",top:10,right:10,background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit",backdropFilter:"blur(4px)"}}>✏️ Chỉnh sửa</button>
            )}
          </div>

          <div style={{padding:"0 24px 22px"}}>
            {/* Avatar + basic info row */}
            <div style={{display:"flex",gap:16,alignItems:"flex-end",marginTop:-40,marginBottom:14}}>
              <div style={{width:80,height:80,borderRadius:20,background:gCard,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:30,border:"4px solid #fff",boxShadow:"0 4px 20px rgba(249,115,22,.35)",flexShrink:0,position:"relative"}}>
                {user.avatar}
                <div style={{position:"absolute",bottom:2,right:2,width:14,height:14,borderRadius:"50%",background:DS.green,border:"2px solid #fff"}}/>
              </div>
              {/* completion ring */}
              <div style={{marginBottom:6,textAlign:"center"}}>
                <div style={{position:"relative",width:48,height:48}}>
                  <svg width={48} height={48} style={{transform:"rotate(-90deg)",position:"absolute"}}>
                    <circle cx={24} cy={24} r={20} fill="none" stroke={DS.border} strokeWidth={4}/>
                    <circle cx={24} cy={24} r={20} fill="none" stroke={pct===100?DS.green:DS.orange} strokeWidth={4}
                      strokeDasharray={`${2*Math.PI*20} ${2*Math.PI*20}`} strokeDashoffset={2*Math.PI*20*(1-pct/100)} strokeLinecap="round"/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
                    <span style={{fontSize:12,fontWeight:900,color:pct===100?DS.green:DS.orange}}>{pct}</span>
                  </div>
                </div>
                <div style={{fontSize:9,color:DS.sub}}>% hồ sơ</div>
              </div>
            </div>

            {editing ? (
              <div style={{display:"flex",flexDirection:"column",gap:11}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <Inp label="Họ và tên" value={form.name}     onChange={v=>setForm(f=>({...f,name:v}))}/>
                  <Inp label="Địa điểm"  value={form.location} onChange={v=>setForm(f=>({...f,location:v}))} placeholder="TP.HCM"/>
                </div>
                <Inp label="Headline / Chức danh" value={form.headline} onChange={v=>setForm(f=>({...f,headline:v}))} placeholder="Data Analyst · Kế toán chuyển ngành"/>
                <Inp label="Giới thiệu bản thân" value={form.bio} onChange={v=>setForm(f=>({...f,bio:v}))} multi rows={3} placeholder="Mô tả ngắn về kinh nghiệm, mục tiêu, điểm mạnh..."/>
                <div style={{display:"flex",gap:9}}>
                  <Btn full variant="success" onClick={save}>💾 Lưu</Btn>
                  <Btn variant="outline" onClick={()=>setEditing(false)}>Hủy</Btn>
                </div>
              </div>
            ) : (
              <div>
                <div style={{fontWeight:900,fontSize:20,color:DS.text,marginBottom:2}}>{user.name}</div>
                <div style={{fontSize:14,color:DS.sub,marginBottom:6}}>{user.headline}</div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:DS.sub,marginBottom:10}}>
                  <span>📍 {user.location}</span>
                  <span>·</span>
                  <span>💼 {user.exp} năm kinh nghiệm</span>
                  <span>·</span>
                  <span>🎓 Đại học Kinh tế TP.HCM</span>
                </div>
                {user.bio && <div style={{fontSize:13,color:DS.text,lineHeight:1.7,marginBottom:10}}>{user.bio}</div>}
                {/* Stats bar */}
                <div style={{display:"flex",gap:14,paddingTop:10,borderTop:`1px solid ${DS.border}`}}>
                  {[[profileData.stats.profileViews,"lượt xem hồ sơ"],[profileData.stats.searchApps,"lượt tìm kiếm"],[profileData.stats.jobApps,"đã ứng tuyển"]].map(([v,l])=>(
                    <div key={l} style={{textAlign:"center"}}>
                      <div style={{fontWeight:900,fontSize:18,color:DS.orange}}>{v}</div>
                      <div style={{fontSize:10,color:DS.sub}}>{l}</div>
                    </div>
                  ))}
                  {/* Availability badge */}
                  <div style={{marginLeft:"auto",background:DS.greenL,border:`1px solid ${DS.green}40`,borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700,color:DS.green,height:"fit-content",alignSelf:"center"}}>
                    🟢 Đang tìm việc
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── TABS ── */}
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={{flex:1,display:"flex",gap:3,background:DS.card,borderRadius:12,padding:4,border:`1px solid ${DS.border}`,overflowX:"auto"}}>
            {TABS.map(([id,l])=>(
            <button key={id} onClick={()=>setActiveTab(id)} style={{padding:"7px 12px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:11,whiteSpace:"nowrap",
              background:activeTab===id?DS.orange:"transparent",color:activeTab===id?"#fff":DS.sub,transition:"all .15s"}}>
              {l}
            </button>
          ))}
          </div>
          <button onClick={()=>setShowAIProfile(true)} style={{ flexShrink:0, background:`linear-gradient(135deg,${DS.orange},#FBBF24)`, border:"none",
            borderRadius:10, padding:"9px 13px", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:11, color:"#fff",
            display:"flex", alignItems:"center", gap:5, boxShadow:`0 2px 10px ${DS.orange}40` }}>
            🤖 AI Phân tích
          </button>
        </div>
        {showAIProfile && <AIProfileAnalyzer user={user} isOpen={showAIProfile} onClose={()=>setShowAIProfile(false)}/>}

        {/* ── TAB: ABOUT ── */}
        {activeTab==="about" && (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Card>
              <SectionHeader icon="👤" title="Giới thiệu"/>
              <div style={{fontSize:13,color:DS.sub,lineHeight:1.8}}>{user.bio||"Chuyên viên kế toán với 2 năm kinh nghiệm đang tích cực học Data Analytics. Tôi có nền tảng mạnh về số liệu tài chính và đang phát triển kỹ năng Python, SQL, Power BI để chuyển sang vai trò Data Analyst trong lĩnh vực Fintech."}</div>
              <div style={{display:"flex",gap:16,marginTop:14,paddingTop:14,borderTop:`1px solid ${DS.border}`,flexWrap:"wrap"}}>
                {[["📧",profileData.contacts.email],["🔗",profileData.contacts.linkedin],["💻",profileData.contacts.github]].map(([ic,v])=>(
                  <span key={v} style={{fontSize:12,color:DS.sub}}>{ic} <b style={{color:DS.orange}}>{v}</b></span>
                ))}
              </div>
            </Card>

            {/* Skills preview */}
            <Card>
              <SectionHeader icon="🎯" title="Kỹ năng nổi bật" onAdd={()=>setActiveTab("skills")}/>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {user.skills.map(s=>(
                  <div key={s} style={{background:DS.orangeSoft,border:`1px solid ${DS.orange}30`,borderRadius:10,padding:"6px 13px",fontSize:12,fontWeight:600,color:DS.orange}}>
                    {s}
                  </div>
                ))}
                <div onClick={()=>setActiveTab("skills")} style={{border:`1.5px dashed ${DS.border}`,borderRadius:10,padding:"6px 13px",fontSize:12,color:DS.sub,cursor:"pointer"}}>+ Thêm kỹ năng</div>
              </div>
            </Card>

            {/* Latest experience */}
            <Card>
              <SectionHeader icon="💼" title="Kinh nghiệm gần nhất" onAdd={()=>setActiveTab("experience")}/>
              {profileData.experiences.slice(0,1).map(e=>(
                <div key={e.id} style={{display:"flex",gap:13}}>
                  <LogoBubble text={e.companyLogo}/>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>{e.title}</div>
                    <div style={{fontSize:12,color:DS.sub}}>{e.company} · {e.startDate} – {e.endDate}</div>
                    <div style={{fontSize:12,color:DS.text,lineHeight:1.6,marginTop:5}}>{e.desc}</div>
                  </div>
                </div>
              ))}
            </Card>

            {/* CV */}
            {user.cv && (
              <Card>
                <div style={{fontWeight:800,fontSize:14,marginBottom:10}}>📎 CV đính kèm</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:DS.orangeSoft,borderRadius:12,padding:"12px 16px",border:`1px solid ${DS.border}`}}>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{width:36,height:36,borderRadius:9,background:"#FF4444",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>PDF</div>
                    <div><div style={{fontWeight:700,fontSize:13}}>CV_Nguyen_Van_Minh.pdf</div><div style={{fontSize:11,color:DS.sub}}>Cập nhật 10/04 · 2.3MB · Xem bởi 43 NTD</div></div>
                  </div>
                  <div style={{display:"flex",gap:7}}>
                    <Btn sm variant="outline">Xem</Btn>
                    <Btn sm>Thay thế</Btn>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── TAB: EXPERIENCE ── */}
        {activeTab==="experience" && (
          <Card>
            <SectionHeader icon="💼" title="Kinh nghiệm làm việc" onAdd={()=>setShowAddExp(!showAddExp)}/>
            {showAddExp && (
              <div style={{background:DS.bg,borderRadius:12,padding:14,marginBottom:16,border:`1px solid ${DS.border}`}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:DS.orange}}>+ Thêm kinh nghiệm mới</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <Inp label="Chức danh" value="" onChange={()=>{}} placeholder="Data Analyst"/>
                  <Inp label="Công ty"   value="" onChange={()=>{}} placeholder="Tên công ty"/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <Inp label="Bắt đầu" value="" onChange={()=>{}} placeholder="MM/YYYY"/>
                  <Inp label="Kết thúc" value="" onChange={()=>{}} placeholder="MM/YYYY hoặc Hiện tại"/>
                </div>
                <Inp label="Mô tả công việc" value="" onChange={()=>{}} multi rows={3} placeholder="Mô tả trách nhiệm và thành tích..."/>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <Btn sm variant="success" onClick={()=>{setShowAddExp(false);showToast("✅ Đã thêm kinh nghiệm!");}}>Lưu</Btn>
                  <Btn sm variant="ghost" onClick={()=>setShowAddExp(false)}>Hủy</Btn>
                </div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {profileData.experiences.map((e,i)=>(
                <div key={e.id} style={{display:"flex",gap:14,paddingBottom:20,marginBottom:i<profileData.experiences.length-1?20:0,borderBottom:i<profileData.experiences.length-1?`1px solid ${DS.border}`:"none"}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <LogoBubble text={e.companyLogo} bg={["#F97316","#1C4DC5","#00B05A"][i%3]}/>
                    {i<profileData.experiences.length-1&&<div style={{width:2,flex:1,background:DS.border,borderRadius:2,marginTop:4}}/>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:14,color:DS.text}}>{e.title}</div>
                        <div style={{fontSize:12,color:DS.sub,margin:"2px 0 6px"}}>{e.company}</div>
                        <div style={{fontSize:11,color:DS.ghost,marginBottom:8}}>
                          📅 {e.startDate} – {e.endDate}
                          <span style={{marginLeft:8,background:e.endDate==="Hiện tại"?DS.greenL:DS.bg,color:e.endDate==="Hiện tại"?DS.green:DS.sub,padding:"1px 7px",borderRadius:20,fontSize:10,fontWeight:600}}>
                            {e.endDate==="Hiện tại"?"Hiện tại":e.endDate}
                          </span>
                        </div>
                      </div>
                      <button style={{background:"none",border:"none",cursor:"pointer",color:DS.ghost,fontSize:12,fontFamily:"inherit"}}>✏️</button>
                    </div>
                    <div style={{fontSize:12,color:DS.sub,lineHeight:1.7,marginBottom:8}}>{e.desc}</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {e.skills.map(s=><span key={s} style={{background:DS.tag,color:DS.tagText,padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:600}}>{s}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── TAB: EDUCATION ── */}
        {activeTab==="education" && (
          <Card>
            <SectionHeader icon="🎓" title="Học vấn" onAdd={()=>setShowAddEdu(!showAddEdu)}/>
            {showAddEdu && (
              <div style={{background:DS.bg,borderRadius:12,padding:14,marginBottom:16,border:`1px solid ${DS.border}`}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:DS.orange}}>+ Thêm học vấn</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <Inp label="Trường"  value="" onChange={()=>{}} placeholder="Tên trường đại học / tổ chức"/>
                  <Inp label="Ngành học / Chứng chỉ" value="" onChange={()=>{}} placeholder="Kế toán, Công nghệ thông tin..."/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Inp label="Năm bắt đầu" value="" onChange={()=>{}} placeholder="2018"/>
                    <Inp label="Năm kết thúc" value="" onChange={()=>{}} placeholder="2022"/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <Btn sm variant="success" onClick={()=>{setShowAddEdu(false);showToast("✅ Đã thêm học vấn!");}}>Lưu</Btn>
                  <Btn sm variant="ghost" onClick={()=>setShowAddEdu(false)}>Hủy</Btn>
                </div>
              </div>
            )}
            {profileData.education.map((ed,i)=>(
              <div key={ed.id} style={{display:"flex",gap:14,paddingBottom:18,marginBottom:i<profileData.education.length-1?18:0,borderBottom:i<profileData.education.length-1?`1px solid ${DS.border}`:"none"}}>
                <div style={{width:46,height:46,borderRadius:12,background:["#1C4DC5","#D01F36"][i%2],display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:13,flexShrink:0}}>{ed.logo}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <div style={{fontWeight:800,fontSize:14}}>{ed.school}</div>
                    <button style={{background:"none",border:"none",cursor:"pointer",color:DS.ghost,fontSize:12,fontFamily:"inherit"}}>✏️</button>
                  </div>
                  <div style={{fontSize:12,color:DS.sub,margin:"2px 0"}}>{ed.degree}</div>
                  <div style={{fontSize:11,color:DS.ghost}}>{ed.year}{ed.gpa&&` · GPA: ${ed.gpa}`}</div>
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* ── TAB: SKILLS ── */}
        {activeTab==="skills" && (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Card>
              <SectionHeader icon="🎯" title="Kỹ năng của bạn" onAdd={()=>{}}/>
              <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:16}}>
                {user.skills.map(s=>(
                  <div key={s} style={{background:DS.orangeSoft,border:`1.5px solid ${DS.orange}40`,borderRadius:10,padding:"7px 14px",fontSize:12,fontWeight:700,color:DS.orange,display:"flex",alignItems:"center",gap:7}}>
                    {s}
                    <span style={{background:DS.orange,color:"#fff",borderRadius:20,fontSize:9,padding:"1px 5px",fontWeight:700}}>Có</span>
                  </div>
                ))}
              </div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:8,color:DS.sub}}>Thêm kỹ năng</div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {SKILLS_ALL.filter(s=>!user.skills.includes(s)).map(s=>(
                  <span key={s} onClick={()=>{ setUser(u=>({...u,skills:[...u.skills,s]})); showToast(`✅ Đã thêm kỹ năng: ${s}`); }} style={{background:DS.tag,color:DS.tagText,padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px dashed ${DS.border}`}}>
                    + {s}
                  </span>
                ))}
              </div>
            </Card>

            {/* Skill gap analysis */}
            {missingSkillsForJobs.length>0&&(
              <Card style={{border:`1px solid ${DS.orange}30`,background:DS.orangeSoft}}>
                <div style={{fontWeight:800,fontSize:14,marginBottom:4,color:DS.orange}}>⚡ Kỹ năng đang được tuyển dụng nhiều</div>
                <div style={{fontSize:12,color:DS.sub,marginBottom:12}}>Các kỹ năng này xuất hiện trong {jobs.length}+ tin tuyển dụng nhưng chưa có trong hồ sơ của bạn</div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                  {missingSkillsForJobs.map(s=>(
                    <div key={s} style={{background:"#fff",border:`1.5px solid ${DS.orange}`,borderRadius:10,padding:"5px 12px",fontSize:12,fontWeight:700,color:DS.orange,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}
                      onClick={()=>{ setUser(u=>({...u,skills:[...u.skills,s]})); showToast(`✅ Đã thêm kỹ năng: ${s}`); }}>
                      + {s}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── TAB: CERTIFICATES ── */}
        {activeTab==="certs" && (
          <Card>
            <SectionHeader icon="🏆" title="Chứng chỉ & Bằng cấp"/>
            {profileData.certs.map((c,i)=>(
              <div key={c.id} style={{display:"flex",gap:14,padding:"14px 0",borderBottom:i<profileData.certs.length-1?`1px solid ${DS.border}`:"none"}}>
                <div style={{width:46,height:46,borderRadius:12,background:{WL:gCard,MS:"#00a4ef",GG:"#4285F4"}[c.logo]||gCard,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:14,flexShrink:0}}>{c.logo}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14}}>{c.name}</div>
                  <div style={{fontSize:12,color:DS.sub,margin:"2px 0"}}>{c.issuer} · {c.date}</div>
                  <div style={{fontSize:11,color:DS.ghost}}>Mã chứng chỉ: {c.credId}</div>
                  <div style={{marginTop:6,display:"flex",gap:7}}>
                    <span style={{background:DS.greenL,color:DS.green,padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:700}}>✓ Đã xác thực</span>
                    <span style={{background:DS.orangeSoft,color:DS.orange,padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer"}}>Xem chứng chỉ</span>
                  </div>
                </div>
              </div>
            ))}
            {/* Enrolled but not completed */}
            {enrolls.filter(e=>!e.cert).length>0&&(
              <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${DS.border}`}}>
                <div style={{fontWeight:700,fontSize:13,color:DS.sub,marginBottom:10}}>⏳ Đang học — chưa nhận chứng chỉ</div>
                {enrolls.filter(e=>!e.cert).map(e=>{const c=courses.find(x=>x.id===e.cId);return c?(
                  <div key={e.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0"}}>
                    <span style={{fontSize:20}}>{c.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600}}>{c.title}</div>
                      <div style={{background:DS.border,borderRadius:10,height:4,marginTop:4,overflow:"hidden"}}>
                        <div style={{width:`${e.pct}%`,background:gOrange,height:"100%",borderRadius:10}}/>
                      </div>
                    </div>
                    <span style={{fontSize:11,color:DS.sub,fontWeight:600}}>{e.pct}%</span>
                  </div>
                ):null;})}
              </div>
            )}
          </Card>
        )}

        {/* ── TAB: RECOMMENDATIONS ── */}
        {activeTab==="recommend" && (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Course recs */}
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontWeight:800,fontSize:15}}>📚 Khóa học phù hợp với bạn</div>
                <span style={{background:`${DS.orange}15`,color:DS.orange,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>AI Powered</span>
              </div>
              <div style={{fontSize:12,color:DS.sub,marginBottom:14}}>Dựa trên kỹ năng còn thiếu so với {jobs.length} tin tuyển dụng phù hợp với hồ sơ của bạn</div>
              {recCourses.length===0?<div style={{fontSize:13,color:DS.sub,textAlign:"center",padding:20}}>Hồ sơ đã đủ kỹ năng! 🎉</div>:
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {recCourses.map(c=>{
                    const enrolled=enrolls.find(e=>e.cId===c.id);
                    return(
                      <div key={c.id} onClick={()=>onViewCourse(c)} style={{border:`1px solid ${DS.border}`,borderRadius:12,overflow:"hidden",cursor:"pointer",transition:"box-shadow .15s,transform .15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 6px 20px ${DS.orange}20`;e.currentTarget.style.transform="translateY(-2px)"}}
                        onMouseLeave={e=>{e.currentTarget.style.boxShadow="";e.currentTarget.style.transform=""}}>
                        <div style={{height:60,background:gDark,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>{c.emoji}</div>
                        <div style={{padding:"10px 12px"}}>
                          <div style={{fontWeight:700,fontSize:13,marginBottom:2,lineHeight:1.3}}>{c.title}</div>
                          <div style={{fontSize:11,color:DS.sub,marginBottom:5}}>{c.trainer} · ⭐{c.rating}</div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontWeight:800,fontSize:13,color:DS.orange}}>{c.price}cr</span>
                            {enrolled?<span style={{fontSize:10,color:DS.green,fontWeight:700}}>✓ Đã đăng ký</span>:<span style={{background:DS.orangeSoft,color:DS.orange,fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20}}>Đăng ký</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              }
            </Card>

            {/* Job recs */}
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontWeight:800,fontSize:15}}>💼 Việc làm phù hợp nhất</div>
                <span style={{background:`${DS.orange}15`,color:DS.orange,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>AI Matching</span>
              </div>
              <div style={{fontSize:12,color:DS.sub,marginBottom:14}}>Xếp hạng theo Matching Score từ kỹ năng, kinh nghiệm và hành vi của bạn</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {recJobs.map(job=>{
                  const logoColors=["#F97316","#F23535","#00C853","#0099FF","#8B5CF6"];
                  const logoBg=logoColors[job.id.charCodeAt(1)%logoColors.length];
                  const sc=scoreColor(job.score);
                  return(
                    <div key={job.id} onClick={()=>onViewJob(job)} style={{display:"flex",gap:12,alignItems:"center",padding:"12px 14px",border:`1px solid ${DS.border}`,borderRadius:12,cursor:"pointer",transition:"all .15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.background=DS.orangeSoft;e.currentTarget.style.borderColor=DS.orange+"40"}}
                      onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.borderColor=DS.border}}>
                      <div style={{width:42,height:42,borderRadius:11,background:logoBg,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:14,flexShrink:0}}>{job.logo}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:13,marginBottom:1}}>{job.title}</div>
                        <div style={{fontSize:11,color:DS.sub}}>{job.company} · 📍 {job.loc} · {job.salary}</div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>
                          {job.skills.slice(0,3).map(s=>{
                            const m=allSkills.map(w=>w.toLowerCase()).includes(s.toLowerCase());
                            return <Chip key={s} label={s} matched={m}/>;
                          })}
                        </div>
                      </div>
                      <div style={{textAlign:"center",flexShrink:0}}>
                        <div style={{fontSize:18,fontWeight:900,color:sc,lineHeight:1}}>{job.score}</div>
                        <div style={{fontSize:9,color:DS.sub}}>% match</div>
                        {appliedIds.has(job.id)&&<div style={{fontSize:9,color:DS.green,fontWeight:700,marginTop:2}}>✓ Đã nộp</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN (sticky sidebar) ── */}
      <div style={{width:240,flexShrink:0,display:"flex",flexDirection:"column",gap:12,position:"sticky",top:0}}>
        {/* Profile strength */}
        <Card style={{padding:"14px 16px"}}>
          <div style={{fontWeight:800,fontSize:13,marginBottom:10}}>💪 Độ mạnh hồ sơ</div>
          {[["Ảnh đại diện","✓",true],["Headline","✓",true],["Kinh nghiệm","✓",true],["Học vấn","✓",true],["Kỹ năng (4+)",user.skills.length>=4?"✓":"✗",user.skills.length>=4],["CV PDF",user.cv?"✓":"✗",!!user.cv],["5 kỹ năng+",user.skills.length>=5?"✓":"✗",user.skills.length>=5],["Giới thiệu (bio)",user.bio?"✓":"✗",!!user.bio]].map(([l,v,ok])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px dashed ${DS.border}`,fontSize:12}}>
              <span style={{color:DS.sub}}>{l}</span>
              <span style={{fontWeight:700,color:ok?DS.green:DS.red,fontSize:13}}>{v}</span>
            </div>
          ))}
          <div style={{marginTop:10}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
              <span style={{color:DS.sub}}>Hoàn thiện</span>
              <span style={{fontWeight:700,color:DS.orange}}>{pct}%</span>
            </div>
            <div style={{background:DS.border,borderRadius:10,height:6,overflow:"hidden"}}>
              <div style={{width:`${pct}%`,background:gOrange,height:"100%",borderRadius:10,transition:"width .5s"}}/>
            </div>
          </div>
        </Card>

        {/* Quick stats */}
        <Card style={{padding:"14px 16px"}}>
          <div style={{fontWeight:800,fontSize:13,marginBottom:10}}>📊 Thống kê hồ sơ</div>
          {[[profileData.stats.profileViews,"👀","Lượt xem 30 ngày"],[profileData.stats.searchApps,"🔍","Lượt tìm kiếm"],[profileData.stats.jobApps,"📤","Đã ứng tuyển"],[enrolls.filter(e=>e.cert).length,"🎓","Chứng chỉ"]].map(([v,ic,l])=>(
            <div key={l} style={{display:"flex",gap:9,alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${DS.border}`}}>
              <span style={{fontSize:16}}>{ic}</span>
              <div>
                <div style={{fontWeight:900,fontSize:16,color:DS.orange,lineHeight:1}}>{v}</div>
                <div style={{fontSize:10,color:DS.sub}}>{l}</div>
              </div>
            </div>
          ))}
        </Card>

        {/* Contacts */}
        <Card style={{padding:"14px 16px"}}>
          <div style={{fontWeight:800,fontSize:13,marginBottom:10}}>🔗 Liên hệ</div>
          {[["📧",profileData.contacts.email,"Email"],["💻",profileData.contacts.github,"GitHub"],["🔗",profileData.contacts.linkedin,"LinkedIn"]].map(([ic,v,l])=>(
            <div key={l} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"6px 0",borderBottom:`1px dashed ${DS.border}`,fontSize:11}}>
              <span>{ic}</span>
              <div><div style={{color:DS.sub,fontSize:9}}>{l}</div><div style={{fontWeight:600,color:DS.orange,wordBreak:"break-all"}}>{v}</div></div>
            </div>
          ))}
        </Card>

        {/* Quick top skill gap */}
        {missingSkillsForJobs.length>0&&(
          <Card style={{padding:"14px 16px",background:DS.orangeSoft,border:`1px solid ${DS.orange}30`}}>
            <div style={{fontWeight:800,fontSize:12,marginBottom:8,color:DS.orange}}>⚡ Học ngay để tăng cơ hội</div>
            {recCourses.slice(0,2).map(c=>(
              <div key={c.id} onClick={()=>onViewCourse(c)} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,cursor:"pointer"}}>
                <span style={{fontSize:18}}>{c.emoji}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:11,color:DS.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</div>
                  <div style={{fontSize:10,color:DS.sub}}>{c.price}cr · ⭐{c.rating}</div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}



/* ═══════════════════════════════════════════════════════
   JOBS PAGE
═══════════════════════════════════════════════════════ */
function JobsPage({ user, jobs, apps, setJobModal }) {
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("all");
  const appliedIds = new Set(apps.map(a=>a.jobId));
  const filtered = useMemo(()=>jobs
    .map(j=>({...j, score:calcMatch(user.skills||[],j.skills)}))
    .filter(j=>{
      const sq = q.toLowerCase();
      return (!sq||j.title.toLowerCase().includes(sq)||j.company.toLowerCase().includes(sq)||j.skills.some(s=>s.toLowerCase().includes(sq)))
        && (loc==="all"||j.loc.includes(loc));
    })
    .sort((a,b)=>b.boosted-a.boosted||b.score-a.score), [jobs,user.skills,q,loc]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontWeight:900, fontSize:18 }}>💼 Tìm việc làm</div>
      {/* Search bar */}
      <div style={{ background:DS.card, borderRadius:14, padding:"14px 16px", border:`1px solid ${DS.border}`, display:"flex", gap:9 }}>
        <div style={{ flex:1, position:"relative" }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, color:DS.ghost }}>🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm tên việc, công ty, kỹ năng..."
            style={{ width:"100%", padding:"9px 12px 9px 36px", borderRadius:10, fontSize:13, border:`1.5px solid ${DS.border}`, outline:"none", fontFamily:"inherit" }}
            onFocus={e=>e.target.style.borderColor=DS.orange} onBlur={e=>e.target.style.borderColor=DS.border}/>
        </div>
        <select value={loc} onChange={e=>setLoc(e.target.value)} style={{ padding:"9px 12px", borderRadius:10, fontSize:12, border:`1.5px solid ${DS.border}`, fontFamily:"inherit", cursor:"pointer", background:DS.card }}>
          <option value="all">📍 Tất cả</option>
          <option value="TP.HCM">TP.HCM</option>
          <option value="Hà Nội">Hà Nội</option>
        </select>
      </div>
      <div style={{ fontSize:12, color:DS.sub }}><b style={{ color:DS.orange }}>{filtered.length}</b> kết quả · Sắp xếp theo AI matching</div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {filtered.map(job=>(
          <JobCard key={job.id} job={{...job}} userSkills={user.skills} applied={appliedIds.has(job.id)} onClick={()=>setJobModal(job)}/>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COURSES PAGE
═══════════════════════════════════════════════════════ */
function CoursesPage({ courses, enrolls, credit, setModalCourse, setModalPlayer }) {
  const [q, setQ] = useState("");
  const [lvl, setLvl] = useState("all");
  const enrolledIds = new Set(enrolls.map(e=>e.cId));
  const active = courses.filter(c=>c.status==="ACTIVE"&&(!q||c.title.toLowerCase().includes(q.toLowerCase())||c.skills.some(s=>s.toLowerCase().includes(q.toLowerCase())))&&(lvl==="all"||c.lvl===lvl));
  const lvlColor = { Beginner:DS.green, Intermediate:DS.amber, Advanced:DS.red };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontWeight:900, fontSize:18 }}>📚 Khóa học</div>
      <div style={{ background:DS.card, borderRadius:14, padding:"14px 16px", border:`1px solid ${DS.border}`, display:"flex", gap:9 }}>
        <div style={{ flex:1, position:"relative" }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, color:DS.ghost }}>🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm khóa học, kỹ năng..."
            style={{ width:"100%", padding:"9px 12px 9px 36px", borderRadius:10, fontSize:13, border:`1.5px solid ${DS.border}`, outline:"none", fontFamily:"inherit" }}
            onFocus={e=>e.target.style.borderColor=DS.orange} onBlur={e=>e.target.style.borderColor=DS.border}/>
        </div>
        <select value={lvl} onChange={e=>setLvl(e.target.value)} style={{ padding:"9px 12px", borderRadius:10, fontSize:12, border:`1.5px solid ${DS.border}`, fontFamily:"inherit", cursor:"pointer", background:DS.card }}>
          <option value="all">Tất cả cấp độ</option>
          <option value="Beginner">Beginner</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Advanced">Advanced</option>
        </select>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {active.map(c=>{
          const enrolled = enrolledIds.has(c.id);
          const enr = enrolls.find(e=>e.cId===c.id);
          return (
            <div key={c.id} style={{ background:DS.card, borderRadius:14, overflow:"hidden", border:`1px solid ${DS.border}`, transition:"box-shadow .15s, transform .15s", cursor:"pointer" }}
              onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 8px 28px rgba(249,115,22,.14)"; e.currentTarget.style.transform="translateY(-2px)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.boxShadow=""; e.currentTarget.style.transform=""; }}>
              {/* Thumb */}
              <div style={{ height:80, background:gDark, display:"flex", alignItems:"center", justifyContent:"center", fontSize:36 }}>
                {c.emoji}
                {enrolled && enr?.cert && <div style={{ position:"absolute", top:8, right:8, fontSize:16 }}>🏆</div>}
              </div>
              <div style={{ padding:"12px 14px" }}>
                <div style={{ fontWeight:800, fontSize:13, marginBottom:2, lineHeight:1.3 }}>{c.title}</div>
                <div style={{ fontSize:11, color:DS.sub, marginBottom:7 }}>{c.trainer} · {c.dur}</div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>
                  {c.skills.slice(0,2).map(s=><Chip key={s} label={s}/>)}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:11, color:DS.sub }}>⭐{c.rating} · {c.students.toLocaleString()}</span>
                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background:lvlColor[c.lvl]+"20", color:lvlColor[c.lvl] }}>{c.lvl}</span>
                </div>
                {enrolled && enr && !enr.cert && (
                  <div style={{ marginBottom:8 }}>
                    <div style={{ background:DS.border, borderRadius:10, height:5, overflow:"hidden" }}>
                      <div style={{ width:`${enr.pct}%`, background:gOrange, height:"100%", borderRadius:10 }}/>
                    </div>
                    <div style={{ fontSize:10, color:DS.sub, marginTop:2 }}>{enr.pct}% hoàn thành</div>
                  </div>
                )}
                <div style={{ display:"flex", gap:6 }}>
                  {enrolled
                    ? (enr?.cert
                        ? <span style={{ fontSize:11, fontWeight:700, color:DS.green, padding:"4px 0" }}>🎓 Có chứng chỉ</span>
                        : <Btn full sm variant="outline" onClick={()=>setModalPlayer(c)}>▶ Học tiếp</Btn>
                      )
                    : <Btn full sm onClick={()=>setModalCourse(c)}>{c.price}cr · Đăng ký</Btn>
                  }
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COURSE DETAIL MODAL
═══════════════════════════════════════════════════════ */
function CourseDetailModal({ course, enrolls, credit, onClose, onEnroll }) {
  const enrolled = enrolls.find(e=>e.cId===course.id);
  const ok = credit >= course.price;
  return (
    <Modal title={course.title} onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ textAlign:"center", background:gDark, borderRadius:14, padding:28, fontSize:52 }}>{course.emoji}</div>
        <div style={{ display:"flex", gap:14, justifyContent:"center", fontSize:12, color:DS.sub, flexWrap:"wrap" }}>
          <span>⭐ {course.rating}/5</span><span>👥 {course.students.toLocaleString()}</span><span>⏱ {course.dur}</span>
          <Badge>{course.lvl}</Badge>
        </div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{course.skills.map(s=><Chip key={s} label={s}/>)}</div>
        <div style={{ background:DS.greenL, borderRadius:12, padding:"11px 14px", border:`1px solid #A7F3D0` }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>🎓 Sau khi hoàn thành</div>
          <div style={{ fontSize:12, color:DS.sub }}>• Chứng chỉ PDF · Kỹ năng thêm vào hồ sơ · +50 credit thưởng</div>
        </div>
        {!enrolled
          ? <div>
              <div style={{ display:"flex", justifyContent:"space-between", background:DS.orangeSoft, borderRadius:10, padding:"11px 14px", marginBottom:9, border:`1px solid ${DS.border}` }}>
                <span style={{ fontWeight:700, fontSize:13 }}>Phí đăng ký</span>
                <span style={{ fontWeight:900, fontSize:18, color:DS.orange }}>{course.price} credit</span>
              </div>
              {!ok && <div style={{ fontSize:11, color:DS.red, marginBottom:8, textAlign:"center" }}>⚠️ Thiếu {course.price-credit} credit</div>}
              <Btn full onClick={()=>onEnroll(course.id)} disabled={!ok}>{ok?`Đăng ký (${course.price}cr)`:"Không đủ credit"}</Btn>
            </div>
          : <div style={{ textAlign:"center", padding:8 }}>
              {enrolled.cert ? <Badge color="green">🎓 Đã có chứng chỉ</Badge>
                : <div>
                    <div style={{ fontWeight:700, fontSize:13, marginBottom:5 }}>{enrolled.pct}% hoàn thành</div>
                    <div style={{ background:DS.border, borderRadius:10, height:8 }}>
                      <div style={{ width:`${enrolled.pct}%`, background:gOrange, height:"100%", borderRadius:10 }}/>
                    </div>
                  </div>}
            </div>}
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   COURSE PLAYER MODAL
═══════════════════════════════════════════════════════ */
function CoursePlayerModal({ course, enroll, onClose, onProgress, onClaim }) {
  const [active, setActive] = useState(0);
  const done = enroll?.done || [];
  const pct = enroll?.pct || 0;
  const lesson = course.lessons[active];
  const markDone = () => {
    if (!lesson) return;
    const nd = [...new Set([...done, lesson.id])];
    const np = Math.round((nd.length / course.lessons.length) * 100);
    onProgress(course.id, np, nd);
  };
  return (
    <Modal title={course.title} onClose={onClose} width={660}>
      <div style={{ display:"flex", gap:0, height:420 }}>
        <div style={{ flex:1, paddingRight:12 }}>
          <div style={{ background:DS.dark, borderRadius:12, height:230, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, marginBottom:12, position:"relative" }}>
            <div style={{ fontSize:46 }}>{course.emoji}</div>
            <div style={{ color:"rgba(255,255,255,.55)", fontSize:12 }}>{lesson?(enroll||lesson.free?"▶ Video đang phát":"🔒 Cần đăng ký"):"Chọn bài học"}</div>
            {lesson&&(enroll||lesson.free)&&<div style={{ color:"rgba(249,115,22,.9)", fontSize:11, fontWeight:600 }}>{lesson.title} · {lesson.dur}</div>}
          </div>
          {lesson && <div>
            <div style={{ fontWeight:800, fontSize:13, marginBottom:3 }}>{lesson.title}</div>
            <div style={{ background:DS.border, borderRadius:10, height:6, marginBottom:10 }}>
              <div style={{ width:`${pct}%`, background:gOrange, height:"100%", borderRadius:10, transition:"width .4s" }}/>
            </div>
            <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
              {enroll && !done.includes(lesson.id) && <Btn sm variant="success" onClick={markDone}>✓ Hoàn thành</Btn>}
              {done.includes(lesson.id) && <Badge color="green">✓ Đã xong</Badge>}
              {pct>=80 && !enroll?.cert && enroll && <Btn sm variant="dark" onClick={()=>onClaim(course.id)}>🎓 Nhận chứng chỉ</Btn>}
            </div>
          </div>}
        </div>
        {/* Lesson list */}
        <div style={{ width:190, borderLeft:`1px solid ${DS.border}`, paddingLeft:12, overflowY:"auto" }}>
          <div style={{ fontWeight:800, fontSize:12, marginBottom:6 }}>Nội dung</div>
          <div style={{ fontSize:10, color:DS.sub, marginBottom:8 }}>{done.length}/{course.lessons.length} bài · {pct}%</div>
          {course.lessons.map((l,i) => {
            const isDone = done.includes(l.id), isActive = i===active, locked = !enroll&&!l.free;
            return (
              <div key={l.id} onClick={()=>!locked&&setActive(i)} style={{ padding:"8px 10px", borderRadius:9, cursor:locked?"not-allowed":"pointer",
                background:isActive?DS.orangeSoft:"transparent", border:`1px solid ${isActive?DS.orange:"transparent"}`, marginBottom:3, opacity:locked?.5:1 }}>
                <div style={{ display:"flex", gap:6 }}>
                  <span style={{ fontSize:12, flexShrink:0 }}>{locked?"🔒":isDone?"✅":"▶"}</span>
                  <div>
                    <div style={{ fontSize:11, fontWeight:isActive?700:400, color:DS.text }}>{l.title}</div>
                    <div style={{ fontSize:10, color:DS.sub }}>{l.dur}{l.free&&<span style={{ color:DS.green }}> · Free</span>}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   MY APPLICATIONS
═══════════════════════════════════════════════════════ */
function MyApplications({ apps, jobs }) {
  const si = { NEW:["orange","Mới nộp"], REVIEW:["amber","Đang xem"], INTERVIEW:["green","Phỏng vấn"], HIRED:["green","Được tuyển ✓"], REJECTED:["red","Từ chối"] };
  const stages = ["NEW","REVIEW","INTERVIEW","HIRED"];
  if (!apps.length) return <Empty icon="📋" text="Chưa có đơn ứng tuyển" sub="Tìm và ứng tuyển việc phù hợp!"/>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontWeight:900, fontSize:18 }}>📋 Đơn ứng tuyển</div>
      {apps.map(app => {
        const job = jobs.find(j=>j.id===app.jobId); if (!job) return null;
        const [sc, sl] = si[app.status]||["ghost","N/A"];
        const ci = stages.indexOf(app.status);
        return (
          <Card key={app.id}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:14, marginBottom:2 }}>{job.title}</div>
                <div style={{ fontSize:12, color:DS.sub }}>🏢 {job.company} · {app.date}</div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:7 }}>
                  {job.skills.slice(0,3).map(s=><Chip key={s} label={s}/>)}
                </div>
              </div>
              <div style={{ textAlign:"right", display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
                <Badge color={sc}>{sl}</Badge>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ fontSize:11, color:DS.sub }}>Match</span>
                  <MatchRing score={app.score} size={40}/>
                </div>
              </div>
            </div>
            {app.status !== "REJECTED" && (
              <div style={{ display:"flex", gap:3, alignItems:"center", marginTop:12, paddingTop:12, borderTop:`1px solid ${DS.border}` }}>
                {stages.map((s,i)=>{
                  const done = i<=ci;
                  return (
                    <div key={s} style={{ display:"flex", alignItems:"center", flex: i<3?1:"auto" }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                        <div style={{ width:18, height:18, borderRadius:"50%", background:done?DS.orange:DS.border, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          {done && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }}/>}
                        </div>
                        <span style={{ fontSize:9, color:done?DS.orange:DS.sub, fontWeight:done?700:400, whiteSpace:"nowrap" }}>
                          {["Nộp","Xem","P.vấn","Tuyển"][i]}
                        </span>
                      </div>
                      {i<3 && <div style={{ flex:1, height:2, background:i<ci?DS.orange:DS.border, margin:"0 4px", marginBottom:12 }}/>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   WALLET
═══════════════════════════════════════════════════════ */
function WalletPage({ credit, ledger, onTopup }) {
  const icons = { TOPUP:"💰", SPEND:"💸", REWARD:"🎁", WITHDRAWAL:"🏦" };
  const topup  = ledger.filter(t=>t.type==="TOPUP").reduce((s,t)=>s+t.amt, 0);
  const spend  = Math.abs(ledger.filter(t=>t.type==="SPEND").reduce((s,t)=>s+t.amt, 0));
  const reward = ledger.filter(t=>t.type==="REWARD").reduce((s,t)=>s+t.amt, 0);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ fontWeight:900, fontSize:18 }}>💳 Ví Credit</div>
      {/* Balance card */}
      <div style={{ background:gDark, borderRadius:18, padding:"28px 32px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", width:260, height:260, borderRadius:"50%", background:"rgba(249,115,22,.2)", right:-60, top:-60, pointerEvents:"none" }}/>
        <div style={{ position:"relative" }}>
          <div style={{ color:"rgba(255,255,255,.55)", fontSize:12, marginBottom:4 }}>Số dư hiện tại</div>
          <div style={{ color:"#FFD700", fontSize:48, fontWeight:900, lineHeight:1 }}>{credit.toLocaleString()}</div>
          <div style={{ color:"rgba(255,255,255,.45)", fontSize:13, marginTop:5 }}>credit ≈ {(credit*1000).toLocaleString()} VND</div>
          <div style={{ marginTop:22, display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
            <button onClick={onTopup} style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#1C4DC5", color:"#fff", border:"none", borderRadius:11, padding:"9px 18px", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 3px 12px rgba(28,77,197,.4)" }}>
              <span style={{ background:"rgba(255,255,255,.2)", borderRadius:6, padding:"2px 6px", fontWeight:900, fontSize:11 }}>FP</span>
              Nạp Credit qua Foxpay
            </button>
          </div>
        </div>
      </div>
      {/* FPAY partner badge */}
      <div style={{ background:"linear-gradient(135deg,#1C4DC5,#0D3A9E)", borderRadius:14, padding:"13px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", border:"1px solid #2A5BE0" }}>
        <div>
          <div style={{ color:"rgba(255,255,255,.65)", fontSize:11, marginBottom:4 }}>Cổng thanh toán chính thức</div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ background:"rgba(255,255,255,.2)", borderRadius:7, padding:"3px 8px", fontWeight:900, fontSize:14, color:"#fff" }}>FP</div>
            <span style={{ color:"#fff", fontWeight:900, fontSize:16 }}>FOXPAY</span>
            <span style={{ background:"rgba(0,176,90,.25)", color:"#5DFFA0", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:10, border:"1px solid rgba(0,176,90,.4)" }}>✓ PCI DSS Level 1</span>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ color:"rgba(255,255,255,.5)", fontSize:10 }}>40+ ngân hàng</div>
          <div style={{ color:"rgba(255,255,255,.5)", fontSize:10 }}>200.000 điểm QR</div>
          <div style={{ color:"#FFD700", fontSize:10, fontWeight:700, marginTop:2 }}>Bảo mật 24/7</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        <StatCard icon="💰" label="Đã nạp"   value={topup}  sub="qua Foxpay"/>
        <StatCard icon="💸" label="Đã tiêu"  value={spend}  sub="dịch vụ"/>
        <StatCard icon="🎁" label="Đã thưởng" value={reward} sub="từ WorkLearn"/>
      </div>
      <Card>
        <div style={{ fontWeight:800, fontSize:14, marginBottom:14 }}>📜 Lịch sử giao dịch</div>
        {ledger.map((tx,i) => (
          <div key={tx.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 0", borderBottom:i<ledger.length-1?`1px solid ${DS.border}`:"none" }}>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:tx.type==="TOPUP"?DS.greenL:tx.type==="SPEND"?DS.redL:DS.amberL, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>
                {icons[tx.type]||"📝"}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:13 }}>{tx.desc}</div>
                <div style={{ fontSize:11, color:DS.sub }}>{tx.date} · Số dư: {tx.after}cr</div>
              </div>
            </div>
            <span style={{ fontWeight:800, fontSize:14, color:tx.amt>0?DS.green:DS.red }}>{tx.amt>0?"+":""}{tx.amt}cr</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FPAY PAYMENT FLOW — Full demo luồng thanh toán
   FPT Pay / Foxpay · Blue primary · Orange accent · QR + OTP
═══════════════════════════════════════════════════════ */

// FPAY Design tokens (FPT Pay brand)
const FP = {
  blue:    "#1C4DC5",   // FPT corporate blue
  blueD:   "#0D3A9E",   // darker
  blueL:   "#E8EEFF",   // light
  orange:  "#FF6B00",   // FPT orange accent
  orangeL: "#FFF0E5",
  green:   "#00B05A",
  bg:      "#F4F6FB",
  card:    "#FFFFFF",
  text:    "#12143A",
  sub:     "#6B7A99",
  border:  "#E3E8F4",
};
const fpGrad  = "linear-gradient(135deg, #1C4DC5, #0D3A9E)";
const fpGrad2 = "linear-gradient(135deg, #1C4DC5 0%, #3B6FD4 100%)";

// FPAY-branded phone frame
function FPayPhone({ children, style={} }) {
  return (
    <div style={{ width:280, margin:"0 auto", ...style }}>
      <div style={{ background:"#0E0E1A", borderRadius:36, padding:"14px 10px 20px", boxShadow:"0 24px 64px rgba(12,18,34,.35), 0 0 0 2px #2A2A3A" }}>
        {/* Notch */}
        <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
          <div style={{ width:80, height:6, background:"#2A2A3A", borderRadius:10 }}/>
        </div>
        <div style={{ background:FP.bg, borderRadius:26, overflow:"hidden", minHeight:480 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// FPAY topbar
function FPayBar({ title, onBack }) {
  return (
    <div style={{ background:fpGrad, padding:"14px 16px", display:"flex", alignItems:"center", gap:10 }}>
      {onBack && <button onClick={onBack} style={{ background:"rgba(255,255,255,.15)", border:"none", cursor:"pointer", width:28, height:28, borderRadius:"50%", color:"#fff", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>←</button>}
      <span style={{ color:"#fff", fontWeight:800, fontSize:14, flex:1 }}>{title}</span>
    </div>
  );
}

// FPay logo badge
function FPayLogo({ size=28 }) {
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
      <div style={{ width:size, height:size, borderRadius:8, background:fpGrad, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ color:"#fff", fontWeight:900, fontSize:size*0.4, fontFamily:"inherit" }}>FP</span>
      </div>
      <span style={{ fontWeight:900, fontSize:size*0.55, color:FP.blue }}>FOXPAY</span>
    </div>
  );
}

// Main TopupModal — now with FPAY flow
function TopupModal({ credit, onClose, onTopup }) {
  const [step, setStep]       = useState("select");
  const [sel, setSel]         = useState(200);
  const [method, setMethod]   = useState("fpay");
  const [otp, setOtp]         = useState(["","","","","",""]);
  const [processing, setProcessing] = useState(false);
  // 6 refs for OTP inputs — must be declared at top level
  const r0 = useRef(null), r1 = useRef(null), r2 = useRef(null);
  const r3 = useRef(null), r4 = useRef(null), r5 = useRef(null);
  const otpRefs = [r0, r1, r2, r3, r4, r5];

  const amount = sel * 1000;
  const txCode = "FP" + Date.now().toString().slice(-8);

  const handleOtp = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const no = [...otp]; no[i] = val; setOtp(no);
    if (val && i < 5) otpRefs[i+1].current?.focus();
  };
  const otpFull = otp.join("").length === 6;

  const doConfirm = () => {
    setProcessing(true);
    setTimeout(() => { setProcessing(false); setStep("success"); }, 1800);
  };

  const doSuccess = () => { onTopup(sel); };

  const PACKAGES = [
    { cr:100, label:"100.000đ",  badge:null },
    { cr:200, label:"200.000đ",  badge:"Phổ biến" },
    { cr:500, label:"500.000đ",  badge:"Tiết kiệm 5%" },
    { cr:1000,label:"1.000.000đ",badge:"Ưu đãi nhất" },
  ];

  /* ── Step: Select package ── */
  if (step === "select") return (
    <Modal title="Nạp Credit WorkLearn" onClose={onClose} width={460}>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {/* FPAY badge */}
        <div style={{ background:fpGrad, borderRadius:14, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ color:"rgba(255,255,255,.7)", fontSize:11, marginBottom:2 }}>Thanh toán qua</div>
            <FPayLogo size={26}/>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ color:"rgba(255,255,255,.6)", fontSize:10 }}>Bảo mật chuẩn</div>
            <div style={{ color:"#FFD700", fontWeight:700, fontSize:11 }}>PCI DSS Level 1</div>
          </div>
        </div>

        <div style={{ fontSize:12, color:DS.sub }}>1 credit = 1.000 VND · Chọn gói nạp:</div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9 }}>
          {PACKAGES.map(p => (
            <button key={p.cr} onClick={()=>setSel(p.cr)} style={{ padding:"14px 10px", borderRadius:12, cursor:"pointer", fontFamily:"inherit", textAlign:"center",
              border:`2px solid ${sel===p.cr?FP.blue:DS.border}`, background:sel===p.cr?FP.blueL:DS.card, position:"relative" }}>
              {p.badge && <div style={{ position:"absolute", top:-8, left:"50%", transform:"translateX(-50%)", background:sel===p.cr?FP.blue:FP.orange, color:"#fff", fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:10, whiteSpace:"nowrap" }}>{p.badge}</div>}
              <div style={{ fontWeight:900, fontSize:20, color:sel===p.cr?FP.blue:DS.text }}>{p.cr}</div>
              <div style={{ fontSize:10, color:FP.blue, fontWeight:700 }}>credit</div>
              <div style={{ fontSize:11, color:DS.sub, marginTop:2 }}>{p.label}</div>
            </button>
          ))}
        </div>

        {/* Method select */}
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:DS.text, marginBottom:8 }}>Phương thức thanh toán</div>
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {[["fpay","💙 Ví FPAY (Foxpay)","Số dư: 850.000đ",""],["atm","🏦 Thẻ ATM / Internet Banking","40+ ngân hàng",""],["qr","📱 Quét mã QR FPAY","Quét bằng app Foxpay",""]].map(([id,l,s,_]) => (
              <button key={id} onClick={()=>setMethod(id)} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 13px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                border:`1.5px solid ${method===id?FP.blue:DS.border}`, background:method===id?FP.blueL:DS.card }}>
                <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${method===id?FP.blue:DS.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {method===id && <div style={{ width:8, height:8, borderRadius:"50%", background:FP.blue }}/>}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:method===id?FP.blue:DS.text }}>{l}</div>
                  <div style={{ fontSize:11, color:DS.sub }}>{s}</div>
                </div>
                {id==="fpay" && <div style={{ marginLeft:"auto" }}><FPayLogo size={18}/></div>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background:FP.blueL, borderRadius:10, padding:"10px 13px", display:"flex", justifyContent:"space-between", border:`1px solid ${FP.border||"#D0D8F0"}` }}>
          <span style={{ fontSize:12 }}>Sau khi nạp: <b style={{ color:FP.blue }}>{(credit+sel).toLocaleString()} credit</b></span>
          <span style={{ fontSize:12, fontWeight:700, color:FP.blue }}>{amount.toLocaleString()} VND</span>
        </div>

        <div style={{ display:"flex", gap:9 }}>
          <button onClick={()=>setStep("confirm")} style={{ flex:1, background:fpGrad, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 16px rgba(28,77,197,.35)" }}>
            Tiếp tục →
          </button>
          <button onClick={onClose} style={{ padding:"12px 16px", background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:12, cursor:"pointer", fontFamily:"inherit", fontSize:13, color:DS.sub }}>Hủy</button>
        </div>
      </div>
    </Modal>
  );

  /* ── Step: Confirm order ── */
  if (step === "confirm") return (
    <Modal title="Xác nhận đơn hàng" onClose={onClose} width={440}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ background:DS.bg, borderRadius:12, padding:"16px 18px", border:`1px solid ${DS.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10, paddingBottom:10, borderBottom:`1px dashed ${DS.border}` }}>
            <span style={{ fontSize:13, color:DS.sub }}>Dịch vụ</span>
            <span style={{ fontWeight:700, fontSize:13 }}>WorkLearn Credit</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:13, color:DS.sub }}>Gói nạp</span>
            <span style={{ fontWeight:700 }}>{sel} credit</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:13, color:DS.sub }}>Tương đương</span>
            <span style={{ fontWeight:700 }}>{amount.toLocaleString()} VND</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:13, color:DS.sub }}>Phương thức</span>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}><FPayLogo size={14}/></div>
          </div>
          <div style={{ borderTop:`1px dashed ${DS.border}`, paddingTop:10, display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontWeight:800, fontSize:14 }}>Tổng thanh toán</span>
            <span style={{ fontWeight:900, fontSize:18, color:FP.blue }}>{amount.toLocaleString()} VND</span>
          </div>
        </div>
        <div style={{ background:"#FFF8E6", borderRadius:10, padding:"10px 13px", fontSize:12, color:"#7A5200", border:"1px solid #FFD700" }}>
          🔒 Giao dịch được mã hóa SSL · Bảo mật chuẩn PCI DSS Level 1
        </div>
        <div style={{ display:"flex", gap:9 }}>
          <button onClick={()=>setStep(method==="qr"?"qr_screen":"fpay_home")} style={{ flex:1, background:fpGrad, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
            🚀 Thanh toán với FPAY
          </button>
          <button onClick={()=>setStep("select")} style={{ padding:"12px 14px", background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:12, cursor:"pointer", fontFamily:"inherit", fontSize:13, color:DS.sub }}>← Quay lại</button>
        </div>
      </div>
    </Modal>
  );

  /* ── Step: QR screen ── */
  if (step === "qr_screen") return (
    <Modal title="Quét mã QR để thanh toán" onClose={onClose} width={360}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
        <FPayLogo size={32}/>
        <div style={{ fontSize:13, color:DS.sub, textAlign:"center" }}>Mở app Foxpay → Quét QR để thanh toán</div>
        {/* Mock QR */}
        <div style={{ background:DS.card, border:`3px solid ${FP.blue}`, borderRadius:16, padding:16 }}>
          <div style={{ width:160, height:160, background:"#fff", display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:2 }}>
            {Array(64).fill(0).map((_,i)=>{
              const pat = [0,1,2,3,4,5,6,7,14,21,28,35,42,49,56,57,58,59,60,61,62,63,7,15,23,31,39,47,8,9,10,11,12,13,50,51,52,53,54,55];
              return <div key={i} style={{ background: (i+Math.floor(i/8))%3===0||pat.includes(i)?"#12143A":"#fff", borderRadius:1 }}/>;
            })}
          </div>
        </div>
        <div style={{ fontWeight:900, fontSize:22, color:FP.blue }}>{amount.toLocaleString()} VND</div>
        <div style={{ fontSize:11, color:DS.sub }}>Mã hết hạn sau <b>5:00</b> phút</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setStep("fpay_home")} style={{ background:fpGrad, color:"#fff", border:"none", borderRadius:10, padding:"10px 18px", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Đã quét QR →</button>
          <button onClick={()=>setStep("confirm")} style={{ background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:10, padding:"10px 14px", fontSize:13, cursor:"pointer", fontFamily:"inherit", color:DS.sub }}>← Quay lại</button>
        </div>
      </div>
    </Modal>
  );

  /* ── Step: FPAY home (phone mock) ── */
  if (step === "fpay_home") return (
    <Modal title="Đang chuyển sang FPAY..." onClose={onClose} width={480}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ textAlign:"center", marginBottom:4 }}>
          <div style={{ fontSize:12, color:DS.sub }}>Ứng dụng Foxpay sẽ mở để xác nhận thanh toán</div>
        </div>
        <FPayPhone>
          {/* FPAY home header */}
          <div style={{ background:fpGrad2, padding:"16px 16px 24px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <FPayLogo size={20}/>
              <div style={{ display:"flex", gap:8 }}>
                <div style={{ width:28, height:28, background:"rgba(255,255,255,.15)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>🔔</div>
              </div>
            </div>
            {/* Balance */}
            <div style={{ background:"rgba(255,255,255,.1)", borderRadius:14, padding:"14px 16px" }}>
              <div style={{ color:"rgba(255,255,255,.7)", fontSize:10, marginBottom:3 }}>Số dư ví Foxpay</div>
              <div style={{ color:"#FFD700", fontSize:24, fontWeight:900, letterSpacing:1 }}>850.000 đ</div>
            </div>
          </div>

          {/* Payment request banner */}
          <div style={{ margin:"12px 14px 0", background:FP.blueL, borderRadius:12, padding:"12px 14px", border:`1px solid ${FP.border||"#D0D8F0"}` }}>
            <div style={{ fontSize:10, color:FP.sub||"#6B7A99", marginBottom:4 }}>Yêu cầu thanh toán từ</div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <div style={{ width:30, height:30, borderRadius:8, background:"linear-gradient(135deg,#F97316,#FBBF24)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:11 }}>WL</div>
              <div>
                <div style={{ fontWeight:800, fontSize:13, color:FP.text }}>WorkLearn Platform</div>
                <div style={{ fontSize:10, color:FP.sub||"#6B7A99" }}>worklearn.vn · Đã xác thực ✓</div>
              </div>
            </div>
            <div style={{ fontWeight:900, fontSize:20, color:FP.blue, marginBottom:2 }}>{amount.toLocaleString()} đ</div>
            <div style={{ fontSize:11, color:FP.sub||"#6B7A99" }}>Nạp {sel} credit WorkLearn</div>
          </div>

          {/* Quick actions */}
          <div style={{ padding:"12px 14px 0" }}>
            <div style={{ fontSize:11, fontWeight:700, color:FP.sub||"#6B7A99", marginBottom:8 }}>Thanh toán từ</div>
            {["💙 Ví Foxpay  •  850.000đ","🏦 Vietcombank •••5678","🏦 Techcombank •••1234"].map((b,i) => (
              <div key={b} style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 11px", borderRadius:10, marginBottom:6, background:i===0?FP.blueL:"#fff", border:`1px solid ${i===0?FP.blue:FP.border||"#E3E8F4"}`, cursor:"pointer" }}>
                <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${i===0?FP.blue:FP.border||"#E3E8F4"}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {i===0&&<div style={{ width:6, height:6, borderRadius:"50%", background:FP.blue }}/>}
                </div>
                <span style={{ fontSize:12, fontWeight:i===0?700:400, color:i===0?FP.blue:FP.text }}>{b}</span>
              </div>
            ))}
          </div>

          <div style={{ padding:"10px 14px 16px", display:"flex", gap:9 }}>
            <button onClick={()=>setStep("otp")} style={{ flex:1, background:fpGrad, color:"#fff", border:"none", borderRadius:12, padding:"11px", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              Xác nhận thanh toán
            </button>
            <button onClick={()=>setStep("confirm")} style={{ padding:"11px 12px", background:"#fff", border:`1px solid ${FP.border||"#E3E8F4"}`, borderRadius:12, cursor:"pointer", fontFamily:"inherit", fontSize:13, color:FP.sub||"#6B7A99" }}>Hủy</button>
          </div>
        </FPayPhone>
      </div>
    </Modal>
  );

  /* ── Step: OTP ── */
  if (step === "otp") return (
    <Modal title="Nhập mã xác thực OTP" onClose={onClose} width={420}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:18 }}>
        <FPayLogo size={34}/>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:800, fontSize:16, marginBottom:6, color:FP.text }}>Nhập mã OTP 6 số</div>
          <div style={{ fontSize:13, color:DS.sub }}>Mã OTP đã gửi đến <b>09xx xxx xxx</b></div>
          <div style={{ fontSize:12, color:FP.orange, fontWeight:600, marginTop:3 }}>Demo: nhập 6 số bất kỳ</div>
        </div>

        {/* OTP boxes */}
        <div style={{ display:"flex", gap:9 }}>
          {otp.map((v, i) => (
            <input key={i} ref={otpRefs[i]} value={v} onChange={e=>handleOtp(i,e.target.value)}
              maxLength={1} inputMode="numeric"
              style={{ width:42, height:50, textAlign:"center", fontSize:22, fontWeight:900, border:`2px solid ${v?FP.blue:FP.border}`, borderRadius:12, outline:"none", background:v?FP.blueL:"#fff", color:FP.blue, fontFamily:"inherit", transition:"all .12s" }}/>
          ))}
        </div>

        {/* Transaction info */}
        <div style={{ background:FP.blueL, borderRadius:12, padding:"12px 16px", width:"100%", border:`1px solid ${FP.border||"#D0D8F0"}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
            <span style={{ color:DS.sub }}>Đến</span><span style={{ fontWeight:700 }}>WorkLearn Platform</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
            <span style={{ color:DS.sub }}>Số tiền</span><span style={{ fontWeight:900, color:FP.blue, fontSize:15 }}>{amount.toLocaleString()} đ</span>
          </div>
        </div>

        <div style={{ fontSize:11, color:DS.sub }}>OTP có hiệu lực trong <b style={{ color:FP.blue }}>2:00</b> phút · <span style={{ color:FP.blue, cursor:"pointer" }}>Gửi lại</span></div>

        <button onClick={doConfirm} disabled={!otpFull||processing}
          style={{ width:"100%", background:fpGrad, color:"#fff", border:"none", borderRadius:12, padding:"13px", fontWeight:800, fontSize:15, cursor:otpFull?"pointer":"not-allowed", fontFamily:"inherit", opacity:otpFull?.98:.45, boxShadow:"0 4px 18px rgba(28,77,197,.35)" }}>
          {processing?"⏳ Đang xử lý...":"✓ Xác nhận thanh toán"}
        </button>
      </div>
    </Modal>
  );

  /* ── Step: Processing animation ── */
  if (step === "processing") return (
    <Modal title="" onClose={()=>{}} width={340}>
      <div style={{ textAlign:"center", padding:"20px 0" }}>
        <div style={{ fontSize:48, marginBottom:14 }}>⏳</div>
        <div style={{ fontWeight:800, fontSize:16, color:FP.text }}>Đang xử lý giao dịch</div>
        <div style={{ fontSize:13, color:DS.sub, marginTop:6 }}>Vui lòng không tắt ứng dụng</div>
      </div>
    </Modal>
  );

  /* ── Step: Success ── */
  if (step === "success") return (
    <Modal title="" onClose={doSuccess} width={400}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16, paddingTop:8 }}>
        {/* Success circle */}
        <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,#00B05A,#00D46A)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 8px 24px rgba(0,176,90,.35)" }}>
          <span style={{ fontSize:32, color:"#fff" }}>✓</span>
        </div>

        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:900, fontSize:20, color:FP.text, marginBottom:4 }}>Thanh toán thành công!</div>
          <div style={{ fontWeight:900, fontSize:28, color:FP.blue }}>{amount.toLocaleString()} đ</div>
        </div>

        {/* Transaction details */}
        <div style={{ background:FP.bg, borderRadius:14, padding:"14px 18px", width:"100%", border:`1px solid ${FP.border||"#E3E8F4"}` }}>
          {[["Mã giao dịch", txCode],["Thời gian", new Date().toLocaleString("vi")],["Từ", "Ví Foxpay"],["Đến", "WorkLearn Platform"],["Nội dung", `Nạp ${sel} credit WorkLearn`]].map(([l,v])=>(
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${FP.border||"#E3E8F4"}`, fontSize:12 }}>
              <span style={{ color:DS.sub }}>{l}</span>
              <span style={{ fontWeight:700, color:FP.text, maxWidth:200, textAlign:"right" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Credit added */}
        <div style={{ background:"linear-gradient(135deg,#00B05A,#009A4F)", borderRadius:14, padding:"14px 20px", width:"100%", textAlign:"center" }}>
          <div style={{ color:"rgba(255,255,255,.8)", fontSize:11, marginBottom:3 }}>Credit đã được cộng vào ví WorkLearn</div>
          <div style={{ color:"#FFD700", fontSize:32, fontWeight:900 }}>+{sel} credit</div>
          <div style={{ color:"rgba(255,255,255,.7)", fontSize:12, marginTop:2 }}>Số dư mới: {(credit+sel).toLocaleString()} credit</div>
        </div>

        <div style={{ display:"flex", gap:9, width:"100%" }}>
          <button onClick={doSuccess} style={{ flex:1, background:fpGrad, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
            ✓ Về trang chính
          </button>
          <button onClick={()=>{ /* download */ }} style={{ padding:"12px 14px", background:FP.bg, border:`1px solid ${FP.border||"#E3E8F4"}`, borderRadius:12, cursor:"pointer", fontFamily:"inherit", fontSize:12, color:DS.sub }}>Lưu biên lai</button>
        </div>
      </div>
    </Modal>
  );

  return null;
}



/* ═══════════════════════════════════════════════════════
   EMPLOYER DASHBOARD
═══════════════════════════════════════════════════════ */
function EmployerDashboard({ user, jobs, apps, credit, setPage }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div style={{ background:gDark, borderRadius:16, padding:"24px 28px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", width:280, height:280, borderRadius:"50%", background:"rgba(249,115,22,.2)", right:-40, top:-80, pointerEvents:"none" }}/>
        <div style={{ position:"relative" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", marginBottom:2, fontWeight:600, textTransform:"uppercase" }}>Nhà tuyển dụng</div>
          <div style={{ fontSize:22, fontWeight:900, color:"#fff", margin:"3px 0 3px" }}>{user.company} 🏢</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.5)", marginBottom:16 }}>{user.verified&&"✓ Đã xác thực · "}{user.name}</div>
          <div style={{ display:"flex", gap:10 }}>
            <Btn variant="white" onClick={()=>setPage("post-job")}>➕ Đăng tin (50cr)</Btn>
            <Btn variant="white" onClick={()=>setPage("pipeline")}>Quản lý ứng viên →</Btn>
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
        <StatCard icon="💳" label="Credit" value={credit}/>
        <StatCard icon="📌" label="Tin active" value={jobs.filter(j=>j.status==="ACTIVE").length}/>
        <StatCard icon="👥" label="Ứng viên" value={apps.length}/>
        <StatCard icon="🎯" label="Phỏng vấn" value={apps.filter(a=>a.status==="INTERVIEW").length}/>
      </div>
      {!jobs.length ? <Empty icon="📌" text="Chưa có tin tuyển dụng" sub="Đăng tin đầu tiên để bắt đầu!" action="Đăng tin ngay" onAction={()=>setPage("post-job")}/> : (
        <Card>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>📌 Tin tuyển dụng của tôi</div>
          {jobs.map(j=>(
            <div key={j.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:DS.orangeSoft, borderRadius:12, border:`1px solid ${DS.border}`, marginBottom:8 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:13 }}>{j.title}</div>
                <div style={{ fontSize:11, color:DS.sub }}>📍 {j.loc} · 💰 {j.salary} · {j.apps} ứng viên</div>
              </div>
              <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                {j.boosted&&<Badge color="amber">⚡ Nổi bật</Badge>}
                <Badge color="green">Active</Badge>
                <Btn sm variant="outline" onClick={()=>setPage("pipeline")}>Ứng viên</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   POST JOB
═══════════════════════════════════════════════════════ */
function PostJobPage({ credit, postJob, showToast, setPage }) {
  const [f, setF] = useState({ title:"", company:"TechCorp VN", loc:"TP.HCM", salary:"", type:"Full-time", skillsInput:"", desc:"" });
  const skills = f.skillsInput.split(",").map(s=>s.trim()).filter(Boolean);
  const submit = () => {
    if (!f.title||!f.salary||!f.desc||!skills.length) { showToast("Điền đủ thông tin","error"); return; }
    if (credit<50) { showToast("Không đủ credit","error"); return; }
    postJob({...f, skills}); setPage("my-jobs");
  };
  return (
    <div style={{ maxWidth:580 }}>
      <div style={{ fontWeight:900, fontSize:18, marginBottom:18 }}>➕ Đăng tin tuyển dụng</div>
      <Card>
        <div style={{ background:DS.amberL, borderRadius:10, padding:"10px 14px", fontSize:13, color:"#CC5500", display:"flex", justifyContent:"space-between", marginBottom:16, border:`1px solid #FFCC80` }}>
          <span>💡 Chi phí: <b>50 credit</b>/tin · 30 ngày hiệu lực</span>
          <span>Còn: <b style={{ color:credit>=50?DS.green:DS.red }}>{credit}cr</b></span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Inp label="Tiêu đề vị trí *" value={f.title} onChange={v=>setF(x=>({...x,title:v}))} placeholder="Data Analyst"/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Inp label="Mức lương *" value={f.salary} onChange={v=>setF(x=>({...x,salary:v}))} placeholder="15–20 triệu"/>
            <Sel label="Địa điểm" value={f.loc} onChange={v=>setF(x=>({...x,loc:v}))} options={["TP.HCM","Hà Nội","Đà Nẵng","Remote"]}/>
          </div>
          <div>
            <Inp label="Kỹ năng (phân cách bằng dấu phẩy)" value={f.skillsInput} onChange={v=>setF(x=>({...x,skillsInput:v}))} placeholder="SQL, Python, Excel"/>
            {skills.length>0&&<div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:7 }}>{skills.map(s=><Chip key={s} label={s}/>)}</div>}
          </div>
          <Inp label="Mô tả công việc *" value={f.desc} onChange={v=>setF(x=>({...x,desc:v}))} multi rows={4} placeholder="Mô tả trách nhiệm, yêu cầu..."/>
          <div style={{ display:"flex", gap:9 }}>
            <Btn full onClick={submit} disabled={credit<50}>{credit>=50?"📤 Đăng tin":"Không đủ credit"}</Btn>
            <Btn variant="outline" onClick={()=>setPage("dashboard")}>Hủy</Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MY JOBS
═══════════════════════════════════════════════════════ */
function MyJobsPage({ jobs, apps, credit, setCredit, setJobs, setLedger, showToast }) {
  const [boostModal, setBoostModal] = useState(null);
  const boostJob = (jid, label, cost) => {
    if (credit<cost) { showToast("Không đủ credit","error"); return; }
    setCredit(c=>c-cost); setJobs(js=>js.map(j=>j.id===jid?{...j,boosted:true}:j));
    setLedger(l=>[{ id:"tx"+Date.now(), type:"SPEND", amt:-cost, after:credit-cost, desc:`Boost ${label}`, date:new Date().toLocaleDateString("vi") },...l]);
    setBoostModal(null); showToast(`✅ Boost ${label} thành công!`);
  };
  if (!jobs.length) return <Empty icon="📌" text="Chưa có tin" sub="Đăng tin đầu tiên!"/>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
      <div style={{ fontWeight:900, fontSize:18 }}>📌 Tin tuyển dụng của tôi</div>
      {jobs.map(job => {
        const ja = apps.filter(a=>a.jobId===job.id);
        return (
          <Card key={job.id}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ display:"flex", gap:7, alignItems:"center", marginBottom:4 }}>
                  {job.boosted&&<Badge color="amber">⚡ Nổi bật</Badge>}
                  <span style={{ fontWeight:800, fontSize:14 }}>{job.title}</span>
                </div>
                <div style={{ fontSize:12, color:DS.sub, marginBottom:8 }}>📍 {job.loc} · 💰 {job.salary} · {job.type}</div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{job.skills.map(s=><Chip key={s} label={s}/>)}</div>
              </div>
              <div style={{ textAlign:"right", display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
                <Badge color="green">🟢 Active</Badge>
                <div style={{ fontSize:11, color:DS.sub }}>{job.apps} ứng viên · {job.posted}</div>
                {!job.boosted && <Btn sm variant="outline" onClick={()=>setBoostModal(job)}>⚡ Boost</Btn>}
              </div>
            </div>
            {ja.length>0&&<div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${DS.border}`, display:"flex", gap:5, flexWrap:"wrap" }}>
              {["NEW","REVIEW","INTERVIEW","HIRED","REJECTED"].map(s=>{const cnt=ja.filter(a=>a.status===s).length;if(!cnt)return null;const cols={NEW:"orange",REVIEW:"amber",INTERVIEW:"green",HIRED:"green",REJECTED:"red"};return <Badge key={s} color={cols[s]}>{s}: {cnt}</Badge>;})}
            </div>}
          </Card>
        );
      })}
      {boostModal&&(
        <Modal title="⚡ Boost tin tuyển dụng" onClose={()=>setBoostModal(null)} width={400}>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:13, color:DS.sub, marginBottom:4 }}>Tin boost hiển thị ưu tiên với badge Nổi bật</div>
            {[["1 ngày",100],["2 ngày",180],["7 ngày",500]].map(([l,cost])=>(
              <div key={l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", border:`1px solid ${DS.border}`, borderRadius:12, background:DS.orangeSoft }}>
                <div><div style={{ fontWeight:700, fontSize:14 }}>Boost {l}</div></div>
                <div style={{ display:"flex", gap:9, alignItems:"center" }}>
                  <span style={{ fontWeight:800, color:DS.orange }}>{cost}cr</span>
                  <Btn sm onClick={()=>boostJob(boostModal.id,l,cost)}>Boost</Btn>
                </div>
              </div>
            ))}
            <Btn full variant="outline" onClick={()=>setBoostModal(null)}>Đóng</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PIPELINE KANBAN
═══════════════════════════════════════════════════════ */
function PipelinePage({ jobs, apps, updateStatus, setPage }) {
  const STAGES = [{ id:"NEW",label:"Mới nộp",c:DS.orange },{ id:"REVIEW",label:"Đang xem",c:DS.amber },{ id:"INTERVIEW",label:"Phỏng vấn",c:DS.green },{ id:"HIRED",label:"Tuyển",c:"#00AA44" },{ id:"REJECTED",label:"Từ chối",c:DS.red }];
  const all = apps.filter(a=>jobs.find(j=>j.id===a.jobId));
  if (!all.length) return <Empty icon="👥" text="Chưa có ứng viên" sub="Đăng tin để nhận hồ sơ" action="Đăng tin" onAction={()=>setPage("post-job")}/>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontWeight:900, fontSize:18 }}>🔀 Kanban – Quản lý ứng viên</div>
      <div style={{ overflowX:"auto", paddingBottom:8 }}>
        <div style={{ display:"flex", gap:10, minWidth:850 }}>
          {STAGES.map(stage => {
            const sa = all.filter(a=>a.status===stage.id);
            const ni = STAGES.findIndex(s=>s.id===stage.id)+1;
            const ns = ni < STAGES.length-1 ? STAGES[ni] : null;
            return (
              <div key={stage.id} style={{ width:185, flexShrink:0 }}>
                <div style={{ fontWeight:700, fontSize:12, marginBottom:8, padding:"7px 10px", background:stage.c+"18", borderRadius:9, color:stage.c, display:"flex", justifyContent:"space-between" }}>
                  {stage.label}
                  <span style={{ background:stage.c, color:"#fff", borderRadius:"50%", width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10 }}>{sa.length}</span>
                </div>
                {!sa.length && <div style={{ background:DS.orangeSoft, border:`2px dashed ${DS.border}`, borderRadius:12, padding:"20px 8px", textAlign:"center", fontSize:11, color:DS.sub }}>Trống</div>}
                {sa.map(app => {
                  const job = jobs.find(j=>j.id===app.jobId);
                  const sc = scoreColor(app.score);
                  return (
                    <div key={app.id} style={{ background:DS.card, borderRadius:12, padding:"10px 12px", border:`1px solid ${DS.border}`, marginBottom:8, boxShadow:"0 2px 8px rgba(12,18,34,.05)" }}>
                      <div style={{ fontWeight:700, fontSize:11, marginBottom:2 }}>#{app.id.slice(-4)}</div>
                      <div style={{ fontSize:11, color:DS.sub, marginBottom:7 }}>{job?.title}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                        <div style={{ flex:1, background:DS.border, borderRadius:10, height:4 }}>
                          <div style={{ width:`${app.score}%`, background:sc, height:"100%", borderRadius:10 }}/>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, color:sc }}>{app.score}%</span>
                      </div>
                      {stage.id!=="HIRED"&&stage.id!=="REJECTED"&&<div style={{ display:"flex", gap:4 }}>
                        {ns&&<button onClick={()=>updateStatus(app.id,ns.id)} style={{ flex:1, padding:"4px 5px", borderRadius:7, fontSize:10, fontWeight:700, background:ns.c+"18", color:ns.c, border:`1px solid ${ns.c}40`, cursor:"pointer", fontFamily:"inherit" }}>→ {ns.id==="HIRED"?"Tuyển":ns.label}</button>}
                        <button onClick={()=>updateStatus(app.id,"REJECTED")} style={{ padding:"4px 8px", borderRadius:7, fontSize:10, background:DS.redL, color:DS.red, border:`1px solid ${DS.red}40`, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>✕</button>
                      </div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CANDIDATE SEARCH
═══════════════════════════════════════════════════════ */
function CandidateSearch() {
  const [q, setQ] = useState("");
  const filtered = WORKERS.filter(w=>!q||w.name.toLowerCase().includes(q.toLowerCase())||w.skills.some(s=>s.toLowerCase().includes(q.toLowerCase())));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
      <div style={{ fontWeight:900, fontSize:18 }}>🔍 Tìm ứng viên</div>
      <Card style={{ padding:"12px 14px" }}>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, color:DS.ghost }}>🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tên, kỹ năng, vị trí..."
            style={{ width:"100%", padding:"9px 12px 9px 36px", borderRadius:10, fontSize:13, border:`1.5px solid ${DS.border}`, outline:"none", fontFamily:"inherit" }}/>
        </div>
      </Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {filtered.map(w=>(
          <Card key={w.id} style={{ padding:"14px 16px" }}>
            <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
              <div style={{ width:42, height:42, borderRadius:12, background:gCard, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:16, flexShrink:0 }}>{w.name[0]}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:13 }}>{w.name}</div>
                <div style={{ fontSize:11, color:DS.sub, marginBottom:7 }}>{w.head} · {w.loc}</div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>
                  {w.skills.slice(0,3).map(s=><Chip key={s} label={s}/>)}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:11, color:w.avail?DS.green:DS.red, fontWeight:600 }}>⬤ {w.avail?"Sẵn sàng":"Đang đi làm"}</span>
                  <Btn sm variant="outline">Liên hệ</Btn>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TRAINER DASHBOARD
═══════════════════════════════════════════════════════ */
function TrainerDashboard({ user, courses, credit, setPage }) {
  const mc = courses.filter(c=>c.tid==="t1");
  const totalStudents = mc.reduce((s,c)=>s+c.students, 0);
  const avgRating = (mc.reduce((s,c)=>s+c.rating, 0) / (mc.length||1)).toFixed(1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div style={{ background:"linear-gradient(135deg,#0E4D2E,#166534)", borderRadius:16, padding:"24px 28px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", width:250, height:250, borderRadius:"50%", background:"rgba(0,200,83,.15)", right:-40, top:-60, pointerEvents:"none" }}/>
        <div style={{ position:"relative" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", fontWeight:600, textTransform:"uppercase" }}>Đối tác đào tạo</div>
          <div style={{ fontSize:22, fontWeight:900, color:"#fff", margin:"3px 0 4px" }}>{user.name} 🎓</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.6)", marginBottom:16 }}>{user.bio}</div>
          <div style={{ display:"flex", gap:9 }}>
            <Btn variant="white" onClick={()=>setPage("create-course")}>✏️ Tạo khóa học</Btn>
            <Btn variant="white" onClick={()=>setPage("analytics")}>Analytics →</Btn>
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
        <StatCard icon="💳" label="Credit" value={credit}/>
        <StatCard icon="📚" label="Khóa học" value={mc.length}/>
        <StatCard icon="👥" label="Học viên" value={totalStudents.toLocaleString()}/>
        <StatCard icon="⭐" label="Rating TB" value={avgRating} sub="/5.0"/>
      </div>
      <Card>
        <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>🏆 Khóa học của tôi</div>
        {mc.map(c=>(
          <div key={c.id} style={{ display:"flex", gap:12, alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${DS.border}` }}>
            <span style={{ fontSize:24 }}>{c.emoji}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:13 }}>{c.title}</div>
              <div style={{ fontSize:11, color:DS.sub }}>⭐{c.rating} · {c.students.toLocaleString()} học viên · {c.price}cr</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontWeight:800, fontSize:13, color:DS.green }}>{(c.students*c.price*.8).toLocaleString()}cr</div>
              <div style={{ fontSize:10, color:DS.sub }}>đã nhận (80%)</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CREATE COURSE
═══════════════════════════════════════════════════════ */
function CreateCoursePage({ showToast, setPage }) {
  const [f, setF] = useState({ title:"", price:"", lvl:"Beginner", skillsInput:"", desc:"" });
  const [loading, setLoading] = useState(false);
  const submit = () => {
    if (!f.title||!f.price||!f.desc) { showToast("Điền đủ thông tin","error"); return; }
    setLoading(true); setTimeout(()=>{ setLoading(false); showToast("✅ Gửi duyệt thành công! Admin xem xét trong 3 ngày"); setPage("my-courses"); }, 900);
  };
  return (
    <div style={{ maxWidth:580 }}>
      <div style={{ fontWeight:900, fontSize:18, marginBottom:18 }}>✏️ Tạo khóa học mới</div>
      <Card>
        <div style={{ background:DS.orangeSoft, border:`1px solid ${DS.border}`, borderRadius:10, padding:"10px 14px", fontSize:12, color:DS.orange, marginBottom:16 }}>
          ℹ️ Cần tối thiểu 5 bài học và 2 giờ nội dung. Bạn nhận <b>80%</b> doanh thu.
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Inp label="Tiêu đề khóa học *" value={f.title} onChange={v=>setF(x=>({...x,title:v}))} placeholder="Python for Data Science"/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Inp label="Giá (credit) *" value={f.price} onChange={v=>setF(x=>({...x,price:v}))} type="number" placeholder="150"/>
            <Sel label="Cấp độ" value={f.lvl} onChange={v=>setF(x=>({...x,lvl:v}))} options={["Beginner","Intermediate","Advanced"]}/>
          </div>
          <Inp label="Kỹ năng đầu ra" value={f.skillsInput} onChange={v=>setF(x=>({...x,skillsInput:v}))} placeholder="Python, Pandas, NumPy"/>
          <Inp label="Mô tả khóa học *" value={f.desc} onChange={v=>setF(x=>({...x,desc:v}))} multi rows={4} placeholder="Nội dung, mục tiêu, đối tượng học viên..."/>
          <div style={{ background:DS.greenL, borderRadius:10, padding:"10px 13px", fontSize:12, color:"#00663B", border:`1px solid #A7F3D0` }}>
            💰 Hoa hồng: <b>80%</b> · Platform fee: <b>20%</b>
          </div>
          <div style={{ display:"flex", gap:9 }}>
            <Btn full onClick={submit} loading={loading}>📤 Gửi duyệt</Btn>
            <Btn variant="outline" onClick={()=>setPage("dashboard")}>Hủy</Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TRAINER MY COURSES
═══════════════════════════════════════════════════════ */
function TrainerCourses({ courses }) {
  const mc = courses.filter(c=>c.tid==="t1");
  if (!mc.length) return <Empty icon="📚" text="Chưa có khóa học" sub="Tạo khóa học đầu tiên!"/>;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
      <div style={{ fontWeight:900, fontSize:18 }}>🎓 Khóa học của tôi</div>
      {mc.map(c=>(
        <Card key={c.id} style={{ padding:"16px 20px" }}>
          <div style={{ display:"flex", gap:14 }}>
            <div style={{ fontSize:36, flexShrink:0 }}>{c.emoji}</div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ fontWeight:800, fontSize:14 }}>{c.title}</div>
                <Badge color={c.status==="ACTIVE"?"green":c.status==="PENDING_REVIEW"?"amber":"red"} sm>
                  {c.status==="ACTIVE"?"✅ Active":c.status==="PENDING_REVIEW"?"⏳ Chờ duyệt":"❌ Từ chối"}
                </Badge>
              </div>
              <div style={{ fontSize:12, color:DS.sub, marginBottom:8 }}>{c.dur} · {c.lvl} · {c.price}cr</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                {[["👥",c.students.toLocaleString(),"Học viên"],["⭐",c.rating,"Rating"],["💰",(c.students*c.price*.8).toLocaleString()+"cr","Đã nhận"]].map(([ic,v,l])=>(
                  <div key={l} style={{ textAlign:"center", background:DS.orangeSoft, borderRadius:9, padding:"8px 6px" }}>
                    <div style={{ fontSize:14 }}>{ic}</div>
                    <div style={{ fontWeight:800, fontSize:13, color:DS.orange }}>{v}</div>
                    <div style={{ fontSize:10, color:DS.sub }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TRAINER ANALYTICS
═══════════════════════════════════════════════════════ */
function TrainerAnalytics({ courses }) {
  const mc = courses.filter(c=>c.tid==="t1");
  const data = [{m:"T1",v:45},{m:"T2",v:62},{m:"T3",v:89},{m:"T4",v:78},{m:"T5",v:134},{m:"T6",v:118}];
  const max = Math.max(...data.map(d=>d.v));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontWeight:900, fontSize:18 }}>📈 Analytics</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        <StatCard icon="👥" label="Tổng học viên" value={mc.reduce((s,c)=>s+c.students,0).toLocaleString()}/>
        <StatCard icon="💰" label="Doanh thu T6" value="17.700cr" sub="80% của GMV"/>
        <StatCard icon="⭐" label="Rating TB" value={(mc.reduce((s,c)=>s+c.rating,0)/(mc.length||1)).toFixed(1)} sub="/5.0"/>
      </div>
      <Card>
        <div style={{ fontWeight:800, fontSize:14, marginBottom:14 }}>📊 Học viên mới theo tháng</div>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end", height:120 }}>
          {data.map(d=>(
            <div key={d.m} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <div style={{ fontSize:9, color:DS.sub }}>{d.v}</div>
              <div style={{ width:"100%", background:gOrange, borderRadius:"4px 4px 0 0", height:`${(d.v/max)*100}px`, minHeight:4 }}/>
              <div style={{ fontSize:10, color:DS.sub, fontWeight:700 }}>{d.m}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ADMIN DASHBOARD
═══════════════════════════════════════════════════════ */
function AdminDashboard({ courses, setPage }) {
  const pending = courses.filter(c=>c.status==="PENDING_REVIEW");
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div style={{ background:gDark, borderRadius:16, padding:"24px 28px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", width:250, height:250, borderRadius:"50%", background:"rgba(249,115,22,.2)", right:-40, top:-60, pointerEvents:"none" }}/>
        <div style={{ position:"relative" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", fontWeight:600 }}>Bảng điều hành</div>
          <div style={{ fontSize:22, fontWeight:900, color:"#fff", margin:"3px 0 14px" }}>Admin Dashboard 🔧</div>
          <div style={{ display:"flex", gap:9 }}>
            {pending.length>0 && <button onClick={()=>setPage("course-approval")} style={{ background:DS.red, color:"#fff", border:"none", borderRadius:9, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>⚠️ {pending.length} khóa chờ duyệt</button>}
            <Btn variant="white" onClick={()=>setPage("analytics")}>Analytics →</Btn>
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
        <StatCard icon="👥" label="Tổng user" value="12,847" sub="+284 tuần này"/>
        <StatCard icon="📌" label="Tin active" value="3,241"/>
        <StatCard icon="📚" label="Khóa active" value={courses.filter(c=>c.status==="ACTIVE").length} sub={`${pending.length} chờ duyệt`} onClick={()=>setPage("course-approval")}/>
        <StatCard icon="💰" label="GMV tháng" value="4.2B" sub="+18% vs T5"/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <Card>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:11 }}>🚨 Cần xử lý ngay</div>
          {pending.map(c=>(
            <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 13px", background:DS.redL, borderRadius:12, border:`1px solid ${DS.red}40`, marginBottom:8 }}>
              <div><div style={{ fontWeight:700, fontSize:13 }}>{c.title}</div><div style={{ fontSize:11, color:DS.sub }}>Trainer: {c.trainer}</div></div>
              <Btn sm onClick={()=>setPage("course-approval")}>Xem xét</Btn>
            </div>
          ))}
          {!pending.length&&<div style={{ fontSize:13, color:DS.sub, textAlign:"center", padding:14 }}>✅ Không có mục cần xử lý</div>}
        </Card>
        <Card>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:11 }}>📊 Hôm nay</div>
          {[["Đăng ký mới","47 TK","↑12%"],["Tin tuyển dụng","28 tin","↑5%"],["Đăng ký học","134","↑22%"],["Giao dịch credit","284","↑8%"]].map(([l,v,c])=>(
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${DS.border}` }}>
              <span style={{ fontSize:12, color:DS.sub }}>{l}</span>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontWeight:700, fontSize:12 }}>{v}</div>
                <div style={{ fontSize:10, color:DS.green }}>{c}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ADMIN COURSE APPROVAL
═══════════════════════════════════════════════════════ */
function CourseApproval({ courses, setCourses, showToast }) {
  const [reviewing, setReviewing] = useState(null);
  const [reason, setReason] = useState("");
  const pending = courses.filter(c=>c.status==="PENDING_REVIEW");
  const approve = id => { setCourses(cs=>cs.map(c=>c.id===id?{...c,status:"ACTIVE"}:c)); setReviewing(null); showToast("✅ Phê duyệt thành công!"); };
  const reject  = id => { if(!reason){showToast("Cần nhập lý do","error");return;} setCourses(cs=>cs.map(c=>c.id===id?{...c,status:"REJECTED"}:c)); setReviewing(null); setReason(""); showToast("Đã từ chối. Trainer nhận thông báo."); };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontWeight:900, fontSize:18 }}>✅ Duyệt khóa học</div>
        <Badge color={pending.length?"red":"green"}>{pending.length} chờ duyệt</Badge>
      </div>
      {!pending.length && <Empty icon="✅" text="Không có khóa học chờ duyệt" sub="Tất cả đã được xử lý!"/>}
      {pending.map(c=>(
        <Card key={c.id} style={{ padding:"16px 20px" }}>
          <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
            <div style={{ fontSize:36, flexShrink:0 }}>{c.emoji}</div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ fontWeight:800, fontSize:14 }}>{c.title}</div>
                <Badge color="amber">⏳ Chờ duyệt</Badge>
              </div>
              <div style={{ fontSize:12, color:DS.sub, marginBottom:9 }}>Trainer: {c.trainer} · {c.dur} · {c.price}cr</div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>{c.skills.map(s=><Chip key={s} label={s}/>)}</div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn sm onClick={()=>setReviewing(c)}>🔍 Chi tiết</Btn>
                <Btn sm variant="success" onClick={()=>approve(c.id)}>✅ Phê duyệt</Btn>
                <Btn sm variant="danger" onClick={()=>setReviewing({...c,rej:true})}>❌ Từ chối</Btn>
              </div>
            </div>
          </div>
        </Card>
      ))}
      {reviewing&&(
        <Modal title={reviewing.rej?"Từ chối khóa học":"Chi tiết"} onClose={()=>{setReviewing(null);setReason("");}}>
          <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{reviewing.title}</div>
            <div style={{ background:DS.orangeSoft, borderRadius:10, padding:13 }}>
              <div style={{ fontWeight:700, fontSize:12, marginBottom:8 }}>Tiêu chí xét duyệt</div>
              {[["Số bài học",`${reviewing.lessons.length} bài`],["Thời lượng",reviewing.dur],["Kỹ năng",`${reviewing.skills.length} kỹ năng`],["Giá",`${reviewing.price}cr`]].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}>
                  <span style={{ color:DS.sub }}>{k}</span><span style={{ color:DS.green, fontWeight:700 }}>{v}</span>
                </div>
              ))}
            </div>
            {reviewing.rej&&<Inp label="Lý do từ chối *" value={reason} onChange={setReason} multi rows={3} placeholder="Mô tả lý do và hướng cải thiện..."/>}
            <div style={{ display:"flex", gap:9 }}>
              {reviewing.rej
                ?<><Btn full variant="danger" onClick={()=>reject(reviewing.id)}>❌ Xác nhận từ chối</Btn><Btn variant="outline" onClick={()=>setReason("")}>Hủy</Btn></>
                :<><Btn full variant="success" onClick={()=>approve(reviewing.id)}>✅ Phê duyệt</Btn><Btn full variant="danger" onClick={()=>setReviewing({...reviewing,rej:true})}>❌ Từ chối</Btn></>
              }
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ADMIN USERS
═══════════════════════════════════════════════════════ */
function AdminUsers() {
  const [q,setQ]=useState("");
  const users=[{name:"Nguyễn Văn Minh",email:"minh@email.com",type:"WORKER",status:"ACTIVE",joined:"01/04",credit:350},{name:"Trần Thị Hoa",email:"hoa@techcorp.vn",type:"EMPLOYER",status:"ACTIVE",joined:"28/03",credit:1200},{name:"Lê Văn Tuấn",email:"tuan@trainer.vn",type:"TRAINER",status:"ACTIVE",joined:"15/03",credit:2840},{name:"Nguyễn Minh Khoa",email:"khoa@co.vn",type:"EMPLOYER",status:"SUSPENDED",joined:"20/03",credit:0}];
  const f=users.filter(u=>!q||u.name.toLowerCase().includes(q.toLowerCase()));
  const tc={WORKER:"orange",EMPLOYER:"green",TRAINER:"amber"};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:13}}>
      <div style={{fontWeight:900,fontSize:18}}>👥 Quản lý người dùng</div>
      <Card style={{padding:"11px 14px"}}><div style={{position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,color:DS.ghost}}>🔍</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm theo tên hoặc email..." style={{width:"100%",padding:"9px 12px 9px 36px",borderRadius:10,fontSize:13,border:`1.5px solid ${DS.border}`,outline:"none",fontFamily:"inherit"}}/></div></Card>
      <Card style={{padding:0,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:DS.orangeSoft}}>
            {["Người dùng","Loại","Trạng thái","Ngày tham gia","Credit",""].map(h=><th key={h} style={{padding:"9px 12px",textAlign:"left",fontWeight:700,color:DS.sub,fontSize:11}}>{h}</th>)}
          </tr></thead>
          <tbody>{f.map((u,i)=>(
            <tr key={u.email} style={{borderBottom:`1px solid ${DS.border}`,background:i%2===0?"#fff":DS.orangeSoft}}>
              <td style={{padding:"9px 12px"}}><div style={{fontWeight:700}}>{u.name}</div><div style={{fontSize:10,color:DS.sub}}>{u.email}</div></td>
              <td style={{padding:"9px 12px"}}><Badge color={tc[u.type]||"ghost"}>{u.type}</Badge></td>
              <td style={{padding:"9px 12px"}}><Badge color={u.status==="ACTIVE"?"green":"red"}>{u.status}</Badge></td>
              <td style={{padding:"9px 12px",color:DS.sub,fontSize:11}}>{u.joined}</td>
              <td style={{padding:"9px 12px",fontWeight:700,color:DS.orange}}>{u.credit}cr</td>
              <td style={{padding:"9px 12px"}}><Btn sm variant={u.status==="ACTIVE"?"danger":"success"}>{u.status==="ACTIVE"?"Khóa":"Mở"}</Btn></td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ADMIN CREDITS & ANALYTICS (simplified)
═══════════════════════════════════════════════════════ */
function AdminCredits() {
  const [f,setF]=useState({user:"",amount:"",reason:""});
  return(
    <div style={{display:"flex",flexDirection:"column",gap:13}}>
      <div style={{fontWeight:900,fontSize:18}}>💰 Quản lý Credit</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Card>
          <div style={{fontWeight:800,fontSize:14,marginBottom:13}}>🔧 Điều chỉnh thủ công</div>
          <div style={{background:DS.redL,border:`1px solid ${DS.red}40`,borderRadius:9,padding:"9px 12px",fontSize:11,color:DS.red,marginBottom:13}}>⚠️ Cần phê duyệt cấp Manager trở lên</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Inp label="User Email" value={f.user} onChange={v=>setF(x=>({...x,user:v}))} placeholder="user@email.com"/>
            <Inp label="Số credit" value={f.amount} onChange={v=>setF(x=>({...x,amount:v}))} type="number" placeholder="+100 hoặc -50"/>
            <Inp label="Lý do *" value={f.reason} onChange={v=>setF(x=>({...x,reason:v}))} multi rows={2} placeholder="Mô tả lý do..."/>
            <Btn full>💾 Thực hiện</Btn>
          </div>
        </Card>
        <Card>
          <div style={{fontWeight:800,fontSize:14,marginBottom:13}}>📊 Thống kê Credit</div>
          {[["Credit lưu thông","4,284,320cr",DS.orange],["Nạp tháng này","842,100cr",DS.green],["Tiêu tháng này","623,400cr",DS.red],["Credit thưởng","45,620cr",DS.amber],["Chờ rút tiền","12 yêu cầu",DS.ghost]].map(([l,v,c])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${DS.border}`}}>
              <span style={{fontSize:12,color:DS.sub}}>{l}</span>
              <span style={{fontWeight:800,color:c,fontSize:12}}>{v}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function AdminAnalytics() {
  const d=[{d:"T2",v:420},{d:"T3",v:510},{d:"T4",v:380},{d:"T5",v:640},{d:"T6",v:780},{d:"T7",v:290},{d:"CN",v:180}];
  const mx=Math.max(...d.map(x=>x.v));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{fontWeight:900,fontSize:18}}>📊 Platform Analytics</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <StatCard icon="👥" label="MAU" value="12,847" sub="T12 target: 50K"/>
        <StatCard icon="📌" label="Tin active" value="3,241"/>
        <StatCard icon="📚" label="Khóa học" value={COURSES.filter(c=>c.status==="ACTIVE").length}/>
        <StatCard icon="💰" label="GMV" value="4.2B VND" sub="Take rate 18%"/>
      </div>
      <Card>
        <div style={{fontWeight:800,fontSize:14,marginBottom:14}}>💰 Doanh thu tuần (triệu credit)</div>
        <div style={{display:"flex",gap:6,alignItems:"flex-end",height:120}}>
          {d.map(x=>(
            <div key={x.d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{fontSize:9,color:DS.sub}}>{x.v}</div>
              <div style={{width:"100%",borderRadius:"3px 3px 0 0",background:gOrange,height:`${(x.v/mx)*100}px`,minHeight:4}}/>
              <div style={{fontSize:10,color:DS.sub,fontWeight:700}}>{x.d}</div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:13}}>
        <Card>
          <div style={{fontWeight:800,fontSize:14,marginBottom:11}}>🎯 KPI Tracking</div>
          {[["MAU T12","12K/50K","25.7%"],["Hire rate","15%/15%","✅ Đạt"],["Course complete","62%/60%","✅ Đạt"],["GMV","4.2B/5B VND","84%"]].map(([k,v,p])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,color:DS.sub}}>{k}</span>
              <div style={{textAlign:"right"}}><div style={{fontWeight:700,fontSize:12}}>{v}</div><div style={{fontSize:10,color:DS.green,fontWeight:700}}>{p}</div></div>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{fontWeight:800,fontSize:14,marginBottom:11}}>📍 Phân bố user</div>
          {[["TP.HCM","52%"],["Hà Nội","31%"],["Đà Nẵng","9%"],["Khác","8%"]].map(([city,pct])=>(
            <div key={city} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:DS.sub}}>{city}</span><span style={{fontWeight:700}}>{pct}</span></div>
              <div style={{background:DS.border,borderRadius:10,height:5}}><div style={{width:pct,background:gOrange,height:"100%",borderRadius:10}}/></div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   JOB DETAIL PAGE (full screen)
═══════════════════════════════════════════════════════ */
function JobDetailPage({ job, user, courses, apps, onBack, onApply }) {
  const score = calcMatch(user.skills || [], job.skills);
  const matched = job.skills.filter(s => (user.skills||[]).map(w=>w.toLowerCase()).includes(s.toLowerCase()));
  const missing  = job.skills.filter(s => !(user.skills||[]).map(w=>w.toLowerCase()).includes(s.toLowerCase()));
  const suggested = courses.filter(c => c.status==="ACTIVE" && c.skills.some(cs => missing.map(m=>m.toLowerCase()).includes(cs.toLowerCase())));
  const already = apps.find(a => a.jobId === job.id);
  const [cover, setCover] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("overview");
  const [showAI, setShowAI]   = useState(false);
  const [coverLetterModal, setCoverLetterModal] = useState(false);
  const apply = () => { setLoading(true); setTimeout(() => { setLoading(false); onApply(job.id, cover); }, 700); };

  const logoColors = ["#F97316","#F23535","#00C853","#0099FF","#FBBF24","#8B5CF6"];
  const logoBg = logoColors[job.id.charCodeAt(1) % logoColors.length];
  const scoreCol = scoreColor(score);

  return (
    <>
    <div style={{ display:"flex", flexDirection:"column", gap:0, maxWidth:860, margin:"0 auto" }}>
      {/* Back nav */}
      <button onClick={onBack} style={{ display:"inline-flex", alignItems:"center", gap:7, color:DS.sub, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, padding:"0 0 14px 0" }}>
        ← Quay lại danh sách việc làm
      </button>

      {/* Hero card */}
      <div style={{ background:DS.card, borderRadius:18, overflow:"hidden", border:`1px solid ${DS.border}`, marginBottom:16, boxShadow:"0 4px 24px rgba(249,115,22,.08)" }}>
        {/* Cover banner */}
        <div style={{ height:100, background:`linear-gradient(135deg, ${logoBg}22, ${logoBg}11)`, borderBottom:`1px solid ${DS.border}`, position:"relative" }}>
          {job.boosted && (
            <div style={{ position:"absolute", top:12, right:14 }}>
              <Badge color="amber">⚡ Tin nổi bật</Badge>
            </div>
          )}
        </div>
        <div style={{ padding:"0 28px 24px" }}>
          {/* Logo overlapping banner */}
          <div style={{ display:"flex", gap:18, alignItems:"flex-end", marginTop:-32, marginBottom:16 }}>
            <div style={{ width:64, height:64, borderRadius:16, background:logoBg, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:20, border:"3px solid #fff", boxShadow:"0 4px 16px rgba(0,0,0,.12)", flexShrink:0 }}>
              {job.logo}
            </div>
            <div style={{ paddingBottom:4 }}>
              <div style={{ fontWeight:900, fontSize:20, color:DS.text }}>{job.title}</div>
              <div style={{ fontSize:13, color:DS.sub }}>{job.company}</div>
            </div>
          </div>

          {/* Info chips row */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18 }}>
            {[["📍", job.loc], ["💼", job.type], ["💰", job.salary+"/tháng"], ["👥", job.apps+" ứng viên"], ["🕐", "Đăng "+job.posted]].map(([ic, v]) => (
              <span key={v} style={{ background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:20, padding:"5px 12px", fontSize:12, fontWeight:500, color:DS.sub }}>
                {ic} {v}
              </span>
            ))}
          </div>

          {/* Match bar */}
          <div style={{ display:"flex", gap:16, alignItems:"center", background:`${scoreCol}10`, borderRadius:14, padding:"14px 18px", border:`1px solid ${scoreCol}30` }}>
            <div style={{ position:"relative", width:72, height:72, flexShrink:0 }}>
              <svg width={72} height={72} style={{ transform:"rotate(-90deg)", position:"absolute" }}>
                <circle cx={36} cy={36} r={30} fill="none" stroke="#E8E4F4" strokeWidth={6}/>
                <circle cx={36} cy={36} r={30} fill="none" stroke={scoreCol} strokeWidth={6}
                  strokeDasharray={`${2*Math.PI*30} ${2*Math.PI*30}`}
                  strokeDashoffset={2*Math.PI*30*(1-score/100)} strokeLinecap="round"/>
              </svg>
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
                <span style={{ fontSize:18, fontWeight:900, color:scoreCol, lineHeight:1 }}>{score}</span>
                <span style={{ fontSize:9, color:DS.sub }}>%</span>
              </div>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:15, color:DS.text, marginBottom:3 }}>
                {score >= 70 ? "🟢 Bạn rất phù hợp với vị trí này!" : score >= 40 ? "🟡 Bạn phù hợp một phần" : "🔴 Cần học thêm để đủ điều kiện"}
              </div>
              <div style={{ fontSize:12, color:DS.sub }}>
                AI phân tích {matched.length}/{job.skills.length} kỹ năng khớp · {missing.length > 0 ? `Còn thiếu ${missing.length} kỹ năng` : "Đủ tất cả kỹ năng yêu cầu"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:14 }}>
        {/* Left column */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* Tabs */}
          <div style={{ display:"flex", gap:0, background:DS.card, borderRadius:12, padding:4, border:`1px solid ${DS.border}` }}>
            {[["overview","📝 Mô tả"],["skills","🎯 Kỹ năng"],["company","🏢 Công ty"]].map(([id,l]) => (
              <button key={id} onClick={()=>setTab(id)} style={{ flex:1, padding:"8px 0", borderRadius:9, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12,
                background:tab===id?DS.orange:"transparent", color:tab===id?"#fff":DS.sub, transition:"all .15s" }}>
                {l}
              </button>
            ))}
          </div>

          {tab==="overview" && (
            <Card>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14 }}>Mô tả công việc</div>
              <div style={{ fontSize:13, color:DS.sub, lineHeight:1.8, marginBottom:16 }}>{job.desc}</div>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>Yêu cầu công việc</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {["Kinh nghiệm tối thiểu 2 năm trong lĩnh vực phân tích dữ liệu",
                  "Thành thạo SQL và ít nhất một ngôn ngữ lập trình (Python/R)",
                  "Kỹ năng trình bày và truyền đạt insight dữ liệu cho stakeholder",
                  "Khả năng làm việc độc lập và theo nhóm trong môi trường Agile"].map(r => (
                  <div key={r} style={{ display:"flex", gap:9, fontSize:13, color:DS.sub }}>
                    <span style={{ color:DS.orange, fontWeight:800, flexShrink:0 }}>•</span>{r}
                  </div>
                ))}
              </div>
              <div style={{ fontWeight:800, fontSize:14, margin:"16px 0 12px" }}>Quyền lợi</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[["💰","Lương cạnh tranh theo năng lực"],["🏥","Bảo hiểm sức khỏe cao cấp"],["📈","Thưởng KPI + thưởng dự án"],["🎓","Ngân sách đào tạo 10tr/năm"],["🏠","Làm remote 2 ngày/tuần"],["🎉","Team building hàng quý"]].map(([ic, b]) => (
                  <div key={b} style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"8px 10px", background:DS.bg, borderRadius:9, fontSize:12 }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>{ic}</span>
                    <span style={{ color:DS.sub, lineHeight:1.4 }}>{b}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab==="skills" && (
            <Card>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14 }}>Phân tích kỹ năng của bạn</div>
              {matched.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:DS.greenL, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>✅</div>
                    <span style={{ fontWeight:700, fontSize:13, color:DS.green }}>Kỹ năng đã có ({matched.length}/{job.skills.length})</span>
                  </div>
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>{matched.map(s => <Chip key={s} label={s} matched/>)}</div>
                </div>
              )}
              {missing.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:DS.redL, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>❌</div>
                    <span style={{ fontWeight:700, fontSize:13, color:DS.red }}>Còn thiếu ({missing.length})</span>
                  </div>
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:12 }}>{missing.map(s => <Chip key={s} label={s} matched={false}/>)}</div>
                  {suggested.length > 0 && (
                    <div style={{ background:`${DS.orange}10`, borderRadius:12, padding:"13px 15px", border:`1px solid ${DS.orange}30` }}>
                      <div style={{ fontWeight:700, fontSize:13, color:DS.orange, marginBottom:10 }}>💡 Học thêm để đủ điều kiện</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {suggested.slice(0,4).map(c => (
                          <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#fff", borderRadius:9, padding:"9px 12px", border:`1px solid ${DS.border}` }}>
                            <div style={{ display:"flex", gap:9, alignItems:"center" }}>
                              <span style={{ fontSize:20 }}>{c.emoji}</span>
                              <div>
                                <div style={{ fontWeight:700, fontSize:12 }}>{c.title}</div>
                                <div style={{ fontSize:11, color:DS.sub }}>⭐{c.rating} · {c.dur} · {c.lvl}</div>
                              </div>
                            </div>
                            <span style={{ fontWeight:800, fontSize:13, color:DS.orange }}>{c.price}cr</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop:8 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>Tất cả kỹ năng JD yêu cầu</div>
                <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                  {job.skills.map(s => {
                    const m = (user.skills||[]).map(w=>w.toLowerCase()).includes(s.toLowerCase());
                    return <Chip key={s} label={s} matched={m}/>;
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* AI Matching Explainer */}
          <div style={{ marginBottom:4 }}>
            <button onClick={()=>setShowAI(v=>!v)} style={{ display:"flex", alignItems:"center", gap:7, background:`${DS.orange}12`,
              border:`1px solid ${DS.orange}30`, borderRadius:10, padding:"8px 14px", cursor:"pointer", fontFamily:"inherit",
              fontSize:12, fontWeight:700, color:DS.orange, width:"100%" }}>
              🤖 {showAI?"Ẩn":"Xem"} phân tích AI cho vị trí này
            </button>
            <MatchingExplainerPanel job={job} user={user} isOpen={showAI} onClose={()=>setShowAI(false)}/>
          </div>

          {tab==="company" && (
            <Card>
              <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:16, paddingBottom:16, borderBottom:`1px solid ${DS.border}` }}>
                <div style={{ width:52, height:52, borderRadius:14, background:logoBg, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:18 }}>{job.logo}</div>
                <div>
                  <div style={{ fontWeight:800, fontSize:16 }}>{job.company}</div>
                  <div style={{ fontSize:12, color:DS.sub }}>Công ty Công nghệ · 500–1000 nhân viên</div>
                </div>
              </div>
              {[["📍 Địa chỉ","Tầng 10, Tòa nhà SunWah, Q.1, TP.HCM"],["🌐 Website","www."+job.company.toLowerCase().replace(" ","")+".vn"],["👤 HR Contact","hr@"+job.company.toLowerCase().replace(" ","")+".vn"],["📅 Ngày đăng",job.posted+" trước"]].map(([l,v])=>(
                <div key={l} style={{ display:"flex", gap:12, marginBottom:10, fontSize:13 }}>
                  <span style={{ color:DS.sub, minWidth:120 }}>{l}</span>
                  <span style={{ color:DS.text, fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Right sticky column */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <Card style={{ position:"sticky", top:20 }}>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:4 }}>{job.title}</div>
            <div style={{ fontSize:12, color:DS.sub, marginBottom:14 }}>{job.company} · {job.loc}</div>
            <div style={{ background:`${DS.orange}12`, borderRadius:10, padding:"12px 14px", marginBottom:14, border:`1px solid ${DS.orange}30` }}>
              <div style={{ fontSize:12, color:DS.sub, marginBottom:2 }}>Mức lương</div>
              <div style={{ fontWeight:900, fontSize:20, color:DS.orange }}>{job.salary}</div>
              <div style={{ fontSize:11, color:DS.sub }}>triệu/tháng (gross)</div>
            </div>

            {already
              ? <div style={{ textAlign:"center", background:DS.greenL, borderRadius:10, padding:"11px", fontWeight:700, fontSize:13, color:"#00663B", border:`1px solid #A7F3D0` }}>
                  ✓ Đã ứng tuyển · {already.status}
                </div>
              : <Btn full onClick={()=>setCoverLetterModal(true)}>✍️ Ứng tuyển + AI thư</Btn>
            }
            <div style={{ fontSize:11, color:DS.sub, textAlign:"center", marginTop:8 }}>Ứng tuyển miễn phí · Không tốn credit</div>
          </Card>

          {/* Quick stats */}
          <Card style={{ padding:"14px 16px" }}>
            {[["👥", "Ứng viên đã nộp", job.apps],["🕐", "Đăng", job.posted+" trước"],["📍", "Địa điểm", job.loc],["💼", "Loại", job.type]].map(([ic,l,v])=>(
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${DS.border}`, fontSize:12 }}>
                <span style={{ color:DS.sub }}>{ic} {l}</span>
                <span style={{ fontWeight:700 }}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>

    {coverLetterModal && (
      <CoverLetterModal job={job} user={user} apps={apps}
        onClose={()=>setCoverLetterModal(false)}
        onApply={(jid,cov)=>{ onApply(jid,cov); setCoverLetterModal(false); }}/>
    )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   COURSE LEARNING PAGE (full screen player)
═══════════════════════════════════════════════════════ */
function CourseLearningPage({ course, enroll, onBack, onProgress, onClaim }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [note, setNote] = useState("");
  const done = enroll?.done || [];
  const pct  = enroll?.pct || 0;
  const lesson = course.lessons[activeIdx];

  const markDone = () => {
    if (!lesson || !enroll) return;
    const nd = [...new Set([...done, lesson.id])];
    const np = Math.round((nd.length / course.lessons.length) * 100);
    onProgress(course.id, np, nd);
  };

  const completedCount = done.length;
  const totalLessons   = course.lessons.length;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", gap:0 }}>
      {/* Top nav */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <button onClick={onBack} style={{ display:"inline-flex", alignItems:"center", gap:7, color:DS.sub, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 }}>
          ← Khóa học
        </button>
        <div style={{ fontWeight:800, fontSize:15, color:DS.text }}>{course.title}</div>
        <div style={{ fontSize:12, color:DS.sub }}>{completedCount}/{totalLessons} bài · {pct}%</div>
      </div>

      {/* Progress bar */}
      <div style={{ background:DS.border, borderRadius:10, height:5, marginBottom:16, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, background:gOrange, height:"100%", borderRadius:10, transition:"width .5s" }}/>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:14, flex:1, minHeight:0 }}>
        {/* LEFT – video + content */}
        <div style={{ display:"flex", flexDirection:"column", gap:14, overflow:"hidden" }}>
          {/* Video player */}
          <div style={{ background:DS.dark, borderRadius:16, aspectRatio:"16/9", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, position:"relative", overflow:"hidden" }}>
            {/* Decorative bg */}
            <div style={{ position:"absolute", width:300, height:300, borderRadius:"50%", background:`${DS.orange}15`, right:-60, top:-60 }}/>
            <div style={{ fontSize:56, position:"relative" }}>{course.emoji}</div>
            {lesson ? (
              enroll || lesson.free ? (
                <div style={{ textAlign:"center", position:"relative" }}>
                  <div style={{ color:"rgba(255,255,255,.9)", fontWeight:700, fontSize:14, marginBottom:4 }}>{lesson.title}</div>
                  <div style={{ color:"rgba(255,255,255,.5)", fontSize:12 }}>▶ Đang phát · {lesson.dur}</div>
                  <div style={{ marginTop:12, display:"flex", gap:16, justifyContent:"center" }}>
                    {[["⏮","Trước"],["⏸","Tạm dừng"],["⏭","Tiếp"]].map(([ic,l])=>(
                      <div key={l} style={{ textAlign:"center", cursor:"pointer" }}>
                        <div style={{ fontSize:24 }}>{ic}</div>
                        <div style={{ fontSize:9, color:"rgba(255,255,255,.4)", marginTop:2 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign:"center", position:"relative" }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>🔒</div>
                  <div style={{ color:"rgba(255,255,255,.7)", fontSize:13 }}>Cần đăng ký để xem bài học này</div>
                </div>
              )
            ) : <div style={{ color:"rgba(255,255,255,.5)", fontSize:13 }}>Chọn bài học để bắt đầu</div>}
          </div>

          {/* Lesson info */}
          {lesson && (
            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:16, marginBottom:3 }}>{lesson.title}</div>
                  <div style={{ fontSize:12, color:DS.sub }}>⏱ {lesson.dur} · Bài {activeIdx+1}/{totalLessons}</div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  {enroll && !done.includes(lesson.id) && <Btn sm variant="success" onClick={markDone}>✓ Đánh dấu hoàn thành</Btn>}
                  {done.includes(lesson.id) && <Badge color="green">✓ Đã hoàn thành</Badge>}
                  {pct >= 80 && !enroll?.cert && enroll && <Btn sm onClick={()=>onClaim(course.id)}>🎓 Nhận chứng chỉ</Btn>}
                </div>
              </div>
              <div style={{ fontSize:13, color:DS.sub, lineHeight:1.7 }}>
                Bài học này cung cấp nền tảng về {lesson.title.toLowerCase()}, bao gồm các khái niệm cốt lõi và ví dụ thực tế trong lĩnh vực Data Analytics.
              </div>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>📝 Ghi chú của bạn</div>
            <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="Ghi chú nhanh trong khi học..."
              style={{ width:"100%", padding:"9px 11px", borderRadius:10, fontSize:12, border:`1.5px solid ${DS.border}`, outline:"none", resize:"vertical", fontFamily:"inherit" }}
              onFocus={e=>e.target.style.borderColor=DS.orange} onBlur={e=>e.target.style.borderColor=DS.border}/>
          </Card>
        </div>

        {/* RIGHT – lesson list */}
        <div style={{ display:"flex", flexDirection:"column", gap:12, overflow:"auto" }}>
          {/* Certificate tracker */}
          {enroll && (
            <Card style={{ padding:"14px 16px" }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>🎓 Tiến độ chứng chỉ</div>
              <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:10 }}>
                <div style={{ position:"relative", width:56, height:56 }}>
                  <svg width={56} height={56} style={{ transform:"rotate(-90deg)", position:"absolute" }}>
                    <circle cx={28} cy={28} r={24} fill="none" stroke={DS.border} strokeWidth={5}/>
                    <circle cx={28} cy={28} r={24} fill="none" stroke={pct>=80?DS.green:DS.orange} strokeWidth={5}
                      strokeDasharray={`${2*Math.PI*24} ${2*Math.PI*24}`} strokeDashoffset={2*Math.PI*24*(1-pct/100)} strokeLinecap="round"/>
                  </svg>
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
                    <span style={{ fontSize:13, fontWeight:900, color:pct>=80?DS.green:DS.orange }}>{pct}</span>
                    <span style={{ fontSize:8, color:DS.sub }}>%</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:12 }}>{completedCount}/{totalLessons} bài xong</div>
                  <div style={{ fontSize:11, color:DS.sub, marginTop:2 }}>{pct>=80?"Đủ điều kiện nhận chứng chỉ!":"Cần "+Math.ceil((0.8*totalLessons)-completedCount)+" bài nữa"}</div>
                </div>
              </div>
              {pct>=80 && !enroll.cert && <Btn full sm onClick={()=>onClaim(course.id)}>🎓 Nhận chứng chỉ +50cr</Btn>}
              {enroll.cert && <div style={{ background:DS.greenL, borderRadius:9, padding:"8px 11px", fontSize:12, color:"#00663B", fontWeight:700, textAlign:"center" }}>🎓 Chứng chỉ đã cấp!</div>}
            </Card>
          )}

          {/* Lesson list */}
          <Card style={{ padding:"14px 16px" }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>Nội dung khóa học</div>
            {course.lessons.map((l, i) => {
              const isDone   = done.includes(l.id);
              const isActive = i === activeIdx;
              const locked   = !enroll && !l.free;
              return (
                <div key={l.id} onClick={()=>!locked && setActiveIdx(i)} style={{
                  display:"flex", gap:9, alignItems:"flex-start", padding:"9px 10px", borderRadius:10,
                  cursor:locked?"not-allowed":"pointer", marginBottom:4, opacity:locked?.5:1,
                  background:isActive?`${DS.orange}12`:isDone?"#F0FDF4":"transparent",
                  border:`1px solid ${isActive?DS.orange:isDone?"#BBF7D0":"transparent"}`,
                  transition:"all .12s",
                }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, marginTop:1, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11,
                    background: locked?"#E5E7EB":isDone?DS.green:isActive?DS.orange:DS.border,
                    color: locked?DS.sub:isDone||isActive?"#fff":DS.sub }}>
                    {locked?"🔒":isDone?"✓":i+1}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:isActive||isDone?700:500, fontSize:12, color:isActive?DS.orange:isDone?"#00663B":DS.text, lineHeight:1.3 }}>{l.title}</div>
                    <div style={{ fontSize:10, color:DS.sub, marginTop:2 }}>⏱ {l.dur}{l.free&&<span style={{ color:DS.green, fontWeight:600 }}> · Miễn phí</span>}</div>
                  </div>
                </div>
              );
            })}
          </Card>

          {/* Course info */}
          <Card style={{ padding:"13px 15px" }}>
            <div style={{ fontWeight:700, fontSize:12, marginBottom:9, color:DS.sub }}>Thông tin khóa học</div>
            {[[course.emoji+" "+course.title,""],["👨‍🏫 Giảng viên",course.trainer],["⭐ Rating",course.rating+"/5"],["👥 Học viên",course.students.toLocaleString()],["⏱ Thời lượng",course.dur],["📊 Cấp độ",course.lvl]].map(([l,v])=>(
              v&&<div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${DS.border}`, fontSize:11 }}>
                <span style={{ color:DS.sub }}>{l}</span><span style={{ fontWeight:700 }}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   AI-POWERED COMPONENTS (Claude Integration)
═══════════════════════════════════════════════════════ */

/* ── AI Streaming text display ── */
function AIText({ text, loading, placeholder = "AI đang phân tích..." }) {
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", gap:8, color:DS.orange, fontSize:13 }}>
      <div style={{ display:"flex", gap:3 }}>
        {[0,1,2].map(i=>(
          <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:DS.orange,
            animation:`pulse 1.2s ${i*0.2}s infinite`, opacity:.7 }}/>
        ))}
      </div>
      <span>{placeholder}</span>

    </div>
  );
  if (!text) return null;
  return (
    <div style={{ fontSize:13, color:DS.text, lineHeight:1.75, whiteSpace:"pre-wrap",
      background:`${DS.orange}08`, borderRadius:10, padding:"11px 14px",
      border:`1px solid ${DS.orange}20`, borderLeft:`3px solid ${DS.orange}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:7 }}>
        <span style={{ fontSize:14 }}>🤖</span>
        <span style={{ fontWeight:700, fontSize:11, color:DS.orange, textTransform:"uppercase", letterSpacing:.5 }}>Claude AI</span>
      </div>
      {text}
    </div>
  );
}

/* ── Cover Letter Generator ── */
function CoverLetterModal({ job, user, apps, onClose, onApply }) {
  const matched = job.skills.filter(s => (user.skills||[]).map(w=>w.toLowerCase()).includes(s.toLowerCase()));
  const [cover, setCover]     = useState("");
  const [aiCover, setAiCover] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState("write"); // write | ai
  const already = apps.find(a=>a.jobId===job.id);
  const [applying, setApplying] = useState(false);

  const generate = async () => {
    setLoading(true); setTab("ai");
    try {
      const txt = await AI.coverLetter(user.name, job.title, job.company, user.skills||[], matched);
      setAiCover(txt); setCover(txt);
    } catch(e) { setAiCover("Lỗi kết nối Claude API. Vui lòng thử lại."); }
    setLoading(false);
  };

  const apply = () => {
    setApplying(true);
    setTimeout(() => { setApplying(false); onApply(job.id, tab==="ai"?aiCover:cover); }, 700);
  };

  return (
    <Modal title={`Ứng tuyển: ${job.title}`} onClose={onClose} width={540}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {/* Job summary */}
        <div style={{ background:DS.bg, borderRadius:12, padding:"11px 14px", display:"flex", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontWeight:700, fontSize:13 }}>{job.company} · {job.loc}</div>
            <div style={{ fontSize:12, color:DS.sub }}>{job.type} · {job.salary}/tháng</div>
          </div>
          <MatchRing score={calcMatch(user.skills||[], job.skills)} size={46}/>
        </div>

        {/* Tab switch */}
        <div style={{ display:"flex", background:DS.bg, borderRadius:10, padding:3, border:`1px solid ${DS.border}` }}>
          {[["write","✍️ Tự viết"],["ai","🤖 AI viết cho bạn"]].map(([id,l])=>(
            <button key={id} onClick={()=>setTab(id)} style={{ flex:1, padding:"7px 0", borderRadius:8, border:"none",
              fontFamily:"inherit", fontWeight:700, fontSize:12, cursor:"pointer",
              background:tab===id?DS.orange:"transparent", color:tab===id?"#fff":DS.sub }}>
              {l}
            </button>
          ))}
        </div>

        {tab==="write" ? (
          <Inp label="Thư ứng tuyển" value={cover} onChange={setCover} multi rows={5}
            placeholder="Giới thiệu lý do bạn phù hợp với vị trí này..."/>
        ) : (
          <div>
            {!aiCover && !loading && (
              <div style={{ textAlign:"center", padding:"20px 0" }}>
                <div style={{ fontSize:36, marginBottom:8 }}>✨</div>
                <div style={{ fontSize:13, color:DS.sub, marginBottom:14 }}>
                  Claude AI sẽ tạo thư ứng tuyển cá nhân hóa dựa trên hồ sơ và JD của bạn
                </div>
                <Btn onClick={generate}>🤖 Tạo thư với Claude AI</Btn>
              </div>
            )}
            <AIText text={aiCover} loading={loading} placeholder="Claude đang viết thư ứng tuyển..."/>
            {aiCover && !loading && (
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <Btn sm variant="outline" onClick={()=>{setAiCover(""); setCover("");}}>↺ Tạo lại</Btn>
                <Btn sm variant="ghost" onClick={()=>{setCover(aiCover);setTab("write");}}>✏️ Chỉnh sửa</Btn>
              </div>
            )}
          </div>
        )}

        <div style={{ display:"flex", gap:8 }}>
          {already
            ? <div style={{ flex:1, background:DS.greenL, borderRadius:10, padding:"10px", textAlign:"center", fontWeight:700, fontSize:13, color:DS.green }}>✓ Đã ứng tuyển</div>
            : <Btn full onClick={apply} loading={applying}>📤 Ứng tuyển ngay</Btn>
          }
          <Btn variant="outline" onClick={onClose}>Đóng</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ── AI Matching Explainer ── */
function MatchingExplainerPanel({ job, user, isOpen, onClose }) {
  const [explanation, setExplanation] = useState("");
  const [interviewQ, setInterviewQ]   = useState("");
  const [loading, setLoading]         = useState(false);
  const [loadingQ, setLoadingQ]       = useState(false);
  const [tab, setTab]                 = useState("explain");
  const score = calcMatch(user.skills||[], job.skills);
  const matched = job.skills.filter(s => (user.skills||[]).map(w=>w.toLowerCase()).includes(s.toLowerCase()));
  const missing  = job.skills.filter(s => !(user.skills||[]).map(w=>w.toLowerCase()).includes(s.toLowerCase()));

  useEffect(() => {
    if (!isOpen || explanation) return;
    setLoading(true);
    AI.explainMatch(user.skills||[], job.skills, job.title, score)
      .then(t=>setExplanation(t)).catch(()=>setExplanation("Không thể kết nối Claude API."))
      .finally(()=>setLoading(false));
  }, [isOpen]);

  const loadInterviewQ = async () => {
    if (interviewQ) { setTab("interview"); return; }
    setLoadingQ(true); setTab("interview");
    try { const t = await AI.interviewPrep(job.title, job.skills); setInterviewQ(t); }
    catch(e) { setInterviewQ("Lỗi kết nối."); }
    setLoadingQ(false);
  };

  if (!isOpen) return null;
  return (
    <div style={{ background:DS.card, borderRadius:14, border:`1px solid ${DS.orange}30`, overflow:"hidden", marginTop:12, boxShadow:`0 4px 24px ${DS.orange}15` }}>
      <div style={{ background:`linear-gradient(135deg,${DS.dark},#1E2F4A)`, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>🤖</span>
          <span style={{ color:"#fff", fontWeight:700, fontSize:13 }}>Phân tích AI – {job.title}</span>
        </div>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,.1)", border:"none", cursor:"pointer", color:"#fff", width:24, height:24, borderRadius:"50%", fontSize:12 }}>×</button>
      </div>
      <div style={{ padding:14 }}>
        <div style={{ display:"flex", gap:4, marginBottom:12 }}>
          {[["explain","🎯 Phân tích"],["interview","📝 Câu hỏi PV"]].map(([id,l])=>(
            <button key={id} onClick={()=>id==="interview"?loadInterviewQ():setTab(id)} style={{ padding:"5px 12px", borderRadius:8, border:"none", fontFamily:"inherit",
              fontWeight:700, fontSize:11, cursor:"pointer",
              background:tab===id?DS.orange:DS.bg, color:tab===id?"#fff":DS.sub }}>
              {l}
            </button>
          ))}
        </div>
        {tab==="explain" && <AIText text={explanation} loading={loading} placeholder="Claude đang phân tích sự phù hợp..."/>}
        {tab==="interview" && <AIText text={interviewQ} loading={loadingQ} placeholder="Claude đang tạo câu hỏi phỏng vấn..."/>}
      </div>
    </div>
  );
}

/* ── AI Chat Assistant (floating) ── */
function AIChatAssistant({ user }) {
  const [open, setOpen]     = useState(false);
  const [msgs, setMsgs]     = useState([
    { role:"assistant", text:`Xin chào ${user.name}! 👋 Tôi là AI trợ lý nghề nghiệp của WorkLearn. Tôi có thể giúp bạn phân tích hồ sơ, gợi ý khóa học, hoặc chuẩn bị cho phỏng vấn. Bạn cần hỏi gì?` }
  ]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMsgs(m=>[...m, { role:"user", text:userMsg }]);
    setLoading(true);
    try {
      const reply = await AI.chat(userMsg, user);
      setMsgs(m=>[...m, { role:"assistant", text:reply }]);
    } catch(e) {
      setMsgs(m=>[...m, { role:"assistant", text:"Xin lỗi, không thể kết nối Claude API lúc này." }]);
    }
    setLoading(false);
  };

  const QUICK = ["Tôi nên học kỹ năng gì tiếp theo?","Hồ sơ của tôi còn thiếu gì?","Cách viết CV Data Analyst?","Lộ trình từ Kế toán sang Data?"];

  return (
    <>
      {/* Floating bubble */}
      <div onClick={()=>setOpen(o=>!o)} style={{ position:"fixed", bottom:24, right:24, zIndex:1000,
        width:52, height:52, borderRadius:"50%", background:`linear-gradient(135deg,${DS.orange},#FBBF24)`,
        display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
        boxShadow:`0 4px 20px ${DS.orange}50`, fontSize:22, transition:"transform .15s" }}
        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"}
        onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
        {open ? "×" : "🤖"}
      </div>

      {/* Chat panel */}
      {open && (
        <div style={{ position:"fixed", bottom:88, right:24, zIndex:999, width:340, height:480,
          background:DS.card, borderRadius:18, boxShadow:"0 20px 60px rgba(12,18,34,.25)",
          border:`1px solid ${DS.border}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Header */}
          <div style={{ background:gDark, padding:"13px 16px", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:`linear-gradient(135deg,${DS.orange},#FBBF24)`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🤖</div>
            <div>
              <div style={{ color:"#fff", fontWeight:800, fontSize:13 }}>WorkLearn AI</div>
              <div style={{ color:DS.green, fontSize:10, display:"flex", alignItems:"center", gap:4 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:DS.green }}/>
                Claude {CLAUDE_MODEL.includes("sonnet")?"Sonnet":"AI"}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
            {msgs.map((m,i) => (
              <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                <div style={{ maxWidth:"82%", padding:"9px 12px", borderRadius:12, fontSize:12, lineHeight:1.6,
                  background: m.role==="user" ? `linear-gradient(135deg,${DS.orange},#FBBF24)` : DS.bg,
                  color: m.role==="user" ? "#fff" : DS.text,
                  borderBottomRightRadius: m.role==="user" ? 3 : 12,
                  borderBottomLeftRadius:  m.role==="user" ? 12 : 3,
                  boxShadow:"0 1px 4px rgba(0,0,0,.08)" }}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display:"flex", justifyContent:"flex-start" }}>
                <div style={{ background:DS.bg, borderRadius:12, padding:"9px 14px", display:"flex", gap:4 }}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:DS.orange,
                      animation:`bounce 1s ${i*0.15}s infinite` }}/>
                  ))}

                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Quick prompts */}
          {msgs.length <= 1 && (
            <div style={{ padding:"0 12px 8px", display:"flex", gap:5, flexWrap:"wrap" }}>
              {QUICK.map(q=>(
                <button key={q} onClick={()=>{setInput(q); setTimeout(()=>send(),50);}}
                  style={{ fontSize:10, background:DS.orangeSoft, color:DS.orange, border:`1px solid ${DS.orange}30`,
                    borderRadius:20, padding:"3px 9px", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding:"10px 12px", borderTop:`1px solid ${DS.border}`, display:"flex", gap:8 }}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
              placeholder="Hỏi về nghề nghiệp, kỹ năng..." disabled={loading}
              style={{ flex:1, padding:"9px 12px", borderRadius:10, fontSize:12, border:`1.5px solid ${DS.border}`,
                outline:"none", fontFamily:"inherit", background:DS.card }}
              onFocus={e=>e.target.style.borderColor=DS.orange}
              onBlur={e=>e.target.style.borderColor=DS.border}/>
            <button onClick={send} disabled={!input.trim()||loading} style={{ width:36, height:36, borderRadius:10,
              background: input.trim()&&!loading ? `linear-gradient(135deg,${DS.orange},#FBBF24)` : DS.border,
              border:"none", cursor:input.trim()&&!loading?"pointer":"not-allowed", fontSize:15,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── AI Profile Analyzer ── */
function AIProfileAnalyzer({ user, isOpen, onClose }) {
  const [analysis, setAnalysis] = useState("");
  const [learningPath, setLP]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [loadingLP, setLoadingLP] = useState(false);
  const [targetJob, setTargetJob] = useState("Data Analyst");
  const PROFILE_EXT_DATA = typeof PROFILE_EXT !== "undefined" ? PROFILE_EXT : { experiences:[] };

  useEffect(() => {
    if (!isOpen || analysis) return;
    setLoading(true);
    AI.profileAnalysis(user.name, user.skills||[], PROFILE_EXT_DATA.experiences, user.headline)
      .then(t=>setAnalysis(t)).catch(()=>setAnalysis("Không thể kết nối Claude API."))
      .finally(()=>setLoading(false));
  }, [isOpen]);

  const genLearningPath = async () => {
    setLoadingLP(true);
    const needed = ["Python","SQL","Tableau","Power BI","Machine Learning"].filter(s=>!(user.skills||[]).includes(s)).slice(0,4);
    try { const t = await AI.learningPath(targetJob, user.skills||[], needed); setLP(t); }
    catch(e) { setLP("Lỗi kết nối."); }
    setLoadingLP(false);
  };

  if (!isOpen) return null;
  return (
    <Modal title="✨ AI Phân tích hồ sơ" onClose={onClose} width={500}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ background:DS.bg, borderRadius:10, padding:"10px 14px", fontSize:12, color:DS.sub }}>
          Claude AI đang đọc hồ sơ của <b>{user.name}</b> và đưa ra gợi ý cá nhân hóa
        </div>
        <AIText text={analysis} loading={loading} placeholder="Claude đang phân tích hồ sơ..."/>

        <div style={{ borderTop:`1px solid ${DS.border}`, paddingTop:14 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:9 }}>🗺 Lộ trình học tập cá nhân hóa</div>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <Inp label="" value={targetJob} onChange={setTargetJob} placeholder="Mục tiêu nghề nghiệp..."/>
            <div style={{ flexShrink:0, marginTop:0 }}>
              <Btn sm onClick={genLearningPath} loading={loadingLP}>Tạo lộ trình</Btn>
            </div>
          </div>
          <AIText text={learningPath} loading={loadingLP} placeholder="Claude đang tạo lộ trình học tập..."/>
        </div>
        <Btn full variant="outline" onClick={onClose}>Đóng</Btn>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════ */
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [role, setRole]     = useState("worker");
  const [user, setUser]     = useState(USERS.worker);
  const [page, setPage]     = useState("dashboard");
  const [jobs, setJobs]     = useState(JOBS);
  const [courses, setCourses] = useState(COURSES);
  const [apps, setApps]     = useState(INIT_APPS);
  const [enrolls, setEnrolls] = useState(INIT_ENROLL);
  const [ledger, setLedger] = useState(INIT_LEDGER);
  const [credits, setCredits] = useState({ worker:350, employer:1200, trainer:2840, admin:0 });
  const [notifs, setNotifs] = useState(INIT_NOTIFS);
  const [toast, setToast]   = useState(null);
  const [jobModal, setJobModal]       = useState(null);
  const [courseModal, setCourseModal] = useState(null);
  const [playerModal, setPlayerModal] = useState(null);
  const [topupModal, setTopupModal]   = useState(false);
  // New full-page detail states
  const [detailJob, setDetailJob]         = useState(null);
  const [learningCourse, setLearningCourse] = useState(null);
  // AI modal states
  const [aiProfileOpen, setAiProfileOpen] = useState(false);
  const [coverLetterJob, setCoverLetterJob] = useState(null); // AI cover letter modal

  const showToast = useCallback((msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); }, []);
  const cr  = credits[role];
  const setCr = v => setCredits(c=>({...c,[role]:typeof v==="function"?v(c[role]):v}));

  const switchRole = r => { setRole(r); setUser(USERS[r]); setPage("dashboard"); };
  const handleLogin = (r, opts={}) => { switchRole(r); setAuthed(true); if(opts.reward){ setCr(c=>c+50); showToast("🎉 +50 credit thưởng hoàn thiện hồ sơ!"); } };

  const applyJob = (jobId, cover) => {
    if (apps.find(a=>a.jobId===jobId)) { showToast("Đã ứng tuyển vị trí này","error"); return; }
    const job = jobs.find(j=>j.id===jobId);
    const score = calcMatch(user.skills||[], job.skills);
    setApps(a=>[{ id:"a"+Date.now(), jobId, status:"NEW", date:new Date().toLocaleDateString("vi"), score },...a]);
    setJobs(js=>js.map(j=>j.id===jobId?{...j,apps:j.apps+1}:j));
    setNotifs(ns=>[{ id:"n"+Date.now(), type:"job", title:"Ứng tuyển thành công!", body:`Hồ sơ ${job.title} đã gửi`, time:"Vừa xong", read:false },...ns]);
    showToast("✅ Hồ sơ đã gửi!"); setJobModal(null);
  };

  const enrollCourse = cId => {
    const c = courses.find(x=>x.id===cId);
    if (enrolls.find(e=>e.cId===cId)) { showToast("Đã đăng ký khóa này","error"); return; }
    if (cr < c.price) { showToast("Không đủ credit","error"); return; }
    setCr(x=>x-c.price);
    setEnrolls(e=>[...e,{ id:"en"+Date.now(), cId, pct:0, cert:false, done:[] }]);
    setLedger(l=>[{ id:"tx"+Date.now(), type:"SPEND", amt:-c.price, after:cr-c.price, desc:`Đăng ký: ${c.title}`, date:new Date().toLocaleDateString("vi") },...l]);
    setNotifs(ns=>[{ id:"n"+Date.now(), type:"course", title:"Đăng ký thành công!", body:`Đăng ký khóa ${c.title}`, time:"Vừa xong", read:false },...ns]);
    showToast(`✅ Đăng ký thành công! Trừ ${c.price}cr`); setCourseModal(null);
  };

  const topup = amount => {
    setCr(c=>c+amount);
    setLedger(l=>[{ id:"tx"+Date.now(), type:"TOPUP", amt:amount, after:cr+amount, desc:"Nạp credit qua Foxpay (FPAY)", date:new Date().toLocaleDateString("vi") },...l]);
    setNotifs(ns=>[{ id:"n"+Date.now(), type:"credit", title:"Nạp thành công", body:`+${amount}cr từ Foxpay vào ví`, time:"Vừa xong", read:false },...ns]);
    showToast(`✅ Nạp ${amount}cr từ Foxpay thành công!`); setTopupModal(false);
  };

  const postJob = data => {
    setCr(c=>c-50);
    setJobs(j=>[{ id:"j"+Date.now(),...data, apps:0, posted:"Vừa đăng", eid:"e1", status:"ACTIVE", boosted:false, logo:"TC", desc:data.desc },...j]);
    setLedger(l=>[{ id:"tx"+Date.now(), type:"SPEND", amt:-50, after:cr-50, desc:`Đăng tin: ${data.title}`, date:new Date().toLocaleDateString("vi") },...l]);
    showToast("✅ Đăng tin thành công!");
  };

  const updateStatus = (appId, status) => {
    setApps(a=>a.map(x=>x.id===appId?{...x,status}:x));
    if (status==="HIRED") { showToast("🎉 Đã tuyển! NLĐ nhận 200cr thưởng"); }
    else showToast("Đã cập nhật trạng thái");
  };

  const updateProgress = (cId, pct, done) => {
    setEnrolls(es=>es.map(e=>e.cId===cId?{...e,pct,done}:e));
    if (pct>=80) showToast("🎓 Đủ điều kiện nhận chứng chỉ!");
  };

  const claimCert = cId => {
    const c = courses.find(x=>x.id===cId);
    setEnrolls(es=>es.map(e=>e.cId===cId?{...e,cert:true}:e));
    setCr(x=>x+50);
    setLedger(l=>[{ id:"tx"+Date.now(), type:"REWARD", amt:50, after:cr+50, desc:`Thưởng hoàn thành: ${c?.title}`, date:new Date().toLocaleDateString("vi") },...l]);
    setNotifs(ns=>[{ id:"n"+Date.now(), type:"course", title:"🎓 Chứng chỉ sẵn sàng!", body:`${c?.title} + 50cr thưởng`, time:"Vừa xong", read:false },...ns]);
    showToast("🎓 Chứng chỉ cấp! +50cr"); setPlayerModal(null);
  };

  // Apply job via full-page detail
  const applyJobDetail = (jobId, cover) => {
    if (apps.find(a=>a.jobId===jobId)) { showToast("Đã ứng tuyển vị trí này","error"); return; }
    const job = jobs.find(j=>j.id===jobId);
    const score = calcMatch(user.skills||[], job.skills);
    setApps(a=>[{ id:"a"+Date.now(), jobId, status:"NEW", date:new Date().toLocaleDateString("vi"), score },...a]);
    setJobs(js=>js.map(j=>j.id===jobId?{...j,apps:j.apps+1}:j));
    showToast("✅ Hồ sơ đã gửi!");
    // Stay on detail page so user can see confirmation
  };

  // Inject global keyframes once
  useEffect(() => {
    const id = "wl-keyframes";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = `
        @keyframes pulse{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.3);opacity:1}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes wlspin{to{transform:rotate(360deg)}}
      `;
      document.head.appendChild(s);
    }
  }, []);

  if (!authed) return <div style={{ height:"100vh", overflow:"auto" }}><AuthScreen onLogin={handleLogin}/></div>;

  const myJobs = jobs.filter(j=>j.eid==="e1");

  // Full-page overlays take priority
  if (detailJob) {
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:DS.bg, fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
        {/* Minimal topbar */}
        <div style={{ background:DS.dark, height:52, padding:"0 18px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ width:210 }}/>
          <span style={{ color:"rgba(255,255,255,.7)", fontWeight:700, fontSize:13 }}>Chi tiết tin tuyển dụng</span>
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ background:`${DS.orange}30`, borderRadius:8, padding:"3px 10px", color:"#FFD700", fontWeight:800, fontSize:12 }}>⚡ {cr}cr</div>
            <NotifBell notifs={notifs} setNotifs={setNotifs}/>
          </div>
        </div>
        <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
          <Sidebar role={role} page={page} setPage={p=>{ setDetailJob(null); setPage(p); }}/>
          <div style={{ flex:1, padding:"20px 28px", overflowY:"auto" }}>
            <JobDetailPage job={detailJob} user={user} courses={courses} apps={apps}
              onBack={()=>setDetailJob(null)} onApply={applyJobDetail}/>
          </div>
        </div>
        {topupModal && <TopupModal credit={cr} onClose={()=>setTopupModal(false)} onTopup={topup}/>}
        {toast && <div style={{ position:"fixed", bottom:20, right:20, zIndex:2000, background:toast.type==="error"?DS.redL:DS.greenL, border:`1px solid ${toast.type==="error"?DS.red:DS.green}`, color:toast.type==="error"?DS.red:"#00663B", padding:"10px 20px", borderRadius:12, fontWeight:700, fontSize:13, boxShadow:"0 6px 24px rgba(12,18,34,.15)" }}>{toast.msg}</div>}
      </div>
    );
  }

  if (learningCourse) {
    const enr = enrolls.find(e=>e.cId===learningCourse.id);
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:DS.bg, fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
        <div style={{ background:DS.dark, height:52, padding:"0 18px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ width:210 }}/>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ fontSize:18 }}>{learningCourse.emoji}</span>
            <span style={{ color:"rgba(255,255,255,.8)", fontWeight:700, fontSize:13 }}>{learningCourse.title}</span>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ background:`${DS.orange}30`, borderRadius:8, padding:"3px 10px", color:"#FFD700", fontWeight:800, fontSize:12 }}>⚡ {cr}cr</div>
            <NotifBell notifs={notifs} setNotifs={setNotifs}/>
          </div>
        </div>
        <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
          <Sidebar role={role} page={page} setPage={p=>{ setLearningCourse(null); setPage(p); }}/>
          <div style={{ flex:1, padding:"20px 24px", overflowY:"auto", display:"flex", flexDirection:"column" }}>
            <CourseLearningPage course={learningCourse} enroll={enr}
              onBack={()=>setLearningCourse(null)}
              onProgress={updateProgress} onClaim={cId=>{ claimCert(cId); setLearningCourse(null); }}/>
          </div>
        </div>
        {toast && <div style={{ position:"fixed", bottom:20, right:20, zIndex:2000, background:toast.type==="error"?DS.redL:DS.greenL, border:`1px solid ${toast.type==="error"?DS.red:DS.green}`, color:toast.type==="error"?DS.red:"#00663B", padding:"10px 20px", borderRadius:12, fontWeight:700, fontSize:13, boxShadow:"0 6px 24px rgba(12,18,34,.15)" }}>{toast.msg}</div>}
      </div>
    );
  }

  const renderPage = () => {
    if (role==="worker") switch(page) {
      case "dashboard":     return <WorkerDashboard user={user} jobs={jobs} courses={courses} apps={apps} enrolls={enrolls} credit={cr} setPage={setPage} setJobModal={j=>setDetailJob(j)}/>;
      case "profile":       return <WorkerProfile user={user} setUser={setUser} jobs={jobs} courses={courses} enrolls={enrolls} apps={apps} showToast={showToast} onViewJob={j=>setDetailJob(j)} onViewCourse={c=>setCourseModal(c)}/>;
      case "jobs":          return <JobsPage user={user} jobs={jobs} apps={apps} setJobModal={j=>setDetailJob(j)}/>;
      case "courses":       return <CoursesPage courses={courses} enrolls={enrolls} credit={cr} setModalCourse={setCourseModal} setModalPlayer={c=>setLearningCourse(c)}/>;
      case "applications":  return <MyApplications apps={apps} jobs={jobs}/>;
      case "wallet":        return <WalletPage credit={cr} ledger={ledger} onTopup={()=>setTopupModal(true)}/>;
    }
    if (role==="employer") switch(page) {
      case "dashboard":   return <EmployerDashboard user={user} jobs={myJobs} apps={apps} credit={cr} setPage={setPage}/>;
      case "post-job":    return <PostJobPage credit={cr} postJob={postJob} showToast={showToast} setPage={setPage}/>;
      case "my-jobs":     return <MyJobsPage jobs={myJobs} apps={apps} credit={cr} setCredit={setCr} setJobs={setJobs} setLedger={setLedger} showToast={showToast}/>;
      case "pipeline":    return <PipelinePage jobs={myJobs} apps={apps} updateStatus={updateStatus} setPage={setPage}/>;
      case "candidates":  return <CandidateSearch/>;
      case "wallet":      return <WalletPage credit={cr} ledger={ledger} onTopup={()=>setTopupModal(true)}/>;
    }
    if (role==="trainer") switch(page) {
      case "dashboard":      return <TrainerDashboard user={user} courses={courses} credit={cr} setPage={setPage}/>;
      case "my-courses":     return <TrainerCourses courses={courses}/>;
      case "create-course":  return <CreateCoursePage showToast={showToast} setPage={setPage}/>;
      case "analytics":      return <TrainerAnalytics courses={courses}/>;
      case "wallet":         return <WalletPage credit={cr} ledger={ledger} onTopup={()=>setTopupModal(true)}/>;
    }
    if (role==="admin") switch(page) {
      case "dashboard":        return <AdminDashboard courses={courses} setPage={setPage}/>;
      case "course-approval":  return <CourseApproval courses={courses} setCourses={setCourses} showToast={showToast}/>;
      case "users":            return <AdminUsers/>;
      case "credits":          return <AdminCredits/>;
      case "analytics":        return <AdminAnalytics/>;
    }
    return null;
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:DS.bg, fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      {/* TOP BAR — no duplicate logo, sidebar owns logo */}
      <div style={{ background:DS.dark, height:52, padding:"0 18px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 2px 16px rgba(12,18,34,.4)" }}>
        {/* Spacer matching sidebar width */}
        <div style={{ width:210, flexShrink:0 }}/>
        {/* Role switcher centered */}
        <div style={{ display:"flex", gap:2, background:"rgba(255,255,255,.08)", borderRadius:11, padding:3 }}>
          {[["worker","👤 NLĐ"],["employer","🏢 NTD"],["trainer","🎓 ĐTĐT"],["admin","🔧 Admin"]].map(([r,l])=>(
            <button key={r} onClick={()=>switchRole(r)} style={{ padding:"5px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit",
              background: role===r ? DS.orange : "transparent", color: role===r ? "#fff" : "rgba(255,255,255,.45)", transition:"all .12s" }}>
              {l}
            </button>
          ))}
        </div>
        {/* Right controls */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ background:`${DS.orange}30`, borderRadius:8, padding:"3px 10px", color:"#FFD700", fontWeight:800, fontSize:12 }}>⚡ {cr}cr</div>
          <NotifBell notifs={notifs} setNotifs={setNotifs}/>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:gCard, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:11 }}>{user.avatar}</div>
            <span style={{ color:"#fff", fontSize:12, fontWeight:600 }}>{user.name.split(" ").pop()}</span>
          </div>
          <button onClick={()=>setAuthed(false)} style={{ background:"rgba(255,255,255,.08)", border:"none", color:"rgba(255,255,255,.45)", cursor:"pointer", fontSize:11, padding:"5px 10px", borderRadius:8, fontFamily:"inherit" }}>Thoát</button>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        <Sidebar role={role} page={page} setPage={setPage}/>
        <div style={{ flex:1, padding:"20px 24px", overflowY:"auto" }}>
          {renderPage()}
        </div>
      </div>

      {/* Modals (keep for course enroll confirm) */}
      {courseModal && <CourseDetailModal course={courseModal} enrolls={enrolls} credit={cr} onClose={()=>setCourseModal(null)} onEnroll={enrollCourse}/>}
      {topupModal  && <TopupModal credit={cr} onClose={()=>setTopupModal(false)} onTopup={topup}/>}

      {/* AI Chat Assistant */}
      {role==="worker" && authed && <AIChatAssistant user={user}/>}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, right:90, zIndex:2000, background:toast.type==="error"?DS.redL:DS.greenL, border:`1px solid ${toast.type==="error"?DS.red:DS.green}`, color:toast.type==="error"?DS.red:"#00663B", padding:"10px 20px", borderRadius:12, fontWeight:700, fontSize:13, boxShadow:"0 6px 24px rgba(12,18,34,.15)", maxWidth:360 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
