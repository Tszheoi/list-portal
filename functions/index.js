// / —— 订阅查看页（必须密码登录才能看）
// 环境变量：VIEW_PASSWORD（默认 6966@list）、ADMIN_PASSWORD（默认 6966@List）
//           ADMIN_SECRET、GITHUB_TOKEN、GITHUB_REPO、GITHUB_BRANCH、GITHUB_FILE

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
    viewPw: e.VIEW_PASSWORD || '6966@list',
    adminPw: e.ADMIN_PASSWORD || '6966@List',
    secret: e.ADMIN_SECRET || 'list-portal-default-secret-change-me',
    token: e.GITHUB_TOKEN || '',
    repo: e.GITHUB_REPO || '',
    branch: e.GITHUB_BRANCH || 'main',
    file: e.GITHUB_FILE || 'subs.json',
  };
}

// ---------- 数据 ----------
async function readItems(c) {
  if (!c.token || !c.repo) throw new Error('服务端未配置 GITHUB_TOKEN / GITHUB_REPO');
  const r = await fetch(`https://api.github.com/repos/${c.repo}/contents/${c.file}?ref=${c.branch}`, {
    headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'User-Agent': 'list-portal' },
  });
  if (!r.ok) throw new Error('读取失败 ' + r.status);
  const j = await r.json();
  const bin = atob(String(j.content || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, x => x.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  return Array.isArray(data.items) ? data.items : [];
}

// ---------- 页面 ----------
const STYLE = `
*{box-sizing:border-box}
body{margin:0;background:#0f1218;color:#e6e8ee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.6}
.wrap{max-width:900px;margin:0 auto;padding:24px 18px 60px}
h1{font-size:19px;margin:0}
.top{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid #1e2531;margin-bottom:18px}
.inp{width:100%;background:#151a23;border:1px solid #252c3a;color:#e6e8ee;border-radius:9px;padding:11px 13px;outline:none;font-size:14px}
.inp:focus{border-color:#3b82f6}
.btn{background:#2563eb;color:#fff;border:0;border-radius:9px;padding:10px 18px;font-weight:600;cursor:pointer;font-size:14px}
.btn.ghost{background:#1c232f;color:#c3cad8}
.btn.sm{padding:6px 12px;font-size:13px}
.row{display:flex;gap:10px;align-items:center}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:11px 10px;border-bottom:1px solid #1e2531;vertical-align:top}
th{color:#8b93a7;font-size:12.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase}
td.acc{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#a5b4fc;word-break:break-all}
.exp{white-space:nowrap}
.exp.bad{color:#fca5a5;font-weight:600}
.exp.soon{color:#fbbf24}
.exp.ok{color:#9ca3af}
.login{max-width:340px;margin:18vh auto;padding:0 18px}
.login h1{font-size:20px;margin-bottom:6px}
.login p{color:#8b93a7;font-size:13px;margin:0 0 20px}
.err{color:#fca5a5;font-size:13px;margin-top:10px}
.hint{color:#6b7488;font-size:12.5px;margin-top:12px}
.empty{color:#6b7488;padding:40px 0;text-align:center}
@media(max-width:640px){
  th,td{padding:9px 6px;font-size:13px}
  .hide-sm{display:none}
}
`;

const LOGIN = (err) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>订阅管理</title>
<style>${STYLE}</style></head><body><div class="login">
<h1>订阅管理</h1><p>需要密码才能查看</p>
<form method="POST" action="/">
<input type="hidden" name="action" value="login">
<input class="inp" type="password" name="pw" placeholder="密码" autofocus autocomplete="current-password">
<div style="margin-top:12px"><button class="btn" type="submit" style="width:100%">进入</button></div>
${err ? `<div class="err">${esc(err)}</div>` : ''}
</form></div></body></html>`;

function daysLeft(expire) {
  if (!expire) return null;
  const t = Date.parse(expire + 'T23:59:59');
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}
function expClass(expire) {
  const d = daysLeft(expire);
  if (d === null) return 'ok';
  if (d < 0) return 'bad';
  if (d <= 30) return 'soon';
  return 'ok';
}
function expText(expire) {
  const d = daysLeft(expire);
  if (!expire) return '—';
  if (d === null) return expire;
  if (d < 0) return expire + '（已过期）';
  if (d === 0) return expire + '（今天）';
  if (d <= 30) return expire + '（剩 ' + d + ' 天）';
  return expire;
}

const TABLE = (items, role) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>订阅</title>
<style>${STYLE}</style></head><body><div class="wrap">
<div class="top"><h1>订阅</h1><div class="row">
<a class="btn ghost sm" href="/tsz">管理</a>
<button class="btn ghost sm" onclick="logout()">退出</button></div></div>

${items.length ? `<table>
<thead><tr><th style="width:20%">类型</th><th style="width:28%">名字</th><th class="hide-sm" style="width:30%">账号</th><th style="width:22%">到期</th></tr></thead>
<tbody>
${items.map(it => `<tr>
  <td>${esc(it.type) || '—'}</td>
  <td>${esc(it.name) || '—'}</td>
  <td class="acc hide-sm">${esc(it.account) || '—'}</td>
  <td class="exp ${expClass(it.expire)}">${esc(expText(it.expire))}</td>
</tr>`).join('')}
</tbody></table>
<div class="hint">共 ${items.length} 项 · 按到期时间排序</div>`
: '<div class="empty">还没有订阅记录</div>'}

</div>
<script>
function logout(){ fetch('/', {method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({action:'logout'})}).then(function(){ location.reload(); }); }
</script></body></html>`;

// ---------- 主处理 ----------
export async function onRequest(ctx) {
  const c = cfg(ctx.env);
  const { request } = ctx;
  const cookies = parseCookies(request.headers.get('cookie'));

  if (request.method === 'GET') {
    const role = await readSession(c.secret, cookies[COOKIE]).catch(() => null);
    if (!role) return new Response(LOGIN(''), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

    let items = [];
    try {
      items = await readItems(c);
    } catch (e) {
      items = [];
    }
    items.sort((a, b) => String(a.expire || '9999').localeCompare(String(b.expire || '9999')));
    return new Response(TABLE(items, role), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
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
      const pw = String(body.pw || '');
      let role = null;
      if (pw === c.adminPw) role = 'admin';
      else if (pw === c.viewPw) role = 'view';
      if (!role) {
        return new Response(LOGIN('密码不对'), { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      const token = await makeSession(c.secret, role);
      const cookie = `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
      if (ct.includes('application/json')) {
        return new Response(JSON.stringify({ ok: true, role }), { headers: { 'content-type': 'application/json', 'set-cookie': cookie, 'cache-control': 'no-store' } });
      }
      return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': cookie } });
    }

    if (action === 'logout') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`, 'cache-control': 'no-store' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: '未知操作' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  return new Response('405', { status: 405 });
}
