// Mono v2 — all core screens, theme-aware via props
// Keys on T.* token object passed in.

const monoBase = {
  light: {
    bg: '#FAFAFA', surface: '#FFFFFF', ink: '#0A0A0A',
    mute: '#737373', faint: '#A3A3A3', line: 'rgba(10,10,10,0.1)',
    inv: '#FAFAFA', invInk: '#0A0A0A',
  },
  dark: {
    bg: '#0A0A0A', surface: '#111111', ink: '#FAFAFA',
    mute: '#737373', faint: '#525252', line: 'rgba(250,250,250,0.12)',
    inv: '#0A0A0A', invInk: '#FAFAFA',
  },
};
const voice = { S: '#EC4899', A: '#F97316', T: '#3B82F6', B: '#22C55E', SATB: '#8B5CF6' };

function makeTokens(theme, accent, radius) {
  return { ...monoBase[theme], accent, radius, theme };
}

// ─── Shared bits ───
const Mono = { font: '"Helvetica Neue", Helvetica, Arial, sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, monospace' };

function StatusBar({ T }) {
  return <div style={{ position: 'absolute', top: 14, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 30px', fontSize: 13, fontWeight: 600, color: T.ink, zIndex: 5 }}>
    <span>9:41</span>
    <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>●●●● ◉ ▮▮</span>
  </div>;
}

function TopBar({ T, left, title, right, sub }) {
  return <div style={{ padding: '50px 22px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.line}` }}>
    <div style={{ width: 28, fontSize: 18, color: T.ink }}>{left || ''}</div>
    <div style={{ flex: 1, textAlign: 'center' }}>
      {sub && <div style={{ fontSize: 9, letterSpacing: 2, color: T.mute, textTransform: 'uppercase', marginBottom: 2, fontFamily: Mono.mono }}>{sub}</div>}
      {title && <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>{title}</div>}
    </div>
    <div style={{ width: 28, textAlign: 'right', fontSize: 16, color: T.ink }}>{right || ''}</div>
  </div>;
}

function VoiceChip({ v, T }) {
  return <div style={{ padding: '2px 7px', border: `1px solid ${voice[v]}`, color: voice[v], fontFamily: Mono.mono, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', borderRadius: T.radius }}>{v}</div>;
}

function PrimaryBtn({ T, children, full }) {
  return <div style={{ width: full ? '100%' : 'auto', background: T.ink, color: T.bg, padding: '15px 20px', textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', borderRadius: T.radius }}>{children}</div>;
}

// ─── 1. LOGIN ───
function MonoLogin({ T }) {
  return <div style={{ height: '100%', background: T.bg, color: T.ink, fontFamily: Mono.font, display: 'flex', flexDirection: 'column', padding: '80px 24px 34px' }}>
    <StatusBar T={T}/>
    <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', fontWeight: 700, marginBottom: 48 }}>Cantabox</div>
    <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.1 }}>Willkommen zurück.</div>
    <div style={{ fontSize: 13, color: T.mute, marginTop: 8 }}>Melde dich mit deinen Zugangsdaten an.</div>
    <div style={{ marginTop: 36 }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: T.mute, textTransform: 'uppercase', marginBottom: 7, fontFamily: Mono.mono }}>Benutzername</div>
      <div style={{ paddingBottom: 10, borderBottom: `1px solid ${T.ink}`, fontSize: 15 }}>jonas</div>
    </div>
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <div style={{ fontSize: 9, letterSpacing: 2, color: T.mute, textTransform: 'uppercase', fontFamily: Mono.mono }}>Passwort</div>
        <div style={{ fontSize: 9, letterSpacing: 2, color: T.accent, textTransform: 'uppercase', fontFamily: Mono.mono }}>Vergessen?</div>
      </div>
      <div style={{ paddingBottom: 10, borderBottom: `1px solid ${T.line}`, fontSize: 15, color: T.mute, letterSpacing: 5 }}>••••••••</div>
    </div>
    <div style={{ flex: 1 }}/>
    <PrimaryBtn T={T} full>Anmelden</PrimaryBtn>
    <div style={{ fontSize: 11, color: T.mute, textAlign: 'center', marginTop: 20 }}>Noch kein Konto? <span style={{ color: T.accent }}>Einladungslink</span></div>
  </div>;
}

// ─── 2. ONBOARDING ───
function MonoOnboarding({ T }) {
  return <div style={{ height: '100%', background: T.bg, color: T.ink, fontFamily: Mono.font, display: 'flex', flexDirection: 'column', padding: '80px 24px 34px' }}>
    <StatusBar T={T}/>
    <div style={{ fontSize: 10, letterSpacing: 2, color: T.mute, textTransform: 'uppercase', fontFamily: Mono.mono, marginBottom: 20 }}>Schritt 2 / 3</div>
    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.15 }}>Welche Stimme singst du?</div>
    <div style={{ fontSize: 12, color: T.mute, marginTop: 8 }}>Wir filtern dein Repertoire entsprechend.</div>
    <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 0, borderTop: `1px solid ${T.line}` }}>
      {[
        { v: 'S', name: 'Sopran', pick: false },
        { v: 'A', name: 'Alt', pick: true },
        { v: 'T', name: 'Tenor', pick: false },
        { v: 'B', name: 'Bass', pick: false },
      ].map(r => (
        <div key={r.v} style={{ padding: '18px 0', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 22, height: 22, border: `1.5px solid ${r.pick ? T.ink : T.line}`, background: r.pick ? T.ink : 'transparent', borderRadius: T.radius, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.bg, fontSize: 12 }}>{r.pick ? '✓' : ''}</div>
          <div style={{ flex: 1, fontSize: 16, fontWeight: r.pick ? 600 : 400 }}>{r.name}</div>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: voice[r.v] }}/>
        </div>
      ))}
    </div>
    <div style={{ flex: 1 }}/>
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ flex: 1, padding: '15px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: T.mute, border: `1px solid ${T.line}`, borderRadius: T.radius }}>Zurück</div>
      <div style={{ flex: 2 }}><PrimaryBtn T={T} full>Weiter</PrimaryBtn></div>
    </div>
  </div>;
}

// ─── 3. BROWSE (tief) ───
function MonoBrowse({ T, density = 1 }) {
  const pad = density;
  const pieces = [
    { nr: 1, name: 'Pie Jesu', voice: 'S', time: '3:15', done: true, lastPlay: 'heute' },
    { nr: 2, name: 'Libera me', voice: 'A', time: '4:22', done: false, lastPlay: 'vor 2 Tagen' },
    { nr: 3, name: 'Agnus Dei', voice: 'T', time: '5:01', done: true, lastPlay: 'gestern' },
    { nr: 4, name: 'In Paradisum', voice: 'B', time: '3:38', done: false, lastPlay: 'letzte Woche' },
    { nr: 5, name: 'Introitus et Kyrie', voice: 'SATB', time: '6:12', done: false, lastPlay: '—' },
    { nr: 6, name: 'Offertoire', voice: 'SATB', time: '8:40', done: false, lastPlay: '—' },
    { nr: 7, name: 'Sanctus', voice: 'S', time: '3:22', done: true, lastPlay: 'vor 3 Tagen' },
  ];
  return <div style={{ height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', color: T.ink, fontFamily: Mono.font }}>
    <StatusBar T={T}/>
    <div style={{ padding: '50px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>Cantabox</div>
      <div style={{ display: 'flex', gap: 12, fontSize: 15 }}>
        <span>⌕</span>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: T.ink, color: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>J</div>
      </div>
    </div>
    <div style={{ padding: '24px 22px 18px' }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: T.mute, textTransform: 'uppercase', marginBottom: 8, fontFamily: Mono.mono }}>Requiem · Fauré</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, lineHeight: 0.95 }}>Op. 48</div>
      <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: T.mute, fontFamily: Mono.mono, letterSpacing: 0.5 }}>
        <span>7 STÜCKE</span>
        <span>·</span>
        <span>3 GEÜBT</span>
        <span>·</span>
        <span style={{ color: T.accent }}>43%</span>
      </div>
      <div style={{ marginTop: 14, height: 2, background: T.line, position: 'relative' }}>
        <div style={{ width: '43%', height: '100%', background: T.accent }}/>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 16, padding: '8px 22px', borderBottom: `1px solid ${T.line}` }}>
      {['Alle', 'Meine (Sopran)', 'Offen'].map((t, i) => (
        <div key={t} style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, color: i === 0 ? T.ink : T.mute, borderBottom: i === 0 ? `2px solid ${T.accent}` : 'none', marginBottom: -1 }}>{t}</div>
      ))}
    </div>
    <div style={{ flex: 1, overflow: 'auto' }}>
      {pieces.map(p => (
        <div key={p.nr} style={{ padding: `${12 + pad * 4}px 22px`, display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 10, color: T.mute, width: 16, fontVariantNumeric: 'tabular-nums', fontFamily: Mono.mono }}>{String(p.nr).padStart(2, '0')}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.3, marginBottom: 4, color: p.done ? T.mute : T.ink, textDecoration: p.done ? 'line-through' : 'none', textDecorationThickness: 1 }}>{p.name}</div>
            <div style={{ fontSize: 10, color: T.mute, fontFamily: Mono.mono, letterSpacing: 0.5, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>{p.time}</span><span>·</span><span>{p.lastPlay.toUpperCase()}</span>
            </div>
          </div>
          <VoiceChip v={p.voice} T={T}/>
        </div>
      ))}
    </div>
    {/* Mini player */}
    <div style={{ background: T.ink, color: T.bg, padding: '12px 18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: T.radius === 9999 ? 16 : T.radius, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 1v8M7 1v8" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>Pie Jesu</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: Mono.mono, letterSpacing: 1, marginTop: 1 }}>01:42 / 03:15</div>
      </div>
      <div style={{ fontSize: 14 }}>⌃</div>
    </div>
  </div>;
}

// ─── 4. PLAYER ───
function MonoPlayer({ T }) {
  return <div style={{ height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', color: T.ink, fontFamily: Mono.font }}>
    <StatusBar T={T}/>
    <TopBar T={T} left="←" sub="Nº 01 / 07" title="Requiem" right="⋯"/>
    <div style={{ padding: '20px 22px 14px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <VoiceChip v="S" T={T}/>
        <div style={{ fontSize: 10, color: T.mute, fontFamily: Mono.mono, letterSpacing: 0.8 }}>D-DUR · 72 BPM</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, lineHeight: 1 }}>Pie Jesu.</div>
      <div style={{ fontSize: 12, color: T.mute, marginTop: 6 }}>Gabriel Fauré · Op. 48</div>
    </div>
    <div style={{ flex: 1, padding: '16px 22px', overflow: 'auto', borderTop: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: T.mute, textTransform: 'uppercase', fontFamily: Mono.mono, marginBottom: 10 }}>Text</div>
      <div style={{ fontSize: 15, lineHeight: 1.75, fontWeight: 500 }}>
        <div style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: 10, marginLeft: -12 }}>Pie Jesu Domine,</div>
        <div style={{ paddingLeft: 10, marginLeft: -12 }}>dona eis requiem,</div>
        <div style={{ paddingLeft: 10, marginLeft: -12 }}>dona eis requiem.</div>
        <div style={{ marginTop: 14, color: T.mute }}>Pie Jesu Domine,</div>
        <div style={{ color: T.mute }}>dona eis requiem,</div>
        <div style={{ color: T.mute }}>sempiternam requiem.</div>
      </div>
    </div>
    {/* Controls */}
    <div style={{ padding: '18px 22px 26px', borderTop: `1px solid ${T.ink}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: Mono.mono, letterSpacing: 1, color: T.mute, marginBottom: 8 }}>
        <span>01:42</span>
        <span style={{ color: T.accent }}>A · 0:32</span>
        <span style={{ color: T.accent }}>B · 2:14</span>
        <span>03:15</span>
      </div>
      <div style={{ position: 'relative', height: 8, marginBottom: 20 }}>
        <div style={{ position: 'absolute', inset: 0, top: 3, height: 2, background: T.line }}/>
        <div style={{ position: 'absolute', left: '10%', right: '31%', top: 3, height: 2, background: T.ink }}/>
        <div style={{ position: 'absolute', left: '10%', top: 0, width: 2, height: 8, background: T.accent }}/>
        <div style={{ position: 'absolute', left: '69%', top: 0, width: 2, height: 8, background: T.accent }}/>
        <div style={{ position: 'absolute', left: '52%', top: -2, width: 10, height: 10, borderRadius: T.radius === 9999 ? 5 : 0, background: T.ink, transform: 'translateX(-5px)' }}/>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.mute, fontFamily: Mono.mono }}>−5s</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ fontSize: 20, color: T.ink }}>⟲</div>
          <div style={{ width: 56, height: 56, borderRadius: T.radius === 9999 ? 28 : T.radius, background: T.ink, color: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 3v12M13 3v12" stroke={T.bg} strokeWidth="3" strokeLinecap="round"/></svg>
          </div>
          <div style={{ fontSize: 20, color: T.ink }}>⟳</div>
        </div>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: T.mute, fontFamily: Mono.mono }}>+5s</div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        {[{l:'LOOP',a:true},{l:'+ MARKER'},{l:'TEXT'},{l:'AUFN.'}].map(b => (
          <div key={b.l} style={{ flex: 1, padding: '9px 0', textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 1, fontFamily: Mono.mono, color: b.a ? T.accent : T.mute, border: `1px solid ${b.a ? T.accent : T.line}`, borderRadius: T.radius }}>{b.l}</div>
        ))}
      </div>
    </div>
  </div>;
}

// ─── 5. RECORDER ───
function MonoRecorder({ T }) {
  const bars = Array.from({length: 36}, (_, i) => 6 + Math.abs(Math.sin(i*0.5)*30) + (i > 10 && i < 26 ? 8 : 0));
  return <div style={{ height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', color: T.ink, fontFamily: Mono.font }}>
    <StatusBar T={T}/>
    <TopBar T={T} left="×" sub="Aufnahme" title="Pie Jesu" right=""/>
    <div style={{ padding: '20px 22px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: T.accent, animation: 'pulse 1s infinite' }}/>
        <div style={{ fontSize: 10, color: T.accent, letterSpacing: 2, textTransform: 'uppercase', fontFamily: Mono.mono, fontWeight: 700 }}>Aufnahme läuft</div>
      </div>
      <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums' }}>00:42</div>
      <div style={{ fontSize: 11, color: T.mute, fontFamily: Mono.mono, letterSpacing: 1, marginTop: 4 }}>VON 03:15 MAX.</div>
    </div>
    <div style={{ flex: 1, padding: '30px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 80 }}>
        {bars.map((h, i) => <div key={i} style={{ flex: 1, height: h, background: i < 14 ? T.accent : T.line }}/>)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: Mono.mono, fontSize: 9, color: T.mute, letterSpacing: 1, marginTop: 8 }}>
        <span>00:00</span><span>MIC · −12 dB</span><span>03:15</span>
      </div>
    </div>
    <div style={{ padding: '16px 22px 30px', borderTop: `1px solid ${T.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, border: `1px solid ${T.line}`, borderRadius: T.radius === 9999 ? 22 : T.radius, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>⟲</div>
          <div style={{ fontSize: 9, color: T.mute, letterSpacing: 1, textTransform: 'uppercase', fontFamily: Mono.mono }}>Neu</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 68, height: 68, background: T.accent, borderRadius: T.radius === 9999 ? 34 : T.radius, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
            <div style={{ width: 20, height: 20, background: '#fff', borderRadius: T.radius === 9999 ? 2 : 0 }}/>
          </div>
          <div style={{ fontSize: 9, color: T.accent, letterSpacing: 1, textTransform: 'uppercase', fontFamily: Mono.mono, fontWeight: 700 }}>Stop</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, border: `1px solid ${T.line}`, borderRadius: T.radius === 9999 ? 22 : T.radius, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: 16 }}>✓</div>
          <div style={{ fontSize: 9, color: T.mute, letterSpacing: 1, textTransform: 'uppercase', fontFamily: Mono.mono }}>Fertig</div>
        </div>
      </div>
    </div>
  </div>;
}

// ─── 6. SETTINGS ───
function MonoSettings({ T }) {
  const Section = ({ title, children }) => <div style={{ marginBottom: 26 }}>
    <div style={{ padding: '0 22px 10px', fontSize: 9, letterSpacing: 2, color: T.mute, textTransform: 'uppercase', fontFamily: Mono.mono }}>{title}</div>
    <div style={{ borderTop: `1px solid ${T.line}` }}>{children}</div>
  </div>;
  const Row = ({ label, val, accent }) => <div style={{ padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.line}` }}>
    <div style={{ fontSize: 14, color: T.ink }}>{label}</div>
    <div style={{ fontSize: 12, color: accent ? T.accent : T.mute, fontFamily: val && val.match(/^\d/) ? Mono.mono : Mono.font }}>{val} ›</div>
  </div>;
  return <div style={{ height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', color: T.ink, fontFamily: Mono.font }}>
    <StatusBar T={T}/>
    <div style={{ padding: '50px 22px 24px' }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: T.mute, textTransform: 'uppercase', fontFamily: Mono.mono, marginBottom: 8 }}>Profil</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6 }}>Jonas Regener</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <VoiceChip v="S" T={T}/>
        <div style={{ fontSize: 10, color: T.mute, fontFamily: Mono.mono, letterSpacing: 1 }}>PRO-MEMBER · CHOR: ST. MARIEN</div>
      </div>
    </div>
    <div style={{ flex: 1, overflow: 'auto', paddingBottom: 20 }}>
      <Section title="Konto">
        <Row label="Stimme" val="Sopran"/>
        <Row label="Passwort" val="ändern"/>
        <Row label="Anzeigename" val="jonas"/>
      </Section>
      <Section title="App">
        <Row label="Theme" val="Hell"/>
        <Row label="Schriftgröße" val="Standard"/>
        <Row label="Offline-Modus" val="An"/>
      </Section>
      <Section title="Chor">
        <Row label="Chor wechseln" val=""/>
        <Row label="Dropbox-Sync" val="Verbunden"/>
      </Section>
      <Section title="Info">
        <Row label="Über CantaBox" val="v2.4.1"/>
        <Row label="Abmelden" val="" accent/>
      </Section>
    </div>
  </div>;
}

// ─── 7. ADMIN · USERS ───
function MonoAdmin({ T }) {
  const users = [
    { name: 'Anna Mercier', voice: 'S', role: 'Member', last: 'heute' },
    { name: 'Bernd Klose', voice: 'B', role: 'Admin', last: 'vor 1h' },
    { name: 'Clara Weiß', voice: 'A', role: 'Member', last: 'gestern' },
    { name: 'David Lang', voice: 'T', role: 'Member', last: 'vor 3 Tagen' },
    { name: 'Eva Hartmann', voice: 'S', role: 'Guest', last: '—' },
    { name: 'Frank Roth', voice: 'B', role: 'Member', last: 'vor 1 Woche' },
  ];
  return <div style={{ height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', color: T.ink, fontFamily: Mono.font }}>
    <StatusBar T={T}/>
    <TopBar T={T} left="←" sub="Admin" title="Mitglieder" right="+"/>
    <div style={{ padding: '16px 22px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>18</div>
      <div style={{ display: 'flex', gap: 14, fontFamily: Mono.mono, fontSize: 10, color: T.mute, letterSpacing: 0.8 }}>
        <span><span style={{ color: voice.S }}>●</span> 6S</span>
        <span><span style={{ color: voice.A }}>●</span> 5A</span>
        <span><span style={{ color: voice.T }}>●</span> 4T</span>
        <span><span style={{ color: voice.B }}>●</span> 3B</span>
      </div>
    </div>
    <div style={{ flex: 1, overflow: 'auto' }}>
      {users.map(u => (
        <div key={u.name} style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${T.line}` }}>
          <div style={{ width: 28, height: 28, borderRadius: T.radius === 9999 ? 14 : T.radius, border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: voice[u.voice] }}>{u.name[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: -0.2 }}>{u.name}</div>
            <div style={{ fontSize: 10, color: T.mute, fontFamily: Mono.mono, letterSpacing: 0.8, marginTop: 2 }}>{u.role.toUpperCase()} · {u.last.toUpperCase()}</div>
          </div>
          <VoiceChip v={u.voice} T={T}/>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', padding: '10px 14px 28px', borderTop: `1px solid ${T.line}`, gap: 0 }}>
      {['Users', 'Labels', 'Gäste', 'Data'].map((t, i) => (
        <div key={t} style={{ flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 10, fontFamily: Mono.mono, letterSpacing: 1, textTransform: 'uppercase', fontWeight: i === 0 ? 700 : 400, color: i === 0 ? T.ink : T.mute, borderTop: i === 0 ? `2px solid ${T.accent}` : 'none', marginTop: -10, paddingTop: 16 }}>{t}</div>
      ))}
    </div>
  </div>;
}

// ─── 8. EMPTY STATE ───
function MonoEmpty({ T }) {
  return <div style={{ height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', color: T.ink, fontFamily: Mono.font }}>
    <StatusBar T={T}/>
    <TopBar T={T} left="←" title="Favoriten" right=""/>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, border: `1.5px solid ${T.ink}`, borderRadius: T.radius, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 24 }}>☆</div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.6, marginBottom: 10 }}>Noch keine Favoriten</div>
      <div style={{ fontSize: 13, color: T.mute, lineHeight: 1.5, maxWidth: 240 }}>Markiere ein Stück mit ☆, um es hier wiederzufinden.</div>
      <div style={{ marginTop: 28, padding: '11px 20px', border: `1px solid ${T.ink}`, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, fontFamily: Mono.mono, borderRadius: T.radius }}>Repertoire öffnen</div>
    </div>
  </div>;
}

// ─── 9. ERROR STATE ───
function MonoError({ T }) {
  return <div style={{ height: '100%', background: T.bg, display: 'flex', flexDirection: 'column', color: T.ink, fontFamily: Mono.font }}>
    <StatusBar T={T}/>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: T.accent, fontFamily: Mono.mono, fontWeight: 700, marginBottom: 14 }}>ERROR · 503</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, lineHeight: 1 }}>Dropbox nicht erreichbar.</div>
      <div style={{ fontSize: 13, color: T.mute, marginTop: 14, lineHeight: 1.5 }}>Wir können gerade keine neuen Stücke laden. Bereits geladene Tracks bleiben verfügbar.</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 32 }}>
        <div style={{ flex: 1, padding: '14px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: T.mute, border: `1px solid ${T.line}`, borderRadius: T.radius, fontFamily: Mono.mono }}>Schließen</div>
        <div style={{ flex: 1, padding: '14px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: T.bg, background: T.ink, borderRadius: T.radius, fontFamily: Mono.mono }}>Erneut</div>
      </div>
    </div>
    <div style={{ padding: 22, fontFamily: Mono.mono, fontSize: 9, color: T.faint, letterSpacing: 1 }}>LAST SYNC · 22.APR 21:04</div>
  </div>;
}

window.makeTokens = makeTokens;
window.MonoLogin = MonoLogin;
window.MonoOnboarding = MonoOnboarding;
window.MonoBrowse = MonoBrowse;
window.MonoPlayer = MonoPlayer;
window.MonoRecorder = MonoRecorder;
window.MonoSettings = MonoSettings;
window.MonoAdmin = MonoAdmin;
window.MonoEmpty = MonoEmpty;
window.MonoError = MonoError;
