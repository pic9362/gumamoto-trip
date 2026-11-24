/* 화면 렌더링·동작. 여행 내용은 data.js 에서만 관리합니다. */
(function () {
'use strict';
const T = window.TRIP, C = T.config;
const NDAYS = C.nights + 1;
const DAYC = ['#d76f83', '#3d9a85', '#6b7cd0', '#c08a2e', '#8a5fb0', '#2f8fb5', '#b0603f'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const enc = encodeURIComponent;
const P = id => T.places[id];

/* ---------- 저장소(차단돼도 동작) ---------- */
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem('trip:' + C.id + ':' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem('trip:' + C.id + ':' + k, JSON.stringify(v)); } catch (e) {} }
};
let route = store.get('route', 'hwy');       // hwy | gen
let large = store.get('large', false);

/* ---------- 날짜·시간 ---------- */
const sd = C.startDate.split('-').map(Number);
const dayUTC = i => new Date(Date.UTC(sd[0], sd[1] - 1, sd[2] + i));
const ymdOf = i => { const d = dayUTC(i); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
const md = i => { const d = dayUTC(i); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); };
const wd = i => WD[dayUTC(i).getUTCDay()];
const dl = i => md(i) + '(' + wd(i) + ')';
const mins = t => { const m = /^(\d\d):(\d\d)$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const fmtMin = m => m >= 60 ? Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분';
function tzNow() {
  const q = new URLSearchParams(location.search).get('now'); // 검증용: ?now=2026-12-08T10:00 (여행지 현지 시각)
  if (q) { const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(q); if (m) return { ymd: m[1] + '-' + m[2] + '-' + m[3], min: +m[4] * 60 + +m[5], sim: true }; }
  try {
    const p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: C.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).forEach(x => p[x.type] = x.value);
    return { ymd: p.year + '-' + p.month + '-' + p.day, min: +p.hour * 60 + +p.minute };
  } catch (e) { const d = new Date(); return { ymd: d.toISOString().slice(0, 10), min: d.getHours() * 60 + d.getMinutes() }; }
}
const ymdDiff = (a, b) => Math.round((Date.UTC(...a.split('-').map((x, i) => i == 1 ? x - 1 : +x)) - Date.UTC(...b.split('-').map((x, i) => i == 1 ? x - 1 : +x))) / 864e5);
const fmtT = t => t ? (t[0] || '') + (t[0] ? '~' : '') + (t[1] || '') : '';
const range = s => !s.t || !s.t[0] ? '시각 미정' : s.t[0] + '~' + (s.t[1] || '');

/* ---------- 링크 ---------- */
const mapUrl = p => 'https://www.google.com/maps/search/?api=1&query=' + enc(p.q || p.ja) + (p.pid ? '&query_place_id=' + p.pid : '');
const avoid = () => route === 'gen' ? '&avoid=' + enc('highways,tolls') : '';
function dirUrl(fromId, toId, wps, mode) {
  const o = fromId && P(fromId), d = P(toId);
  let u = 'https://www.google.com/maps/dir/?api=1&travelmode=' + (mode || 'driving');
  if (o) u += '&origin=' + enc(o.q || o.ja) + (o.pid ? '&origin_place_id=' + o.pid : '');
  u += '&destination=' + enc(d.q || d.ja) + (d.pid ? '&destination_place_id=' + d.pid : '');
  if (wps && wps.length) {
    const ps = wps.map(P);
    u += '&waypoints=' + ps.map(p => enc(p.q || p.ja)).join('%7C');
    if (ps.every(p => p.pid)) u += '&waypoint_place_ids=' + ps.map(p => p.pid).join('%7C');
  }
  return u + ((mode || 'driving') === 'driving' ? avoid() : '');
}
const searchUrl = p => 'https://www.google.com/search?q=' + enc((p.ja || p.ko) + ' 熊本');
const trUrl = t => 'https://translate.google.com/?sl=ja&tl=ko&text=' + enc(t) + '&op=translate';
const ext = (href, label, cls) => '<a class="btn ' + (cls || '') + '" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
const jaBtn = (ja, pr, ko) => '<button type="button" class="tap jp" lang="ja" data-ja="' + esc(ja) + '" data-pr="' + esc(pr || '') + '" data-ko="' + esc(ko || '') + '">' + esc(ja) + '</button>';
const copyBtn = (t, label) => '<button type="button" class="btn" data-copy="' + esc(t) + '">' + (label || '이름 복사') + '</button>';
const sTag = s => ({ ok: '<span class="tag s-ok">확인됨</span>', est: '<span class="tag s-est">계획상 추정</span>', chk: '<span class="tag s-chk">확인 필요</span>' }[s] || '');
const dc = i => DAYC[i % DAYC.length];

/* ---------- 일정 계산 ---------- */
const placeStops = d => d.stops.filter(s => s.place);
function legs(di) {
  const st = T.days[di].stops, out = [];
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1], b = st[i];
    const aEnd = a.t && (mins(a.t[1]) != null ? mins(a.t[1]) : (a.kind === 'depart' ? mins(a.t[0]) : null));
    const bStart = b.t && mins(b.t[0]);
    if (aEnd == null || bStart == null) continue;
    const gap = bStart - aEnd;
    if (gap < 0) continue;
    out.push({ i, a, b, gap, flight: a.kind === 'flight' || b.kind === 'flight' });
  }
  return out;
}
const driveMin = di => legs(di).filter(l => !l.flight && !(l.a.meal && l.b.place && P(l.b.place).near)).reduce((s, l) => s + (l.b.place && l.a.place && P(l.a.place).near === l.b.place || l.b.place && l.a.place && P(l.b.place).near === l.a.place ? 0 : l.gap), 0);
function mealOptions(di, s) {
  const key = { lunch2: '점심', dinner2: '저녁' }[s.meal];
  return key ? Object.keys(T.foods).filter(id => T.foods[id].day === di + 1 && T.foods[id].meal === key) : [];
}
function dayRoute(di) {
  const ps = placeStops(T.days[di]).filter(s => !P(s.place).nomap).map(s => s.place);
  const uniq = ps.filter((p, i) => i === 0 || p !== ps[i - 1]);
  return uniq;
}
function dayDirUrl(di) {
  const r = dayRoute(di);
  if (r.length < 2) return mapUrl(P(r[0]));
  return dirUrl(r[0], r[r.length - 1], r.slice(1, -1));
}
const routeLabel = () => route === 'gen' ? '일반도로 위주' : '고속도로 이용';

/* ---------- 큰 글씨 ---------- */
function applyLarge() { document.documentElement.classList.toggle('large', !!large); $$('[data-act=large]').forEach(b => { b.setAttribute('aria-pressed', large); b.classList.toggle('on', !!large); }); }

/* ---------- 상단·하단·사이드 메뉴 ---------- */
const NAVS = [['', '전체', '🏠'], ['map', '지도', '🗺️'], ['food', '식당', '🍚'], ['talk', '현지어', '💬'], ['stay', '숙소', '🛏️'], ['move', '교통·비상', '🚗']];
function renderChrome() {
  $('#bottomnav').innerHTML = NAVS.map(n => '<button type="button" class="nav-item" data-nav="' + n[0] + '"><span class="ic" aria-hidden="true">' + n[2] + '</span><span>' + n[1] + '</span></button>').join('');
  let chips = '<a class="chip" data-chip="" href="#/">전체</a>';
  for (let i = 0; i < NDAYS; i++) chips += '<a class="chip" data-chip="day/' + (i + 1) + '" href="#/day/' + (i + 1) + '">' + (i + 1) + '일차 ' + dl(i) + '</a>';
  chips += '<a class="chip" data-chip="prep" href="#/prep">출발 준비</a>';
  $('#topbar').innerHTML = '<div class="ttl"><span>' + esc(C.brandShort) + '</span><button type="button" class="btn" data-act="large" aria-pressed="false">큰 글씨</button></div><div class="row" id="chiprow">' + chips + '</div>';
  let sb = '<div class="brand"><div class="stamp" aria-hidden="true">♨</div><b>' + esc(C.brand) + '</b></div>';
  sb += '<a class="side-link" data-chip="" href="#/"><span class="ic">🏠</span>한눈에</a>';
  for (let i = 0; i < NDAYS; i++) sb += '<a class="side-link side-sub" data-chip="day/' + (i + 1) + '" href="#/day/' + (i + 1) + '">' + (i + 1) + '일차 ' + dl(i) + '</a>';
  sb += [['map', '여행 지도', '🗺️'], ['food', '식당 후보', '🍚'], ['talk', '현지어 한마디', '💬'], ['stay', '숙소·식사', '🛏️'], ['move', '교통·비상', '🚗'], ['prep', '출발 준비', '✅']].map(n => '<a class="side-link" data-chip="' + n[0] + '" href="#/' + n[0] + '"><span class="ic">' + n[2] + '</span>' + n[1] + '</a>').join('');
  sb += '<div class="side-foot"><button type="button" class="btn" data-act="large" aria-pressed="false">큰 글씨</button><p style="margin-top:8px">조회 기준일 ' + C.researchedOn + '</p></div>';
  $('#sidebar').innerHTML = sb;
}

/* ---------- 히어로 ---------- */
const HERO_SVG = '<svg viewBox="0 0 480 330" role="img" aria-label="아소 칼데라 산봉우리와 구마모토성, 온천 김, 렌터카를 그린 일러스트" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3d6"/><stop offset="1" stop-color="#fff4e4"/></linearGradient></defs><rect width="480" height="330" fill="url(#sk)"/><circle cx="380" cy="78" r="34" fill="#ffd9a8" opacity=".9"/><path d="M0 200 Q60 170 120 188 T250 176 T380 190 T480 170 V330 H0Z" fill="#e8c9d2"/><path d="M40 205 L90 150 L120 175 L165 120 L195 150 L240 95 L262 120 L290 135 L330 118 L372 160 L420 148 L480 195 V330 H40Z" fill="#c98b9f"/><path d="M165 120 L240 95 L262 120" fill="none" stroke="#fff" stroke-width="2" opacity=".5"/><path d="M243 95 q-8-18 4-30 q-6-14 8-24 q-2 14 8 20 q10 10-2 26" fill="#fff" opacity=".7"/><path d="M0 245 Q110 205 220 238 T480 224 V330 H0Z" fill="#9fcfae"/><path d="M0 285 Q140 250 280 282 T480 268 V330 H0Z" fill="#7bbf9c"/><g transform="translate(330 205)"><rect x="-4" y="38" width="96" height="18" fill="#9d8a93"/><path d="M-4 38 L-12 56 H100 L92 38Z" fill="#8a7882"/><rect x="14" y="22" width="60" height="16" fill="#fff8f0" stroke="#d9c7c9"/><path d="M6 22 L44 4 L82 22Z" fill="#5d4a57"/><rect x="26" y="-6" width="36" height="12" fill="#fff8f0" stroke="#d9c7c9"/><path d="M18 -6 L44 -22 L70 -6Z" fill="#5d4a57"/><path d="M38 -22 L44 -34 L50 -22Z" fill="#c9566e"/></g><path d="M0 312 Q150 290 330 308 T480 300 V330 H0Z" fill="#8a6f7c"/><g transform="translate(110 292)"><rect x="0" y="0" width="64" height="16" rx="7" fill="#fff"/><path d="M12 0 L22 -11 H44 L54 0Z" fill="#fff" stroke="#e3c6cc"/><circle cx="14" cy="17" r="6" fill="#4a3d45"/><circle cx="50" cy="17" r="6" fill="#4a3d45"/></g><g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"><path d="M60 270 q-6-12 2-22 q8-10 0-22"/><path d="M78 274 q-6-12 2-22 q8-10 0-22"/></g></svg>';
function renderHero() {
  const c = C.hero, end = NDAYS - 1;
  $('#hero').innerHTML = '<div class="hero-l"><h1>' + esc(C.brand) + '</h1><div class="hero-meta"><span class="hero-chip">' + C.nights + '박 ' + NDAYS + '일</span><span class="hero-chip">' + sd[0] + '.' + md(0).replace('/', '.') + '(' + wd(0) + ')~' + md(end).replace('/', '.') + '(' + wd(end) + ')</span><span class="hero-chip">' + esc(C.transportLabel) + '</span></div><p class="hero-lede">' + esc(c.lede) + '</p><div class="hero-meta"><span class="hero-chip">🛏 ' + esc(c.stay) + '</span><span class="hero-chip">' + esc(c.style) + '</span></div></div><div class="hero-art">' + HERO_SVG + '</div>';
}

/* ---------- 날씨 ---------- */
const WMO = c => c === 0 ? '맑음' : c <= 3 ? '구름' : c <= 48 ? '안개' : c <= 57 ? '이슬비' : c <= 67 ? '비' : c <= 77 ? '눈' : c <= 82 ? '소나기' : c <= 86 ? '눈 소나기' : '뇌우';
const wxPlaces = () => { const s = new Set(); T.days.forEach(d => { (d.wx || []).forEach(x => s.add(x)); placeStops(d).forEach(x => !P(x.place).nomap && s.add(x.place)); }); return Array.from(s).filter(id => P(id).lat != null); };
const WX = { data: null, ids: [], at: null, stale: false, state: 'idle', msg: '' };
function wxRange() {
  const n = tzNow(), a = ymdDiff(ymdOf(0), n.ymd), z = ymdDiff(ymdOf(NDAYS - 1), n.ymd);
  if (z < 0) return 'past'; if (a > 15) return 'future:' + a; return 'ok';
}
async function loadWeather() {
  const r = wxRange();
  if (r === 'past') { WX.state = 'past'; paintWeather(); return; }
  if (r.startsWith('future')) { WX.state = 'future'; WX.msg = r.split(':')[1]; paintWeather(); return; }
  const ids = wxPlaces(); WX.ids = ids;
  const cached = store.get('wx', null);
  if (cached && cached.ids && cached.ids.join() === ids.join() && Date.now() - cached.t < 36e5) { WX.data = cached.data; WX.at = cached.t; WX.state = 'ok'; paintWeather(); return; }
  WX.state = 'loading'; paintWeather();
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + ids.map(i => P(i).lat).join(',') + '&longitude=' + ids.map(i => P(i).lng).join(',') + '&hourly=temperature_2m,precipitation_probability,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset&timezone=' + enc(C.tz) + '&start_date=' + ymdOf(0) + '&end_date=' + ymdOf(NDAYS - 1);
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 12000);
    const res = await fetch(url, { signal: ctl.signal }); clearTimeout(to);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let j = await res.json(); if (!Array.isArray(j)) j = [j];
    if (!j[0] || !j[0].daily) throw new Error('empty');
    WX.data = j; WX.at = Date.now(); WX.state = 'ok'; WX.stale = false;
    store.set('wx', { t: WX.at, ids, data: j });
  } catch (e) {
    if (cached && cached.data) { WX.data = cached.data; WX.at = cached.t; WX.state = 'ok'; WX.stale = true; } else { WX.state = 'fail'; }
  }
  paintWeather();
}
function wxDaily(pid, di) { const k = WX.ids.indexOf(pid); if (k < 0 || !WX.data || !WX.data[k]) return null; const d = WX.data[k].daily, i = d.time.indexOf(ymdOf(di)); if (i < 0) return null; return { max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], pop: d.precipitation_probability_max[i], sun: (d.sunset[i] || '').slice(11, 16), code: d.weather_code[i] }; }
function wxHour(pid, di, t) { const k = WX.ids.indexOf(pid); if (k < 0 || !WX.data || !WX.data[k] || !t) return null; const h = WX.data[k].hourly, hh = t.slice(0, 2), i = h.time.indexOf(ymdOf(di) + 'T' + hh + ':00'); if (i < 0) return null; return { t: h.temperature_2m[i], p: h.precipitation_probability[i], w: h.wind_speed_10m[i] }; }
const wxNote = () => WX.state === 'ok' ? 'Open-Meteo · 조회 ' + new Date(WX.at).toLocaleString('ko-KR', { timeZone: C.tz, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' (JST, 약 1시간 캐시)' + (WX.stale ? ' · 이전 조회값(갱신 실패)' : '') : '';
function wxMsg() {
  return { idle: '날씨 조회 준비 중입니다.', loading: '날씨를 불러오는 중입니다. 일정은 그대로 사용할 수 있습니다.', fail: '날씨를 불러오지 못했습니다. 인터넷 연결 후 다시 시도하세요. 일정은 정상 표시됩니다.', past: '여행이 끝나 예보를 표시하지 않습니다.', future: '아직 조회할 수 없습니다. 여행이 ' + WX.msg + '일 남았고, 예보는 약 16일 전부터 조회됩니다.' }[WX.state];
}
function paintWeather() {
  $$('[data-wxd]').forEach(el => {
    const di = +el.dataset.wxd, pids = (el.dataset.wxp || '').split(',').filter(Boolean), hour = el.dataset.wxt;
    if (WX.state !== 'ok') { el.innerHTML = el.dataset.wxk === 'stop' ? '' : '<span class="muted">' + esc(wxMsg()) + '</span>'; return; }
    if (el.dataset.wxk === 'stop') { const h = wxHour(pids[0], di, hour); el.innerHTML = h ? '<span class="wxstop">' + hour.slice(0, 2) + '시 무렵 ' + Math.round(h.t) + '℃ · 강수 ' + h.p + '% · 바람 ' + Math.round(h.w) + 'km/h</span>' : ''; return; }
    el.innerHTML = pids.map(pid => { const w = wxDaily(pid, di); return w ? '<div class="wxrow"><b>' + esc(P(pid).ko.replace(/\(.*\)/, '')) + '</b><span>' + WMO(w.code) + '</span><span>최고 ' + Math.round(w.max) + '℃ / 최저 ' + Math.round(w.min) + '℃</span><span>강수확률 ' + w.pop + '%</span><span>일몰 ' + w.sun + '</span></div>' : ''; }).join('') || '<span class="muted">이 날짜의 예보 값이 없습니다.</span>';
  });
  $$('.wxnote').forEach(e => { e.textContent = WX.state === 'ok' ? wxNote() : ''; });
}

/* ---------- 지금 / 다음 ---------- */
function buildEvents() {
  const ev = [];
  T.days.forEach((d, di) => d.stops.forEach(s => { const a = s.t && mins(s.t[0]); if (a == null) return; const b = s.t[1] ? mins(s.t[1]) : null; ev.push({ di, s, start: di * 1440 + a, end: b != null ? di * 1440 + b : null }); }));
  return ev.sort((x, y) => x.start - y.start);
}
const evName = e => e.s.place ? P(e.s.place).ko + (e.s.title && e.s.kind !== 'stay' && e.s.kind !== 'view' ? ' · ' + e.s.title : '') : e.s.title;
function nnCard(cls, h, e, extra) { return '<div class="nn ' + cls + '"><h4>' + h + '</h4>' + (e ? '<div class="tt">' + esc(e.s.title || evName(e)) + '</div><div class="small">' + (e.s.place ? esc(P(e.s.place).ko) + ' · ' : '') + dl(e.di) + ' ' + esc(range(e.s)) + '</div>' : '<div class="muted">없음</div>') + (extra || '') + '</div>'; }
function paintNN() {
  const el = $('#nn'); if (!el) return;
  const n = tzNow(), ev = buildEvents(), diff = ymdDiff(n.ymd, ymdOf(0));
  let stat = '', cur = null, nxt = null, note = '';
  if (diff < 0) { stat = '여행 전'; nxt = ev[0]; note = '<div class="muted small">출발 전입니다. 첫 일정을 보여줍니다.</div>'; }
  else if (diff >= NDAYS) { stat = '여행 후'; }
  else {
    stat = '여행 중'; const abs = diff * 1440 + n.min;
    cur = ev.find(e => e.end != null && e.start <= abs && abs < e.end) || null;
    nxt = ev.find(e => e.start > abs && e !== cur) || null;
    if (!cur) { const last = ev.filter(e => e.start <= abs).pop(); if (last && last.end == null && last.di === diff) note = '<div class="muted small">마지막으로 시작한 일정: ' + esc(last.s.title) + '(' + last.s.t[0] + '). 종료 시각이 없어 진행 중으로 표시하지 않습니다.</div>'; if (!nxt) stat = '여행 종료'; }
  }
  const dd = diff < 0 ? 'D-' + (-diff) : diff < NDAYS ? (diff + 1) + '일차' : '종료';
  let html = '<div class="status"><span class="dday">' + dd + '</span><span class="tag ' + (stat === '여행 중' ? 't-must' : 't-plan') + '">' + stat + '</span><span class="muted small">' + (n.sim ? '시뮬레이션 시각 ' : '여행지(JST) 현재 ') + n.ymd + ' ' + String(Math.floor(n.min / 60)).padStart(2, '0') + ':' + String(n.min % 60).padStart(2, '0') + '</span></div>';
  html += '<div class="callout info small" style="margin:10px 0">GPS가 아니라 <b>계획 시간표 기준</b>의 “시간표상 지금 / 다음”입니다. 실제 위치와 다를 수 있습니다.</div>';
  html += '<div class="nownext">' + nnCard('now', '시간표상 지금', cur) + nnCard('', '시간표상 다음', nxt) + '</div>' + note;
  el.innerHTML = html;
}

/* ---------- 오늘의 화면: 한눈에 ---------- */
function routeToggle() { return '<div class="chips no-print" role="group" aria-label="경로 선택"><button type="button" class="chip' + (route === 'hwy' ? ' active' : '') + '" data-route="hwy">고속도로 이용</button><button type="button" class="chip' + (route === 'gen' ? ' active' : '') + '" data-route="gen">일반도로 위주</button></div>'; }
function budgetHtml() {
  const rate = store.get('rate', C.jpyKrwDefault), extra = store.get('extra', 0);
  return '<div id="budget"><div class="tscroll"><table class="t"><tbody><tr><th>항목</th><th>금액</th><th>원화</th></tr>'
    + '<tr><td>항공 ZE967·ZE968 (4인 합계로 가정)</td><td>₩887,261</td><td data-k="a">887,261원</td></tr>'
    + '<tr><td>렌터카 22,550엔</td><td>¥22,550</td><td data-k="r"></td></tr>'
    + '<tr><td>료칸 1박 117,800엔</td><td>¥117,800</td><td data-k="y"></td></tr>'
    + '<tr><td>칸데오 호텔 2실 1박</td><td>₩249,514</td><td data-k="c">249,514원</td></tr>'
    + '<tr><td>구마모토성 입장료 800엔×4 (공지 기준, 확인 필요)</td><td>¥3,200</td><td data-k="e"></td></tr>'
    + '<tr><td><b>소계(예약·확인된 항목)</b></td><td></td><td><b data-k="s"></b></td></tr></tbody></table></div>'
    + '<p class="small" style="margin-top:10px"><label>가정 환율 1엔 = <input class="numin" type="number" step="0.1" min="1" id="rate" value="' + rate + '"> 원</label></p>'
    + '<p class="small"><label>그 밖의 현지 비용(식비·유류·톨·주차 등, 직접 입력) <input class="numin" style="width:9em" type="number" step="10000" min="0" id="extra" value="' + extra + '"> 원</label></p>'
    + '<p><b>예상 총액(4인 전체): <span data-k="t"></span></b></p><p class="muted small">식당 1인 예산·유류·톨·주차는 조사하지 못해 합계에 넣지 않았습니다. 환율은 가정값입니다.</p></div>';
}
function calcBudget(save) {
  const b = $('#budget'); if (!b) return;
  const rate = +$('#rate').value || C.jpyKrwDefault, ex = +$('#extra').value || 0;
  if (save) { store.set('rate', rate); store.set('extra', ex); }
  const f = n => Math.round(n).toLocaleString('ko-KR') + '원';
  const r = 22550 * rate, y = 117800 * rate, e = 3200 * rate, s = 887261 + 249514 + r + y + e;
  const set = (k, v) => { const x = $('[data-k=' + k + ']', b); if (x) x.textContent = v; };
  set('r', f(r)); set('y', f(y)); set('e', f(e)); set('s', f(s)); set('t', f(s + ex));
}
function renderHome() {
  const daysCards = T.days.map((d, i) => {
    const key = placeStops(d).filter(s => s.level === 'must' && !P(s.place).nomap).map(s => P(s.place).ko.replace(/\(.*\)/, '')).filter((x, k, a) => a.indexOf(x) === k).slice(0, 3).join(' · ');
    return '<a class="daycard" style="--dc:' + dc(i) + '" href="#/day/' + (i + 1) + '"><span class="dn">' + (i + 1) + '일차 · ' + dl(i) + '</span><h4>' + esc(d.title) + '</h4><div class="small"><b>핵심</b> ' + esc(key) + '</div><p class="small" style="margin-top:4px">' + esc(d.theme) + '</p><p class="small muted" style="margin-top:4px">이동·주차 배정 합계 ' + fmtMin(driveMin(i)) + ' · 경로 ' + routeLabel() + '</p><div data-wxd="' + i + '" data-wxp="' + esc((d.wx || [])[0] || '') + '"></div></a>';
  }).join('');
  const flow = ['김해공항', '아소 구마모토 공항', '렌터카', '아소 외륜산', '료칸(구로카와·오다)', '아소 북·남쪽 전망', '구마모토 시내 호텔', '구마모토성', '공항·김해'].map(x => '<span class="n">' + x + '</span>').join('<span class="a">→</span>');
  const mustPl = [['yamasaki', '♨', '독채 노천온천 료칸', '객실에 딸린 노천탕과 가이세키 석식. 1일차 저녁의 중심입니다.'], ['daikanbo', '⛰', '대관봉 360도 파노라마', '아소 칼데라를 한눈에 보는 드라이브 하이라이트입니다.'], ['kusasenri', '🌿', '쿠사센리 초원 산책', '평지 위주로 걷는 화산 초원입니다.'], ['castle', '🏯', '구마모토성 천수각', '귀국 전 오전에 보는 구마모토의 상징입니다.']].map(h => '<div class="hl"><span class="ic" aria-hidden="true">' + h[1] + '</span><b>' + h[2] + '</b><span class="small">' + h[3] + '</span><span class="btns">' + ext(mapUrl(P(h[0])), '지도') + '</span></div>').join('');
  const sumRows = T.days.map((d, i) => '<tr><td>' + (i + 1) + '일차 ' + dl(i) + '</td><td>' + fmtMin(driveMin(i)) + '</td><td>미조회</td><td>' + esc(d.buffer || '') + '</td></tr>').join('');
  return '<div class="card" id="nn"></div>'
    + '<div class="card"><h3 class="ct">전체 이동 순서</h3><div class="flow">' + flow + '</div><div class="btns" style="margin-top:12px">' + ext(dayDirUrl(0), '1일차 전체 경로 열기') + '<a class="btn pri" href="#/map">여행 지도 바로가기</a></div></div>'
    + '<div class="card"><h3 class="ct">경로 선택</h3>' + routeToggle() + '<p class="muted small">선택한 경로는 요약·날짜 카드·구간 안내·지도·길찾기 링크에 함께 반영됩니다. 경로별 시간·거리 비교값은 조회하지 못해 표시하지 않습니다.</p></div>'
    + '<h2 class="vt">날짜별 요약</h2><div class="grid3 stack" style="margin-bottom:14px">' + daysCards + '</div>'
    + '<div class="card"><h3 class="ct">전체 이동 거리·시간 요약</h3><div class="tscroll"><table class="t"><tr><th>날짜</th><th>배정 이동·주차 시간</th><th>거리(조회값)</th><th>확보한 여유</th></tr>' + sumRows + '</table></div><p class="muted small" style="margin-top:8px">시간은 일정표에 배정한 값(주차·도보·대기 포함)이며 지도 조회값이 아닙니다. 거리는 조회하지 못했습니다. 정확한 값은 각 구간의 길찾기 링크에서 확인하세요.</p></div>'
    + '<div class="card"><h3 class="ct">여행 날짜별 날씨</h3>' + T.days.map((d, i) => '<div style="margin:8px 0"><b style="color:' + dc(i) + '">' + (i + 1) + '일차 ' + dl(i) + '</b><div data-wxd="' + i + '" data-wxp="' + esc((d.wx || []).join(',')) + '"></div></div>').join('') + '<p class="muted small wxnote"></p><button type="button" class="btn no-print" data-act="wx">날씨 다시 불러오기</button></div>'
    + '<h2 class="vt">이번 여행의 핵심 장소</h2><div class="grid2 stack" style="margin-bottom:14px">' + mustPl + '</div>'
    + '<details class="fold"><summary>예약 정보와 계획에 적용한 가정</summary><div class="fb">'
    + '<h3 class="ct">예약 정보(개인정보·예약번호 제외)</h3><ul class="small stack"><li><span class="tag s-ok">예약 확정</span> 항공 ZE967 12/7 11:55 김해 → 13:25 아소 구마모토 / ZE968 12/9 14:30 구마모토 → 15:55 김해. 인당 기내 수하물 10kg 1개</li><li><span class="tag s-ok">예약 확정</span> 렌터카 프리우스 12/7 14:00 ~ 12/9 14:00, 토요타렌터리스 구마모토공항점 인수·반납, ETC·내비 포함</li><li><span class="tag s-ok">예약 확정</span> 離れ宿 山咲 12/7~8 1박, 석식 가이세키·조식 포함</li><li><span class="tag s-ok">예약 확정</span> CANDEO HOTELS Kumamoto Shinshigai 12/8~9 1박, 트윈 2실, 조식 불포함</li></ul>'
    + '<h3 class="ct" style="margin-top:12px">예상 비용(원화)</h3>' + budgetHtml()
    + '<h3 class="ct" style="margin-top:12px">적용한 가정</h3><ul class="small stack">' + T.assumptions.map(a => '<li>• ' + esc(a) + '</li>').join('') + '</ul></div></details>';
}

/* ---------- 날짜별 일정 ---------- */
function foodCard(id, compact) {
  const f = T.foods[id], p = P(f.place), first = f.rank === '1순위';
  return '<div class="' + (compact ? 'mo' + (first ? ' first' : '') : 'card fcard') + '"><div><span class="tag ' + (f.meal === '2차' ? 't-ext' : 't-plan') + '">' + f.meal + '</span><span class="tag ' + (first ? 't-must' : 't-ext') + '">' + esc(f.rank) + '</span><span class="tag s-chk">영업·예산 확인 필요</span></div>'
    + '<div class="nm"><b>' + esc(p.ko) + '</b>' + jaBtn(p.ja, p.pr, p.ko) + '<span class="pr">' + esc(p.pr) + '</span></div>'
    + '<p class="why"><b>' + esc(f.menu) + '</b> — ' + esc(f.why) + '</p>'
    + '<dl class="kv"><dt>지역</dt><dd>' + esc(p.area) + '</dd><dt>1인 예산</dt><dd>' + esc(f.price || '확인 필요(미조사)') + '</dd><dt>영업시간</dt><dd>' + esc(f.hours || '확인 필요(구글 지도·공식 안내로 확인)') + '</dd><dt>휴무</dt><dd>' + esc(f.closed || '확인 필요') + '</dd><dt>접근</dt><dd>' + esc(f.access) + '</dd>' + (f.wait ? '<dt>대기</dt><dd>' + esc(f.wait) + '</dd>' : '') + (f.phone ? '<dt>전화</dt><dd><a href="tel:+81' + f.phone.replace(/^0/, '').replace(/-/g, '') + '">' + esc(f.phone) + '</a> <span class="muted small">(' + esc(f.phoneSrc) + ')</span></dd>' : '') + '</dl>'
    + '<div class="btns" style="margin-top:8px">' + ext(mapUrl(p), '지도') + ext(searchUrl(p), '공식 안내 찾기') + copyBtn(p.ja) + '</div></div>';
}
function stopHtml(di, s, prevPlaceStop) {
  const d = T.days[di];
  if (s.meal) {
    const opts = mealOptions(di, s), incl = s.meal.startsWith('incl');
    let h = '<article class="stop meal' + (incl ? ' incl' : '') + '" id="' + s.id + '"><div class="tm">' + (s.t && s.t[0] ? esc(range(s)) : '시각 미정') + '</div><h4>' + (incl ? '<span class="tag t-incl">숙소 포함 식사</span>' : '<span class="tag t-plan">식사 계획</span>') + esc(s.title) + '</h4><p class="why">' + esc(s.why) + '</p>' + (s.note ? '<p class="small muted">' + esc(s.note) + '</p>' : '');
    if (opts.length) {
      const main = opts.filter(id => T.foods[id].rank !== '예비'), back = opts.filter(id => T.foods[id].rank === '예비');
      h += '<div class="mealopts">' + main.map(id => foodCard(id, true)).join('') + '</div>';
      if (back.length) h += '<details class="fold" style="margin-top:8px"><summary>예비 후보 ' + back.length + '곳</summary><div class="fb mealopts">' + back.map(id => foodCard(id, true)).join('') + '</div></details>';
    }
    return h + '</article>';
  }
  const p = P(s.place), must = s.level === 'must';
  const booked = s.status === 'ok' && ['flight', 'car', 'stay'].includes(s.kind);
  const off = s.official && p.official ? ext(p.official.url, p.official.label) : (p.official && !s.official ? ext(p.official.url, p.official.label) : '');
  return '<article class="stop' + (must ? ' must' : '') + '" id="' + s.id + '"><div class="tm">' + esc(range(s)) + '</div>'
    + '<div><span class="tag ' + (must ? 't-must' : 't-plan') + '">' + (must ? '필수' : '계획') + '</span>' + (booked ? '<span class="tag t-incl">예약 확정</span>' : '') + (s.status ? sTag(s.status) : '') + '</div>'
    + '<h4>' + esc(s.title) + '</h4>'
    + '<div class="nm"><b>' + esc(p.ko) + '</b>' + (p.nomap && !p.ja ? '' : jaBtn(p.ja, p.pr, p.ko)) + '<span class="pr">' + esc(p.pr) + '</span></div>'
    + '<p class="why">' + esc(s.why) + '</p>'
    + '<dl class="kv"><dt>할 일</dt><dd>' + esc(s.todo || '') + '</dd><dt>체류</dt><dd>' + esc(s.stay || '') + '</dd><dt>예산</dt><dd>' + esc(s.cost || '') + '</dd>' + (s.access ? '<dt>접근</dt><dd>' + esc(s.access) + '</dd>' : '') + (p.addr ? '<dt>주소</dt><dd>' + esc(p.addr) + '</dd>' : '') + (p.note ? '<dt>참고</dt><dd>' + esc(p.note) + '</dd>' : '') + '</dl>'
    + (s.backup ? '<p class="small" style="margin-top:6px">🔁 ' + esc(s.backup) + '</p>' : '')
    + (p.approx ? '<p class="muted small">지도 핀은 근사 위치입니다. 길찾기는 장소 ID 기준입니다.</p>' : '')
    + '<span data-wxk="stop" data-wxd="' + di + '" data-wxp="' + s.place + '" data-wxt="' + esc((s.t && s.t[0]) || '') + '"></span>'
    + '<div class="btns" style="margin-top:8px">' + ext(mapUrl(p), '지도') + copyBtn(p.ja) + off + (s.live ? ext(s.live.url, '라이브캠 확인') : '') + '</div>'
    + (s.live ? '<p class="muted small">' + esc(s.live.label) + '</p>' : '') + '</article>';
}
function legHtml(di, l) {
  const a = l.a, b = l.b;
  let mode = '🚗 차 이동', link = '', t = '배정 ' + fmtMin(l.gap);
  if (l.flight && a.kind === 'flight') return '<div class="leg"><span>🚐 입국 수속·렌터카 셔틀 · 배정 ' + fmtMin(l.gap) + '</span></div>';
  if (l.flight) return '<div class="leg"><span>🚶 공항 수속·대기 · 배정 ' + fmtMin(l.gap) + '</span></div>';
  const pa = a.place && P(a.place), pb = b.place && P(b.place);
  if (a.meal && b.meal) return '';
  if (a.meal) { if (b.place) link = ext(dirUrl(null, b.place), '현재 위치에서 길찾기'); mode = '🚗 식당에서 다음 장소로'; }
  else if (b.meal) { const opts = mealOptions(di, b); if (opts.length) link = ext(dirUrl(a.place, T.foods[opts[0]].place), '1순위 식당 길찾기'); mode = '🚗 식당 후보 지역으로'; if (b.meal.startsWith('incl')) return ''; }
  else if (pa && pb && (pa.near === b.place || pb.near === a.place)) { mode = '🚶 도보'; link = ext(dirUrl(a.place, b.place, null, 'walking'), '도보 길찾기'); }
  else if (a.place === b.place) { mode = '🅿 같은 장소(주차·정리)'; }
  else if (pa && pb) link = ext(dirUrl(a.place, b.place), '길찾기');
  const warn = route === 'gen' && mode.startsWith('🚗') ? '<span class="small" style="color:var(--warn)">일반도로 위주: 시간이 늘 수 있음(비교값 없음)</span>' : '';
  return '<div class="leg"><span>' + mode + ' · ' + t + (b.leg ? ' (' + esc(b.leg) + ')' : '') + ' · ' + routeLabel() + '</span>' + link + warn + '</div>';
}
function renderDay(di) {
  const d = T.days[di], col = dc(di);
  const lg = {}; legs(di).forEach(l => lg[l.i] = l);
  let tl = '';
  d.stops.forEach((s, i) => { if (lg[i]) tl += legHtml(di, lg[i]); tl += stopHtml(di, s); });
  const lastStay = d.stay ? d.stay : null, dest = lastStay ? T.stays[lastStay].place : 'airport';
  const ex = (d.extras || []).map(x => { const p = P(x.place); return '<div class="stop" style="margin:8px 0"><span class="tag t-opt">선택</span><span class="tag s-est">계획상 추정</span><div class="nm"><b>' + esc(p.ko) + '</b>' + jaBtn(p.ja, p.pr, p.ko) + '<span class="pr">' + esc(p.pr) + '</span></div><p class="why">' + esc(x.why) + '</p><dl class="kv"><dt>시간대</dt><dd>' + esc(x.window) + '</dd><dt>추가 이동</dt><dd>' + esc(x.extraMove) + '</dd><dt>체류</dt><dd>' + esc(x.stayMin) + '</dd><dt>주의</dt><dd>' + esc(x.note) + '</dd></dl><div class="btns" style="margin-top:8px">' + ext(mapUrl(p), '지도') + copyBtn(p.ja) + '</div></div>'; }).join('');
  const st = d.stay ? T.stays[d.stay] : null;
  const stayCard = st ? '<div class="card"><h3 class="ct">오늘 숙소</h3><div class="nm"><b>' + esc(P(st.place).ko) + '</b>' + jaBtn(P(st.place).ja, P(st.place).pr, P(st.place).ko) + '</div><p class="small">체크인 ' + st.checkIn + ' / 체크아웃 ' + st.checkOut + ' · ' + esc(st.meals) + '</p><div class="btns" style="margin-top:8px">' + ext(dirUrl(null, st.place), '숙소 길찾기') + '<a class="btn" href="#/stay">숙소 상세</a></div></div>' : '<div class="card"><h3 class="ct">귀국 일정 역산</h3><ul class="small stack">' + T.transit.returnPlan.map(r => '<li><b>' + esc(r.t) + '</b> ' + esc(r.a) + '</li>').join('') + '</ul></div>';
  const prev = di > 0 ? '<a class="btn" href="#/day/' + di + '">← ' + di + '일차 ' + dl(di - 1) + '</a>' : '<a class="btn" href="#/">← 한눈에</a>';
  const next = di < NDAYS - 1 ? '<a class="btn pri" href="#/day/' + (di + 2) + '">' + (di + 2) + '일차 ' + dl(di + 1) + ' →</a>' : '<a class="btn pri" href="#/prep">출발 준비 →</a>';
  return '<div class="dayhead" style="--dc:' + col + '"><span class="dn">' + (di + 1) + '일차 · ' + dl(di) + '</span><h2>' + esc(d.title) + '</h2></div>'
    + '<div class="card"><p>' + esc(d.route) + '</p><p class="small muted" style="margin-top:6px">' + esc(d.mode) + '</p>'
    + '<div class="btns" style="margin:12px 0"><a class="btn pri" href="' + esc(dayDirUrl(di)) + '" target="_blank" rel="noopener noreferrer">오늘 전체 경로(지도)</a><a class="btn" href="#/map/' + (di + 1) + '">오늘 지도 핀 보기</a><a class="btn" href="#/food/' + (di + 1) + '">식당 후보</a>' + ext(dirUrl(null, dest), lastStay ? '숙소 길찾기' : '공항 길찾기') + '</div>'
    + '<div class="facts"><div class="fact"><b>이동·주차 배정 합계</b><span>' + fmtMin(driveMin(di)) + '</span></div><div class="fact"><b>이동 거리</b><span>미조회</span></div><div class="fact"><b>선택한 경로</b><span>' + routeLabel() + '</span></div></div><p class="small" style="margin-top:8px">⏱ <b>확보한 여유</b> ' + esc(d.buffer || '') + '</p>'
    + (route === 'gen' ? '<div class="callout" style="margin-top:8px">일반도로 위주를 선택했습니다. ' + esc(d.genWarn || '') + '</div>' : '') + routeToggle()
    + (d.notes || []).map(n => '<div class="callout info small" style="margin-top:8px">' + esc(n) + '</div>').join('') + '</div>'
    + '<div class="card"><h3 class="ct">날씨 요약</h3><div data-wxd="' + di + '" data-wxp="' + esc((d.wx || []).join(',')) + '"></div><p class="muted small wxnote"></p></div>'
    + '<h3 class="ct" style="margin-top:16px">시간순 일정</h3><div class="timeline">' + tl + '</div>'
    + '<div class="card"><h3 class="ct">날씨·컨디션이 달라졌을 때</h3><ul class="stack small">' + d.alts.map(a => '<li><b>' + esc(a.c) + '</b><br>' + esc(a.t) + '</li>').join('') + '</ul></div>'
    + (ex ? '<details class="opt-block" style="margin-top:14px"><summary>동선 위에서 더 들를 곳 (선택 ' + d.extras.length + ')</summary><div style="padding-bottom:12px"><p class="small muted">기본 일정과 경로에는 넣지 않았습니다. 추가하면 아래 시간이 더 필요합니다.</p>' + ex + '</div></details>' : '')
    + '<div style="margin-top:14px">' + stayCard + '</div><div class="daynav">' + prev + next + '</div>';
}

/* ---------- 지도 (Google 지도 임베드, API 키 불필요) ---------- */
let mapDay = 0, mapOpt = false, mapLocked = true, mapSel = null, mapSrc = '';
const mapSeq = di => placeStops(T.days[di]).filter(s => !P(s.place).nomap);
const mapDayList = di => di === 0 ? T.days.map((_, i) => i) : [di - 1];
const gq = id => { const p = P(id); return enc(p.q || p.addr || p.ja); };
function embedUrl() {
  const base = 'https://www.google.com/maps?output=embed&hl=ko';
  if (mapSel) return base + '&z=15&q=' + gq(mapSel);
  if (mapDay === 0) return base + '&z=9&q=' + enc('熊本県 阿蘇');
  const r0 = dayRoute(mapDay - 1), r = r0.filter((id, i) => !(P(id).near && (r0[i - 1] === P(id).near || r0[i + 1] === P(id).near)));
  if (r.length < 2) return base + '&z=14&q=' + gq(r[0]);
  return base + '&saddr=' + gq(r[0]) + '&daddr=' + r.slice(1).map(gq).join('+to:') + (route === 'gen' ? '&dirflg=h' : '');
}
function renderMapShell() {
  const chips = '<a class="chip" data-mf="0" href="#/map">전체</a>' + T.days.map((d, i) => '<a class="chip" data-mf="' + (i + 1) + '" href="#/map/' + (i + 1) + '" style="border-left:5px solid ' + dc(i) + '">' + (i + 1) + '일차 ' + dl(i) + '</a>').join('');
  return '<h2 class="vt">여행 지도</h2><div class="chips" id="mapchips">' + chips + '</div>'
    + '<div class="btns mapctl" style="margin-bottom:10px"><button type="button" class="btn" id="mlock">지도 조작 켜기</button><button type="button" class="btn" id="mfit">전체 맞춤</button><button type="button" class="btn" id="mopt">선택·추가 명소 표시</button>' + '</div>'
    + '<div class="mapwrap"><div id="mapbox" aria-label="Google 지도"></div><div id="maplock" class="maplock"><span>지도 조작이 잠겨 있습니다. 스크롤은 그대로 됩니다.</span></div></div>'
    + '<div id="mapinfo" class="card" style="margin-top:10px;display:none"></div>'
    + '<div class="legend"><span>숫자: 아래 목록의 방문 순서</span><span>도보: 도보로 둘러보는 곳</span><span>선택: 선택·추가 명소와 식당 후보</span></div>'
    + '<p class="muted small">지도는 Google 지도를 그대로 보여 주며, 날짜를 고르면 그날 방문 순서대로 이은 <b>Google의 실제 도로 경로</b>가 표시됩니다(선택한 경로: <span id="mroute"></span>). 숫자 핀은 Google 임베드에서 지원하지 않아 목록 번호로 대신합니다. 바로 옆 도보 이동 장소(요코바치·로마이·조사이엔)는 경로선에서 빼고 목록에서 위치를 확인하세요. 장소를 누르면 그 위치로 지도가 바뀝니다. 지도는 인터넷이 필요합니다.</p>'
    + '<div id="maplist"></div>';
}
function mapInfo(di, k) {
  const s = mapSeq(di)[k], p = P(s.place), prev = mapSeq(di)[k - 1];
  return '<b>' + (di + 1) + '일차 ' + (k + 1) + '번 · ' + esc(p.ko) + '</b> ' + jaBtn(p.ja, p.pr, p.ko) + '<div class="small muted">' + esc(range(s)) + (p.walk ? ' · 도보 관람' : '') + '</div><div class="btns" style="margin-top:8px">' + ext(mapUrl(p), '지도 앱에서 열기') + ext(dirUrl(prev ? prev.place : null, s.place), '길찾기') + '<button type="button" class="btn" data-act="mapback">날짜 경로로 돌아가기</button></div>';
}
function setMapFrame() {
  const box = $('#mapbox'); if (!box) return;
  const url = embedUrl();
  if (url === mapSrc && box.firstChild) return;
  mapSrc = url;
  if (!navigator.onLine) { box.innerHTML = '<div class="callout bad" style="margin:12px">인터넷에 연결되어 있지 않아 지도를 표시할 수 없습니다. 아래 방문 순서 목록은 그대로 볼 수 있고, 연결되면 지도가 표시됩니다.</div>'; mapSrc = ''; return; }
  box.innerHTML = '<iframe title="Google 지도" src="' + esc(url) + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>';
}
function drawMap() {
  const list = $('#maplist'); if (!list) return;
  $$('#mapchips .chip').forEach(c => c.classList.toggle('active', +c.dataset.mf === mapDay));
  const mr = $('#mroute'); if (mr) mr.textContent = routeLabel();
  let html = '';
  mapDayList(mapDay).forEach(di => {
    const seq = mapSeq(di);
    html += '<h3 class="ct" style="margin-top:14px;color:' + dc(di) + '">' + (di + 1) + '일차 방문 순서 <span class="muted small">(' + routeLabel() + ')</span></h3><ol class="olist card" style="--pc:' + dc(di) + '">';
    seq.forEach((s, k) => { const p = P(s.place); html += '<li><span class="num" style="--pc:' + dc(di) + '">' + (k + 1) + '</span><button type="button" class="row" data-pin="' + di + '-' + k + '"><b>' + esc(p.ko) + '</b> <span class="jp small" lang="ja">' + esc(p.ja) + '</span><br><span class="small muted">' + esc(range(s)) + (p.walk ? ' · 도보 관람' : '') + '</span></button>' + ext(mapUrl(p), '지도') + '</li>'; });
    html += '</ol>';
    if (mapOpt) {
      const ex = [];
      (T.days[di].extras || []).forEach(x => ex.push({ id: x.place, label: '선택 · ' + x.window }));
      Object.keys(T.foods).filter(id => T.foods[id].day === di + 1).forEach(id => { const f = T.foods[id]; if (!seq.some(s => s.place === f.place)) ex.push({ id: f.place, label: f.meal + ' ' + f.rank }); });
      if (ex.length) html += '<div class="card" style="margin-top:8px"><b>선택·추가 명소와 식당 후보</b><ul>' + ex.map(x => '<li style="display:flex;gap:8px;align-items:center;padding:6px 0"><span class="tag t-opt">선택</span><button type="button" class="row tap" style="flex:1;min-height:44px" data-pickp="' + x.id + '"><b>' + esc(P(x.id).ko) + '</b><br><span class="small muted">' + esc(x.label) + '</span></button>' + ext(mapUrl(P(x.id)), '지도') + '</li>').join('') + '</ul></div>';
    }
  });
  list.innerHTML = html;
  const inf = $('#mapinfo');
  if (!mapSel) { inf.style.display = 'none'; }
  setMapFrame();
}
function showPin(di, k) {
  const s = mapSeq(di)[k]; mapSel = s.place;
  const inf = $('#mapinfo'); inf.innerHTML = mapInfo(di, k); inf.style.display = 'block';
  setMapFrame(); $('#mapbox').scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function setLock(lock) { mapLocked = lock; const b = $('#mlock'); if (b) { b.textContent = lock ? '지도 조작 켜기' : '지도 조작 끄기'; b.classList.toggle('on', !lock); } const l = $('#maplock'); if (l) l.style.display = lock ? '' : 'none'; }

/* ---------- 식당 / 현지어 / 숙소 / 교통 / 준비 ---------- */
function renderFood() {
  return '<h2 class="vt">식당 후보</h2><p class="muted small">식당 후보이며 예약은 확정된 것이 없습니다. 영업시간·휴무·예산은 확인하지 못해 방문 전 확인이 필요합니다. 숙소 포함 식사(1일차 석식·2일차 조식)는 목록에서 제외했습니다.</p><div class="chips" id="foodchips"><a class="chip" data-ff="0" href="#/food">전체</a>' + T.days.map((d, i) => '<a class="chip" data-ff="' + (i + 1) + '" href="#/food/' + (i + 1) + '">' + (i + 1) + '일차 ' + dl(i) + '</a>').join('') + '</div><div id="foodlist" class="grid2"></div>';
}
function drawFood(day) {
  $$('#foodchips .chip').forEach(c => c.classList.toggle('active', +c.dataset.ff === day));
  const ids = Object.keys(T.foods).filter(id => !day || T.foods[id].day === day);
  $('#foodlist').innerHTML = ids.length ? ids.map(id => foodCard(id)).join('') : '<div class="card">이 날은 외부 식당 후보가 없습니다(숙소 포함 식사, 이동 또는 미정).</div>';
}
let talkCat = '전체';
function renderTalk() {
  const cats = ['전체'].concat(Array.from(new Set(T.phrases.map(p => p.c))));
  return '<h2 class="vt">현지어 한마디</h2><p class="muted small">문장을 누르면 발음·뜻·듣기·복사·크게 보여주기 창이 열립니다. 음성은 기기의 일본어 음성 합성을 사용하며, 파일을 미리 저장하지 않아 오프라인에서는 소리가 나지 않을 수 있습니다. 발음과 크게 보여주기는 오프라인에서도 됩니다.</p><div class="chips" id="talkchips">' + cats.map(c => '<button type="button" class="chip" data-tc="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div><div id="talklist" class="grid2"></div>';
}
function drawTalk() {
  $$('#talkchips .chip').forEach(c => c.classList.toggle('active', c.dataset.tc === talkCat));
  $('#talklist').innerHTML = T.phrases.map((p, i) => ({ p, i })).filter(x => talkCat === '전체' || x.p.c === talkCat).map(({ p, i }) => '<div class="card phrase"><span class="tag t-ext" style="align-self:flex-start">' + esc(p.c) + '</span><div>' + esc(p.ko) + '</div><button type="button" class="tap jp ja" lang="ja" data-ja="' + esc(p.ja) + '" data-pr="' + esc(p.pr) + '" data-ko="' + esc(p.ko) + '">' + esc(p.ja) + '</button><div class="pr">' + esc(p.pr) + '</div><div class="btns"><button type="button" class="btn say-btn" data-say="' + i + '">▶ 듣기</button><button type="button" class="btn say-btn" data-say="' + i + '" data-slow="1">🐢 천천히</button>' + copyBtn(p.ja, '복사') + '<button type="button" class="btn" data-big="' + i + '">크게 보여주기</button></div></div>').join('');
}
function renderStay() {
  const cards = Object.keys(T.stays).map(id => {
    const s = T.stays[id], p = P(s.place), ni = T.days.findIndex(d => d.stay === id);
    return '<div class="card"><span class="tag t-incl">예약 확정</span><span class="tag s-ok">' + s.nights + '박</span><div class="nm"><b style="font-size:1.1rem">' + esc(p.ko) + '</b>' + jaBtn(p.ja, p.pr, p.ko) + '<span class="pr">' + esc(p.pr) + '</span></div>'
      + '<dl class="kv"><dt>숙박</dt><dd>' + dl(ni) + ' ~ ' + dl(ni + 1) + ' (' + s.nights + '박)</dd><dt>체크인</dt><dd>' + s.checkIn + ' 이후 <span class="muted small">(예약 사이트 게재값)</span></dd><dt>체크아웃</dt><dd>' + s.checkOut + '</dd><dt>객실</dt><dd>' + esc(s.room) + '</dd><dt>식사</dt><dd>' + esc(s.meals) + '</dd><dt>요금</dt><dd>' + esc(s.price) + '</dd><dt>주소</dt><dd class="jp" lang="ja">' + esc(s.address) + '<br><span class="muted small ko">' + esc(s.addressNote) + '</span></dd><dt>접근</dt><dd>' + esc(s.access) + '</dd><dt>전화</dt><dd>확인 필요(예약 확인 메일·예약 사이트 확인)</dd></dl>'
      + '<p class="small" style="margin-top:6px">💡 ' + esc(s.tip) + '</p><div class="btns" style="margin-top:10px">' + ext(dirUrl(null, s.place), '길찾기') + ext(mapUrl(p), '지도') + copyBtn(s.address, '주소 복사') + ext(s.official.url, s.official.label) + '</div></div>';
  }).join('');
  const rows = T.days.map((d, i) => {
    const m = [['아침', '', ''], ['점심', '', ''], ['저녁', '', '']];
    return { i, d };
  });
  const MEALS = [
    ['개인(출발 전 공항 이동 중)', '간이 요기(미정) — 입국 후 공항·마트', '가이세키 석식', '숙소 포함'],
    ['일본 가정식 조식', '아소 점심 후보 택 1', '구마모토 시내 후보 택 1(+2차 선택)', '조식만 숙소 포함'],
    ['킷사텐 조식 후보(호텔 조식 불포함)', '공항 식당가(미정)', '귀국 후', '외부 식사']
  ];
  const kind = ['', '', ''];
  const meal = '<div class="card"><h3 class="ct">날짜별 식사 계획</h3><div class="tscroll"><table class="t mealgrid"><tr><th>날짜</th><th>아침</th><th>점심</th><th>저녁</th></tr>'
    + '<tr><td class="k">1일차 ' + dl(0) + '</td><td><span class="tag s-chk">개인</span>출발 전 개별 해결</td><td><span class="tag t-plan">외부</span>김해국제공항에서 해결(탑승 전)</td><td><span class="tag t-incl">숙소 포함</span>가이세키 석식</td></tr>'
    + '<tr><td class="k">2일차 ' + dl(1) + '</td><td><span class="tag t-incl">숙소 포함</span>일본 가정식 조식</td><td><span class="tag t-plan">외부 후보</span>이마킨 식당 / 요카요카테이</td><td><span class="tag t-plan">외부 후보</span>카츠레츠테이 / 무쓰고로<br><span class="tag t-plan">2차</span>요코바치 20:00~22:00(예약·영업 확인 필요)</td></tr>'
    + '<tr><td class="k">3일차 ' + dl(2) + '</td><td><span class="tag t-plan">외부 후보</span>킷사토 사케 로마이(호텔 조식 불포함)</td><td><span class="tag s-chk">미정</span>공항 식당가</td><td>귀국 후</td></tr></table></div><p class="muted small">숙소 포함 식사는 외부 식당 일정과 겹치지 않게 뺐습니다.</p></div>';
  const rent = '<div class="card"><span class="tag t-incl">예약 확정</span><h3 class="ct" style="display:inline">렌터카 프리우스</h3><p class="small">12/7 14:00 인수 ~ 12/9 14:00 반납 · 토요타렌터리스 구마모토공항점 · ETC·내비 포함 · 22,550엔. 영업소 주소: ' + esc(P('rental').addr) + '(사용자 제공, 공항 건물과 별도). 전화는 예약서로 확인하세요. 반납 전 주유소: ' + esc(P('gas').addr) + '. 계획 반납은 12/9 12:00~12:20입니다.</p><div class="btns">' + ext(mapUrl(P('rental')), '영업소 검색') + ext(P('rental').official.url, '토요타렌터리스 공식') + copyBtn(P('rental').ja) + '</div></div>';
  return '<h2 class="vt">숙소·식사</h2><div class="grid2">' + cards + '</div><div style="margin-top:14px">' + meal + '</div><div style="margin-top:14px">' + rent + '</div>';
}
function renderMove() {
  const t = T.transit;
  const emg = t.emergency.map(e => '<tr><td><b>' + esc(e.n) + '</b><br><span class="small muted">' + esc(e.note) + '</span></td><td><a class="btn" href="' + e.tel + '">' + esc(e.num) + '</a><br><span class="tag ' + (e.kind === 'local' ? 's-ok' : 's-est') + '" style="margin-top:4px">' + (e.kind === 'local' ? '일본 현지번호' : '국제전화 형식') + '</span></td></tr>').join('');
  return '<h2 class="vt">교통·비상</h2>'
    + '<div class="card"><h3 class="ct">가는 길과 오는 길</h3><ul class="stack">' + t.gettingThere.map(g => '<li><b>' + esc(g.h) + '</b> ' + sTag(g.s) + '<br><span class="small">' + esc(g.b) + '</span></li>').join('') + '</ul></div>'
    + '<div class="card"><h3 class="ct">렌터카 운전·주차·주유·반납 요령</h3><ul class="stack small">' + t.driving.map(x => '<li>• ' + esc(x) + '</li>').join('') + '</ul></div>'
    + '<div class="card"><h3 class="ct">긴급 연락처</h3><div class="tscroll"><table class="t">' + emg + '</table></div><p class="small" style="margin-top:8px"><b>확인된 정보만 넣었습니다.</b> 아래는 확인하지 못했습니다.</p><ul class="small">' + t.unknown.map(x => '<li>• ' + esc(x) + '</li>').join('') + '</ul></div>'
    + '<div class="card"><h3 class="ct">귀국일(' + dl(NDAYS - 1) + ') 마지막 이동 역산</h3><ul class="stack small">' + t.returnPlan.map(r => '<li><b>' + esc(r.t) + '</b> ' + esc(r.a) + '</li>').join('') + '</ul><div class="callout" style="margin-top:8px">렌터카 예약 반납(14:00)이 항공 출발(14:30)보다 늦습니다. 계획은 12:20까지 조기 반납이므로 영업소에 사전 확인하세요.</div></div>'
    + '<div class="card"><a class="btn" href="#/prep">출발 준비·조사 출처로 이동</a></div>';
}
function renderPrep() {
  const chk = store.get('chk', {});
  let total = 0, done = 0;
  const groups = T.checklist.map((g, gi) => '<h3 class="ct" style="margin-top:12px">' + esc(g.g) + '</h3><ul>' + g.items.map((it, ii) => { const k = gi + '-' + ii; total++; if (chk[k]) done++; return '<li><label style="display:flex;gap:10px;align-items:flex-start;min-height:44px;padding:8px 0"><input type="checkbox" data-chk="' + k + '" style="width:24px;height:24px;flex:none"' + (chk[k] ? ' checked' : '') + '><span>' + esc(it) + '</span></label></li>'; }).join('') + '</ul>').join('');
  const src = T.sources.map(s => '<li class="small" style="margin:6px 0"><b>' + (s.u ? '<a href="' + esc(s.u) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">' + esc(s.t) + '</a>' : esc(s.t)) + '</b>' + (s.date ? ' · 조회 ' + s.date : '') + '<br><span class="muted">' + esc(s.d) + '</span></li>').join('');
  return '<h2 class="vt">출발 준비</h2><div class="card"><h3 class="ct">체크리스트 <span id="chkcount" class="tag t-must">' + done + '/' + total + '</span></h3>' + groups + '</div>'
    + '<div class="card"><h3 class="ct">귀국일 마지막 이동 역산</h3><ul class="small stack">' + T.transit.returnPlan.map(r => '<li><b>' + esc(r.t) + '</b> ' + esc(r.a) + '</li>').join('') + '</ul></div>'
    + '<div class="card no-print"><h3 class="ct">인쇄·저장</h3><button type="button" class="btn pri" data-act="print">전체 일정 인쇄 / PDF 저장</button><p class="muted small">모든 날짜와 접힌 내용이 펼쳐져 인쇄됩니다.</p></div>'
    + '<div class="card"><h3 class="ct">조사 출처 모음</h3><p class="muted small">조회일 ' + C.researchedOn + '. 검색으로 확인하지 못한 항목은 화면에 “확인 필요”로 표시했습니다. 식당 영업시간·렌터카 영업소 전화·숙소 전화·구마모토성 12월 개장시간·화구 규제 상태는 확인하지 못했습니다.</p><ul>' + src + '</ul></div>';
}

/* ---------- 시트·모달·복사·음성 ---------- */
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }
function copyText(text) {
  const fallback = () => { try { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); if (ok) { toast('복사했습니다'); return; } } catch (e) {} manualCopy(text); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('복사했습니다'), fallback); else fallback();
}
function manualCopy(text) {
  const s = $('#sheet'); openSheetRaw('<h3 class="ct">직접 복사하세요</h3><p class="small">이 기기에서는 자동 복사가 막혀 있습니다. 아래 글자를 길게 눌러 복사하세요.</p><textarea class="copybox jp" lang="ja" readonly id="mc">' + esc(text) + '</textarea><div class="btns" style="margin-top:10px"><button type="button" class="btn" data-act="closesheet">닫기</button></div>');
  setTimeout(() => { const t = $('#mc'); if (t) { t.focus(); t.select(); } }, 50);
}
function openSheetRaw(html) { $('#sheet').innerHTML = html; $('#sheet').classList.add('on'); $('#sheetbg').classList.add('on'); }
function closeSheet() { $('#sheet').classList.remove('on'); $('#sheetbg').classList.remove('on'); stopSpeech(); }
let cur = null;
function openSheet(o) {
  cur = o;
  openSheetRaw('<div class="btns" style="justify-content:space-between"><b>현지어</b><button type="button" class="btn" data-act="closesheet">닫기</button></div><div class="big jp" lang="ja">' + esc(o.ja) + '</div>' + (o.pr ? '<p style="color:var(--rose-d);font-weight:700">' + esc(o.pr) + '</p>' : '') + (o.ko ? '<p>뜻: ' + esc(o.ko) + '</p>' : '<p class="muted small">확인된 사전에 없어 뜻을 만들지 않았습니다.</p><p>' + ext(trUrl(o.ja), '번역 링크 열기') + '</p>') + '<div class="btns" style="margin-top:10px"><button type="button" class="btn pri say-btn" data-say-cur="1">▶ 듣기</button><button type="button" class="btn say-btn" data-say-cur="1" data-slow="1">🐢 천천히</button>' + copyBtn(o.ja, '복사') + '<button type="button" class="btn" data-big-cur="1">크게 보여주기</button></div><p class="muted small" id="saymsg"></p>');
}
function openBig(o) {
  stopSpeech(); const b = $('#bigmodal');
  b.innerHTML = '<div class="bj jp" lang="ja">' + esc(o.ja) + '</div>' + (o.pr ? '<div class="bp">' + esc(o.pr) + '</div>' : '') + (o.ko ? '<div class="bk">' + esc(o.ko) + '</div>' : '') + '<div class="btns"><button type="button" class="btn pri say-btn" data-say-big="1">▶ 듣기</button><button type="button" class="btn" data-act="closebig">닫기</button></div>';
  b.classList.add('on'); cur = o;
}
function closeBig() { $('#bigmodal').classList.remove('on'); stopSpeech(); }
let speakKey = null;
function stopSpeech() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {} speakKey = null; $$('.say-btn.on').forEach(b => b.classList.remove('on')); }
function speak(text, slow, key) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') { toast('이 브라우저는 음성 재생을 지원하지 않습니다. 발음과 크게 보여주기를 이용하세요.'); const m = $('#saymsg'); if (m) m.textContent = '음성 재생을 지원하지 않는 기기입니다. 위의 한글 발음을 참고하거나 크게 보여주기를 사용하세요.'; return; }
  if (speakKey === key) { stopSpeech(); return; }
  stopSpeech();
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = C.speechLang; u.rate = slow ? 0.5 : 1;
    const vs = speechSynthesis.getVoices(), v = vs.find(x => x.lang.replace('_', '-').toLowerCase().startsWith('ja'));
    if (v) u.voice = v; else if (vs.length) { const m = $('#saymsg'); if (m) m.textContent = '이 기기에 일본어 음성이 없을 수 있습니다. 소리가 나지 않으면 한글 발음이나 크게 보여주기를 사용하세요.'; }
    u.onend = u.onerror = () => { if (speakKey === key) { speakKey = null; $$('.say-btn.on').forEach(b => b.classList.remove('on')); } };
    speakKey = key; speechSynthesis.speak(u);
  } catch (e) { toast('음성을 재생하지 못했습니다. 발음과 크게 보여주기를 이용하세요.'); }
}

/* ---------- 라우터 ---------- */
const VIEWS = {};
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const v = h[0] || '', n = h[1] != null ? +h[1] : null;
  if (v === '' && h.length === 0) return { v: '' };
  if (v === 'day' && n >= 1 && n <= NDAYS && h.length === 2) return { v: 'day', n };
  if ((v === 'map' || v === 'food') && h.length <= 2 && (n == null || (n >= 1 && n <= NDAYS))) return { v, n: n || 0 };
  if (['talk', 'stay', 'move', 'prep'].includes(v) && h.length === 1) return { v };
  return null;
}
function route_() {
  const r = parseHash();
  if (!r) { location.replace('#/'); return; }
  stopSpeech(); closeSheet(); closeBig();
  const id = r.v === 'day' ? 'v-day-' + r.n : 'v-' + (r.v || 'home');
  $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
  $('#hero').style.display = r.v === '' ? '' : 'none';
  const key = r.v === 'day' ? 'day/' + r.n : r.v;
  $$('[data-chip]').forEach(c => { const on = c.dataset.chip === key; c.classList.toggle('active', on); if (on) c.setAttribute('aria-current', 'page'); else c.removeAttribute('aria-current'); });
  const navKey = ['', 'day', 'prep'].includes(r.v) ? '' : r.v;
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === navKey));
  const ac = $('#topbar .chip.active'); if (ac && ac.scrollIntoView) { try { ac.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }
  if (r.v === 'map') { if (mapDay !== r.n) mapSel = null; mapDay = r.n; setLock(mapLocked); drawMap(); }
  if (r.v === 'food') drawFood(r.n);
  if (r.v === 'talk') drawTalk();
  document.title = (r.v === 'day' ? r.n + '일차 · ' : '') + C.brand;
  window.scrollTo(0, 0);
  if (r.v === '') paintNN();
  paintWeather();
}

/* ---------- 렌더 전체 ---------- */
function buildViews() {
  let h = '<section class="view" id="v-home">' + renderHome() + '</section>';
  for (let i = 0; i < NDAYS; i++) h += '<section class="view" id="v-day-' + (i + 1) + '">' + renderDay(i) + '</section>';
  h += '<section class="view" id="v-map">' + renderMapShell() + '</section><section class="view" id="v-food">' + renderFood() + '</section><section class="view" id="v-talk">' + renderTalk() + '</section><section class="view" id="v-stay">' + renderStay() + '</section><section class="view" id="v-move">' + renderMove() + '</section><section class="view" id="v-prep">' + renderPrep() + '</section>';
  $('#views').innerHTML = h;
  calcBudget();
}
function rebuildKeep() { const y = window.scrollY; mapSrc = ''; buildViews(); route_(); window.scrollTo(0, y); }

/* ---------- 이벤트 ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button,a,[data-copy]'); if (!t) { if (e.target.id === 'sheetbg') closeSheet(); return; }
  if (t.dataset.nav != null && t.classList.contains('nav-item')) { location.hash = '#/' + t.dataset.nav; return; }
  if (t.dataset.route) { route = t.dataset.route; store.set('route', route); rebuildKeep(); return; }
  if (t.dataset.copy != null) { copyText(t.dataset.copy); return; }
  if (t.classList.contains('tap') && t.dataset.ja) { openSheet({ ja: t.dataset.ja, pr: t.dataset.pr, ko: t.dataset.ko }); return; }
  if (t.dataset.say != null) { const p = T.phrases[+t.dataset.say]; speak(p.ja, !!t.dataset.slow, 'p' + t.dataset.say + (t.dataset.slow ? 's' : '')); t.classList.toggle('on', speakKey != null); return; }
  if (t.dataset.sayCur != null || t.dataset.sayBig != null) { if (cur) { const k = 'c' + cur.ja + (t.dataset.slow ? 's' : ''); speak(cur.ja, !!t.dataset.slow, k); t.classList.toggle('on', speakKey != null); } return; }
  if (t.dataset.big != null) { const p = T.phrases[+t.dataset.big]; openBig({ ja: p.ja, pr: p.pr, ko: p.ko }); return; }
  if (t.dataset.bigCur != null) { if (cur) openBig(cur); return; }
  if (t.dataset.tc) { talkCat = t.dataset.tc; stopSpeech(); drawTalk(); return; }
  if (t.dataset.pin) { const [d, k] = t.dataset.pin.split('-').map(Number); showPin(d, k); return; }
  if (t.dataset.pickp) { mapSel = t.dataset.pickp; const p = P(mapSel); const inf = $('#mapinfo'); inf.innerHTML = '<b>' + esc(p.ko) + '</b> ' + jaBtn(p.ja, p.pr, p.ko) + '<div class="btns" style="margin-top:8px">' + ext(mapUrl(p), '지도 앱에서 열기') + '<button type="button" class="btn" data-act="mapback">날짜 경로로 돌아가기</button></div>'; inf.style.display = 'block'; setMapFrame(); $('#mapbox').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  switch (t.dataset.act) {
    case 'large': large = !large; store.set('large', large); applyLarge(); return;
    case 'closesheet': closeSheet(); return;
    case 'closebig': closeBig(); return;
    case 'wx': localStorage.removeItem && 0; store.set('wx', null); loadWeather(); return;
    case 'print': doPrint(); return;
    case 'mapback': mapSel = null; drawMap(); return;
  }
  if (t.id === 'mlock') { setLock(!mapLocked); return; }
  if (t.id === 'mfit') { mapSel = null; mapSrc = ''; drawMap(); return; }
  if (t.id === 'mopt') { mapOpt = !mapOpt; t.classList.toggle('on', mapOpt); drawMap(); return; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.chk) { const c = store.get('chk', {}); if (t.checked) c[t.dataset.chk] = 1; else delete c[t.dataset.chk]; store.set('chk', c); const total = $$('[data-chk]').length; $('#chkcount').textContent = Object.keys(c).length + '/' + total; }
  if (t.id === 'rate' || t.id === 'extra') calcBudget(true);
});
document.addEventListener('input', e => { if (e.target.id === 'rate' || e.target.id === 'extra') calcBudget(true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); closeBig(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeech(); else { paintNN(); } });
window.addEventListener('pagehide', stopSpeech);
window.addEventListener('pageshow', () => paintNN());
window.addEventListener('hashchange', route_);
let openState = [];
function doPrint() { window.print(); }
window.addEventListener('beforeprint', () => { openState = $$('details').map(d => d.open); $$('details').forEach(d => d.open = true); });
window.addEventListener('afterprint', () => { $$('details').forEach((d, i) => d.open = !!openState[i]); });

/* ---------- 시작 ---------- */
function init() {
  renderChrome(); renderHero(); buildViews(); applyLarge();
  if (!location.hash) history.replaceState(null, '', '#/');
  route_();
  loadWeather();
  setInterval(() => { paintNN(); }, 60000);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
init();
})();
