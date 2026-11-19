/**
 * CampusVerse Lite - Frontend Application
 * Fully integrated Single Page Application (SPA) with Java Jakarta EE Backend.
 */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));

const ctx = window.APP_CONTEXT || '';

// Shared records are loaded from the server, never restored from demo localStorage.
const state = { profile: {name: 'Student', interests: []}, messages: {}, connections: [], ghosts: [], doubts: [] };
let loggedIn = Boolean(window.INITIAL_STUDENT?.id);
let csrfToken = window.CSRF_TOKEN || '';
function save() {} // Server persistence is handled explicitly by each mutation.
async function api(path, params) {
    const options = {credentials: 'same-origin', headers: {Accept: 'application/json'}};
    if (params) {
        options.method = 'POST';
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        options.headers['X-CSRF-Token'] = csrfToken;
        options.body = params.toString();
    }
    const res = await fetch(ctx + path, options);
    csrfToken = res.headers.get('X-CSRF-Token') || csrfToken;
    const type = res.headers.get('Content-Type') || '';
    if (!type.includes('application/json')) throw new Error('Unexpected server response. Reload the page.');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}
function displayText(value) {
    // Legacy services store HTML-escaped text. Decode only into text, then escape at render time.
    return String(value || '').replace(/&(amp|lt|gt|quot|#x27);/g, (_, x) => ({amp:'&',lt:'<',gt:'>',quot:'"','#x27':"'"}[x]));
}
function normalizeDoubt(d) {
    return {...d, id:String(d.id), title:displayText(d.title), body:displayText(d.body),
        replies:(d.replies || []).map(r=>({...r,text:displayText(r.text)}))};
}
async function loadShared() {
    const [rooms, ds, gs, matches] = await Promise.all([
        api('/chat?rooms=true'), api('/doubts?json=true'), api('/ghostrooms?json=true'), api('/vibematch?json=true')
    ]);
    roomMap = Object.fromEntries(rooms.map(r=>[r.name,r.id]));
    state.doubts = ds.map(normalizeDoubt);
    state.ghosts = gs.map(g=>({...g,id:String(g.id),title:displayText(g.title)}));
    peers = matches.map(p=>({...p, initials:String(p.id), color:'purple'}));
}
// Navigation & route definitions
const navs = [
    ['home', '▦', 'Overview'],
    ['chat', '▤', 'Study Chat'],
    ['match', '✳', 'VibeMatch'],
    ['ghost', '♧', 'GhostRooms'],
    ['doubts', '◈', 'DoubtDrop']
];

const interests = ['Java', 'DSA', 'UI/UX', 'React', 'Hackathons', 'Gaming', 'DBMS', 'Python'];
const subjects = ['DSA', 'Java', 'DBMS', 'General'];

let current = 'home';
let room = 'DSA';
let ghostId = null;
let filter = 'All';
let search = '';
let lastPolledMessageId = 0;
const pendingPolls = new Set();
let roomMap = { 'Java': 1, 'DSA': 2, 'DBMS': 3, 'General': 4 };

let peers = [];
function allGhosts() { return state.ghosts; }
function allDoubts() { return state.doubts; }


function toast(text) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(window.tt);
    window.tt = setTimeout(() => el.classList.remove('show'), 3000);
}

function initials(nameStr) {
    if (!nameStr) return 'ST';
    const parts = nameStr.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nameStr.substring(0, 2).toUpperCase();
}

function name() {
    return state.profile.name || 'Student';
}

function heading(title, sub, action = '') {
    return `
        <div class="page-heading">
            <div>
                <div class="eyebrow">A LITTLE COMMUNITY. A LOT OF POSSIBILITY.</div>
                <h1>${title}</h1>
                <p>${sub}</p>
            </div>
            ${action}
        </div>
    `;
}

function navigate(page) {
    current = page;
    location.hash = page;
    render();
    window.scrollTo(0, 0);
    if (loggedIn && page !== 'chat') loadShared().then(()=>{if(current===page)render()}).catch(e=>toast(e.message));
}

function render() {
    // Navigation bar buttons
    const navEl = $('#nav');
    if (navEl) {
        navEl.innerHTML = navs.map(([key, icon, label]) => `
            <button onclick="navigate('${key}')" class="${current === key ? 'active' : ''}">
                <span class="symbol">${icon}</span>
                <span>${label}</span>
                ${key === 'ghost' ? '<span class="badge">LIVE</span>' : ''}
            </button>
        `).join('');
    }

    // Breadcrumb and profile avatars
    const crumb = $('#crumb');
    if (crumb) {
        crumb.textContent = navs.find(x => x[0] === current)?.[2] ||
            (current === 'saved' ? 'Your activity' : 'Your profile');
    }

    const userNameEl = $('#user-name');
    if (userNameEl) userNameEl.textContent = name();

    const currentInitials = initials(name());
    const headerAvatar = $('.header-right .avatar') || $('.header-avatar');
    if (headerAvatar) headerAvatar.textContent = currentInitials;

    const profileAvatar = $('.profile-button .avatar');
    if (profileAvatar) profileAvatar.textContent = currentInitials;

    if (!loggedIn) {
        $('#main').innerHTML = heading('Welcome to your campus corner.', 'Choose a nickname to begin.') + `
            <section class="panel profile-panel"><form class="form-stack" onsubmit="saveProfile(event)">
            <label>Nickname<input name="nickname" maxlength="50" pattern="[A-Za-z0-9_.\\- ]+" required placeholder="Your nickname"></label>
            <p class="muted">Classroom prototype: nicknames are not password-protected. Use a unique nickname for each student.</p>
            <button class="primary">Enter CampusVerse ↗</button></form></section>`;
        return;
    }
    // View router
    const views = {
        home: home,
        chat: chat,
        match: match,
        ghost: ghosts,
        doubts: doubts,
        profile: profile,
        saved: saved
    };

    const mainEl = $('#main');
    if (mainEl) {
        mainEl.innerHTML = (views[current] || home)();
    }

    if (current === 'chat') {
        const msgsEl = $('.messages');
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
        syncRoomMessages();
    }
}

// ----------------------------------------------------
// VIEW: Home (Overview)
// ----------------------------------------------------
function home() {
    const firstName = esc(name().split(' ')[0]);
    const liveGhostCount = allGhosts().filter(g => g.expires > Date.now()).length;
    const openDoubtsCount = allDoubts().filter(d => !d.resolved).length;

    return heading(
        `Hey ${firstName}, find your people <span style="color:#acb77a">✳</span>`,
        'A little help, a good conversation, and your next big idea. It all starts here.',
        `<span class="date">◷ &nbsp; YOUR CAMPUS, YOUR CORNER</span>`
    ) + `
        <section class="hero">
            <div class="hero-content">
                <span class="hero-label">LESS SCROLLING. MORE CONNECTING.</span>
                <h2>Your campus.<br>Your people. <em>Your verse.</em></h2>
                <p>From “I don’t get it” to “we’ve got this.”<br>Find a study circle that feels like you.</p>
                <button class="primary" onclick="navigate('match')">Find my people <span>↗</span></button>
            </div>
            <div class="hero-art" aria-hidden="true">
                <div class="orbit"></div>
                <span class="art-star">✳</span>
                <div class="art-card art-chat">☏</div>
                <div class="art-card art-ghost"><div class="ghost"></div></div>
                <span class="art-spark">✧</span>
                <span class="art-caption">a good kind of campus chaos.</span>
            </div>
        </section>

        <section class="stats">
            <div class="stat">
                <span class="stat-icon">♧</span>
                <div><b>${String(Object.keys(roomMap).length).padStart(2, '0')}</b><small>Study rooms</small></div>
            </div>
            <div class="stat">
                <span class="stat-icon">✳</span>
                <div><b>${String(peers.length).padStart(2, '0')}</b><small>People to discover</small></div>
            </div>
            <div class="stat">
                <span class="stat-icon">◈</span>
                <div><b>${String(openDoubtsCount).padStart(2, '0')}</b><small>Open conversations</small></div>
            </div>
            <div class="stat">
                <span class="stat-icon">◷</span>
                <div><b>${String(liveGhostCount).padStart(2, '0')}</b><small>GhostRooms live</small></div>
            </div>
        </section>

        <div class="section-heading">
            <div>
                <h2>Make yourself at home</h2>
                <p>Four ways to make campus feel a little smaller.</p>
            </div>
            <span class="text-link">Pick your vibe ↘</span>
        </div>

        <section class="feature-grid">
            <button class="feature" onclick="navigate('chat')">
                <span class="feature-symbol">▤</span>
                <h3>Study Chat</h3>
                <p>Big questions. Small study circles.<br>Learn better, together.</p>
                <div class="feature-bottom">
                    <span>4 subject rooms</span>
                    <span>↗</span>
                </div>
            </button>
            <button class="feature" onclick="navigate('match')">
                <span class="feature-symbol">✳</span>
                <h3>VibeMatch</h3>
                <p>Same interests. Fresh connections.<br>Meet your kind of people.</p>
                <div class="feature-bottom">
                    <span>Find your circle</span>
                    <span>↗</span>
                </div>
            </button>
            <button class="feature" onclick="navigate('ghost')">
                <span class="feature-symbol">♧</span>
                <span class="tiny-tag">EPHEMERAL</span>
                <h3>GhostRooms</h3>
                <p>Here for a good time, not a long time.<br>Rooms that disappear.</p>
                <div class="feature-bottom">
                    <span>Drop in. Talk. Vanish.</span>
                    <span>↗</span>
                </div>
            </button>
            <button class="feature" onclick="navigate('doubts')">
                <span class="feature-symbol">◈</span>
                <h3>DoubtDrop</h3>
                <p>No “silly” questions here.<br>Get unstuck with a little help.</p>
                <div class="feature-bottom">
                    <span>Ask away</span>
                    <span>↗</span>
                </div>
            </button>
        </section>

        <div class="lower-grid">
            <section>
                <div class="section-heading">
                    <h2>Find your study corner</h2>
                    <button class="text-link" onclick="navigate('chat')">View all rooms ↗</button>
                </div>
                <div class="panel">
                    <div class="room-row">
                        <span class="room-icon">⌘</span>
                        <div class="room-info">
                            <b>Data Structures & Algorithms</b>
                            <p><i></i> Binary trees & better understanding</p>
                        </div>
                        
                        <button class="room-action" onclick="openRoom('DSA')">Join ↗</button>
                    </div>
                    <div class="room-row">
                        <span class="room-icon">☕</span>
                        <div class="room-info">
                            <b>The Java Junction</b>
                            <p><i></i> Classes, coffee & conversations</p>
                        </div>
                        
                        <button class="room-action" onclick="openRoom('Java')">Join ↗</button>
                    </div>
                    <div class="room-row">
                        <span class="room-icon">▥</span>
                        <div class="room-info">
                            <b>DBMS Study Circle</b>
                            <p><i></i> Making sense of relationships</p>
                        </div>
                        
                        <button class="room-action" onclick="openRoom('DBMS')">Join ↗</button>
                    </div>
                </div>
            </section>

            <section>
                <div class="section-heading">
                    <h2>A little help goes a long way</h2>
                    <button class="text-link" onclick="navigate('doubts')">DoubtDrop ↗</button>
                </div>
                <div class="panel">
                    ${state.doubts.length ? doubtList(state.doubts.slice(0,1)) : '<p class="muted">No questions yet. Start with yours.</p>'}
                </div>
            </section>
        </div>
    `;
}

// ----------------------------------------------------
// VIEW: Study Chat
// ----------------------------------------------------
function openRoom(s, id = null) {
    room = s;
    ghostId = id;
    lastPolledMessageId = 0;
    state.messages[ghostId || room] = [];
    navigate('chat');
}

function chat() {
    let g = ghostId ? allGhosts().find(x => x.id === ghostId) : null;
    const key = ghostId || room;
    const msgs = state.messages[key] || [];
    let expired = g && g.expires <= Date.now();

    return heading('A good place to get it.', 'Ask a question, share a thought, or just say hello.') + `
        <div class="info-banner">Live Chat · Powered by persistent H2 database & cursor polling API. Messages are saved securely on CampusVerse Lite.</div>
        <div class="workspace">
            <aside class="panel room-list">
                ${subjects.map(s => `
                    <button class="${room === s && !ghostId ? 'active' : ''}" onclick="openRoom('${s}')">
                        # ${s}
                        <small>${s === 'General' ? 'The campus common room' : 'Your ' + s + ' study circle'}</small>
                    </button>
                `).join('')}
                ${g ? `
                    <button class="active">
                        ♧ ${esc(g.title)}
                        <small>Temporary room</small>
                    </button>
                ` : ''}
            </aside>

            <section class="panel chat-panel">
                <div class="chat-top">
                    ${g ? '♧ ' + esc(g.title) : '# ' + room + ' Study Circle'}
                    <small>${expired ? 'This room has expired. You can still read the conversation.' : 'A little curiosity goes a long way. Be kind, always.'}</small>
                </div>

                <div class="messages" id="chat-messages">
                    ${msgs.length === 0 ? '<p class="muted">No messages yet. Start the conversation.</p>' : ''}
                    ${msgs.map(m => `
                        <div class="message ${m.author === name() ? 'mine' : ''}">
                            <span class="avatar ${m.author === name() ? 'lime' : 'purple'}">${esc(initials(m.author))}</span>
                            <div>
                                <b>${esc(m.author)}</b><time>${esc(m.time)}</time>
                                <div class="bubble">${esc(m.text)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <form class="compose" onsubmit="sendMessage(event)">
                    <input name="message" maxlength="2000" aria-label="Message"
                           placeholder="${expired ? 'This GhostRoom is closed' : 'A question? A thought? Drop it here…'}"
                           required ${expired ? 'disabled' : ''} autocomplete="off">
                    <button class="primary" ${expired ? 'disabled' : ''}>Send ↗</button>
                </form>
            </section>
        </div>
    `;
}

async function sendMessage(e) {
    e.preventDefault();
    const form=e.target, input=form.querySelector('[name="message"]'), button=form.querySelector('button');
    const text=input.value.trim(), target=ghostId ? Number(ghostId) : roomMap[room];
    if (!text || !target || button.disabled) return;
    button.disabled=true;
    try {
        await api('/messages',new URLSearchParams({roomId:target,content:text}));
        input.value='';
        await syncRoomMessages();
    } catch(err) { toast(err.message); }
    finally { button.disabled=false; }
}

async function syncRoomMessages() {
    if (!loggedIn || current !== 'chat') return;
    const key=ghostId || room, target=ghostId ? Number(ghostId) : roomMap[room];
    if (!target || pendingPolls.has(target)) return;
    pendingPolls.add(target);
    try {
        const cursor=Math.max(0,...(state.messages[key]||[]).map(m=>Number(m.id)||0));
        const msgs=await api(`/api/messages?roomId=${target}&afterId=${cursor}`);
        if (current!=='chat' || (ghostId||room)!==key) return;
        const items=state.messages[key]??=[];
        for(const m of msgs) if(!items.some(x=>Number(x.id)===Number(m.id))) items.push({
            id:m.id, author:m.senderNickname, text:displayText(m.content), time:(m.createdAt||'').substring(11,16)
        });
        items.sort((a,b)=>a.id-b.id);
        const el=$('#chat-messages');
        if(el) {
            el.innerHTML=items.length ? items.map(m=>`<div class="message ${m.author===name()?'mine':''}">
            <span class="avatar purple">${esc(initials(m.author))}</span><div><b>${esc(m.author)}</b>
            <time>${esc(m.time)}</time><div class="bubble">${esc(m.text)}</div></div></div>`).join('') : '<p class="muted">No messages yet. Start the conversation.</p>';
            if(msgs.length)el.scrollTop=el.scrollHeight;
        }
    } catch(err) { if(current==='chat')toast(err.message); }
    finally { pendingPolls.delete(target); }
}

// ----------------------------------------------------
// VIEW: VibeMatch
// ----------------------------------------------------
function match() {
    const chosen = state.profile.interests || [];
    const list = peers;

    return heading('Your people are out there.', 'Start with what you love. Find someone who gets it.') + `
        <div class="info-banner">VibeMatch compares shared interests using Jaccard Similarity (intersection ÷ union). Choose your interests to see recommendations change in real time.</div>

        <div class="section-heading">
            <h2>What’s your thing?</h2>
            <span class="muted">Select a few. We’ll find the overlap.</span>
        </div>

        <div class="interest-picks">
            ${interests.map(i => `
                <button class="${chosen.includes(i) ? 'selected' : ''}" onclick="toggleInterest('${i}')">
                    ${chosen.includes(i) ? '✓ ' : '+ '}${i}
                </button>
            `).join('')}
        </div>

        <div class="card-grid">
            ${list.map(p => `
                <article class="person">
                    <span class="match">${p.score}% match</span>
                    <span class="avatar ${p.color}">${esc(initials(p.name))}</span>
                    <h3>${esc(p.name)}</h3>
                    <span class="muted">${esc(p.year)}</span>
                    <p>${esc(p.bio)}</p>
                    <div>
                        ${p.interests.map(i => `
                            <span class="chip ${chosen.includes(i) ? 'green' : ''}">${esc(i)}</span>
                        `).join('')}
                    </div>
                    <button class="primary" onclick="connect('${p.initials}')">
                        ${state.connections.includes(p.initials) ? '✓ Saved on this page' : 'Save on this page ↗'}
                    </button>
                </article>
            `).join('')}
        </div>
    `;
}

async function toggleInterest(i) {
    const before=[...state.profile.interests];
    state.profile.interests=before.includes(i)?before.filter(x=>x!==i):[...before,i];
    try { await syncProfileToBackend(); await loadShared(); render(); }
    catch(err) {state.profile.interests=before; render();toast(err.message);}
}

function connect(id) {
    if (state.connections.includes(id)) {
        state.connections = state.connections.filter(x => x !== id);
        toast('Removed from your saved circle');
    } else {
        state.connections.push(id);
        toast('Saved on this page');
    }
    save();
    render();
}

// ----------------------------------------------------
// VIEW: GhostRooms
// ----------------------------------------------------
function countdown(t) {
    let s = Math.max(0, Math.floor((t - Date.now()) / 1000));
    if (!s) return 'Room closed';
    const hrs = String(Math.floor(s / 3600)).padStart(2, '0');
    const mins = String(Math.floor(s / 60) % 60).padStart(2, '0');
    const secs = String(s % 60).padStart(2, '0');
    return `${hrs} : ${mins} : ${secs}`;
}

function ghosts() {
    return heading(
        'Good conversations. Limited editions.',
        'A room for right now. Revision, ideas, or whatever’s on your mind.',
        `<button class="primary" onclick="createGhost()">+ Create a room</button>`
    ) + `
        <div class="info-banner">GhostRooms automatically lock when their timer runs out. Messages remain readable, but no new messages can be posted.</div>
        <div class="card-grid">
            ${allGhosts().map(g => `
                <article class="ghost-card">
                    <div class="ghost" aria-hidden="true"></div>
                    <h3>${esc(g.title)}</h3>
                    <p>${esc(g.topic)}</p>
                    <span class="chip">${esc(g.subject)}</span>
                    <div class="countdown" data-expiry="${g.expires}">${countdown(g.expires)}</div>
                    <div class="muted">${g.expires > Date.now() ? 'until this room vanishes' : 'This conversation has ended'}</div>
                    <div style="margin-top:22px">
                        <span class="muted">Temporary study room</span>
                        <button class="room-action" onclick="openRoom('${g.subject}','${g.id}')">
                            ${g.expires > Date.now() ? 'Step inside ↗' : 'Read chat ↗'}
                        </button>
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function modal(html) {
    const body = $('#dialog-body');
    const dlg = $('#dialog');
    if (body && dlg) {
        body.innerHTML = html;
        dlg.showModal();
    }
}

function createGhost() {
    modal(`
        <h2>A little room for something.</h2>
        <p>Pick a topic. Set a timer. Bring your people.</p>
        <form class="form-stack" onsubmit="submitGhost(event)">
            <label>
                Room name
                <input name="title" placeholder="e.g. Midnight Java revision" maxlength="70" required autofocus>
            </label>
            <label>
                Keep it around for
                <select name="hours">
                    <option value="1">1 hour</option>
                    <option value="2" selected>2 hours</option>
                    <option value="6">6 hours</option>
                    <option value="24">24 hours</option>
                </select>
            </label>
            <button class="primary" type="submit">Create GhostRoom ↗</button>
        </form>
    `);
}

async function submitGhost(e) {
    e.preventDefault(); const f=new FormData(e.target);
    try {
        await api('/ghostrooms',new URLSearchParams({name:f.get('title').trim(),duration:f.get('hours')+'h'}));
        await loadShared(); $('#dialog').close();render();toast('GhostRoom created.');
    } catch(err) {toast(err.message);}
}

// ----------------------------------------------------
// VIEW: DoubtDrop
// ----------------------------------------------------
function doubts() {
    const items = allDoubts().filter(d =>
        (filter === 'All' || (filter === 'Resolved' && d.resolved) || (filter === 'Open' && !d.resolved)) &&
        `${d.title} ${d.body} ${d.subject}`.toLowerCase().includes(search.toLowerCase())
    );

    return heading(
        'Big lightbulb energy.',
        'Every “I don’t get it” deserves an “oh, now I do.”',
        `<button class="primary" onclick="askDoubt()">+ Drop a doubt</button>`
    ) + `
        <div class="doubt-controls">
            <input aria-label="Search doubts" placeholder="Search questions, subjects, or concepts…"
                   value="${esc(search)}" oninput="search=this.value;refreshDoubts()">
            <select aria-label="Filter questions" onchange="filter=this.value;render()">
                ${['All', 'Open', 'Resolved'].map(x => `<option ${x === filter ? 'selected' : ''}>${x}</option>`).join('')}
            </select>
        </div>
        <div id="doubt-list">${doubtList(items)}</div>
    `;
}

function doubtList(items) {
    if (!items.length) {
        return '<div class="empty">No questions here yet. Be the first to ask.</div>';
    }
    return items.map(d => `
        <article class="doubt-card">
            <span class="chip">${esc(d.subject)}</span>
            <span class="chip ${d.resolved ? 'green' : ''}">${d.resolved ? '✓ Resolved' : 'Open for ideas'}</span>
            <h3>${esc(d.title)}</h3>
            <p>${esc(d.body)}</p>
            <div class="bottom">
                <span class="muted">${esc(d.author)} · ${(d.replies || []).length} ${(d.replies || []).length === 1 ? 'reply' : 'replies'}</span>
                <button class="room-action" onclick="viewDoubt('${d.id}')">Join the conversation ↗</button>
            </div>
        </article>
    `).join('');
}

function refreshDoubts() {
    const listEl = $('#doubt-list');
    if (!listEl) return;
    const items = allDoubts().filter(d =>
        (filter === 'All' || (filter === 'Resolved' && d.resolved) || (filter === 'Open' && !d.resolved)) &&
        `${d.title} ${d.body} ${d.subject}`.toLowerCase().includes(search.toLowerCase())
    );
    listEl.innerHTML = doubtList(items);
}

function askDoubt() {
    modal(`
        <h2>Let’s get you unstuck.</h2>
        <p>Small question, big question. It belongs here.</p>
        <form class="form-stack" onsubmit="submitDoubt(event)">
            <label>
                Subject
                <select name="subject">${subjects.map(s => `<option>${s}</option>`).join('')}</select>
            </label>
            <label>
                Your question
                <input name="title" maxlength="150" placeholder="What’s on your mind?" required autofocus>
            </label>
            <label>
                A little more context
                <textarea name="body" maxlength="2000" placeholder="What have you tried? Where are you stuck?" required></textarea>
            </label>
            <button class="primary" type="submit">Drop my doubt ↗</button>
        </form>
    `);
}

async function submitDoubt(e) {
    e.preventDefault(); const f=new FormData(e.target);
    try {
        await api('/doubts',new URLSearchParams({subject:f.get('subject'),title:f.get('title').trim(),description:f.get('body').trim()}));
        await loadShared();$('#dialog').close();navigate('doubts');toast('Question saved.');
    } catch(err){toast(err.message);}
}

function viewDoubt(id) {
    const d = allDoubts().find(x => String(x.id) === String(id));
    if (!d) return;

    modal(`
        <span class="chip">${esc(d.subject)}</span>
        <h2 style="margin-top:15px">${esc(d.title)}</h2>
        <p>${esc(d.body)}</p>
        <span class="muted">Asked by ${esc(d.author)} · ${d.resolved ? 'Resolved' : 'Open'}</span>

        <div class="answers">
            ${(d.replies || []).length ? d.replies.map(r => `
                <b style="font-size:11px">${esc(r.author)}</b>
                <p>${esc(r.text)}</p>
            `).join('') : '<p>No replies yet. A little help starts with you.</p>'}
        </div>

        <form class="form-stack" onsubmit="replyDoubt(event,'${d.id}')">
            <label>
                Your reply
                <textarea name="reply" required maxlength="2000" placeholder="Share an explanation or a helpful example…"></textarea>
            </label>
            <button class="primary" type="submit">Post reply ↗</button>
        </form>

        ${d.owned && !d.resolved ? `
            <button class="room-action" style="margin-top:15px" onclick="resolveDoubt('${d.id}')">
                ${d.resolved ? 'Reopen question' : '✓ Mark as resolved'}
            </button>
        ` : ''}
    `);
}

async function replyDoubt(e,id) {
    e.preventDefault();const text=new FormData(e.target).get('reply').trim(); if(!text)return;
    try {
        await api('/doubts/answer',new URLSearchParams({doubtId:id,answerText:text}));
        await loadShared();$('#dialog').close();render();viewDoubt(id);toast('Reply saved.');
    }catch(err){toast(err.message);}
}

async function resolveDoubt(id) {
    const d=allDoubts().find(d=>String(d.id)===String(id));
    if(!d?.owned || d.resolved)return;
    try {
        await api('/doubts',new URLSearchParams({action:'resolve',doubtId:id}));
        await loadShared();$('#dialog').close();render();toast('Question resolved.');
    }catch(err){toast(err.message);}
}

// ----------------------------------------------------
// VIEW: Profile
// ----------------------------------------------------
function profile() {
    return heading('A little more you.', 'Your name and interests help your campus find you.') + `
        <section class="panel profile-panel">
            <h2>Your campus identity</h2>
            <p class="muted">Connected directly to CampusVerse Lite backend session and database.</p>
            <form class="form-stack" onsubmit="saveProfile(event)">
                <label>
                    Your nickname
                    <input name="nickname" maxlength="50" value="${esc(name())}" required autofocus>
                </label>
                <div>
                    <label>Your interests</label>
                    <div class="interest-picks">
                        ${interests.map(i => `
                            <button type="button" class="${state.profile.interests.includes(i) ? 'selected' : ''}" onclick="toggleInterest('${i}')">
                                ${state.profile.interests.includes(i) ? '✓ ' : '+ '}${i}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <button class="primary" type="submit">Save my profile ↗</button>
            </form>
        </section>
    `;
}

async function saveProfile(e) {
    e.preventDefault(); const n=new FormData(e.target).get('nickname').trim(); if(!n)return;
    const old=state.profile.name;state.profile.name=n;
    try {
        await syncProfileToBackend(); await boot(); toast('Profile saved.');
    }catch(err){state.profile.name=old;toast(err.message);}
}

async function syncProfileToBackend() {
    const params=new URLSearchParams({action:'saveProfile',nickname:state.profile.name});
    for(const i of state.profile.interests) params.append('interests',i);
    return await api('/student',params);
}

// ----------------------------------------------------
// VIEW: Saved Activity
// ----------------------------------------------------
function saved() {
    return heading('Your little corner of campus.', 'The people, questions, and conversations you’ve started.') + `
        <div class="panel">
            <h2>Your circle</h2>
            ${state.connections.length ? peers.filter(p => state.connections.includes(p.initials)).map(p => `
                <div class="room-row">
                    <span class="avatar ${p.color}">${esc(initials(p.name))}</span>
                    <div class="room-info">
                        <b>${esc(p.name)}</b>
                        <p>${p.interests.join(' · ')}</p>
                    </div>
                    <button class="room-action" onclick="navigate('match')">View matches ↗</button>
                </div>
            `).join('') : '<p class="muted">Your circle is waiting. Find someone with a shared interest in VibeMatch.</p>'}

            <h2 style="margin-top:28px">Your questions</h2>
            ${doubtList(state.doubts.filter(d=>d.owned))}

            <button class="primary" style="margin-top:20px" onclick="navigate('match')">Explore VibeMatch ↗</button>
        </div>
    `;
}

// ----------------------------------------------------
// INITIALIZATION & TIMERS
// ----------------------------------------------------

// Live countdown ticker & active chat polling
setInterval(() => {
    // 1. Update GhostRoom countdown timers
    document.querySelectorAll('[data-expiry]').forEach(el => {
        el.textContent = countdown(Number(el.dataset.expiry));
    });

    // 2. Poll messages if currently on chat screen
    if (current === 'chat') {
        syncRoomMessages();
    }
}, 3000);

// Hash routing
window.addEventListener('hashchange', () => {
    const p = location.hash.slice(1);
    if (p && p !== current) {
        current = p;
        render();
    }
});

// Modal outside-click dismiss
const dialog = $('#dialog');
if (dialog) {
    dialog.addEventListener('click', e => {
        if (e.target === dialog) dialog.close();
    });
}

// Initial Boot
async function boot() {
    try {
        const user=await api('/student?json=true');
        loggedIn=user.loggedIn;
        if(loggedIn) {
            state.profile={name:user.nickname,interests:user.interests||[]};
            state.messages={};
            await loadShared();
        }
        current=location.hash.slice(1)||'home';render();
    }catch(err){render();toast(err.message);}
}

boot();
