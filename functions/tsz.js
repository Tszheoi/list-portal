// /tsz —— 订阅管理后台（只有 ADMIN 密码能进）
// 环境变量：ADMIN_PASSWORD（默认 6966@List）、ADMIN_SECRET、
//           GITHUB_TOKEN、GITHUB_REPO、GITHUB_BRANCH、GITHUB_FILE

const COOKIE = 'list_sess';
const SESSION_DAYS = 7;

// ---------- 工具 ----------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function makeSession(secret, role) {
  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  return exp + '.' + role + '.' + await hmac(secret, exp + '.' + role);
}
async function readSession(secret, token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [exp, role, sig] = parts;
  const expect = await hmac(secret, exp + '.' + role);
  if (sig.length !== expect.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  if (diff !== 0) return null;
  if (Number(exp) <= Date.now()) return null;
  return role;
}
function cfg(env) {
  const e = env || {};
  return {
    adminPw: e.ADMIN_PASSWORD || '6966@List',
    secret: e.ADMIN_SECRET || 'list-portal-default-secret-change-me',
    token: e.GITHUB_TOKEN || '',
    repo: e.GITHUB_REPO || '',
    branch: e.GITHUB_BRANCH || 'main',
    file: e.GITHUB_FILE || 'subs.json',
  };
}
function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
const ghHeaders = (t) => ({ Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'User-Agent': 'list-portal', 'Content-Type': 'application/json' });

async function ghRead(c) {
  const r = await fetch(`https://api.github.com/repos/${c.repo}/contents/${c.file}?ref=${c.branch}`, { headers: ghHeaders(c.token) });
  if (!r.ok) throw new Error('读取 subs.json 失败: ' + r.status);
  const j = await r.json();
  const bin = atob(String(j.content || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, x => x.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  return { items: Array.isArray(data.items) ? data.items : [], sha: j.sha };
}
async function ghWrite(c, items, sha) {
  const r = await fetch(`https://api.github.com/repos/${c.repo}/contents/${c.file}`, {
    method: 'PUT',
    headers: ghHeaders(c.token),
    body: JSON.stringify({
      message: 'update subscriptions',
      content: b64encodeUtf8(JSON.stringify({ items }, null, 2) + '\n'),
      branch: c.branch,
      sha,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('写入失败: ' + r.status + ' ' + (j.message || ''));
  return j;
}

// ---------- 页面 ----------
const STYLE = `
*{box-sizing:border-box}
body{margin:0;background:#0f1218;color:#e6e8ee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.6}
.wrap{max-width:980px;margin:0 auto;padding:24px 18px 60px}
h1{font-size:19px;margin:0}
.top{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid #1e2531;margin-bottom:18px}
.inp{width:100%;background:#151a23;border:1px solid #252c3a;color:#e6e8ee;border-radius:9px;padding:10px 12px;outline:none;font-size:14px}
.inp:focus{border-color:#3b82f6}
.btn{background:#2563eb;color:#fff;border:0;border-radius:9px;padding:10px 18px;font-weight:600;cursor:pointer;font-size:14px}
.btn.ghost{background:#1c232f;color:#c3cad8}
.btn.danger{background:#7f1d1d;color:#fecaca}
.btn.sm{padding:6px 11px;font-size:13px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 9px;border-bottom:1px solid #1e2531;vertical-align:top}
th{color:#8b93a7;font-size:12.5px;font-weight:600}
td.acc{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#a5b4fc;word-break:break-all}
td.memo{font-size:13px;color:#8b93a7;word-break:break-word;white-space:pre-wrap}
.sorter{display:flex;flex-direction:column;gap:3px}
.mv{background:#1c232f;border:0;color:#c3cad8;border-radius:6px;font-size:10px;line-height:1;padding:4px 6px;cursor:pointer}
.mv:hover{background:#27303f;color:#fff}
.mv:disabled{opacity:.25;cursor:default}
.login{max-width:340px;margin:18vh auto;padding:0 18px}
.login h1{font-size:20px;margin-bottom:6px}
.login p{color:#8b93a7;font-size:13px;margin:0 0 20px}
.err{color:#fca5a5;font-size:13px;margin-top:10px}
.hint{color:#6b7488;font-size:12.5px;margin-top:10px}
.panel{background:#141922;border:1px solid #1e2531;border-radius:12px;padding:14px;margin-bottom:18px}
.grid{display:grid;grid-template-columns:0.9fr 1.1fr 1.2fr 0.9fr 1.1fr;gap:9px}
@media(max-width:860px){.grid{grid-template-columns:1fr 1fr}}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1e293b;border:1px solid #334155;color:#e6e8ee;padding:9px 16px;border-radius:9px;font-size:13.5px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:9}
.toast.on{opacity:1}
`;

const LOGIN = (err) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>订阅管理 · 后台</title>
<style>${STYLE}</style></head><body><div class="login">
<h1>订阅管理 · 后台</h1><p>请输入管理密码</p>
<form method="POST" action="/tsz">
<input type="hidden" name="action" value="login">
<input class="inp" type="password" name="pw" placeholder="管理密码" autofocus autocomplete="current-password">
<div style="margin-top:12px"><button class="btn" type="submit" style="width:100%">进入</button></div>
${err ? `<div class="err">${esc(err)}</div>` : ''}
</form></div></body></html>`;

const ADMIN = (items) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>订阅管理 · 后台</title>
<style>${STYLE}</style></head><body><div class="wrap">
<div class="top"><h1>订阅管理 · 后台</h1><div class="row">
<a class="btn ghost sm" href="/" target="_blank">看前台</a>
<button class="btn ghost sm" onclick="logout()">退出</button></div></div>

<div class="panel">
  <div class="grid">
    <input class="inp" id="f-type" placeholder="类型（如 会员/云服务）">
    <input class="inp" id="f-name" placeholder="名字（如 夸克SVIP）">
    <input class="inp" id="f-account" placeholder="账号">
    <input class="inp" id="f-expire" type="text" placeholder="到期，如 2027-03-15 或 -">
    <input class="inp" id="f-note" placeholder="备注（选填）">
  </div>
  <div class="row" style="margin-top:10px">
    <button class="btn" id="btn-save" onclick="submitForm()">添加</button>
    <button class="btn ghost" onclick="resetForm()">清空</button>
    <span class="hint" id="edit-hint"></span>
    <span class="hint">到期填 <code>-</code> 表示无限期</span>
  </div>
</div>

<table>
<thead><tr><th style="width:7%">序</th><th style="width:12%">类型</th><th style="width:17%">名字</th><th style="width:21%">账号</th><th style="width:14%">到期</th><th style="width:15%">备注</th><th style="width:14%"></th></tr></thead>
<tbody id="rows">
${items.map((it, i) => `<tr>
  <td>
    <div class="sorter">
      <button class="mv" onclick="moveUp(${i})" ${i === 0 ? 'disabled' : ''} title="上移">▲</button>
      <button class="mv" onclick="moveDown(${i})" ${i === items.length - 1 ? 'disabled' : ''} title="下移">▼</button>
    </div>
  </td>
  <td>${esc(it.type) || '—'}</td>
  <td>${esc(it.name) || '—'}</td>
  <td class="acc">${esc(it.account) || '—'}</td>
  <td>${esc(it.expire) || '—'}</td>
  <td class="memo">${esc(it.note) || '—'}</td>
  <td><div class="row">
    <button class="btn ghost sm" onclick="edit(${i})">编辑</button>
    <button class="btn danger sm" onclick="del(${i})">删除</button>
  </div></td>
</tr>`).join('') || '<tr><td colspan="7" class="hint">还没有记录</td></tr>'}
</tbody></table>

<div class="toast" id="toast"></div>
</div>
<script>
var items = ${JSON.stringify(items)};
var editIndex = -1;

function toast(m){var t=document.getElementById('toast');t.textContent=m;t.className='toast on';setTimeout(function(){t.className='toast'},1800);}

function resetForm(){
  editIndex = -1;
  ['f-type','f-name','f-account','f-expire','f-note'].forEach(function(id){ document.getElementById(id).value = ''; });
  document.getElementById('btn-save').textContent = '添加';
  document.getElementById('edit-hint').textContent = '';
}

function submitForm(){
  var it = {
    type: document.getElementById('f-type').value.trim(),
    name: document.getElementById('f-name').value.trim(),
    account: document.getElementById('f-account').value.trim(),
    expire: document.getElementById('f-expire').value.trim(),
    note: document.getElementById('f-note').value.trim()
  };
  if(!it.name){ toast('名字不能为空'); return; }
  var next = items.slice();
  if(editIndex >= 0) next[editIndex] = it; else next.push(it);
  save(next);
}

function edit(i){
  var it = items[i];
  document.getElementById('f-type').value = it.type || '';
  document.getElementById('f-name').value = it.name || '';
  document.getElementById('f-account').value = it.account || '';
  document.getElementById('f-expire').value = it.expire || '';
  document.getElementById('f-note').value = it.note || '';
  editIndex = i;
  document.getElementById('btn-save').textContent = '保存修改';
  document.getElementById('edit-hint').textContent = '正在编辑：' + (it.name || '');
  window.scrollTo({top:0,behavior:'smooth'});
}

function moveUp(i){ if(i<=0) return; var n=items.slice(); var t=n[i-1]; n[i-1]=n[i]; n[i]=t; save(n); }
function moveDown(i){ if(i>=items.length-1) return; var n=items.slice(); var t=n[i+1]; n[i+1]=n[i]; n[i]=t; save(n); }

function del(i){
  if(!confirm('删除「' + (items[i].name || '') + '」？')) return;
  var next = items.slice(); next.splice(i,1); save(next);
}

function save(next){
  fetch('/tsz', {method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({action:'save', items: next})})
   .then(function(r){ return r.json(); })
   .then(function(j){ if(!j.ok){ toast(j.error || '保存失败'); return; } location.reload(); })
   .catch(function(){ toast('保存失败'); });
}

function logout(){ fetch('/tsz', {method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({action:'logout'})}).then(function(){ location.href='/tsz'; }); }
</script></body></html>`;

// ---------- 主处理 ----------
export async function onRequest(ctx) {
  const c = cfg(ctx.env);
  const { request } = ctx;
  const cookies = parseCookies(request.headers.get('cookie'));
  const role = await readSession(c.secret, cookies[COOKIE]).catch(() => null);
  const isAdmin = role === 'admin';

  const HTML = (body, status) => new Response(body, { status: status || 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  const JSONR = (o, status, extra) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, extra || {}) });

  if (request.method === 'GET') {
    if (!isAdmin) return HTML(LOGIN(''));
    let items = [];
    try { items = (await ghRead(c)).items; } catch (e) { return HTML(LOGIN('读取数据失败：' + esc(e.message))); }
    return HTML(ADMIN(items));
  }

  if (request.method === 'POST') {
    let body = {};
    const ct = request.headers.get('content-type') || '';
    try {
      if (ct.includes('application/json')) body = await request.json();
      else { const fd = await request.formData(); fd.forEach((v, k) => { body[k] = v; }); }
    } catch (e) { }

    const action = body.action;

    if (action === 'login') {
      if (String(body.pw || '') !== c.adminPw) return HTML(LOGIN('密码不对'), 401);
      const token = await makeSession(c.secret, 'admin');
      const cookie = `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
      if (ct.includes('application/json')) return JSONR({ ok: true }, 200, { 'set-cookie': cookie });
      return new Response(null, { status: 303, headers: { location: '/tsz', 'set-cookie': cookie } });
    }

    if (action === 'logout') {
      return JSONR({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
    }

    if (!isAdmin) return JSONR({ ok: false, error: '未登录' }, 401);

    if (action === 'save') {
      const list = Array.isArray(body.items) ? body.items : [];
      const clean = list.map(x => ({
        type: String(x.type || '').trim().slice(0, 40),
        name: String(x.name || '').trim().slice(0, 80),
        account: String(x.account || '').trim().slice(0, 120),
        expire: String(x.expire || '').trim().slice(0, 20),
        note: String(x.note || '').trim().slice(0, 200),
      })).filter(x => x.name);
      try {
        const cur = await ghRead(c);
        await ghWrite(c, clean, cur.sha);
        return JSONR({ ok: true, count: clean.length });
      } catch (e) {
        return JSONR({ ok: false, error: String((e && e.message) || e) }, 500);
      }
    }

    return JSONR({ ok: false, error: '未知操作' }, 400);
  }

  return new Response('405', { status: 405 });
}
