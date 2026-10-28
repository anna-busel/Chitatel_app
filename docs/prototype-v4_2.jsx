import { useState } from "react";

// ─── ICONS (SVG) ───
const I = {
  home: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
  search: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  book: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  user: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  bell: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  back: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C73E28" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>,
  pen: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>,
  plus: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>,
  play: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill={c} stroke="none"><polygon points="5,3 19,12 5,21"/></svg>,
  pause: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill={c} stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  lock: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c||"#A09080"} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  check: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c||"#2D7F5E"} strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>,
  chev: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>,
  send: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="#C73E28" stroke="none"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>,
  star: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFB800" stroke="none"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
  flag: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  shield: (c) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c||"#C73E28"} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  sparkle: (c) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c||"#7B61FF"} strokeWidth="2"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4l-6.4 4.8L8 14 2 9.2h7.6z"/></svg>,
  notebook: (c) => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c||"#C73E28"} strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6"/></svg>,
  wifi: (c) => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c||"#C73E28"} strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
};

const Card = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)", cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>
);
const Back = ({ onBack, label }) => (
  <div onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 20px 12px", cursor: "pointer" }}>{I.back()}<span style={{ fontSize: 14, color: "#C73E28", fontWeight: 500 }}>{label || "Назад"}</span></div>
);
const SH = ({ title, action, onAction }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <span style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A" }}>{title}</span>
    {action && <span onClick={onAction} style={{ fontSize: 13, color: "#C73E28", fontWeight: 600, cursor: "pointer" }}>{action}</span>}
  </div>
);
const Btn = ({ children, style, onClick, outline, danger }) => (
  <div onClick={onClick} style={{ background: danger ? "#DC3545" : outline ? "transparent" : "#C73E28", border: outline ? "1.5px solid #C73E28" : "none", borderRadius: 14, padding: "13px 0", textAlign: "center", cursor: "pointer", boxShadow: outline ? "none" : danger ? "0 4px 16px rgba(220,53,69,0.15)" : "0 4px 16px rgba(199,62,40,0.2)", ...style }}>
    <span style={{ color: outline ? "#C73E28" : "#fff", fontWeight: 700, fontSize: 15 }}>{children}</span>
  </div>
);
const Empty = ({ icon, title, sub, action, onAction }) => (
  <div style={{ textAlign: "center", padding: "40px 30px" }}>
    <div style={{ marginBottom: 16, opacity: 0.7 }}>{icon}</div>
    <div style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A", marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 14, color: "#A09080", lineHeight: 1.5, marginBottom: action ? 18 : 0 }}>{sub}</div>
    {action && <Btn onClick={onAction} style={{ maxWidth: 220, margin: "0 auto" }}>{action}</Btn>}
  </div>
);
const Toggle = ({ on, onToggle }) => (
  <div onClick={onToggle} style={{ width: 44, height: 26, borderRadius: 13, background: on ? "#2D7F5E" : "#DDD", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
    <div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", position: "absolute", top: 2, left: on ? 20 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}/>
  </div>
);
const Input = ({ placeholder, type }) => (
  <div style={{ background: "#F0EDE8", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
    <span style={{ color: "#A09080", fontSize: 14 }}>{placeholder}</span>
  </div>
);

const serif = { fontFamily: "'Playfair Display', Georgia, serif" };
const FAB_SCREENS = ["home","catalog","club","profile","diary","book-free","book-paid"];
const TAB_SCREENS = ["home","catalog","club","profile"];

export default function App() {
  const [screen, setScreen] = useState("onboarding");
  const [isNew, setIsNew] = useState(true);
  const [clubTab, setClubTab] = useState("audio");
  const [playing, setPlaying] = useState(false);
  const [playerExp, setPlayerExp] = useState(false);
  const [quoteSheet, setQuoteSheet] = useState(false);
  const [onbStep, setOnbStep] = useState(0);
  const [aiConsent, setAiConsent] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState("Все");
  const [showReport, setShowReport] = useState(false);
  const [chatMenu, setChatMenu] = useState(null);
  const [surveyStep, setSurveyStep] = useState(0);
  const [surveyAnswers, setSurveyAnswers] = useState({});
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [showSleepPicker, setShowSleepPicker] = useState(false);
  const [speed, setSpeed] = useState("1.0");
  const [gdprChecked, setGdprChecked] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const nav = (s) => { setScreen(s); setPlayerExp(false); setQuoteSheet(false); setChatMenu(null); setShowReport(false); setShowSpeedPicker(false); setShowSleepPicker(false); setSearchOpen(false); };
  const activeTab = TAB_SCREENS.includes(screen) ? screen : null;
  const showFab = FAB_SCREENS.includes(screen) && !playerExp && !quoteSheet && !showReport && !showAiModal && !searchOpen;
  const showMini = playing && !playerExp && !quoteSheet && !searchOpen;
  const showTabs = activeTab && !playerExp && !quoteSheet && !showAiModal && !showReport && !searchOpen;

  // ══════════════════════════════════════
  // ONBOARDING FLOW
  // ══════════════════════════════════════
  if (screen === "onboarding") {
    const slides = [
      { title: "Книжный клуб\nот психолога", sub: "Аудиоразборы книг с глубиной психоанализа. Больше чем пересказ — путь к пониманию себя.", bg: "linear-gradient(145deg, #1A0E08, #3A2018)" },
      { title: "Слушайте.\nДумайте.\nМеняйтесь.", sub: "4 аудиоразбора в месяц, чат с участницами, вопросы Анне, ИИ-анализ ваших цитат.", bg: "linear-gradient(145deg, #2C1810, #4A2820)" },
      { title: "100+ отзывов.\nВсегда больше,\nчем ожидаете.", sub: "Начните с бесплатных разборов — «Маленький принц», «Три сестры», «Алхимик».", bg: "linear-gradient(145deg, #3A1810, #5A2820)" },
    ];
    if (onbStep < 3) return (
      <div style={{ width: 375, height: 812, margin: "0 auto", background: slides[onbStep].bg, borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", padding: "0 28px", overflow: "hidden", position: "relative" }}>
        <div style={{ height: 54 }}/>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontSize: 15, color: "#C73E28", fontWeight: 700, letterSpacing: 4, marginBottom: 16, ...serif }}>ЧИТАТЕЛЬ</span>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#FAFAF7", lineHeight: 1.2, marginBottom: 16, whiteSpace: "pre-line", ...serif }}>{slides[onbStep].title}</div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{slides[onbStep].sub}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: i===onbStep?24:8, height: 8, borderRadius: 4, background: i===onbStep?"#C73E28":"rgba(255,255,255,0.2)", transition: "all 0.3s" }}/>)}
        </div>
        <div onClick={() => setOnbStep(onbStep+1)} style={{ background: "#C73E28", borderRadius: 14, padding: "15px 0", textAlign: "center", cursor: "pointer", marginBottom: 40 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{onbStep === 2 ? "Начать" : "Далее"}</span>
        </div>
      </div>
    );
    // Auth screen
    return (
      <div style={{ width: 375, height: 812, margin: "0 auto", background: "#FAFAF7", borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", padding: "0 28px", overflow: "hidden" }}>
        <div style={{ height: 54 }}/>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: "#1A1A1A", letterSpacing: 5, ...serif }}>ЧИТАТЕЛЬ</span>
            <div style={{ fontSize: 14, color: "#A09080", marginTop: 8 }}>Войдите чтобы начать</div>
          </div>
          {[
            { bg: "#000", color: "#fff", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.11 4.45-3.74 4.25z"/></svg>, label: "Sign in with Apple", action: () => gdprChecked && nav("survey") },
            { bg: "#fff", color: "#1A1A1A", border: true, icon: <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>, label: "Google", action: () => gdprChecked && nav("survey") },
            { bg: "#F5F3EF", color: "#1A1A1A", label: "Email и пароль", action: () => gdprChecked && nav("email-register") },
          ].map((b, i) => (
            <div key={i} onClick={b.action} style={{ background: b.bg, borderRadius: 14, padding: "14px 0", textAlign: "center", cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: gdprChecked ? 1 : 0.4, border: b.border ? "1px solid #E0E0E0" : "none" }}>
              {b.icon}<span style={{ color: b.color, fontWeight: 600, fontSize: 15 }}>{b.label}</span>
            </div>
          ))}
          <div onClick={() => nav("forgot-password")} style={{ textAlign: "center", marginTop: 8, cursor: "pointer" }}><span style={{ fontSize: 13, color: "#C73E28" }}>Забыли пароль?</span></div>
          <div onClick={() => setGdprChecked(!gdprChecked)} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 20, cursor: "pointer" }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${gdprChecked?"#C73E28":"#CCC"}`, background: gdprChecked?"#C73E28":"#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              {gdprChecked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
            </div>
            <span style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>Я согласна на обработку персональных данных и принимаю <span style={{ color: "#C73E28" }}>Условия</span> и <span style={{ color: "#C73E28" }}>Политику конфиденциальности</span></span>
          </div>
        </div>
        <div style={{ height: 40 }}/>
      </div>
    );
  }

  // ── EMAIL REGISTER ──
  if (screen === "email-register") return (
    <div style={{ width: 375, height: 812, margin: "0 auto", background: "#FAFAF7", borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden", padding: "0 28px" }}>
      <div style={{ height: 54 }}/>
      <div onClick={() => { setOnbStep(3); nav("onboarding"); }} style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 16, cursor: "pointer" }}>{I.back()}<span style={{ fontSize: 14, color: "#C73E28" }}>Назад</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", marginBottom: 4, ...serif }}>Регистрация</div>
      <div style={{ fontSize: 13, color: "#A09080", marginBottom: 24 }}>Создайте аккаунт по email</div>
      <Input placeholder="Имя" /><Input placeholder="Email" /><Input placeholder="Пароль" type="password" /><Input placeholder="Повторите пароль" type="password" />
      <div style={{ fontSize: 11, color: "#A09080", marginBottom: 16 }}>Пароль минимум 8 символов, буквы и цифры</div>
      <Btn onClick={() => nav("survey")}>Создать аккаунт</Btn>
      <div style={{ textAlign: "center", marginTop: 16 }}><span style={{ fontSize: 13, color: "#A09080" }}>Уже есть аккаунт? </span><span onClick={() => { setOnbStep(3); nav("onboarding"); }} style={{ fontSize: 13, color: "#C73E28", cursor: "pointer" }}>Войти</span></div>
    </div>
  );

  // ── FORGOT PASSWORD ──
  if (screen === "forgot-password") return (
    <div style={{ width: 375, height: 812, margin: "0 auto", background: "#FAFAF7", borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden", padding: "0 28px" }}>
      <div style={{ height: 54 }}/>
      <div onClick={() => { setOnbStep(3); nav("onboarding"); }} style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 16, cursor: "pointer" }}>{I.back()}<span style={{ fontSize: 14, color: "#C73E28" }}>Назад</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", marginBottom: 8, ...serif }}>Восстановление пароля</div>
      <div style={{ fontSize: 14, color: "#A09080", lineHeight: 1.6, marginBottom: 24 }}>Введите email, указанный при регистрации. Мы отправим ссылку для сброса пароля.</div>
      <Input placeholder="Email" />
      <Btn onClick={() => { setOnbStep(3); nav("onboarding"); }}>Отправить ссылку</Btn>
      <div style={{ textAlign: "center", marginTop: 16 }}><span style={{ fontSize: 12, color: "#A09080" }}>Письмо может занять до 5 минут. Проверьте «Спам».</span></div>
    </div>
  );

  // ── SURVEY ──
  if (screen === "survey") {
    const questions = [
      { q: "Что вас привело в книжный клуб?", sub: "Выберите один вариант", opts: [{i:"🌱",t:"Саморазвитие"},{i:"💕",t:"Отношения"},{i:"📚",t:"Любовь к литературе"},{i:"👯",t:"Подруга посоветовала"}] },
      { q: "Сколько книг вы читаете в месяц?", sub: "Это поможет подобрать темп", opts: [{i:"📖",t:"0–1 книгу"},{i:"📚",t:"2–3 книги"},{i:"📚",t:"4 и больше"}] },
      { q: "Что вам интереснее?", opts: [{i:"🏛️",t:"Классическая литература"},{i:"🧠",t:"Психологическая литература"},{i:"✨",t:"И то, и другое"}] },
      { q: "Что вы хотите изменить?", sub: "Выберите самое важное", opts: [{i:"🪞",t:"Понять себя глубже"},{i:"💬",t:"Научиться диалогу"},{i:"📵",t:"Меньше в телефоне"},{i:"💪",t:"Больше дисциплины"}] },
      { q: "Как предпочитаете учиться?", opts: [{i:"🎧",t:"Слушать аудио"},{i:"📝",t:"Читать и записывать"},{i:"💬",t:"Обсуждать с другими"}] },
      { q: "Когда удобнее слушать?", sub: "Для уведомлений в нужное время", opts: [{i:"🌅",t:"Утром (7–10)"},{i:"☀️",t:"Днём (12–15)"},{i:"🌙",t:"Вечером (19–22)"}] },
      { q: "Слушали разборы Анны раньше?", opts: [{i:"✅",t:"Да, в Instagram/YouTube"},{i:"🆕",t:"Нет, я новенькая"},{i:"🔄",t:"Была в Telegram-боте"}] },
    ];
    const cur = questions[surveyStep];
    return (
      <div style={{ width: 375, height: 812, margin: "0 auto", background: "#FAFAF7", borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: 54 }}/>
        <div style={{ padding: "0 28px 8px", display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: "#A09080" }}>Персонализация</span><span style={{ fontSize: 13, color: "#A09080" }}>{surveyStep+1}/7</span></div>
        <div style={{ height: 3, background: "#F0EDE8", margin: "0 28px", borderRadius: 2, overflow: "hidden" }}><div style={{ height: 3, background: "#C73E28", borderRadius: 2, width: `${((surveyStep+1)/7)*100}%`, transition: "width 0.3s" }}/></div>
        <div style={{ flex: 1, padding: "24px 28px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.3, marginBottom: cur.sub?6:20, ...serif }}>{cur.q}</div>
          {cur.sub && <div style={{ fontSize: 13, color: "#A09080", marginBottom: 20 }}>{cur.sub}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {cur.opts.map((o,i) => {
              const sel = surveyAnswers[surveyStep]===i;
              return <div key={i} onClick={() => setSurveyAnswers({...surveyAnswers,[surveyStep]:i})} style={{ padding: "14px 16px", borderRadius: 14, border: `1.5px solid ${sel?"#C73E28":"#E8E5E0"}`, background: sel?"rgba(199,62,40,0.04)":"#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 22 }}>{o.i}</span><span style={{ fontSize: 15, color: "#1A1A1A", fontWeight: sel?600:400 }}>{o.t}</span></div>;
            })}
          </div>
          <Btn onClick={() => { if(surveyStep<6) setSurveyStep(surveyStep+1); else nav("ai-consent"); }} style={{ marginTop: 16 }}>{surveyStep===6?"Завершить":"Далее"}</Btn>
          <div onClick={() => nav("ai-consent")} style={{ textAlign: "center", marginTop: 10, cursor: "pointer" }}><span style={{ fontSize: 13, color: "#A09080" }}>Пропустить</span></div>
        </div>
      </div>
    );
  }

  // ── AI CONSENT ──
  if (screen === "ai-consent") return (
    <div style={{ width: 375, height: 812, margin: "0 auto", background: "#FAFAF7", borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden", padding: "0 28px" }}>
      <div style={{ height: 54 }}/>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: "linear-gradient(145deg, #F3EEFF, #E8E0FF)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>{I.sparkle("#7B61FF")}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", marginBottom: 10, ...serif }}>ИИ-анализ ваших цитат</div>
        <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 16 }}>Когда вы сохраняете цитату, наш ИИ (на базе OpenAI) подготовит персональный психологический анализ.</div>
        <Card style={{ padding: 16, textAlign: "left", width: "100%", marginBottom: 20 }}>
          {["Цитаты обрабатываются OpenAI API","Данные не используются для обучения моделей","Анализ — это не терапия и не диагноз","Отключить можно в настройках"].map((t,i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0" }}><span style={{ color: "#7B61FF" }}>•</span><span style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>{t}</span></div>
          ))}
        </Card>
      </div>
      <div style={{ paddingBottom: 40 }}>
        <Btn onClick={() => { setAiConsent(true); nav("push-permission"); }}>Согласна, включить ИИ-анализ</Btn>
        <div onClick={() => nav("push-permission")} style={{ textAlign: "center", marginTop: 12, cursor: "pointer" }}><span style={{ fontSize: 14, color: "#A09080" }}>Пока без ИИ</span></div>
      </div>
    </div>
  );

  // ── PUSH PERMISSION ──
  if (screen === "push-permission") return (
    <div style={{ width: 375, height: 812, margin: "0 auto", background: "#FAFAF7", borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden", padding: "0 28px" }}>
      <div style={{ height: 54 }}/>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: "linear-gradient(145deg, #FFF0ED, #FFE0D8)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}><span style={{ fontSize: 32 }}>🔔</span></div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", marginBottom: 10, ...serif }}>Не пропустите важное</div>
        <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 24 }}>Только полезное — новые разборы, ответы Анны и анализы цитат. Никакого спама.</div>
        {[{i:"🎧",t:"Новые аудиоразборы"},{i:"🤖",t:"ИИ-анализ цитаты готов"},{i:"💬",t:"Ответы Анны в Q&A"},{i:"📊",t:"Еженедельный отчёт"}].map((f,i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", width: "100%" }}><span style={{ fontSize: 20 }}>{f.i}</span><span style={{ fontSize: 14, color: "#444", textAlign: "left" }}>{f.t}</span></div>
        ))}
      </div>
      <div style={{ paddingBottom: 40 }}>
        <Btn onClick={() => { setIsNew(true); nav("home"); }}>Разрешить уведомления</Btn>
        <div onClick={() => { setIsNew(true); nav("home"); }} style={{ textAlign: "center", marginTop: 12, cursor: "pointer" }}><span style={{ fontSize: 14, color: "#A09080" }}>Не сейчас</span></div>
      </div>
    </div>
  );

  // ── NETWORK ERROR ──
  if (screen === "no-network") return (
    <div style={{ width: 375, height: 812, margin: "0 auto", background: "#FAFAF7", borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center" }}>
      <div style={{ opacity: 0.4, marginBottom: 20 }}>{I.wifi("#A09080")}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#1A1A1A", marginBottom: 8, ...serif }}>Нет подключения</div>
      <div style={{ fontSize: 14, color: "#A09080", lineHeight: 1.6, marginBottom: 24 }}>Проверьте интернет-соединение и попробуйте снова</div>
      <Btn onClick={() => nav("home")} style={{ width: "100%" }}>Попробовать снова</Btn>
    </div>
  );

  // ── PURCHASE SUCCESS ──
  if (screen === "purchase-success") return (
    <div style={{ width: 375, height: 812, margin: "0 auto", background: "#FAFAF7", borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
      <div style={{ width: 80, height: 80, borderRadius: 40, background: "#E8F5E9", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}><span style={{ fontSize: 40 }}>✓</span></div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#1A1A1A", marginBottom: 8, ...serif }}>Добро пожаловать в клуб!</div>
      <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 8 }}>Подписка «6 месяцев» оформлена</div>
      <div style={{ fontSize: 13, color: "#A09080", marginBottom: 30 }}>Следующее списание: 22 августа 2026</div>
      <div style={{ width: "100%", padding: 16, background: "#FFF8F3", borderRadius: 14, marginBottom: 24, textAlign: "left" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", marginBottom: 8 }}>Что теперь:</div>
        {["🎧 Первый разбор уже ждёт вас","💬 Заходите в чат клуба","❓ Q&A с Анной по пятницам"].map((t,i) => <div key={i} style={{ fontSize: 13, color: "#555", padding: "4px 0" }}>{t}</div>)}
      </div>
      <Btn onClick={() => { setIsNew(false); setPlaying(true); nav("club"); }} style={{ width: "100%" }}>Начать слушать</Btn>
    </div>
  );

  // ══════════════════════════════════════
  // MAIN APP SHELL
  // ══════════════════════════════════════
  return (
    <div style={{ width: 375, height: 812, margin: "0 auto", background: "#FAFAF7", borderRadius: 44, boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif" }}>
      <div style={{ height: 54, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6 }}><span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A" }}>9:41</span></div>

      {/* State Toggle */}
      <div style={{ display: "flex", margin: "0 20px 6px", background: "#F0EDE8", borderRadius: 8, padding: 2 }}>
        {[{v:true,l:"👤 Новый"},{v:false,l:"⭐ Активный"}].map(s => (
          <div key={s.l} onClick={() => { setIsNew(s.v); if(!s.v) setPlaying(true); else setPlaying(false); }} style={{ flex: 1, padding: "5px 0", textAlign: "center", borderRadius: 6, background: isNew===s.v?"#fff":"transparent", cursor: "pointer", boxShadow: isNew===s.v?"0 1px 3px rgba(0,0,0,0.06)":"none" }}>
            <span style={{ fontSize: 11, fontWeight: isNew===s.v?700:500, color: isNew===s.v?"#1A1A1A":"#A09080" }}>{s.l}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      {!playerExp && !searchOpen && (
        <div style={{ display: "flex", alignItems: "center", padding: "4px 20px 12px" }}>
          <div onClick={() => nav("profile")} style={{ width: 36, height: 36, borderRadius: 18, background: isNew?"#E0E0E0":"linear-gradient(145deg, #C73E28, #E8734A)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <span style={{ color: isNew?"#999":"#fff", fontSize: 14, fontWeight: 700 }}>{isNew?"?":"А"}</span>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}><span style={{ fontSize: 19, fontWeight: 600, letterSpacing: 4, color: "#1A1A1A", ...serif }}>ЧИТАТЕЛЬ</span></div>
          <div onClick={() => nav("notifications")} style={{ position: "relative", cursor: "pointer", padding: 4 }}>
            {I.bell("#1A1A1A")}
            {!isNew && <div style={{ position: "absolute", top: 3, right: 3, width: 7, height: 7, background: "#C73E28", borderRadius: 4, border: "1.5px solid #FAFAF7" }}/>}
          </div>
        </div>
      )}

      {/* Fullscreen Search */}
      {searchOpen && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 20px 12px" }}>
          <div style={{ flex: 1, background: "#F0EDE8", borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            {I.search("#A09080")}<input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Поиск..." autoFocus style={{ border: "none", background: "transparent", outline: "none", fontSize: 14, color: "#1A1A1A", width: "100%", fontFamily: "inherit" }}/>
          </div>
          <span onClick={() => { setSearchOpen(false); setSearchQuery(""); }} style={{ fontSize: 14, color: "#C73E28", cursor: "pointer" }}>Отмена</span>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {searchOpen && <SearchScreen query={searchQuery} nav={nav} />}
        {!searchOpen && screen === "home" && <HomeScreen nav={nav} isNew={isNew} />}
        {!searchOpen && screen === "catalog" && <CatalogScreen nav={nav} filter={catalogFilter} setFilter={setCatalogFilter} setSearchOpen={setSearchOpen} />}
        {!searchOpen && screen === "club" && <ClubScreen nav={nav} isNew={isNew} clubTab={clubTab} setClubTab={setClubTab} chatMenu={chatMenu} setChatMenu={setChatMenu} setShowReport={setShowReport} />}
        {!searchOpen && screen === "profile" && <ProfileScreen nav={nav} isNew={isNew} setShowAiModal={setShowAiModal} aiConsent={aiConsent} />}
        {!searchOpen && screen === "book-free" && <BookFreeScreen nav={nav} setPlaying={setPlaying} />}
        {!searchOpen && screen === "book-paid" && <BookPaidScreen nav={nav} setPlaying={setPlaying} setShowReport={setShowReport} />}
        {!searchOpen && screen === "diary" && <DiaryScreen nav={nav} isNew={isNew} setQuoteSheet={setQuoteSheet} />}
        {!searchOpen && screen === "pricing" && <PricingScreen nav={nav} />}
        {!searchOpen && screen === "notifications" && <NotificationsScreen nav={nav} isNew={isNew} />}
        {!searchOpen && screen === "notification-settings" && <NotifSettingsScreen nav={nav} />}
        {!searchOpen && screen === "delete-account" && <DeleteAccountScreen nav={nav} />}
        {!searchOpen && screen === "report" && <ReportScreen nav={nav} />}
        {!searchOpen && screen === "expired" && <ExpiredScreen nav={nav} />}
        {!searchOpen && screen === "skeleton" && <SkeletonScreen nav={nav} />}
        {!searchOpen && screen === "my-purchases" && <MyPurchasesScreen nav={nav} isNew={isNew} />}
        {!searchOpen && screen === "my-progress" && <MyProgressScreen nav={nav} isNew={isNew} />}
        {!searchOpen && screen === "manage-sub" && <ManageSubScreen nav={nav} />}
        {!searchOpen && screen === "edit-profile" && <EditProfileScreen nav={nav} isNew={isNew} />}
        {!searchOpen && screen === "ai-analysis" && <AiAnalysisScreen nav={nav} />}
        {!searchOpen && screen === "weekly-report" && <WeeklyReportScreen nav={nav} />}
        {!searchOpen && screen === "support" && <SupportScreen nav={nav} />}
        {!searchOpen && screen === "referral" && <ReferralScreen nav={nav} />}
        {!searchOpen && screen === "package-detail" && <PackageDetailScreen nav={nav} />}
      </div>

      {/* ── MODALS ── */}
      {showAiModal && !aiConsent && <>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }}/>
        <div style={{ position: "absolute", left: 20, right: 20, top: "50%", transform: "translateY(-50%)", background: "#fff", borderRadius: 20, padding: 24, zIndex: 41 }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>{I.sparkle("#7B61FF")}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A", textAlign: "center", marginBottom: 8 }}>ИИ-анализ цитат</div>
          <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, textAlign: "center", marginBottom: 20 }}>Ваши цитаты будут проанализированы ИИ для персональных инсайтов.</div>
          <Btn onClick={() => { setAiConsent(true); setShowAiModal(false); }}>Разрешить анализ</Btn>
          <div onClick={() => setShowAiModal(false)} style={{ textAlign: "center", marginTop: 10, cursor: "pointer" }}><span style={{ fontSize: 14, color: "#A09080" }}>Не сейчас</span></div>
        </div>
      </>}
      {showReport && <>
        <div onClick={() => setShowReport(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }}/>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderRadius: "20px 20px 0 0", padding: "16px 24px 36px", zIndex: 41 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#E0E0E0", margin: "0 auto 16px" }}/>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A", marginBottom: 14 }}>Пожаловаться</div>
          {["🚫 Спам","🔞 Неприемлемый контент","😡 Оскорбления","📋 Нарушение авторских прав","❓ Другое"].map((r,i) => (
            <div key={i} onClick={() => setShowReport(false)} style={{ padding: "12px 0", borderTop: i?"1px solid #F0EDE8":"none", cursor: "pointer" }}><span style={{ fontSize: 14 }}>{r}</span></div>
          ))}
          <div style={{ height: 1, background: "#F0EDE8", margin: "8px 0" }}/>
          <div onClick={() => setShowReport(false)} style={{ padding: "12px 0", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>{I.shield("#C73E28")}<span style={{ fontSize: 14, color: "#C73E28", fontWeight: 600 }}>Заблокировать пользователя</span></div>
        </div>
      </>}
      {quoteSheet && <>
        <div onClick={() => setQuoteSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 20 }}/>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px 36px", zIndex: 21 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#E0E0E0", margin: "0 auto 16px" }}/>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><span style={{ fontSize: 17, fontWeight: 700 }}>Новая цитата</span><span onClick={() => setQuoteSheet(false)} style={{ cursor: "pointer", color: "#999", fontSize: 18 }}>✕</span></div>
          <div style={{ background: "#F5F3EF", borderRadius: 12, padding: 14, minHeight: 72, marginBottom: 10 }}><span style={{ color: "#A09080", fontSize: 14 }}>Введите текст цитаты...</span></div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, background: "#F5F3EF", borderRadius: 10, padding: "10px 12px" }}><span style={{ color: playing?"#1A1A1A":"#A09080", fontSize: 13 }}>{playing?"Эрих Фромм":"Автор"}</span></div>
            <div style={{ flex: 1, background: "#F5F3EF", borderRadius: 10, padding: "10px 12px" }}><span style={{ color: playing?"#1A1A1A":"#A09080", fontSize: 13 }}>{playing?"Бегство от свободы":"Книга"}</span></div>
          </div>
          {playing && <div style={{ fontSize: 11, color: "#2D7F5E", marginBottom: 10 }}>✓ Автозаполнено из текущего разбора</div>}
          <Btn onClick={() => { setQuoteSheet(false); if(!aiConsent) setShowAiModal(true); }}>Сохранить</Btn>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#A09080" }}>🤖 После сохранения ИИ подготовит анализ</div>
        </div>
      </>}
      {showSpeedPicker && <>
        <div onClick={() => setShowSpeedPicker(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50 }}/>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#1A0E08", borderRadius: "20px 20px 0 0", padding: "16px 24px 36px", zIndex: 51 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto 16px" }}/>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 14, textAlign: "center" }}>Скорость</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {["0.75","1.0","1.25","1.5","2.0"].map(s => (
              <div key={s} onClick={() => { setSpeed(s); setShowSpeedPicker(false); }} style={{ width: 52, height: 52, borderRadius: 14, background: speed===s?"#C73E28":"rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{s}×</span></div>
            ))}
          </div>
        </div>
      </>}
      {showSleepPicker && <>
        <div onClick={() => setShowSleepPicker(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50 }}/>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#1A0E08", borderRadius: "20px 20px 0 0", padding: "16px 24px 36px", zIndex: 51 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto 16px" }}/>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 14, textAlign: "center" }}>Таймер сна</div>
          {["15 минут","30 минут","45 минут","60 минут","Конец части","Отключить"].map((t,i) => (
            <div key={i} onClick={() => setShowSleepPicker(false)} style={{ padding: "13px 0", borderTop: i?"1px solid rgba(255,255,255,0.08)":"none", cursor: "pointer", textAlign: "center" }}><span style={{ color: i===5?"#C73E28":"rgba(255,255,255,0.8)", fontSize: 15 }}>{t}</span></div>
          ))}
        </div>
      </>}

      {/* Expanded Player */}
      {playerExp && (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #1A0E08, #0D0705)", display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 32px 40px", zIndex: 30 }}>
          <div onClick={() => setPlayerExp(false)} style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", marginBottom: 36, cursor: "pointer" }}/>
          <div style={{ width: 220, height: 220, borderRadius: 16, background: "linear-gradient(145deg, #C73E28, #E8734A)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 24px 48px rgba(0,0,0,0.4)", marginBottom: 36 }}><span style={{ fontSize: 22, fontWeight: 700, color: "#fff", ...serif }}>Фромм</span></div>
          <div style={{ color: "#fff", fontSize: 21, fontWeight: 700, marginBottom: 4, ...serif }}>Бегство от свободы</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 28 }}>Часть 1 из 4 · Эрих Фромм</div>
          <div style={{ width: "100%", marginBottom: 6 }}><div style={{ height: 3, background: "rgba(255,255,255,0.12)", borderRadius: 2 }}><div style={{ height: 3, background: "#D2452C", borderRadius: 2, width: "37%" }}/></div></div>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginBottom: 36 }}><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>23:15</span><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>62:00</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: 36 }}>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>−15</span>
            <div onClick={() => setPlaying(!playing)} style={{ width: 64, height: 64, borderRadius: 32, background: "#D2452C", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 20px rgba(210,69,44,0.5)" }}>{playing ? I.pause("#fff") : I.play("#fff")}</div>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>+15</span>
          </div>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <div onClick={() => setShowSpeedPicker(true)} style={{ cursor: "pointer", padding: "6px 14px", borderRadius: 20, background: "rgba(255,255,255,0.08)" }}><span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600 }}>{speed}×</span></div>
            <div onClick={() => { setPlayerExp(false); setQuoteSheet(true); }} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "rgba(210,69,44,0.2)", padding: "6px 14px", borderRadius: 20 }}>{I.pen("#D2452C")}<span style={{ color: "#D2452C", fontSize: 13, fontWeight: 600 }}>Цитата</span></div>
            <div onClick={() => setShowSleepPicker(true)} style={{ cursor: "pointer", padding: "6px 14px", borderRadius: 20, background: "rgba(255,255,255,0.08)" }}><span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>🌙 Сон</span></div>
          </div>
        </div>
      )}

      {/* Mini Player */}
      {showMini && <div style={{ background: "#1A0E08", display: "flex", alignItems: "center", padding: "8px 14px", gap: 10 }}>
        <div onClick={() => setPlayerExp(true)} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer" }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: "linear-gradient(145deg, #C73E28, #E8734A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ color: "#fff", fontSize: 11, fontWeight: 700, ...serif }}>Ф</span></div>
          <div><div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Бегство от свободы</div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Часть 1 · 23:15</div></div>
        </div>
        <div onClick={() => setPlaying(!playing)} style={{ width: 32, height: 32, borderRadius: 16, border: "1.5px solid rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{I.pause("rgba(255,255,255,0.9)")}</div>
      </div>}

      {/* FAB */}
      {showFab && <div onClick={() => setQuoteSheet(true)} style={{ position: "absolute", right: 20, bottom: showMini?(showTabs?138:72):(showTabs?96:40), width: 52, height: 52, borderRadius: 26, background: "#C73E28", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 16px rgba(199,62,40,0.35)", zIndex: 10, transition: "bottom 0.2s" }}>{I.pen("#fff")}</div>}

      {/* Tab Bar */}
      {showTabs && <div style={{ display: "flex", background: "#FAFAF7", borderTop: "1px solid #ECEAE5", paddingBottom: 28, paddingTop: 8 }}>
        {[{id:"home",l:"Главная",icon:I.home},{id:"catalog",l:"Каталог",icon:I.search},{id:"club",l:"Клуб",icon:I.book},{id:"profile",l:"Профиль",icon:I.user}].map(t => (
          <div key={t.id} onClick={() => nav(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
            <div style={{ opacity: activeTab===t.id?1:0.35 }}>{t.icon(activeTab===t.id?"#C73E28":"#1A1A1A")}</div>
            <span style={{ fontSize: 10, fontWeight: activeTab===t.id?700:500, color: activeTab===t.id?"#C73E28":"#1A1A1A", opacity: activeTab===t.id?1:0.4 }}>{t.l}</span>
          </div>
        ))}
      </div>}
    </div>
  );
}

// ══════════════════════════════════════
// SCREEN COMPONENTS
// ══════════════════════════════════════

function HomeScreen({ nav, isNew }) {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <Card onClick={() => nav("pricing")} style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(145deg, #1A0E08, #3A2018)", padding: 20, position: "relative" }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: 50, background: "rgba(210,69,44,0.1)" }}/>
          <div style={{ display: "inline-block", background: "#C73E28", borderRadius: 6, padding: "3px 10px", marginBottom: 10 }}><span style={{ color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>КЛУБ МАРТА</span></div>
          <div style={{ color: "#fff", fontSize: 21, fontWeight: 700, marginBottom: 3, ...serif }}>«Бегство от свободы»</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 14 }}>Эрих Фромм · ⏱ До старта 5 дней</div>
          <div style={{ background: "#C73E28", borderRadius: 12, padding: "12px 0", textAlign: "center" }}><span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Вступить — $18/мес</span></div>
        </div>
      </Card>
      <Card style={{ padding: 18, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#C73E28", letterSpacing: 1.2 }}>МЫСЛЬ ДНЯ</span>
        <div style={{ fontSize: 17, color: "#1A1A1A", lineHeight: 1.55, margin: "10px 0", fontStyle: "italic", ...serif }}>«Люди бегут от свободы, потому что она требует ответственности за собственную жизнь»</div>
        <div style={{ color: "#A09080", fontSize: 13, marginBottom: 12 }}>— Эрих Фромм</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, background: "#F5F3EF", borderRadius: 10, padding: "10px 0", textAlign: "center", cursor: "pointer" }}><span style={{ fontSize: 13 }}>📒 В дневник</span></div>
          <div style={{ flex: 1, background: "#F5F3EF", borderRadius: 10, padding: "10px 0", textAlign: "center", cursor: "pointer" }}><span style={{ fontSize: 13 }}>↗ Поделиться</span></div>
        </div>
      </Card>
      <SH title="Бесплатные разборы" action="Все →" onAction={() => nav("catalog")} />
      <div style={{ display: "flex", gap: 10, overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
        {[{t:"Маленький принц",a:"Сент-Экзюпери",d:"2ч 10м",c:"#E8734A",l:"МП"},{t:"Три сестры",a:"Чехов",d:"1ч 45м",c:"#7B61FF",l:"ТС"},{t:"Алхимик",a:"Коэльо",d:"2ч 30м",c:"#2D9F6E",l:"АЛ"}].map((b,i) => (
          <Card key={i} onClick={() => nav("book-free")} style={{ minWidth: 140, overflow: "hidden", flexShrink: 0 }}>
            <div style={{ height: 88, background: `linear-gradient(145deg, ${b.c}, ${b.c}CC)`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "rgba(255,255,255,0.9)", fontSize: 20, fontWeight: 700, ...serif }}>{b.l}</span></div>
            <div style={{ padding: "10px 12px" }}>
              <div style={{ display: "inline-block", background: "#E8F5E9", borderRadius: 4, padding: "1px 6px", marginBottom: 5 }}><span style={{ fontSize: 9, color: "#2D7F5E", fontWeight: 700 }}>БЕСПЛАТНО</span></div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{b.t}</div>
              <div style={{ fontSize: 11, color: "#A09080" }}>{b.a} · {b.d}</div>
            </div>
          </Card>
        ))}
      </div>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        {isNew ? <div style={{ textAlign: "center", padding: "8px 0" }}><div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Мой прогресс</div><div style={{ fontSize: 13, color: "#A09080", marginBottom: 10 }}>Начните слушать первый разбор</div><div style={{ height: 6, background: "#F0EDE8", borderRadius: 3 }}/></div> : <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 14, fontWeight: 700 }}>Мой прогресс</span><span style={{ fontSize: 13, fontWeight: 600 }}>3ч 20м / 5ч</span></div>
          <div style={{ height: 6, background: "#F0EDE8", borderRadius: 3, marginBottom: 8 }}><div style={{ height: 6, background: "linear-gradient(90deg, #2D9F6E, #4CC98A)", borderRadius: 3, width: "66%" }}/></div>
          <span style={{ fontSize: 13, color: "#C73E28", fontWeight: 600 }}>🔥 7 дней подряд</span>
        </>}
      </Card>
      {!isNew && <>
        <SH title="Популярные разборы" />
        {[{t:"Анна Каренина",a:"Толстой",r:"4.9",p:"$12",c:"#FFB800"},{t:"Человек в поисках смысла",a:"Франкл",r:"4.8",p:"$10",c:"#7B61FF"}].map((b,i) => (
          <Card key={i} onClick={() => nav("book-paid")} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ width: 46, height: 46, borderRadius: 10, background: `linear-gradient(145deg, ${b.c}, ${b.c}AA)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>#{i+1}</span></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{b.t}</div><div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}><span style={{ fontSize: 12, color: "#A09080" }}>{b.a}</span>{I.star()}<span style={{ fontSize: 12, color: "#A09080" }}>{b.r}</span></div></div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#C73E28" }}>{b.p}</span>
          </Card>
        ))}
      </>}
      <Card onClick={() => nav("referral")} style={{ padding: 18, marginTop: 8, background: "linear-gradient(145deg, #FFF8F3, #FFF0E8)" }}>
        <div style={{ textAlign: "center" }}><span style={{ fontSize: 28 }}>🎁</span><div style={{ fontSize: 16, fontWeight: 700, margin: "6px 0 4px", ...serif }}>Подарите подруге</div><div style={{ fontSize: 13, color: "#A09080", marginBottom: 12 }}>Пригласите подругу — получите бесплатный разбор</div><Btn outline>Пригласить</Btn></div>
      </Card>
      <div style={{ height: 60 }}/>
    </div>
  );
}

function CatalogScreen({ nav, filter, setFilter, setSearchOpen }) {
  const chips = ["Все","Классика","Психология","Пакеты","Бесплатные"];
  const books = [
    {t:"Бегство от свободы",a:"Фромм",d:"4ч 12м",p:"$12",c:"#C73E28",l:"БС",free:false},{t:"Маленький принц",a:"Сент-Экзюпери",d:"2ч 10м",c:"#2D9F6E",l:"МП",free:true},{t:"Анна Каренина",a:"Толстой",d:"5ч 30м",p:"$12",c:"#FFB800",l:"АК",free:false},{t:"Три сестры",a:"Чехов",d:"1ч 45м",c:"#7B61FF",l:"ТС",free:true},{t:"Человек в поисках смысла",a:"Франкл",d:"3ч",p:"$10",c:"#E8734A",l:"ЧП",free:false},{t:"Алхимик",a:"Коэльо",d:"2ч 30м",c:"#2D9F6E",l:"АЛ",free:true},
  ];
  const filtered = filter==="Бесплатные"?books.filter(b=>b.free):books;
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <div onClick={() => setSearchOpen(true)} style={{ background: "#F0EDE8", borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>{I.search("#A09080")}<span style={{ color: "#A09080", fontSize: 14 }}>Поиск по названию, автору...</span></div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 2 }}>
        {chips.map(c => <div key={c} onClick={() => setFilter(c)} style={{ padding: "7px 14px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", background: filter===c?"#1A0E08":"#fff", border: `1px solid ${filter===c?"#1A0E08":"#E8E5E0"}` }}><span style={{ fontSize: 13, fontWeight: 600, color: filter===c?"#fff":"#1A1A1A" }}>{c}</span></div>)}
      </div>
      <Card onClick={() => nav("package-detail")} style={{ padding: 0, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(145deg, #1A0E08, #3A2018)", padding: 16 }}>
          <span style={{ fontSize: 10, color: "#E8734A", letterSpacing: 1, fontWeight: 700 }}>ПАКЕТНОЕ ПРЕДЛОЖЕНИЕ</span>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, margin: "4px 0 2px", ...serif }}>Пакет «Отношения» — 5 книг</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Толстой · Фромм · Франкл · Достоевский · Ремарк</div>
          <div style={{ display: "inline-block", background: "#C73E28", borderRadius: 6, padding: "4px 12px" }}><span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>Экономия 40% — $25</span></div>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {filtered.map((b,i) => (
          <Card key={i} onClick={() => nav(b.free?"book-free":"book-paid")} style={{ overflow: "hidden" }}>
            <div style={{ height: 96, background: `linear-gradient(145deg, ${b.c}, ${b.c}BB)`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 700, ...serif }}>{b.l}</span></div>
            <div style={{ padding: "10px 12px" }}>
              {b.free && <div style={{ display: "inline-block", background: "#E8F5E9", borderRadius: 4, padding: "1px 6px", marginBottom: 4 }}><span style={{ fontSize: 9, color: "#2D7F5E", fontWeight: 700 }}>БЕСПЛАТНО</span></div>}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{b.t}</div>
              <div style={{ fontSize: 11, color: "#A09080" }}>{b.a} · {b.d}</div>
              {!b.free && <div style={{ fontSize: 13, fontWeight: 700, color: "#C73E28", marginTop: 4 }}>{b.p}</div>}
            </div>
          </Card>
        ))}
      </div>
      <div style={{ height: 60 }}/>
    </div>
  );
}

function SearchScreen({ query, nav }) {
  const all = [{t:"Бегство от свободы",a:"Фромм",c:"#C73E28"},{t:"Маленький принц",a:"Сент-Экзюпери",c:"#2D9F6E"},{t:"Анна Каренина",a:"Толстой",c:"#FFB800"},{t:"Три сестры",a:"Чехов",c:"#7B61FF"},{t:"Алхимик",a:"Коэльо",c:"#2D9F6E"}];
  const r = query.length>0 ? all.filter(b => (b.t+b.a).toLowerCase().includes(query.toLowerCase())) : [];
  if (query.length>0 && r.length===0) return <Empty icon={I.search("#A09080")} title="Ничего не найдено" sub={`По запросу «${query}» нет результатов`} />;
  if (!query) return <div style={{ padding: "16px 20px" }}><div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Популярные запросы</div>{["Фромм","Маленький принц","Психология","Толстой","Отношения"].map((t,i) => <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #F0EDE8", cursor: "pointer" }}><span style={{ fontSize: 14, color: "#666" }}>🔍 {t}</span></div>)}</div>;
  return <div style={{ padding: "0 20px" }}>{r.map((b,i) => <Card key={i} onClick={() => nav("book-paid")} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, marginBottom: 8 }}><div style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(145deg, ${b.c}, ${b.c}AA)`, flexShrink: 0 }}/><div><div style={{ fontSize: 14, fontWeight: 700 }}>{b.t}</div><div style={{ fontSize: 12, color: "#A09080" }}>{b.a}</div></div></Card>)}</div>;
}

// ── BOOK DETAIL: FREE ──
function BookFreeScreen({ nav, setPlaying }) {
  return (
    <div style={{ paddingBottom: 80 }}>
      <Back onBack={() => nav("catalog")} />
      <div style={{ height: 180, background: "linear-gradient(145deg, #E8734A, #FFB066)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "rgba(255,255,255,0.9)", fontSize: 28, fontWeight: 700, ...serif }}>МП</span></div>
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "inline-block", background: "#E8F5E9", borderRadius: 6, padding: "2px 8px", marginBottom: 8 }}><span style={{ fontSize: 11, color: "#2D7F5E", fontWeight: 700 }}>БЕСПЛАТНО</span></div>
        <div style={{ fontSize: 23, fontWeight: 700, marginBottom: 3, ...serif }}>Маленький принц</div>
        <div style={{ fontSize: 14, color: "#A09080", marginBottom: 10 }}>Антуан де Сент-Экзюпери</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>{I.star()}<span style={{ fontSize: 13, fontWeight: 600 }}>4.8</span><span style={{ color: "#DDD" }}>·</span><span style={{ fontSize: 13, color: "#A09080" }}>64 отзыва · 2ч 10м</span></div>
        <Btn onClick={() => setPlaying(true)} style={{ background: "#2D7F5E", boxShadow: "0 4px 16px rgba(45,127,94,0.2)" }}>▶ Слушать бесплатно</Btn>
        <div style={{ height: 18 }}/>
        <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 10 }}>Содержание</span>
        {[{n:1,t:"Встреча в пустыне",d:"32 мин"},{n:2,t:"Планета Маленького принца",d:"28 мин"},{n:3,t:"Роза и Лис",d:"35 мин"},{n:4,t:"Возвращение домой",d:"35 мин"}].map((p,i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i?"1px solid #F0EDE8":"none" }}>{I.play("#2D7F5E")}<div style={{ flex: 1 }}><span style={{ fontSize: 14 }}>Часть {p.n}: {p.t}</span></div><span style={{ fontSize: 12, color: "#A09080" }}>{p.d}</span></div>
        ))}
        <div style={{ fontSize: 15, fontWeight: 700, margin: "18px 0 8px" }}>О разборе</div>
        <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 16 }}>Почему Маленький принц ушёл с планеты? Анна разбирает одну из самых известных сказок с точки зрения привязанности, сепарации и взросления.</div>
        {/* Reviews section */}
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Отзывы</div>
        {[{n:"Мария",t:"Слушала 3 раза — каждый раз находила новое",r:5},{n:"Елена",t:"Прослезилась на части про Лиса. Анна великолепна!",r:5},{n:"Ксения",t:"Отличный разбор для начала, очень рекомендую",r:4}].map((rv,i) => (
          <div key={i} style={{ padding: "10px 0", borderTop: i?"1px solid #F0EDE8":"none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{rv.n}</span><span style={{ color: "#DDD" }}>·</span>{[...Array(rv.r)].map((_,j) => <span key={j}>{I.star()}</span>)}</div>
            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>{rv.t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BOOK DETAIL: PAID ──
function BookPaidScreen({ nav, setPlaying, setShowReport }) {
  return (
    <div style={{ paddingBottom: 80 }}>
      <Back onBack={() => nav("catalog")} />
      <div style={{ height: 180, background: "linear-gradient(145deg, #C73E28, #E8734A)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "rgba(255,255,255,0.9)", fontSize: 28, fontWeight: 700, ...serif }}>Фромм</span></div>
      <div style={{ padding: "18px 20px" }}>
        <div style={{ fontSize: 23, fontWeight: 700, marginBottom: 3, ...serif }}>Бегство от свободы</div>
        <div style={{ fontSize: 14, color: "#A09080", marginBottom: 10 }}>Эрих Фромм</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>{I.star()}<span style={{ fontSize: 13, fontWeight: 600 }}>4.9</span><span style={{ color: "#DDD" }}>·</span><span style={{ fontSize: 13, color: "#A09080" }}>87 отзывов · 4ч 12м</span></div>
        <Btn onClick={() => setPlaying(true)}>Купить за $12</Btn>
        <div style={{ height: 6 }}/>
        <Btn outline onClick={() => setPlaying(true)}>Слушать превью (5 мин)</Btn>
        <div style={{ height: 18 }}/>
        <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 10 }}>Содержание</span>
        {[{n:1,t:"Свобода — иллюзия?",d:"62 мин",o:true},{n:2,t:"Механизмы бегства",d:"58 мин",o:false},{n:3,t:"Свобода и демократия",d:"61 мин",o:false},{n:4,t:"Новое начало",d:"55 мин",o:false}].map((p,i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i?"1px solid #F0EDE8":"none", opacity: p.o?1:0.4 }}>
            {p.o?I.play("#C73E28"):I.lock()}<div style={{ flex: 1 }}><span style={{ fontSize: 14 }}>Часть {p.n}: {p.t}</span></div><span style={{ fontSize: 12, color: "#A09080" }}>{p.d}</span>
          </div>
        ))}
        <Card onClick={() => nav("package-detail")} style={{ padding: 12, margin: "14px 0", background: "#FFF8F3" }}>
          <span style={{ fontSize: 12, color: "#E8734A", fontWeight: 600 }}>📦 Входит в пакет «Отношения»</span>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>5 книг — экономия 40%. Подробнее →</div>
        </Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>О разборе</div>
        <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, marginBottom: 16 }}>Почему люди бегут от свободы? Фромм показывает, как страх одиночества толкает нас в токсичные отношения и подчинение авторитетам.</div>
        {/* Reviews */}
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Отзывы</div>
        {[{n:"Татьяна",t:"Каждая часть как сеанс у психолога. Слушаю уже второй раз.",r:5},{n:"Ольга",t:"Фромм в интерпретации Анны — это совсем другой уровень.",r:5},{n:"Ирина",t:"Наконец-то поняла свои паттерны в отношениях!",r:5}].map((rv,i) => (
          <div key={i} style={{ padding: "10px 0", borderTop: i?"1px solid #F0EDE8":"none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{rv.n}</span>{[...Array(rv.r)].map((_,j) => <span key={j}>{I.star()}</span>)}</div>
            <div style={{ fontSize: 13, color: "#555" }}>{rv.t}</div>
          </div>
        ))}
        <div onClick={() => setShowReport(true)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", paddingTop: 12, borderTop: "1px solid #F0EDE8" }}>{I.flag()}<span style={{ fontSize: 12, color: "#999" }}>Пожаловаться на контент</span></div>
      </div>
    </div>
  );
}

function ClubScreen({ nav, isNew, clubTab, setClubTab, chatMenu, setChatMenu, setShowReport }) {
  if (isNew) return (
    <div style={{ padding: "0 20px 80px" }}>
      <Card style={{ overflow: "hidden" }}>
        <div style={{ height: 140, background: "linear-gradient(145deg, #1A0E08, #3A2018)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}><span style={{ color: "#fff", fontSize: 22, fontWeight: 700, ...serif }}>«Бегство от свободы»</span><span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Клуб марта · Эрих Фромм</span></div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Что входит:</div>
          {["4 аудиоразбора каждый понедельник","Закрытый чат с участницами","Q&A с Анной по пятницам","21 день доступа к записям"].map((t,i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>{I.check()}<span style={{ fontSize: 14, color: "#555" }}>{t}</span></div>)}
          <Btn onClick={() => nav("pricing")} style={{ marginTop: 16 }}>Вступить в клуб</Btn>
          <div style={{ marginTop: 12, fontSize: 10, color: "#A09080", lineHeight: 1.5, textAlign: "center" }}>Подписка продлевается автоматически. Отмена за 24ч в настройках App Store / Google Play. <span style={{ color: "#C73E28" }}>Условия</span> · <span style={{ color: "#C73E28" }}>Конфиденциальность</span></div>
        </div>
      </Card>
    </div>
  );
  return (
    <div style={{ padding: "0 20px 80px" }}>
      <Card style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(145deg, #C73E28, #E8734A)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontSize: 15, fontWeight: 700, ...serif }}>БС</span></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 700 }}>Бегство от свободы</div><div style={{ fontSize: 12, color: "#A09080" }}>Неделя 2 из 4</div></div>
        </div>
        <div style={{ height: 4, background: "#F0EDE8", borderRadius: 2 }}><div style={{ height: 4, background: "linear-gradient(90deg, #C73E28, #E8734A)", borderRadius: 2, width: "50%" }}/></div>
      </Card>
      <div style={{ display: "flex", background: "#F0EDE8", borderRadius: 10, padding: 3, marginBottom: 16 }}>
        {[{id:"audio",l:"Разборы"},{id:"chat",l:"Чат"},{id:"qa",l:"Q&A"}].map(t => (
          <div key={t.id} onClick={() => setClubTab(t.id)} style={{ flex: 1, padding: "9px 0", textAlign: "center", borderRadius: 8, background: clubTab===t.id?"#fff":"transparent", boxShadow: clubTab===t.id?"0 1px 4px rgba(0,0,0,0.06)":"none", cursor: "pointer" }}><span style={{ fontSize: 14, fontWeight: clubTab===t.id?700:500, color: clubTab===t.id?"#1A1A1A":"#A09080" }}>{t.l}</span></div>
        ))}
      </div>
      {clubTab==="audio" && [{n:1,t:"Бегство от свободы",s:"done"},{n:2,t:"Механизмы бегства",s:"new"},{n:3,t:"Свобода и демократия",s:"locked"},{n:4,t:"Новое начало",s:"locked"}].map((p,i) => (
        <Card key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, marginBottom: 8, opacity: p.s==="locked"?0.45:1, border: p.s==="new"?"2px solid #C73E28":undefined }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: p.s==="done"?"#E8F5E9":p.s==="new"?"#FFF0ED":"#F5F3EF", display: "flex", alignItems: "center", justifyContent: "center" }}>{p.s==="done"?I.check():p.s==="new"?I.play("#C73E28"):I.lock()}</div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>Часть {p.n}</div><div style={{ fontSize: 12, color: "#A09080" }}>{p.t}</div></div>
          {p.s==="new" && <span style={{ fontSize: 10, fontWeight: 700, color: "#C73E28", background: "#FFF0ED", padding: "2px 8px", borderRadius: 8 }}>НОВОЕ</span>}
        </Card>
      ))}
      {clubTab==="chat" && <>
        {/* Messages including own */}
        {[
          {n:"Мария",t:"Прослушала часть 2 — меняет взгляд на отношения...",time:"14:23",anna:false,own:false},
          {n:"Анна Бусел",t:"Обратите внимание на параллель с вашей ситуацией.",time:"15:01",anna:true,own:false},
          {n:"Вы",t:"Анна, а как применить это к ситуации с родителями?",time:"15:30",anna:false,own:true},
          {n:"Елена",t:"Девочки, кто на Q&A в пятницу? Хочу спросить про главу 3",time:"15:45",anna:false,own:false},
        ].map((m,i) => (
          <div key={i} onClick={() => !m.anna && !m.own && setChatMenu(chatMenu===i?null:i)} style={{ background: m.anna?"#FFF8F3":m.own?"#F0F8FF":"#fff", borderRadius: 14, padding: 14, marginBottom: 8, border: m.anna?"1px solid #F0D8C8":m.own?"1px solid #D0E8FF":"1px solid #F0EDE8", position: "relative", marginLeft: m.own?30:0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ fontSize: 13, fontWeight: 700, color: m.anna?"#C73E28":m.own?"#2D7F9F":"#1A1A1A" }}>{m.anna?"✦ ":""}{m.n}</span><span style={{ fontSize: 11, color: "#C0B8B0" }}>{m.time}</span></div>
            <div style={{ fontSize: 14, color: "#444", lineHeight: 1.5 }}>{m.t}</div>
            {chatMenu===i && !m.anna && !m.own && (
              <div style={{ position: "absolute", right: 10, top: 40, background: "#fff", borderRadius: 10, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 5, border: "1px solid #F0EDE8" }}>
                <div onClick={(e) => { e.stopPropagation(); setChatMenu(null); setShowReport(true); }} style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>{I.flag()}<span style={{ fontSize: 13, color: "#666" }}>Пожаловаться</span></div>
                <div style={{ height: 1, background: "#F0EDE8" }}/>
                <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>{I.shield("#C73E28")}<span style={{ fontSize: 13, color: "#C73E28" }}>Заблокировать</span></div>
              </div>
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, background: "#F0EDE8", borderRadius: 14, padding: "10px 14px", alignItems: "center" }}><span style={{ flex: 1, color: "#A09080", fontSize: 14 }}>Написать...</span>{I.send()}</div>
      </>}
      {clubTab==="qa" && <>
        <Card style={{ padding: 16, marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>Задайте вопрос Анне</span>
          <div style={{ background: "#F5F3EF", borderRadius: 10, padding: 12, minHeight: 56, marginBottom: 10 }}><span style={{ color: "#A09080", fontSize: 13 }}>Ваш вопрос к пятничному Q&A...</span></div>
          <Btn>Отправить</Btn>
        </Card>
        <span style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>Архив ответов</span>
        {[{q:"Как преодолеть страх свободы?",a:"Осознание паттерна — первый шаг. Когда вы видите что бежите от решений..."},{q:"Почему я выбираю токсичных партнёров?",a:"Фромм объясняет это через концепцию «бегства в авторитарность»..."},{q:"Как отличить настоящую любовь от зависимости?",a:"Настоящая любовь по Фромму — это активная забота, ответственность и знание..."}].map((qa,i) => (
          <Card key={i} style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{qa.q}</div>
            <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>Анна: «{qa.a}»</div>
          </Card>
        ))}
      </>}
    </div>
  );
}

function ProfileScreen({ nav, isNew, setShowAiModal, aiConsent }) {
  return (
    <div style={{ padding: "0 20px 80px", paddingTop: 4 }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div onClick={() => nav("edit-profile")} style={{ width: 68, height: 68, borderRadius: 34, margin: "0 auto 10px", background: isNew?"#E0E0E0":"linear-gradient(145deg, #C73E28, #E8734A)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
          <span style={{ color: isNew?"#999":"#fff", fontSize: 26, fontWeight: 700 }}>{isNew?"?":"А"}</span>
          <div style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, background: "#fff", border: "2px solid #FAFAF7", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.pen("#C73E28")}</div>
        </div>
        <div style={{ fontSize: 19, fontWeight: 700 }}>{isNew?"Новый пользователь":"Анна Петрова"}</div>
        <div style={{ fontSize: 12, color: "#A09080", marginTop: 2 }}>{isNew?"Нажмите на аватар для редактирования":"Участница с октября 2025"}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 14 }}>
          {(isNew?[{n:"0",l:"разборов"},{n:"0ч",l:"слушала"},{n:"0",l:"дней"}]:[{n:"12",l:"разборов"},{n:"48ч",l:"слушала"},{n:"🔥7",l:"дней"}]).map((s,i) => <div key={i} style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700 }}>{s.n}</div><div style={{ fontSize: 11, color: "#A09080" }}>{s.l}</div></div>)}
        </div>
      </div>
      {[
        {icon:"📒",label:"Мой дневник",sub:isNew?"Добавьте первую цитату":"23 цитаты",badge:isNew?0:3,action:()=>{nav("diary");if(!aiConsent)setTimeout(()=>setShowAiModal(true),500);}},
        {icon:"🎧",label:"Мои покупки",sub:isNew?"Пока пусто":"8 разборов",action:()=>nav("my-purchases")},
        {icon:"📊",label:"Мой прогресс",sub:isNew?"Послушайте первый разбор":"65% цели",action:()=>nav("my-progress")},
        {icon:"💳",label:"Подписка",sub:isNew?"Бесплатный":"Клуб · 6 мес",action:()=>nav(isNew?"pricing":"manage-sub")},
        {icon:"🔄",label:"Восстановить покупки",sub:"Apple / Google"},
      ].map((item,i) => (
        <Card key={i} onClick={item.action} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>{item.icon}</span>
          <div style={{ flex: 1 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</span>{item.badge>0 && <div style={{ background: "#C73E28", borderRadius: 8, padding: "1px 6px" }}><span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{item.badge}</span></div>}</div>{item.sub && <div style={{ fontSize: 12, color: "#A09080", marginTop: 1 }}>{item.sub}</div>}</div>{I.chev()}
        </Card>
      ))}
      <div style={{ marginTop: 8 }}>
        {[{l:"Настройки уведомлений",a:()=>nav("notification-settings")},{l:"Политика конфиденциальности"},{l:"Условия использования"},{l:"Поддержка",a:()=>nav("support")},{l:"Удалить аккаунт",danger:true,a:()=>nav("delete-account")}].map((item,i) => (
          <div key={i} onClick={item.a} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderTop: i?"1px solid #F0EDE8":"none", cursor: item.a?"pointer":"default" }}><span style={{ fontSize: 14, color: item.danger?"#C73E28":"#1A1A1A" }}>{item.l}</span>{I.chev()}</div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 16 }}><span style={{ fontSize: 14, color: "#A09080", cursor: "pointer" }}>Выйти</span></div>
    </div>
  );
}

function DiaryScreen({ nav, isNew, setQuoteSheet }) {
  return (
    <div style={{ padding: "0 20px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}><div onClick={() => nav("profile")} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>{I.back()}<span style={{ fontSize: 14, color: "#C73E28" }}>Профиль</span></div></div>
      <span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 14 }}>Мой дневник</span>
      {isNew ? <Empty icon={I.notebook("#C73E28")} title="Пока пусто" sub="Добавьте первую цитату — и получите персональный анализ от ИИ" action="Добавить цитату" onAction={() => setQuoteSheet(true)} /> : <>
        <Card onClick={() => nav("weekly-report")} style={{ padding: 16, marginBottom: 14, background: "linear-gradient(145deg, #C73E28, #E8734A)", cursor: "pointer" }}>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 3 }}>📊 Еженедельный отчёт</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginBottom: 10 }}>ИИ проанализировал 7 цитат за неделю</div>
          <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "9px 0", textAlign: "center" }}><span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>Посмотреть →</span></div>
        </Card>
        {[{t:"«Свобода — это ответственность. Вот почему все её боятся»",b:"Бегство от свободы",a:true},{t:"«Настоящая любовь начинается там, где ничего не ожидают»",b:"Маленький принц",a:true},{t:"«Человек может вынести всё, если есть зачем»",b:"Человек в поисках смысла",a:false}].map((q,i) => (
          <Card key={i} style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 15, lineHeight: 1.5, fontStyle: "italic", marginBottom: 8, ...serif }}>{q.t}</div>
            <div style={{ fontSize: 12, color: "#A09080" }}>{q.b}</div>
            {q.a && <div onClick={() => nav("ai-analysis")} style={{ marginTop: 8, padding: "7px 10px", background: "#FFF8F3", borderRadius: 8, borderLeft: "3px solid #C73E28", cursor: "pointer" }}><span style={{ fontSize: 11, color: "#C73E28", fontWeight: 600 }}>🤖 Анализ от Анны →</span></div>}
          </Card>
        ))}
      </>}
    </div>
  );
}

// ── NEW: AI ANALYSIS RESULT ──
function AiAnalysisScreen({ nav }) {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <Back onBack={() => nav("diary")} label="Дневник" />
      <Card style={{ padding: 16, marginBottom: 14, borderLeft: "3px solid #C73E28" }}>
        <div style={{ fontSize: 16, fontStyle: "italic", lineHeight: 1.5, marginBottom: 8, ...serif }}>«Свобода — это ответственность. Вот почему все её боятся»</div>
        <div style={{ fontSize: 12, color: "#A09080" }}>Эрих Фромм · Бегство от свободы</div>
      </Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>{I.sparkle("#7B61FF")}<span style={{ fontSize: 17, fontWeight: 700 }}>Анализ от Анны</span></div>
      <Card style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Что цитата говорит о вас</div>
        <div style={{ fontSize: 14, color: "#555", lineHeight: 1.7, marginBottom: 12 }}>Вы выбрали эту цитату неслучайно — она указывает на внутренний конфликт между желанием автономии и страхом ответственности. Фромм описывает это как центральную дилемму современного человека.</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Паттерн недели</div>
        <div style={{ fontSize: 14, color: "#555", lineHeight: 1.7, marginBottom: 12 }}>Из 7 ваших цитат за неделю 4 связаны с темой свободы и ответственности. Это может говорить о том, что вы сейчас на пороге важного решения.</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Вопрос для размышления</div>
        <div style={{ fontSize: 14, color: "#7B61FF", fontStyle: "italic", lineHeight: 1.6 }}>«В какой области своей жизни вы сейчас избегаете ответственности? Что произойдёт, если вы её примете?»</div>
      </Card>
      <div style={{ padding: 12, background: "#F5F3EF", borderRadius: 12, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#A09080" }}>ИИ-анализ подготовлен на основе ваших цитат с помощью OpenAI. Это не терапия и не диагноз.</div>
      </div>
    </div>
  );
}

// ── NEW: WEEKLY REPORT ──
function WeeklyReportScreen({ nav }) {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <Back onBack={() => nav("diary")} label="Дневник" />
      <span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 4, ...serif }}>Еженедельный отчёт</span>
      <span style={{ fontSize: 13, color: "#A09080", display: "block", marginBottom: 16 }}>17–23 февраля 2026</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[{n:"7",l:"цитат",i:"📒"},{n:"128",l:"минут",i:"🎧"},{n:"3",l:"книги",i:"📚"},{n:"🔥7",l:"дней",i:"🔥"}].map((s,i) => (
          <Card key={i} style={{ padding: 14, textAlign: "center" }}><span style={{ fontSize: 22 }}>{s.i}</span><div style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 2px" }}>{s.n}</div><div style={{ fontSize: 11, color: "#A09080" }}>{s.l}</div></Card>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>{I.sparkle("#7B61FF")}<span style={{ fontSize: 17, fontWeight: 700 }}>Анализ ваших тем</span></div>
      <Card style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Главная тема недели: Свобода</div>
        <div style={{ fontSize: 14, color: "#555", lineHeight: 1.7, marginBottom: 12 }}>Из 7 цитат: 4 о свободе и ответственности, 2 о любви, 1 о смысле жизни. Вы глубоко погружаетесь в тему Фромма — это показывает, что книга резонирует с текущим этапом вашей жизни.</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Рекомендация</div>
        <div style={{ fontSize: 14, color: "#555", lineHeight: 1.7 }}>После «Бегства от свободы» рекомендуем послушать «Человек в поисках смысла» Франкла — он продолжает тему свободы через призму смысла.</div>
      </Card>
      <Btn outline onClick={() => nav("diary")}>Вернуться в дневник</Btn>
    </div>
  );
}

// ── NEW: EDIT PROFILE ──
function EditProfileScreen({ nav, isNew }) {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <Back onBack={() => nav("profile")} label="Профиль" />
      <span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 16 }}>Редактировать профиль</span>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ width: 80, height: 80, borderRadius: 40, margin: "0 auto 8px", background: isNew?"#E0E0E0":"linear-gradient(145deg, #C73E28, #E8734A)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: isNew?"#999":"#fff", fontSize: 30, fontWeight: 700 }}>{isNew?"?":"А"}</span></div>
        <span style={{ fontSize: 13, color: "#C73E28", cursor: "pointer" }}>Изменить фото</span>
      </div>
      <div style={{ fontSize: 12, color: "#A09080", marginBottom: 4, fontWeight: 600 }}>Имя</div>
      <div style={{ background: "#F0EDE8", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}><span style={{ fontSize: 14, color: isNew?"#A09080":"#1A1A1A" }}>{isNew?"Введите имя":"Анна Петрова"}</span></div>
      <div style={{ fontSize: 12, color: "#A09080", marginBottom: 4, fontWeight: 600 }}>Email</div>
      <div style={{ background: "#F0EDE8", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}><span style={{ fontSize: 14, color: "#1A1A1A" }}>{isNew?"user@email.com":"anna.petrova@gmail.com"}</span></div>
      <div style={{ fontSize: 12, color: "#A09080", marginBottom: 4, fontWeight: 600 }}>О себе (необязательно)</div>
      <div style={{ background: "#F0EDE8", borderRadius: 12, padding: "14px 16px", minHeight: 60, marginBottom: 16 }}><span style={{ fontSize: 14, color: "#A09080" }}>Расскажите немного о себе...</span></div>
      <Btn onClick={() => nav("profile")}>Сохранить</Btn>
    </div>
  );
}

// ── NEW: SUPPORT ──
function SupportScreen({ nav }) {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <Back onBack={() => nav("profile")} label="Профиль" />
      <span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 16, ...serif }}>Поддержка</span>
      <Card style={{ padding: 18, marginBottom: 14, textAlign: "center" }}>
        <span style={{ fontSize: 32 }}>💬</span>
        <div style={{ fontSize: 15, fontWeight: 700, margin: "8px 0 4px" }}>Написать нам</div>
        <div style={{ fontSize: 13, color: "#A09080", marginBottom: 12 }}>Обычно отвечаем в течение 24 часов</div>
        <Btn>support@chitatel.app</Btn>
      </Card>
      <span style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 12 }}>Частые вопросы</span>
      {[{q:"Как отменить подписку?",a:"Перейдите в Настройки iPhone → Подписки → ЧИТАТЕЛЬ → Отменить"},{q:"Можно ли скачать аудио для оффлайн?",a:"Пока нет, но мы работаем над этой функцией для ближайших обновлений."},{q:"Как работает ИИ-анализ?",a:"Ваши цитаты отправляются в OpenAI для анализа. Данные не хранятся на стороне OpenAI."},{q:"Что будет после окончания подписки?",a:"Доступ к записям клуба сохраняется ещё 3 дня. Купленные разборы доступны навсегда."}].map((faq,i) => (
        <Card key={i} style={{ padding: 14, marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{faq.q}</div>
          <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>{faq.a}</div>
        </Card>
      ))}
    </div>
  );
}

// ── NEW: REFERRAL ──
function ReferralScreen({ nav }) {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <Back onBack={() => nav("home")} />
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <span style={{ fontSize: 48 }}>🎁</span>
        <div style={{ fontSize: 22, fontWeight: 700, margin: "10px 0 6px", ...serif }}>Подарите подруге</div>
        <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6 }}>Пригласите подругу в ЧИТАТЕЛЬ — вы оба получите бесплатный разбор книги</div>
      </div>
      <Card style={{ padding: 18, marginBottom: 14, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#A09080", marginBottom: 8 }}>Ваша ссылка для приглашения</div>
        <div style={{ background: "#F0EDE8", borderRadius: 12, padding: "12px 16px", marginBottom: 12, fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>chitatel.app/ref/anna2026</div>
        <Btn>Скопировать ссылку</Btn>
        <div style={{ marginTop: 10 }}><Btn outline>Поделиться в мессенджере</Btn></div>
      </Card>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Ваша статистика</div>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          {[{n:"3",l:"приглашено"},{n:"2",l:"вступили"},{n:"2",l:"бонуса получено"}].map((s,i) => <div key={i} style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 700, color: "#C73E28" }}>{s.n}</div><div style={{ fontSize: 11, color: "#A09080" }}>{s.l}</div></div>)}
        </div>
      </Card>
    </div>
  );
}

// ── NEW: PACKAGE DETAIL ──
function PackageDetailScreen({ nav }) {
  const books = [{t:"Анна Каренина",a:"Толстой",d:"5ч 30м",c:"#FFB800"},{t:"Бегство от свободы",a:"Фромм",d:"4ч 12м",c:"#C73E28"},{t:"Человек в поисках смысла",a:"Франкл",d:"3ч",c:"#E8734A"},{t:"Преступление и наказание",a:"Достоевский",d:"5ч",c:"#7B61FF"},{t:"Три товарища",a:"Ремарк",d:"4ч",c:"#2D9F6E"}];
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <Back onBack={() => nav("catalog")} />
      <div style={{ background: "linear-gradient(145deg, #1A0E08, #3A2018)", borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <span style={{ fontSize: 10, color: "#E8734A", letterSpacing: 1, fontWeight: 700 }}>ПАКЕТНОЕ ПРЕДЛОЖЕНИЕ</span>
        <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: "6px 0 4px", ...serif }}>Пакет «Отношения»</div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 8 }}>5 книг · 21ч 42м · Тема: Отношения и привязанность</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>$25</span><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, textDecoration: "line-through" }}>$42</span><span style={{ color: "#E8734A", fontSize: 13, fontWeight: 600 }}>−40%</span></div>
      </div>
      <Btn style={{ marginBottom: 16 }}>Купить пакет — $25</Btn>
      <span style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 10 }}>5 книг в пакете</span>
      {books.map((b,i) => (
        <Card key={i} onClick={() => nav("book-paid")} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(145deg, ${b.c}, ${b.c}AA)`, flexShrink: 0 }}/>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{b.t}</div><div style={{ fontSize: 12, color: "#A09080" }}>{b.a} · {b.d}</div></div>{I.chev()}
        </Card>
      ))}
    </div>
  );
}

function PricingScreen({ nav }) {
  const [sel, setSel] = useState(1);
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <Back onBack={() => nav("home")} />
      <div style={{ textAlign: "center", marginBottom: 24 }}><div style={{ fontSize: 22, fontWeight: 700, ...serif }}>Выберите тариф</div><div style={{ fontSize: 13, color: "#A09080", marginTop: 4 }}>Отмена в любой момент</div></div>
      {[{id:0,n:"1 месяц",p:"$18",sub:"/мес",f:["Книга месяца (4 аудио)","Чат + Q&A"]},{id:1,n:"6 месяцев",p:"$90",sub:"$15/мес",save:"−17%",pop:true,f:["Всё из «1 месяц»","Архив 6 мес"]},{id:2,n:"Год + все книги",p:"$150",sub:"$12.50/мес",save:"−31%",f:["ВСЕ разборы навсегда","Бейдж Gold"]}].map(p => (
        <div key={p.id} onClick={() => setSel(p.id)} style={{ background: sel===p.id?"#1A0E08":"#fff", borderRadius: 16, padding: 18, marginBottom: 10, cursor: "pointer", border: `2px solid ${sel===p.id?"#C73E28":"#E8E5E0"}`, position: "relative" }}>
          {p.pop && <div style={{ position: "absolute", top: -10, right: 14, background: "#C73E28", borderRadius: 6, padding: "2px 10px" }}><span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>ПОПУЛЯРНЫЙ</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sel===p.id?10:0 }}>
            <div><div style={{ fontSize: 16, fontWeight: 700, color: sel===p.id?"#fff":"#1A1A1A" }}>{p.n}</div>{p.save && <div style={{ fontSize: 12, color: sel===p.id?"#E8734A":"#2D7F5E", fontWeight: 600 }}>Экономия {p.save}</div>}</div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 22, fontWeight: 700, color: sel===p.id?"#fff":"#1A1A1A" }}>{p.p}</div><div style={{ fontSize: 11, color: sel===p.id?"rgba(255,255,255,0.5)":"#A09080" }}>{p.sub}</div></div>
          </div>
          {sel===p.id && p.f.map((f,i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>{I.check("#4CC98A")}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{f}</span></div>)}
        </div>
      ))}
      <Btn onClick={() => nav("purchase-success")} style={{ marginTop: 14 }}>Подписаться</Btn>
      <div style={{ marginTop: 14, fontSize: 10, color: "#A09080", lineHeight: 1.6, textAlign: "center" }}>Подписка автоматически продлевается. Оплата через Apple In-App Purchase или Google Play Billing. Отмена за 24ч в настройках App Store / Google Play.</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}><span style={{ fontSize: 12, color: "#C73E28" }}>Восстановить покупки</span><span style={{ fontSize: 12, color: "#C73E28" }}>Условия</span><span style={{ fontSize: 12, color: "#C73E28" }}>Конфиденциальность</span></div>
    </div>
  );
}

function NotificationsScreen({ nav, isNew }) {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <Back onBack={() => nav("home")} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><span style={{ fontSize: 20, fontWeight: 700 }}>Уведомления</span><span onClick={() => nav("notification-settings")} style={{ fontSize: 13, color: "#C73E28", cursor: "pointer" }}>⚙ Настройки</span></div>
      {isNew ? <Empty icon={I.bell("#A09080")} title="Пока нет" sub="Здесь появятся новости о разборах и анализы цитат" /> :
        [{t:"Новый разбор: Часть 2",sub:"Клуб",time:"1ч",u:true,i:"🎧"},{t:"Анализ цитаты готов",sub:"Дневник",time:"3ч",u:true,i:"🤖"},{t:"Анна ответила в чате",sub:"Клуб",time:"Вчера",u:false,i:"💬"},{t:"Запишите цитату ✍️",sub:"Напоминание",time:"Вчера",u:false,i:"📒"},{t:"Еженедельный отчёт",sub:"128 мин · 7 цитат",time:"2д",u:false,i:"📊"}].map((n,i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "13px 0", borderBottom: "1px solid #F0EDE8", opacity: n.u?1:0.55 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: n.u?"#FFF0ED":"#F5F3EF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 18 }}>{n.i}</span></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: n.u?600:400 }}>{n.t}</div><div style={{ fontSize: 12, color: "#A09080", marginTop: 1 }}>{n.sub} · {n.time}</div></div>
            {n.u && <div style={{ width: 8, height: 8, borderRadius: 4, background: "#C73E28", marginTop: 6, flexShrink: 0 }}/>}
          </div>
        ))}
    </div>
  );
}

function NotifSettingsScreen({ nav }) {
  const [t, sT] = useState({a:true,b:true,c:true,d:true,e:true,f:true,g:true,h:true,i:true,j:true,k:false});
  const Row = ({l,s,k}) => <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #F0EDE8" }}><div><div style={{ fontSize: 14 }}>{l}</div>{s && <div style={{ fontSize: 11, color: "#A09080", marginTop: 1 }}>{s}</div>}</div><Toggle on={t[k]} onToggle={() => sT({...t,[k]:!t[k]})} /></div>;
  const S = ({t:title}) => <div style={{ fontSize: 11, color: "#A09080", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginTop: 18, marginBottom: 4 }}>{title}</div>;
  return <div style={{ padding: "0 20px 20px" }}><Back onBack={() => nav("profile")} label="Профиль" /><span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 4 }}>Уведомления</span><S t="Контент" /><Row l="Мысль дня" s="Ежедневно утром" k="a" /><Row l="Новый аудиоразбор" k="b" /><Row l="#цитатадня" s="2 раза в неделю" k="c" /><S t="Дневник" /><Row l="Напоминание: цитата" s="4 раза в неделю" k="d" /><Row l="ИИ-анализ готов" k="e" /><Row l="Еженедельный отчёт" k="f" /><S t="Продукты" /><Row l="Бесплатные разборы" k="g" /><Row l="Платные разборы" s="Новинки" k="h" /><Row l="Клуб месяца" k="i" /><S t="Сообщество" /><Row l="Чат клуба" k="j" /><Row l="Лайки" k="k" /></div>;
}

function DeleteAccountScreen({ nav }) {
  return <div style={{ padding: "0 20px 20px" }}><Back onBack={() => nav("profile")} label="Профиль" /><span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 16, ...serif }}>Удаление аккаунта</span><Card style={{ padding: 16, marginBottom: 16, borderLeft: "3px solid #DC3545", background: "#FFF5F5" }}>{["Все данные безвозвратно удалены","Цитаты, прогресс, анализы — стёрты","Купленные разборы станут недоступны","Подписки НЕ отменяются — отмените в App Store / Google Play"].map((t,i) => <div key={i} style={{ fontSize: 13, color: "#DC3545", lineHeight: 1.6, padding: "2px 0" }}>• {t}</div>)}</Card><div style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>Введите <strong>«УДАЛИТЬ»</strong> для подтверждения</div><div style={{ background: "#F0EDE8", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}><span style={{ color: "#A09080", fontSize: 14 }}>Введите УДАЛИТЬ</span></div><Btn danger onClick={() => nav("profile")}>Удалить аккаунт навсегда</Btn><div onClick={() => nav("profile")} style={{ textAlign: "center", marginTop: 12, cursor: "pointer" }}><span style={{ fontSize: 14, color: "#A09080" }}>Отмена</span></div></div>;
}
function ReportScreen({ nav }) {
  return <div style={{ padding: "0 20px 20px" }}><Back onBack={() => nav("club")} /><span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 8 }}>Пожаловаться</span><div style={{ fontSize: 14, color: "#A09080", marginBottom: 16 }}>Модератор рассмотрит за 24 часа.</div>{["🚫 Спам","🔞 Неприемлемый контент","😡 Оскорбления","📋 Авторские права","🤖 Фейк","❓ Другое"].map((r,i) => <Card key={i} onClick={() => nav("club")} style={{ padding: "14px 16px", marginBottom: 8, cursor: "pointer" }}><span style={{ fontSize: 14 }}>{r}</span></Card>)}<div style={{ height: 1, background: "#F0EDE8", margin: "12px 0" }}/><Btn outline>Заблокировать пользователя</Btn><div style={{ textAlign: "center", marginTop: 16 }}><span style={{ fontSize: 12, color: "#A09080" }}>Помощь: </span><span style={{ fontSize: 12, color: "#C73E28" }}>Поддержка</span></div></div>;
}
function ExpiredScreen({ nav }) {
  return <div style={{ padding: "0 20px 20px" }}><Back onBack={() => nav("home")} /><div style={{ textAlign: "center", padding: "40px 10px" }}><div style={{ fontSize: 56, marginBottom: 16 }}>⏰</div><div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, ...serif }}>Подписка истекла</div><div style={{ fontSize: 14, color: "#A09080", lineHeight: 1.6, marginBottom: 24 }}>Записи доступны ещё 3 дня. Продлите, чтобы не пропустить клуб апреля.</div><Btn onClick={() => nav("pricing")} style={{ marginBottom: 10 }}>Продлить подписку</Btn><Btn outline onClick={() => nav("catalog")} style={{ marginBottom: 16 }}>Купить записи</Btn><span style={{ fontSize: 13, color: "#C73E28" }}>Восстановить покупки</span></div></div>;
}
function SkeletonScreen({ nav }) {
  const sh = { background: "linear-gradient(90deg, #F0EDE8 25%, #E8E5E0 50%, #F0EDE8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: 10 };
  return <div style={{ padding: "0 20px 20px" }}><Back onBack={() => nav("home")} /><div style={{ textAlign: "center", marginBottom: 16 }}><span style={{ fontSize: 11, color: "#A09080", letterSpacing: 1 }}>СКЕЛЕТОН ЗАГРУЗКИ</span></div><style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style><div style={{ ...sh, width: "100%", height: 150, marginBottom: 16 }}/><div style={{ ...sh, width: "100%", height: 100, marginBottom: 16 }}/><div style={{ ...sh, width: 140, height: 18, marginBottom: 12 }}/><div style={{ display: "flex", gap: 10, marginBottom: 20 }}><div style={{ ...sh, minWidth: 140, height: 130 }}/><div style={{ ...sh, minWidth: 140, height: 130 }}/></div><div style={{ ...sh, width: "100%", height: 64 }}/></div>;
}
function MyPurchasesScreen({ nav, isNew }) {
  return <div style={{ padding: "0 20px 20px" }}><Back onBack={() => nav("profile")} label="Профиль" /><span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 14 }}>Мои покупки</span>{isNew ? <Empty icon={<span style={{ fontSize: 40 }}>🎧</span>} title="Пока нет покупок" sub="Начните с бесплатных разборов" action="В каталог" onAction={() => nav("catalog")} /> : [{t:"Бегство от свободы",a:"Фромм",type:"Клуб",c:"#C73E28"},{t:"Маленький принц",a:"Сент-Экзюпери",type:"Бесплатно",c:"#2D9F6E"},{t:"Анна Каренина",a:"Толстой",type:"$12",c:"#FFB800"},{t:"Пакет «Отношения»",a:"5 книг",type:"$25",c:"#7B61FF"}].map((b,i) => <Card key={i} onClick={() => nav("book-paid")} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, marginBottom: 8 }}><div style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(145deg, ${b.c}, ${b.c}AA)`, flexShrink: 0 }}/><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{b.t}</div><div style={{ fontSize: 12, color: "#A09080" }}>{b.a} · {b.type}</div></div>{I.chev()}</Card>)}</div>;
}
function MyProgressScreen({ nav, isNew }) {
  const days=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"], vals=isNew?[0,0,0,0,0,0,0]:[45,30,60,0,55,40,30];
  return <div style={{ padding: "0 20px 20px" }}><Back onBack={() => nav("profile")} label="Профиль" /><span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 14 }}>Мой прогресс</span><Card style={{ padding: 18, marginBottom: 14 }}><div style={{ display: "flex", justifyContent: "space-around", marginBottom: 8 }}>{days.map((d,i) => <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><div style={{ width: 28, height: 80, background: "#F0EDE8", borderRadius: 14, display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden" }}><div style={{ height: `${(vals[i]/60)*100}%`, background: vals[i]?"linear-gradient(180deg, #C73E28, #E8734A)":"transparent", borderRadius: 14 }}/></div><span style={{ fontSize: 10, color: "#A09080" }}>{d}</span></div>)}</div></Card><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>{[{n:isNew?"0":"260",l:"минут",i:"🎧"},{n:isNew?"0":"12",l:"разборов",i:"📚"},{n:isNew?"0":"23",l:"цитат",i:"📒"},{n:isNew?"0":"7",l:"дней подряд",i:"🔥"}].map((s,i) => <Card key={i} style={{ padding: 14, textAlign: "center" }}><span style={{ fontSize: 24 }}>{s.i}</span><div style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 2px" }}>{s.n}</div><div style={{ fontSize: 11, color: "#A09080" }}>{s.l}</div></Card>)}</div>{!isNew && <Card style={{ padding: 14, background: "#FFF8F3" }}><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Цель: 5 часов</div><div style={{ height: 6, background: "#F0EDE8", borderRadius: 3, marginBottom: 4 }}><div style={{ height: 6, background: "linear-gradient(90deg, #2D9F6E, #4CC98A)", borderRadius: 3, width: "86%" }}/></div><span style={{ fontSize: 12, color: "#2D7F5E" }}>4ч 20м — почти у цели!</span></Card>}</div>;
}
function ManageSubScreen({ nav }) {
  return <div style={{ padding: "0 20px 20px" }}><Back onBack={() => nav("profile")} label="Профиль" /><span style={{ fontSize: 20, fontWeight: 700, display: "block", marginBottom: 14 }}>Моя подписка</span><Card style={{ padding: 18, marginBottom: 14, border: "2px solid #C73E28" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><div><div style={{ fontSize: 16, fontWeight: 700 }}>Клуб · 6 месяцев</div><div style={{ fontSize: 12, color: "#2D7F5E", fontWeight: 600, marginTop: 2 }}>Активна</div></div><div style={{ fontSize: 22, fontWeight: 700, color: "#C73E28" }}>$90</div></div><div style={{ height: 1, background: "#F0EDE8", margin: "10px 0" }}/>{[{l:"Следующее списание",v:"22 августа 2026"},{l:"Оплачено через",v:"Apple IAP"},{l:"Дата начала",v:"22 февраля 2026"}].map((r,i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}><span style={{ fontSize: 13, color: "#A09080" }}>{r.l}</span><span style={{ fontSize: 13, fontWeight: 500 }}>{r.v}</span></div>)}</Card><Btn onClick={() => nav("pricing")} style={{ marginBottom: 10 }}>Улучшить до «Год»</Btn><div style={{ textAlign: "center", padding: 12, background: "#F5F3EF", borderRadius: 12 }}><span style={{ fontSize: 13, color: "#666" }}>Отмена: </span><span style={{ fontSize: 13, color: "#C73E28", fontWeight: 600 }}>Настройки iPhone → Подписки</span></div></div>;
}
