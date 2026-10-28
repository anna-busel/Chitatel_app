var SEGS = [['all','Вся база'],['club','В клубе сейчас'],['ending','Доступ до 31.10'],['noclub','Без доступа к клубу'],['content','Разборы без клуба'],['unlinked','Не связаны с приложением'],['noorders','Без оплат'],['long','Длительные абонементы']];
var PLAN_COLS = [['todo','К работе'],['contact','Связались'],['think','Думает'],['won','Оплатила'],['lost','Отказ']];
var PLAN_KIND = {unpaid:['Не оплатила счёт','warn'], renew:['Абонемент до 31.10','wait'], lapsed:['Не продлила','ask'], content:['Разборы без клуба','mute'], manual:['Добавлена вручную','mute']};
var CCOLS = [['app','Приложение','minmax(150px,1fr)',150],['phone','Телефон','140px',140],['tg','Telegram','120px',120],['city','Город','minmax(130px,1fr)',130],['until','Клуб по','86px',86],['ltv','Сумма покупок','110px',110],['last','Посл. оплата','110px',110]];
function clone(x) { return JSON.parse(JSON.stringify(x)); }

class Component extends DCLogic {
 constructor(props) {
  super(props);
  var g = generate();
  var clients = CLIENTS0.concat(g.clients).map(function (c) { var x = clone(c); if (!x.hist.length) x.hist = [{dt:'2026-09-01 12:00', who:'Импорт', text:'Перенесена из ГетКурса'}]; return x; });
  var orders = ORDERS0.concat(g.orders).map(function (o) { var x = clone(o); x.hist = seedHist(x); return x; });
  this._clock = 20; var self0 = this;
  this._searchRef = function (el) { self0._searchEl = el; };
  this._drawerRef = function (el) { if (el && el !== self0._drawerEl) { self0._drawerEl = el; try { el.focus({preventScroll:true}); } catch (e) {} } else if (!el) self0._drawerEl = null; };
  this.state = {
   screen:'today', role:'manager', userOpen:false, notifOpen:false, read:{}, gq:'',
   clients:clients, orders:orders, products:clone(PRODUCTS0), promos:clone(PROMOS0), autos:clone(AUTOS0), camps:clone(CAMPS0),
   members:clone(MEMBERS0), threads:clone(THREADS0), tgreq:clone(TGREQ0), tgAuto:14, rates:{USD:'3.30', RUB:'0.036', EUR:'3.60', GEL:'1.20'},
   drawer:null, dtab:'overview', f:{},
   cq:'', cf:'all', csort:{key:'last', dir:'desc'}, cpage:1, ccols:{app:true, phone:true, tg:true, city:false, until:true, ltv:false, last:true}, colsOpen:false, csel:{},
   oq:'', otab:'all', osrc:'all', omgr:'all', operiod:'all', osort:{key:'date', dir:'desc'}, opage:1, osel:{},
   plan:{g1:'contact', g3:'think', g4:'won', g6:'contact', g8:'lost', g10:'won', g12:'lost', g14:'think', g20:'lost'}, sf:'all',
   ifilter:'all', tid:'t2', reply:'',
   ptab:'products', pf:'all', pageSel:'p3', ck:{promo:'', disc:0, promoMsg:'', gift:false, method:'bepaid', email:'', giftEmail:''},
   np:{code:'', type:'%', val:'', scope:'all', limit:'', until:'2026-12-31'},
   period:6, ftab:'revenue', stab:'team', imp:1, toast:'', requireConfirm:false,
   tasks:clone(TASKS0), rules:clone(RULES0), tfilter:'today', tscope:'mine',
   planReason:{g8:'Дорого', g12:'Нет времени', g20:'Не отвечает'},
   segments:[{id:'s1', name:'Не покупали 3 месяца', conds:[{field:'nopay', val:'3'}]}, {id:'s2', name:'Разборы без клуба в октябре', conds:[{field:'boughtCat', val:'content'}, {field:'club', val:String(CUR), not:true, join:'and'}]}],
   pg:{name:PRODUCTS0[2].name, desc:PRODUCTS0[2].desc, price:String(PRODUCTS0[2].price), slug:PRODUCTS0[2].slug}
  };
 }
 componentWillUnmount() { clearTimeout(this._t); }
 now() { this._clock += 1; var m = this._clock % 60, h = 13 + Math.floor(this._clock / 60); return TODAY + ' ' + h + ':' + (m < 10 ? '0' : '') + m; }
 me() { var r = this.state.role; return byId(this.state.members, r === 'owner' ? 'anna' : r === 'admin' ? 'gulnara' : r === 'marketing' ? 'veronika' : 'tamuna'); }
 can(k) { if (k === 'orders_view') return true; return CAN[k].indexOf(this.state.role) >= 0; }
 flash(msg, undo) { var self = this; this.setState({toast:msg, undo:undo || null}); clearTimeout(this._t); this._t = setTimeout(function () { self.setState({toast:''}); }, 4200); }
 go(screen, extra) { this.setState(Object.assign({screen:screen, drawer:null, userOpen:false, notifOpen:false, colsOpen:false, gq:''}, extra || {})); }
 C(id) { return byId(this.state.clients, id); }
 Pr(id) { return byId(this.state.products, id); }
 updC(id, fn) { return this.state.clients.map(function (c) { if (c.id !== id) return c; var x = clone(c); fn(x); return x; }); }
 updO(id, fn) { return this.state.orders.map(function (o) { if (o.id !== id) return o; var x = clone(o); fn(x); return x; }); }
 logC(x, text) { x.hist.push({dt:this.now(), who:this.me().name, text:text}); }

 derive(c, orders) {
  var self = this, ent = c.legacy.slice(), books = [], packs = [], ltv = 0, last = '', mine = [], auto = false, tier2 = false, matF = false;
  orders.forEach(function (o) {
   if (o.c !== c.id) return;
   mine.push(o);
   var p = self.Pr(o.p), st = status(o);
   if (grants(o, p)) {
    monthsOf(o, p).forEach(function (m) { if (ent.indexOf(m) < 0) ent.push(m); });
    if (p.matForever) matF = true;
    if (p.grant === 'tier2' && mOf(payDate(o)) === CUR) tier2 = true;
    if (p.tier2 && monthsOf(o, p).indexOf(CUR) >= 0) tier2 = true;
    if (p.grant === 'book') p.books.forEach(function (b) { if (books.indexOf(b) < 0) books.push(b); });
    if (p.grant === 'pack' && packs.indexOf(p.pack) < 0) packs.push(p.pack);
    if (o.src === 'App Store' && p.grant === 'month' && mOf(payDate(o)) === CUR) auto = true;
   }
   if (st === 'paid' || st === 'partial') {
    ltv += o.payments.reduce(function (t, pm) { return t + (pm.method === 'Баланс' ? 0 : self.toBYN(pm.amt, o.cur)); }, 0);
    if (payDate(o) > last) last = payDate(o);
   }
  });
  ent.sort(function (a, b) { return a - b; });
  var bal = c.cardOps.reduce(function (t, x) { return t + x.amt; }, 0);
  return {c:c, ent:ent, books:books, packs:packs, ltv:ltv, last:last, orders:mine, bal:bal, auto:auto, tier2:tier2, matForever:matF,
   inClub: ent.indexOf(CUR) >= 0, lastM: ent.length ? ent[ent.length - 1] : -1};
 }
 toBYN(n, cur) { if (cur === 'BYN' || !cur) return n; return n * (parseFloat(String(this.state.rates[cur]).replace(',', '.')) || 0); }
 condPass(c, d, k) {
  var self = this, r;
  if (k.field === 'club') r = d.ent.indexOf(+k.val) >= 0;
  else if (k.field === 'nopay') r = !d.last || d.last.slice(0, 10) < addDays(TODAY, -30 * (+k.val));
  else if (k.field === 'boughtCat') r = d.orders.some(function (o) { var p = self.Pr(o.p); return grants(o, p) && (p.cat === k.val || (k.val === 'club' && p.grant === 'tier2')); });
  else if (k.field === 'bought') r = d.orders.some(function (o) { return o.p === k.val && grants(o, self.Pr(o.p)); });
  else if (k.field === 'tag') r = c.tags.indexOf(k.val) >= 0;
  else if (k.field === 'country') r = c.city.indexOf(k.val) === 0;
  else if (k.field === 'linked') r = (k.val === 'yes') === !!c.linked;
  else if (k.field === 'bot') r = (k.val === 'yes') === !!c.bot;
  else r = d.tier2;
  return k.not ? !r : r;
 }
 matchConds(c, d, conds) {
  if (!conds || !conds.length) return true;
  var groups = [[]], self = this;
  conds.forEach(function (k, i) { if (i > 0 && k.join === 'or') groups.push([]); groups[groups.length - 1].push(k); });
  return groups.some(function (g) { return g.every(function (k) { return self.condPass(c, d, k); }); });
 }
 segPass(d, k) {
  if (k.indexOf('seg:') === 0) { var sg = byId(this.state.segments, k.slice(4)); return sg ? this.matchConds(d.c, d, sg.conds) : false; }
  if (k === 'club') return d.inClub;
  if (k === 'ending') return d.lastM === CUR && !d.auto;
  if (k === 'noclub') return !d.inClub;
  if (k === 'content') return !d.inClub && (d.books.length + d.packs.length) > 0;
  if (k === 'unlinked') return !d.c.linked;
  if (k === 'noorders') return d.ltv === 0 && !d.ent.length;
  if (k === 'long') return d.ent.filter(function (m) { return m >= CUR; }).length >= 6;
  if (k === 'tier2') return d.tier2;
  return true;
 }
 dupOf(c) { if (!c.phone) return null; var ph = c.phone.replace(/\D/g, ''); var self = this; var d = this.state.clients.filter(function (x) { return x.id !== c.id && !x.merged && x.phone && x.phone.replace(/\D/g, '') === ph; }); return d.length ? d[0] : null; }

 // ---------- действия: клиентки
 openClient(id, tab) { this.setState({drawer:{type:'client', id:id}, dtab:tab || 'overview', f:{comment:'', linkEmail:'', tag:'', cardAmt:'', cardText:''}, notifOpen:false, userOpen:false, gq:''}); }
 sendCode(cid) {
  var c = this.C(cid), self = this;
  this.setState({clients:this.updC(cid, function (x) { x.codeSent = true; self.logC(x, 'Отправлен код активации приложения на ' + (c.gk || c.app)); })});
  this.flash('Код CHT-7K3P отправлен на ' + (c.gk || c.app) + '. Клиентка вводит его в приложении — доступ откроется сам.');
 }
 link(cid, email) {
  email = (email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { this.flash('Проверьте почту: нужен адрес, под которым клиентка вошла в приложение.'); return; }
  var self = this;
  this.setState({clients:this.updC(cid, function (x) { x.linked = true; x.app = email; self.logC(x, 'Связана с аккаунтом приложения ' + email); }), f:Object.assign({}, this.state.f, {linkEmail:''})});
  this.flash('Связано с ' + email + '. Все оплаченные доступы открыты в приложении.');
 }
 merge(fromId, intoId) {
  var self = this, from = this.C(fromId), moved = 0, prev = {orders:this.state.orders, clients:this.state.clients};
  var orders = this.state.orders.map(function (o) { if (o.c !== fromId) return o; moved++; var x = clone(o); x.c = intoId; return x; });
  var clients = this.state.clients.map(function (c) {
   if (c.id === fromId) { var y = clone(c); y.merged = true; return y; }
   if (c.id === intoId) { var x = clone(c); x.hist.push({dt:self.now(), who:self.me().name, text:'Объединена с дублем ' + from.gk + ' (заказов перенесено: ' + moved + ')'}); if (from.gk && x.gk !== from.gk) x.comments.push({who:self.me().name, dt:self.now(), text:'Вторая почта: ' + from.gk}); return x; }
   return c;
  });
  this.setState({orders:orders, clients:clients});
  this.flash('Дубли объединены. Заказов перенесено: ' + moved + '.', prev);
 }
 addTag(cid, tag) { tag = (tag || '').trim(); if (!tag) return; var self = this; this.setState({clients:this.updC(cid, function (x) { if (x.tags.indexOf(tag) < 0) x.tags.push(tag); self.logC(x, 'Добавлен тег «' + tag + '»'); }), f:Object.assign({}, this.state.f, {tag:''})}); }
 removeTag(cid, tag) { var self = this, prev = {clients:this.state.clients}; this.flash('Тег «' + tag + '» снят.', prev); this.setState({clients:this.updC(cid, function (x) { x.tags = x.tags.filter(function (t) { return t !== tag; }); self.logC(x, 'Снят тег «' + tag + '»'); })}); }
 addComment(cid) { var t = (this.state.f.comment || '').trim(); if (!t) return; var self = this; this.setState({clients:this.updC(cid, function (x) { x.comments.push({who:self.me().name, dt:self.now(), text:t}); }), f:Object.assign({}, this.state.f, {comment:''})}); }
 cardOp(cid, sign) {
  var f = this.state.f, amt = parseFloat(String(f.cardAmt || '').replace(',', '.')), text = (f.cardText || '').trim();
  if (!(amt > 0)) { this.flash('Укажите сумму больше нуля.'); return; }
  if (!text) { this.flash('Укажите, за что пополнение или списание — это попадёт в историю.'); return; }
  var d = this.derive(this.C(cid), this.state.orders);
  if (sign < 0 && amt > d.bal + 0.001) { this.flash('На карте только ' + money(d.bal) + '.'); return; }
  var self = this;
  this.setState({clients:this.updC(cid, function (x) { x.cardOps.push({dt:TODAY, amt:sign * amt, text:(sign > 0 ? 'Пополнение · ' : 'Списание · ') + text}); self.logC(x, (sign > 0 ? 'Пополнен баланс' : 'Списано с баланса') + ': ' + money(amt)); }), f:Object.assign({}, f, {cardAmt:'', cardText:''})});
  this.flash(sign > 0 ? 'Баланс пополнен на ' + money(amt) + '.' : 'Списано ' + money(amt) + ' с баланса.');
 }

 // ---------- действия: заказы
 openOrder(id) { var o = byId(this.state.orders, id); this.setState({drawer:{type:'order', id:id}, f:{payAmt:String(Math.max(0, Math.round((total(o) - paidAmt(o)) * 100) / 100)), payMethod:'Перевод на карту', promo:o.promo || '', price:String(o.price), refMode:'money', refAmt:String(paidAmt(o)), refReason:'', payAcc:ACCOUNTS[0], payNote:'', edit:false, fakeAsk:false}, notifOpen:false, userOpen:false, gq:''}); }
 afterPaid(orders, clients, o, prevSt) {
  var p = this.Pr(o.p), st = status(o), self = this;
  if (prevSt !== 'paid' && st === 'paid' && p.grant === 'deposit') {
   clients = clients.map(function (c) { if (c.id !== o.c) return c; var x = clone(c); x.cardOps.push({dt:TODAY, amt:(p.deposit || total(o)), text:'Пополнение баланса · заказ #' + o.id}); return x; });
  }
  var plan = this.state.plan;
  if (st === 'paid' && plan[o.c] && plan[o.c] !== 'won') { plan = Object.assign({}, plan); plan[o.c] = 'won'; }
  return {orders:orders, clients:clients, plan:plan};
 }
 addPayment(oid) {
  var f = this.state.f, amt = parseFloat(String(f.payAmt || '').replace(',', '.')), o = byId(this.state.orders, oid);
  if (!(amt > 0)) { this.flash('Укажите сумму платежа.'); return; }
  var left = total(o) - paidAmt(o);
  if (amt > left + 0.001) { this.flash('Сумма больше остатка (' + money(left, o.cur) + ').'); return; }
  var c = this.C(o.c), self = this, prevSt = status(o), patch;
  if (f.payMethod === 'Баланс') {
   if (o.cur !== 'BYN') { this.flash('Клубной картой можно оплатить только заказ в BYN.'); return; }
   var bal = this.derive(c, this.state.orders).bal;
   if (amt > bal + 0.001) { this.flash('На балансе только ' + money(bal) + '.'); return; }
  }
  var who = this.me().name, dt = this.now(), pend = f.payMethod === 'Перевод на карту' && this.state.requireConfirm && !this.can('confirm'), acc = f.payMethod === 'Перевод на карту' ? (f.payAcc || ACCOUNTS[0]) : '', pnote = (f.payNote || '').trim();
  var orders = this.updO(oid, function (x) { x.payments.push({amt:amt, dt:dt, method:f.payMethod, pending:pend, acc:acc, note:pnote}); x.hist.push({dt:dt, who:who, text:(pend ? 'Перевод ' : 'Платёж ') + money(amt, x.cur) + ' · ' + f.payMethod + (acc ? ' → ' + acc : '') + (pnote ? ' (' + pnote + ')' : '') + (pend ? ' — ждёт подтверждения Анны' : '')}); });
  var clients = f.payMethod === 'Баланс' ? this.updC(o.c, function (x) { x.cardOps.push({dt:TODAY, amt:-amt, text:'Списание · заказ #' + oid}); }) : this.state.clients;
  var no = byId(orders, oid);
  patch = this.afterPaid(orders, clients, no, prevSt);
  var left2 = total(no) - paidAmt(no);
  this.setState(Object.assign(patch, {f:Object.assign({}, f, {payNote:'', payAmt:String(Math.max(0, Math.round((left2 - pendAmt(no)) * 100) / 100))})}));
  if (pend) { this.flash('Перевод записан. Анна получит уведомление и подтвердит, что деньги пришли, — тогда откроется доступ.'); return; }
  var p = this.Pr(o.p);
  if (status(no) === 'paid') this.flash('Заказ #' + oid + ' оплачен. ' + (p.grant === 'none' || p.grant === 'ask' ? '' : (c.linked ? 'В приложении открыто: ' + shortGrant(p, no) + '.' : c.name + ' не связана с приложением — отправлен код активации.')));
  else this.flash('Платёж принят. Осталось ' + money(left2, o.cur) + '.');
  if (status(no) === 'paid' && !c.linked && p.grant !== 'none' && p.grant !== 'ask') { this.setState({clients:this.updC(o.c, function (x) { x.codeSent = true; })}); }
 }
 confirmPay(oid, idx) {
  if (!this.can('confirm')) { this.flash('Переводы подтверждает Анна.'); return; }
  var o = byId(this.state.orders, oid), prevSt = status(o), c = this.C(o.c), p = this.Pr(o.p), who = this.me().name, dt = this.now();
  var orders = this.updO(oid, function (x) { x.payments[idx].pending = false; x.hist.push({dt:dt, who:who, text:'Перевод ' + money(x.payments[idx].amt, x.cur) + ' подтверждён: деньги пришли'}); });
  var no = byId(orders, oid), patch = this.afterPaid(orders, this.state.clients, no, prevSt);
  if (status(no) === 'paid' && !c.linked && p.grant !== 'none' && p.grant !== 'ask') patch.clients = patch.clients.map(function (x) { if (x.id !== c.id) return x; var y = clone(x); y.codeSent = true; return y; });
  this.setState(patch);
  this.flash('Перевод подтверждён. ' + (status(no) === 'paid' ? (p.grant === 'none' || p.grant === 'ask' ? 'Заказ оплачен.' : (c.linked ? 'В приложении открыто: ' + shortGrant(p, no) + '.' : 'Клиентке отправлен код активации приложения.')) : 'Осталось ' + money(total(no) - paidAmt(no), no.cur) + '.'));
 }
 addOrderComment(oid) { var t = (this.state.f.ocomment || '').trim(); if (!t) return; var who = this.me().name, dt = this.now(); this.setState({orders:this.updO(oid, function (x) { x.comments.push({who:who, dt:dt, text:t}); }), f:Object.assign({}, this.state.f, {ocomment:''})}); }
 resendLetter(oid) { var o = byId(this.state.orders, oid), c = this.C(o.c), p = this.Pr(o.p), who = this.me().name, dt = this.now(); this.setState({orders:this.updO(oid, function (x) { x.hist.push({dt:dt, who:who, text:'Письмо после оплаты отправлено повторно'}); })}); this.flash('Письмо после оплаты отправлено ещё раз на ' + (c.gk || c.app) + (p.tgLink ? ' — со ссылкой на канал ' + p.tgLink : '') + '.'); }
 resendChannel(cid) {
  var self = this, d = this.derive(this.C(cid), this.state.orders), links = [];
  d.orders.forEach(function (o) { var p = self.Pr(o.p); if (isActive(o) && p.tgLink && links.indexOf(p.tgLink) < 0) links.push(p.tgLink); });
  if (d.inClub && links.indexOf('t.me/+chitatel_club_october') < 0) links.unshift('t.me/+chitatel_club_october');
  if (!links.length) { this.flash('У клиентки нет оплаченных каналов.'); return; }
  var c = this.C(cid);
  this.setState({clients:this.updC(cid, function (x) { self.logC(x, 'Повторно отправлены ссылки на каналы: ' + links.join(', ')); })});
  this.flash('Ссылки на каналы отправлены ' + (c.tg ? 'в Telegram-бот и ' : '') + 'на почту: ' + links.join(', ') + '.');
 }
 removePay(oid, i) {
  var who = this.me().name, dt = this.now(), prev = {orders:this.state.orders};
  this.setState({orders:this.updO(oid, function (x) { var pm = x.payments[i]; x.payments.splice(i, 1); x.hist.push({dt:dt, who:who, text:'Платёж удалён: ' + money(pm.amt, x.cur) + ' · ' + pm.method}); })});
  this.flash('Платёж удалён. Статус заказа пересчитан.', prev);
 }
 setEdit(oid, on) { var who = this.me().name, dt = this.now(); if (!on) this.setState({orders:this.updO(oid, function (x) { x.hist.push({dt:dt, who:who, text:'Заказ отредактирован'}); })}); this.setState({f:Object.assign({}, this.state.f, {edit:on, fakeAsk:false})}); }
 restore(oid) { var who = this.me().name, dt = this.now(); this.setState({orders:this.updO(oid, function (x) { x.st = ''; x.hist.push({dt:dt, who:who, text:'Возвращён в работу'}); })}); this.flash('Заказ #' + oid + ' возвращён в работу.'); }
 startThread(cid, ch) {
  var me = this.me().name, t = this.state.threads.filter(function (x) { return x.c === cid && x.channel === ch; })[0], threads = this.state.threads;
  if (!t) { t = {id:'t' + cid + ch.length, c:cid, channel:ch, dt:this.now(), answered:true, assign:me, msgs:[]}; threads = [t].concat(threads); }
  this.setState({threads:threads}); this.go('inbox', {tid:t.id, ifilter:'all'});
 }
 sellMonth(book) {
  if (!this.can('products')) return;
  var id = 'p' + (200 + this.state.products.length), p = P({id:id, cat:'content', name:'Разбор «' + book + '»', price:140, grant:'book', books:[book], term:'навсегда', slug:tr(book).replace(/[^a-z0-9]+/g, '-'), ask:'Завести продукт в App Store и Google Play', desc:'Разбор книги месяца клуба\nДоступ навсегда в приложении ЧИТАТЕЛЬ'});
  this.setState({products:this.state.products.concat([p])});
  this.flash('Разбор «' + book + '» продаётся отдельно за 140 BYN. Страница оплаты: pay.chitatel.app/' + p.slug + '.');
 }
 pickPage(id) { var p = this.Pr(id); this.setState({pageSel:id, pg:{name:p.name, desc:p.desc || '', price:p.price === null ? '' : String(p.price), slug:p.slug}, ck:{promo:'', disc:0, promoMsg:'', gift:false, method:'bepaid', email:'', giftEmail:''}}); }
 savePage() {
  var g = this.state.pg, id = this.state.pageSel, price = String(g.price).trim() === '' ? null : parseFloat(String(g.price).replace(',', '.'));
  if (!g.name.trim()) { this.flash('Укажите название.'); return; }
  if (price !== null && !(price >= 0)) { this.flash('Цена должна быть числом.'); return; }
  if (!/^[a-z0-9-]+$/.test(g.slug)) { this.flash('Адрес: латинские буквы, цифры и дефис.'); return; }
  this.setState({products:this.state.products.map(function (p) { return p.id === id ? Object.assign({}, p, {name:g.name.trim(), desc:g.desc, price:price, slug:g.slug}) : p; })});
  this.flash('Страница сохранена: pay.chitatel.app/' + g.slug + '.');
 }
 duplicatePage() {
  var src = this.Pr(this.state.pageSel), id = 'p' + (300 + this.state.products.length), copy = Object.assign(clone(src), {id:id, name:src.name + ' (копия)', slug:src.slug + '-copy'});
  this.setState({products:this.state.products.concat([copy])}); this.pickPage(id);
  this.flash('Создана копия. Поменяйте название, цену и описание и сохраните.');
 }
 orderField(oid, key, val, label) { var self = this, who = this.me().name, dt = this.now(); this.setState({orders:this.updO(oid, function (x) { x[key] = val; x.hist.push({dt:dt, who:who, text:label}); })}); }
 changeProduct(oid, pid) { var p = this.Pr(pid), self = this, who = this.me().name, dt = this.now(); this.setState({orders:this.updO(oid, function (x) { x.p = pid; x.price = p.price || 0; x.cur = p.cur; x.disc = 0; x.promo = ''; x.hist.push({dt:dt, who:who, text:'Позиция изменена: ' + p.name}); }), f:Object.assign({}, this.state.f, {price:String(p.price || 0), promo:''})}); }
 changePrice(oid) { var v = parseFloat(String(this.state.f.price).replace(',', '.')); if (!(v >= 0)) { this.flash('Цена должна быть числом.'); return; } var o = byId(this.state.orders, oid); this.orderField(oid, 'price', v, 'Цена изменена: ' + money(o.price, o.cur) + ' → ' + money(v, o.cur)); this.flash('Цена обновлена.'); }
 applyPromoOrder(oid) {
  var code = (this.state.f.promo || '').trim().toUpperCase(), o = byId(this.state.orders, oid), p = this.Pr(o.p);
  var pr = byId(this.state.promos.map(function (x) { return Object.assign({id:x.code}, x); }), code), chk = promoCheck(pr, p);
  if (!chk.ok) { this.flash(chk.why + '.'); return; }
  var d = promoDisc(pr, o.price), who = this.me().name, dt = this.now();
  this.setState({orders:this.updO(oid, function (x) { x.promo = code; x.disc = d; x.hist.push({dt:dt, who:who, text:'Применён промокод ' + code + ' (−' + money(d, x.cur) + ')'}); }), promos:this.state.promos.map(function (x) { return x.code === code ? Object.assign({}, x, {used:x.used + 1}) : x; })});
  this.flash('Промокод ' + code + ' применён: −' + money(d, o.cur) + '.');
 }
 markFake(oid) { var who = this.me().name, dt = this.now(), prev = {orders:this.state.orders}; this.setState({orders:this.updO(oid, function (x) { x.st = 'fake'; x.hist.push({dt:dt, who:who, text:'Помечен как ложный'}); })}); this.flash('Заказ #' + oid + ' помечен как ложный.', prev); }
 copyLink(oid) { var who = this.me().name, dt = this.now(); this.setState({orders:this.updO(oid, function (x) { x.hist.push({dt:dt, who:who, text:'Скопирована ссылка на оплату'}); })}); this.flash('Ссылка pay.chitatel.app/o/' + oid + ' скопирована.'); }
 mailLink(oid) { var o = byId(this.state.orders, oid), c = this.C(o.c), who = this.me().name, dt = this.now(); if (!c.gk && !c.app) { this.flash('У клиентки нет почты.'); return; } this.setState({orders:this.updO(oid, function (x) { x.reminded = true; x.hist.push({dt:dt, who:who, text:'Ссылка на оплату отправлена на почту'}); })}); this.flash('Ссылка на оплату отправлена на ' + (c.gk || c.app) + '.'); }
 refund(oid) {
  var f = this.state.f, o = byId(this.state.orders, oid), amt = parseFloat(String(f.refAmt || '').replace(',', '.'));
  if (!this.can('refund')) { this.flash('Возвраты доступны владельцу и администратору.'); return; }
  if (!(amt > 0) || amt > paidAmt(o) + 0.001) { this.flash('Сумма возврата — от 0 до ' + money(paidAmt(o), o.cur) + '.'); return; }
  if (!(f.refReason || '').trim()) { this.flash('Укажите причину возврата.'); return; }
  if (f.refMode === 'card' && o.cur !== 'BYN') { this.flash('Перезачесть на баланс можно только заказ в BYN.'); return; }
  var who = this.me().name, dt = this.now(), label = f.refMode === 'card' ? 'Перезачёт на баланс' : 'Возврат денег';
  var orders = this.updO(oid, function (x) { x.st = 'refund'; x.refund = {amt:amt, mode:f.refMode, reason:f.refReason.trim()}; x.hist.push({dt:dt, who:who, text:label + ' ' + money(amt, x.cur) + ': ' + f.refReason.trim() + '. Доступ закрыт.'}); });
  var clients = f.refMode === 'card' ? this.updC(o.c, function (x) { x.cardOps.push({dt:TODAY, amt:amt, text:'Пополнение · перезачёт заказа #' + oid}); }) : this.state.clients;
  this.setState({orders:orders, clients:clients});
  this.flash(label + ' оформлен. Доступ по заказу #' + oid + ' закрыт' + (f.refMode === 'card' ? ', ' + money(amt) + ' на балансе.' : '.'));
 }

 // ---------- новый заказ
 openNew(pre) {
  pre = pre || {};
  var p = this.Pr(pre.p || 'p3');
  this.setState({drawer:{type:'new'}, notifOpen:false, userOpen:false, gq:'', f:{c:pre.c || '', cq:'', p:p.id, price:p.price === null ? '' : String(p.price), cur:p.cur, gift:false, giftName:'', giftEmail:'', promo:'', disc:0, promoMsg:'', method:pre.method || 'link', payMethod:'Перевод на карту', payAcc:ACCOUNTS[0], payNote:'', reason:'', days:'3', manager:this.me().name}});
 }
 newPromo() {
  var f = this.state.f, code = (f.promo || '').trim().toUpperCase(), p = this.Pr(f.p);
  var pr = byId(this.state.promos.map(function (x) { return Object.assign({id:x.code}, x); }), code), chk = promoCheck(pr, p);
  var price = parseFloat(String(f.price).replace(',', '.')) || 0;
  if (!chk.ok) { this.setState({f:Object.assign({}, f, {disc:0, promoMsg:chk.why})}); return; }
  this.setState({f:Object.assign({}, f, {promo:code, disc:promoDisc(pr, price), promoMsg:'Скидка ' + (pr.type === '%' ? pr.val + '%' : money(pr.val))})});
 }
 createOrder() {
  var f = this.state.f, s = this.state, self = this, p = this.Pr(f.p), c = this.C(f.c);
  if (!c) { this.flash('Выберите клиентку.'); return; }
  var price = parseFloat(String(f.price).replace(/\s/g, '').replace(',', '.'));
  if (f.method !== 'free' && !(price > 0)) { this.flash('Укажите сумму.'); return; }
  if (f.method === 'free' && !f.reason.trim()) { this.flash('Укажите причину выдачи без оплаты.'); return; }
  if (f.gift && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.giftEmail.trim())) { this.flash('Укажите почту получательницы подарка.'); return; }
  var disc = f.method === 'free' ? 0 : (f.disc || 0), tot = f.method === 'free' ? 0 : Math.max(0, price - disc);
  var bal = this.derive(c, s.orders).bal;
  if (f.method === 'card' && (f.cur !== 'BYN' || tot > bal + 0.001)) { this.flash(f.cur !== 'BYN' ? 'С баланса — только в BYN.' : 'На балансе только ' + money(bal) + '.'); return; }
  var id = Math.max.apply(null, s.orders.map(function (o) { return o.id; })) + 1, dt = this.now(), who = this.me().name;
  var o = O({id:id, dt:dt, c:c.id, p:p.id, price: f.method === 'free' ? (p.price || 0) : price, cur:f.cur, disc:disc, promo: disc ? f.promo : '', src:'Ручной заказ', manager:f.manager, deadline: f.method === 'link' ? addDays(TODAY, +f.days) : '', note: f.method === 'free' ? f.reason.trim() : '',
   gift: f.gift ? {name:f.giftName.trim(), email:f.giftEmail.trim()} : null, st: f.method === 'free' ? 'free' : ''});
  o.hist = [{dt:dt, who:who, text:'Заказ создан вручную'}];
  if (f.method === 'manual') { var pnd = f.payMethod === 'Перевод на карту' && this.state.requireConfirm && !this.can('confirm'); o.payments.push({amt:tot, dt:dt, method:f.payMethod, pending:pnd, acc: f.payMethod === 'Перевод на карту' ? (f.payAcc || ACCOUNTS[0]) : '', note:(f.payNote || '').trim()}); o.hist.push({dt:dt, who:who, text:(pnd ? 'Перевод ' : 'Платёж ') + money(tot, f.cur) + ' · ' + f.payMethod + (pnd ? ' — ждёт подтверждения Анны' : '')}); }
  if (f.method === 'card') { o.payments.push(pay(tot, dt, 'Баланс')); o.hist.push({dt:dt, who:who, text:'Оплачено с баланса ' + money(tot)}); }
  if (f.method === 'free') o.hist.push({dt:dt, who:who, text:'Выдано без оплаты: ' + f.reason.trim()});
  if (f.gift) o.hist.push({dt:dt, who:who, text:'Подарок для ' + (f.giftName.trim() || f.giftEmail.trim()) + ' — доступ получит она'});
  var orders = [o].concat(s.orders);
  var clients = s.clients.map(function (x) {
   if (x.id !== c.id) return x; var y = clone(x);
   if (f.method === 'card') y.cardOps.push({dt:TODAY, amt:-tot, text:'Списание · заказ #' + id});
   if (f.method === 'free') y.comments.push({who:who, dt:dt, text:'Выдано без оплаты (заказ #' + id + '): ' + f.reason.trim()});
   if (f.promo && disc) {}
   return y;
  });
  var promos = disc ? s.promos.map(function (x) { return x.code === f.promo ? Object.assign({}, x, {used:x.used + 1}) : x; }) : s.promos;
  var patch = this.afterPaid(orders, clients, o, 'new');
  patch.promos = promos;
  patch.drawer = {type:'order', id:id};
  patch.f = {payAmt:String(Math.max(0, tot - paidAmt(o))), payMethod:'Перевод на карту', payAcc:ACCOUNTS[0], payNote:'', promo:o.promo, price:String(o.price), refMode:'money', refAmt:String(paidAmt(o)), refReason:'', edit:false, fakeAsk:false};
  this.setState(patch);
  var st = status(o);
  if (st === 'confirm') { this.flash('Заказ #' + id + ' создан. Перевод ждёт подтверждения Анны — доступ откроется после него.'); return; }
  if (f.method === 'link' && (byId(s.rules, 'r4') || {}).on) { var at = {id:'ka' + id, type:'call', c:c.id, title:'Проверить оплату заказа #' + id + ', если нет — позвонить', due:o.deadline + ' 12:00', pri:'mid', who:f.manager, done:false, auto:'Новый счёт по ссылке'}; this.setState({tasks:[at].concat(this.state.tasks), rules:this.state.rules.map(function (r) { return r.id === 'r4' ? Object.assign({}, r, {n:r.n + 1}) : r; })}); }
  if (f.method === 'link') this.flash('Заказ #' + id + ' создан, ссылка скопирована. Напоминание уйдёт автоматически, срок — ' + fmtD(o.deadline) + '.');
  else this.flash('Заказ #' + id + ' ' + (st === 'free' ? 'выдан' : 'оплачен') + '. ' + (p.grant === 'none' || p.grant === 'ask' ? '' : (f.gift ? 'Получательнице уйдёт письмо с кодом активации.' : (c.linked ? 'В приложении открыто: ' + shortGrant(p, o) + '.' : 'Клиентка не связана с приложением — отправлен код активации.'))));
  if ((st === 'paid' || st === 'free') && !c.linked && !f.gift && p.grant !== 'none' && p.grant !== 'ask') this.setState({clients:this.updC(c.id, function (x) { x.codeSent = true; })});
 }

 // ---------- продукты, промокоды, рассылки
 openProduct(id) { var p = this.Pr(id); this.setState({drawer:{type:'product', id:id}, f:Object.assign(clone(p), {price:p.price === null ? '' : String(p.price), deposit:String(p.deposit || '')})}); }
 newProduct() { this.setState({drawer:{type:'product', id:'new'}, f:P({id:'new', name:'', price:'', grant:'book', cat:'content', term:'навсегда'})}); }
 saveProduct() {
  if (!this.can('products')) return;
  var f = this.state.f, self = this;
  if (!f.name.trim()) { this.flash('Укажите название.'); return; }
  var price = String(f.price).trim() === '' ? null : parseFloat(String(f.price).replace(',', '.'));
  if (price !== null && !(price >= 0)) { this.flash('Цена должна быть числом или пустой («по договорённости»).'); return; }
  var data = Object.assign({}, f, {name:f.name.trim(), price:price, deposit:parseFloat(f.deposit) || 0, ask:f.ask});
  if (data.grant === 'book' && !(data.books || []).length) { this.flash('Отметьте хотя бы один разбор.'); return; }
  if (data.grant === 'pack' && !data.pack.trim()) { this.flash('Укажите, какой пакет открывается.'); return; }
  var products;
  if (f.id === 'new') { data.id = 'p' + (100 + this.state.products.length); data.slug = data.slug || data.id; products = this.state.products.concat([data]); }
  else products = this.state.products.map(function (p) { return p.id === f.id ? data : p; });
  this.setState({products:products, drawer:null});
  this.flash(f.id === 'new' ? 'Продукт создан. Страница оплаты: pay.chitatel.app/' + data.slug : 'Продукт сохранён.');
 }
 createPromo() {
  var n = this.state.np, code = n.code.trim().toUpperCase(), val = parseFloat(String(n.val).replace(',', '.'));
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) { this.flash('Код: 3–20 латинских букв или цифр.'); return; }
  if (byId(this.state.promos.map(function (x) { return {id:x.code}; }), code)) { this.flash('Такой промокод уже есть.'); return; }
  if (!(val > 0) || (n.type === '%' && val > 100)) { this.flash('Скидка: число больше нуля, для процентов — не больше 100.'); return; }
  this.setState({promos:[{code:code, type:n.type, val:val, scope:n.scope, used:0, limit:parseInt(n.limit, 10) || 0, until:n.until || '2026-12-31', on:true}].concat(this.state.promos), np:{code:'', type:'%', val:'', scope:'all', limit:'', until:'2026-12-31'}});
  this.flash('Промокод ' + code + ' создан.');
 }
 openTask(pre) {
  pre = pre || {}; var t = pre.tid ? byId(this.state.tasks, pre.tid) : null;
  this.setState({drawer:{type:'task'}, notifOpen:false, userOpen:false, gq:'', f: t ? {tid:t.id, type:t.type, title:t.title, c:t.c, cq:'', date:t.due.slice(0, 10), time:t.due.slice(11, 16), pri:t.pri, who:t.who} : {tid:'new', type:pre.type || 'call', title:pre.title || '', c:pre.c || '', cq:'', date:addDays(TODAY, 1), time:'12:00', pri:'mid', who:this.me().name}});
 }
 saveTask() {
  var f = this.state.f, self = this;
  if (!f.title.trim()) { this.flash('Напишите, что нужно сделать.'); return; }
  if (!f.c) { this.flash('Выберите клиентку.'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || !/^\d{2}:\d{2}$/.test(f.time)) { this.flash('Укажите дату и время.'); return; }
  var t = {id: f.tid === 'new' ? 'k' + (this.state.tasks.length + 1) + Math.round(Math.random() * 1000) : f.tid, type:f.type, title:f.title.trim(), c:f.c, due:f.date + ' ' + f.time, pri:f.pri, who:f.who, done:false, auto:''};
  var tasks = f.tid === 'new' ? [t].concat(this.state.tasks) : this.state.tasks.map(function (x) { return x.id === t.id ? Object.assign({}, x, t, {done:x.done, auto:x.auto}) : x; });
  this.setState({tasks:tasks, drawer:null, clients:this.updC(f.c, function (x) { self.logC(x, (f.tid === 'new' ? 'Задача: ' : 'Задача изменена: ') + t.title + ' · ' + fmtD(t.due) + ' ' + t.due.slice(11)); })});
  this.flash(f.tid === 'new' ? 'Задача создана: ' + fmtD(t.due) + ' ' + t.due.slice(11) + ', ' + t.who + '.' : 'Задача сохранена.');
 }
 doneTask(id) {
  var prev = {tasks:this.state.tasks}, t = byId(this.state.tasks, id), self = this;
  this.setState({tasks:this.state.tasks.map(function (x) { return x.id === id ? Object.assign({}, x, {done:!x.done}) : x; })});
  if (!t.done) { this.setState({clients:this.updC(t.c, function (x) { self.logC(x, 'Выполнена задача: ' + t.title); })}); this.flash('Задача выполнена.', prev); }
 }
 postpone(id) { var t = byId(this.state.tasks, id), d = (t.due.slice(0, 10) < TODAY ? TODAY : t.due.slice(0, 10)); this.setState({tasks:this.state.tasks.map(function (x) { return x.id === id ? Object.assign({}, x, {due:addDays(d, 1) + ' ' + x.due.slice(11)}) : x; })}); this.flash('Перенесено на ' + fmtD(addDays(d, 1)) + '.'); }
 openSegment() { this.setState({drawer:{type:'seg'}, f:{segName:'', conds:[{field:'nopay', val:'3'}]}, notifOpen:false, userOpen:false}); }
 saveSegment(name, conds) {
  name = (name || '').trim(); if (!name) { this.flash('Назовите сегмент.'); return null; }
  var sg = {id:'s' + (this.state.segments.length + 1) + name.length, name:name, conds:clone(conds || [])};
  this.setState({segments:this.state.segments.concat([sg])}); this.flash('Сегмент «' + name + '» сохранён — он есть в «Клиентах» и в рассылках.'); return sg;
 }
 toggleChannel(cid, ch, auto) {
  var self = this, cur = (this.C(cid).chan || {})[ch], next = cur ? null : (auto ? 'out' : 'in');
  this.setState({clients:this.updC(cid, function (x) { x.chan = Object.assign({}, x.chan || {}); if (next) x.chan[ch] = next; else delete x.chan[ch]; self.logC(x, (next === 'out' ? 'Вручную убрана из канала: ' : next === 'in' ? 'Вручную добавлена в канал: ' : 'Канал снова по оплатам: ') + ch); })});
 }
 openCampaign() { this.setState({drawer:{type:'camp'}, f:{name:'', conds:[{field:'club', val:String(CUR)}], ch:'Email', subject:'', text:'', fmt:'text', html:'', when:'now', at:'2026-10-22T10:00'}}); }
 createCampaign(count) {
  var f = this.state.f;
  if (!f.name.trim() || !(f.fmt === 'html' ? f.html.trim() : f.text.trim())) { this.flash(f.fmt === 'html' ? 'Заполните название и вставьте HTML письма.' : 'Заполните название и текст.'); return; }
  if (f.ch !== 'Telegram-бот' && !f.subject.trim()) { this.flash('Для письма нужна тема.'); return; }
  var seg = this._segLabel || 'Вся база';
  var c = {id:'m' + Date.now(), name:f.name.trim(), seg:seg, ch:f.ch, status: f.when === 'now' ? 'Отправлена' : 'Запланирована', dt: f.when === 'now' ? this.now() : f.at.replace('T', ' '), sent: f.when === 'now' ? count : 0, open:'—'};
  this.setState({camps:[c].concat(this.state.camps), drawer:null});
  this.flash(f.when === 'now' ? 'Рассылка отправлена: ' + count + ' ' + plural(count, 'получатель', 'получателя', 'получателей') + '.' : 'Рассылка запланирована на ' + fmtD(c.dt) + ' ' + c.dt.slice(11) + '.');
 }

 renderVals() {
  var self = this, s = this.state, role = s.role, me = this.me();
  var D = {}; s.clients.forEach(function (c) { D[c.id] = self.derive(c, s.orders); });
  var live = s.clients.filter(function (c) { return !c.merged; });
  function chipStyle(on) { return 'font:inherit;font-size:13px;font-weight:600;border-radius:999px;padding:5px 12px;min-height:32px;cursor:pointer;white-space:nowrap;border:1px solid ' + (on ? '#2453A6' : '#D5D9E0') + ';background:' + (on ? '#2453A6' : '#FFFFFF') + ';color:' + (on ? '#FFFFFF' : '#171A21'); }
  function chips(key, defs, counter) { return defs.map(function (d) { var on = s[key] === d[0]; return {text:d[1] + (counter ? ' · ' + counter(d[0]) : ''), style:chipStyle(on), pick:function () { var p = {}; p[key] = d[0]; if (key === 'cf') p.cpage = 1; if (key === 'otab') p.opage = 1; self.setState(p); }}; }); }
  function tabs(key, defs) { return defs.map(function (d) { var on = s[key] === d[0]; return {label:d[1], pick:function () { var p = {}; p[key] = d[0]; self.setState(p); }, style:'font:inherit;font-size:14px;font-weight:600;background:none;border:0;border-bottom:2px solid ' + (on ? '#2453A6' : 'transparent') + ';color:' + (on ? '#171A21' : '#5B6170') + ';padding:10px 2px;cursor:pointer;white-space:nowrap'}; }); }
  function heads(key, defs) {
   var cur = s[key];
   return defs.map(function (d) {
    var k = d[1], on = !!k && cur.key === k;
    return {label:d[0], sortable:!!k, plain:!k, arrow: on ? (cur.dir === 'asc' ? '↑' : '↓') : '',
     sort:function () { var p = {}; p[key] = {key:k, dir: on ? (cur.dir === 'asc' ? 'desc' : 'asc') : (d[2] || 'asc')}; self.setState(p); },
     style:'font:inherit;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;background:none;border:0;padding:0;cursor:pointer;text-align:left;white-space:nowrap;color:' + (on ? '#171A21' : '#5B6170')};
   });
  }
  function pager(n, page, key, size) {
   var pages = Math.max(1, Math.ceil(n / size)), pg = Math.min(page, pages), a = n ? (pg - 1) * size + 1 : 0, b = Math.min(n, pg * size);
   var list = []; for (var i = 1; i <= pages; i++) { (function (i) { var on = i === pg; list.push({n:i, go:function () { var p = {}; p[key] = i; self.setState(p); }, style:'font:inherit;font-size:13px;font-weight:600;min-width:32px;height:32px;border-radius:6px;cursor:pointer;border:1px solid ' + (on ? '#2453A6' : '#D5D9E0') + ';background:' + (on ? '#2453A6' : '#FFFFFF') + ';color:' + (on ? '#FFFFFF' : '#171A21')}); })(i); }
   return {info:a + '–' + b + ' из ' + n, pages:list, hasPrev:pg > 1, hasNext:pg < pages, noPrev:!(pg > 1), noNext:!(pg < pages), prev:function () { var p = {}; p[key] = pg - 1; self.setState(p); }, next:function () { var p = {}; p[key] = pg + 1; self.setState(p); }, page:pg, size:size};
  }
  function ord(o) {
   var c = self.C(o.c), p = self.Pr(o.p), st = status(o), a = appState(o);
   return {id:o.id, date:fmtD(o.dt), name:c.name, product:p.name, amount:money(total(o), o.cur), paid:money(paidAmt(o), o.cur), st:ST[st][0], stStyle:pill(ST[st][1]),
    src:srcLabel(o), srcStyle:pill(o.src === 'App Store' || o.src === 'Google Play' ? 'ask' : 'mute'), mgr:o.manager || '—', app:a.text, appStyle:pill(a.tone),
    note:o.note || '', hasNote:!!o.note, gift:!!o.gift, open:function () { self.openOrder(o.id); }};
  }
  function appState(o) {
   var p = self.Pr(o.p), c = self.C(o.c), st = status(o);
   if (p.grant === 'none') { if (p.tgLink && grants(o, p)) return {text: st === 'partial' ? 'ТГК открыт · рассрочка' : 'Доступ: ТГК', tone:'ok'}; return {text:'Вне приложения', tone:'mute'}; }
   if (p.grant === 'tier2') return grants(o, p) ? {text:'Зум этого месяца', tone:'ok'} : {text:'После оплаты', tone:'mute'};
   if (st === 'partial' && p.accessOnFirst) return {text:'Открыто · рассрочка', tone:'ok'};
   if (p.grant === 'ask') return {text:'Нужно уточнить', tone:'ask'};
   if (st === 'refund') return {text:'Доступ закрыт', tone:'mute'};
   if (st === 'fake') return {text:'—', tone:'mute'};
   if (st === 'confirm') return {text:'После подтверждения', tone:'mute'};
   if (st !== 'paid' && st !== 'free') return {text:'После оплаты', tone:'mute'};
   if (p.grant === 'deposit') return {text:'Зачислено на баланс', tone:'ok'};
   if (o.src === 'App Store' || o.src === 'Google Play') return {text:'Выдано автоматически', tone:'ok'};
   if (o.gift) return {text:'Код у получательницы', tone:'wait'};
   if (c.linked) return {text:'Открыто: ' + shortGrant(p, o), tone:'ok'};
   if (c.codeSent) return {text:'Код отправлен', tone:'wait'};
   return {text:'Ждёт привязки', tone:'warn'};
  }

  // ---------- навигация
  var counts = {
   unpaid: s.orders.filter(function (o) { var t = status(o); return t === 'new' || t === 'overdue'; }).length,
   inbox: s.threads.filter(function (t) { return !t.answered && t.cat !== 'spam'; }).length,
   tg: s.tgreq.length,
   pend: s.orders.filter(function (o) { return status(o) === 'confirm' || (pendAmt(o) > 0 && status(o) !== 'fake' && status(o) !== 'refund'); }).length,
   plan: 0
  };
  var meName = me.name;
  var mineOpen = s.tasks.filter(function (t) { return !t.done && t.who === meName; });
  counts.tasks = mineOpen.filter(function (t) { return t.due.slice(0, 10) <= TODAY; }).length;
  function taskRow(t) {
   var c = self.C(t.c), over = !t.done && t.due < NOW, today = t.due.slice(0, 10) === TODAY;
   return {title:t.title, type:TTYPES[t.type], client:c ? c.name : '—', openClient:function () { if (c) self.openClient(c.id); }, due:fmtD(t.due) + ' ' + t.due.slice(11, 16),
    dueStyle:'font-size:13px;font-weight:600;white-space:nowrap;color:' + (t.done ? '#8A909C' : over ? '#8A2E1C' : today ? '#7A4A0B' : '#3A4050'), over:over, overText: over ? 'просрочена' : '',
    pri:PRI[t.pri][0], priStyle:pill(PRI[t.pri][1]), who:t.who, auto:t.auto, hasAuto:!!t.auto, done:t.done,
    titleStyle:'font-weight:600;' + (t.done ? 'text-decoration:line-through;color:#8A909C' : ''),
    toggle:function () { self.doneTask(t.id); }, postpone:function () { self.postpone(t.id); }, edit:function () { self.openTask({tid:t.id}); }, canPostpone:!t.done};
  }
  var seenU = {};
  var unlinkedOrders = s.orders.filter(function (o) { var p = self.Pr(o.p), c = self.C(o.c); return isActive(o) && !c.merged && p.grant !== 'none' && p.grant !== 'ask' && p.grant !== 'deposit' && o.src !== 'App Store' && !o.gift && !c.linked && payDate(o).slice(0, 10) >= addDays(TODAY, -14); })
   .sort(function (a, b) { return payDate(a) < payDate(b) ? 1 : -1; }).filter(function (o) { if (seenU[o.c]) return false; seenU[o.c] = true; return true; });

  // ---------- план продаж
  var cards = [];
  live.forEach(function (c) {
   var d = D[c.id], kind = '', why = '', offer = 'p3', oid = 0;
   var unpaidO = d.orders.filter(function (o) { var t = status(o); return t === 'new' || t === 'overdue'; })[0];
   if (unpaidO) { kind = 'unpaid'; why = 'Счёт #' + unpaidO.id + ' · ' + self.Pr(unpaidO.p).name; offer = unpaidO.p; oid = unpaidO.id; }
   else if (d.lastM === CUR && !d.auto && (function () { var n = 0, k = CUR; while (d.ent.indexOf(k) >= 0) { n++; k--; } return n >= 3; })()) { kind = 'renew'; why = 'Длительный доступ заканчивается 31.10'; offer = 'p3'; }
   else if (d.lastM >= CUR - 3 && d.lastM < CUR) { kind = 'lapsed'; why = 'Последний месяц — ' + mFull(d.lastM); offer = 'p1'; }
   else if (!d.inClub && d.lastM < CUR && (d.books.length + d.packs.length) > 0) { kind = 'content'; why = 'Купила: ' + d.books.concat(d.packs).slice(0, 2).join(', '); offer = 'p3'; }
   else if (s.plan[c.id]) { kind = 'manual'; why = 'Добавлена из списка клиенток'; }
   if (!kind) return;
   cards.push({c:c, d:d, kind:kind, why:why, offer:offer, oid:oid, stage:s.plan[c.id] || 'todo'});
  });
  counts.plan = cards.filter(function (x) { return x.stage === 'todo'; }).length;
  var planKinds = [['all','Все'],['unpaid','Не оплатили счёт'],['renew','Абонемент заканчивается'],['lapsed','Не продлили'],['content','Разборы без клуба']];
  var sChips = chips('sf', planKinds, function (k) { return cards.filter(function (x) { return k === 'all' || x.kind === k; }).length; });
  var planCols = PLAN_COLS.map(function (col, ci) {
   var list = cards.filter(function (x) { return x.stage === col[0] && (s.sf === 'all' || x.kind === s.sf); }).map(function (x) {
    var move = function (dir) { return function () { var p = Object.assign({}, s.plan); p[x.c.id] = PLAN_COLS[ci + dir][0]; self.setState({plan:p}); }; };
    var offerP = self.Pr(x.offer);
    return {name:x.c.name, open:function () { self.openClient(x.c.id); }, kind:PLAN_KIND[x.kind][0], kindStyle:pill(PLAN_KIND[x.kind][1]), why:x.why,
     offer:offerP.name, last: x.d.last ? 'Последняя оплата ' + fmtD(x.d.last) : 'Оплат не было', contact: x.c.tg || x.c.phone || x.c.gk,
     hasPrev:ci > 0, hasNext:ci < PLAN_COLS.length - 1, prev:ci > 0 ? move(-1) : null, next:ci < PLAN_COLS.length - 1 ? move(1) : null,
     task:function () { self.openTask({c:x.c.id, type:'call', title:'Связаться: ' + offerP.name}); }, isLost:x.stage === 'lost', reason:s.planReason[x.c.id] || '', reasonOpts:[{v:'', label:'Причина отказа…'}].concat(LOSS.map(function (r) { return {v:r, label:r}; })), onReason:function (e) { var pr = Object.assign({}, s.planReason); pr[x.c.id] = e.target.value; self.setState({planReason:pr}); },
     order:function () { if (x.oid) self.openOrder(x.oid); else self.openNew({c:x.c.id, p:x.offer}); }, orderLabel: x.oid ? 'Открыть счёт' : 'Создать заказ'};
   });
   return {title:col[1], count:list.length, cards:list, empty:!list.length};
  });

  // ---------- уведомления
  var notifs = [];
  s.orders.forEach(function (o) { o.payments.forEach(function (pm, i) { if (!pm.pending || status(o) === 'fake' || status(o) === 'refund') return; notifs.push({id:'c' + o.id + '_' + i, dt:pm.dt, text:'Перевод ждёт подтверждения · ' + self.C(o.c).name, sub:money(pm.amt, o.cur) + ' · заказ #' + o.id + (role === 'owner' ? ' · подтвердите, что деньги пришли' : ' · подтвердит Анна'), go:function () { self.openOrder(o.id); }}); }); });
  s.orders.forEach(function (o) {
   o.payments.forEach(function (pm, i) {
    if (pm.dt.slice(0, 10) !== TODAY || pm.method === 'Баланс') return;
    var c = self.C(o.c); notifs.push({id:'p' + o.id + '_' + i, dt:pm.dt, text:'Оплата ' + money(pm.amt, o.cur) + ' · ' + c.name, sub:self.Pr(o.p).name + ' · ' + pm.method, go:function () { self.openOrder(o.id); }});
   });
   if (status(o) === 'overdue') notifs.push({id:'o' + o.id, dt:o.deadline + ' 09:00', text:'Просрочен счёт #' + o.id, sub:self.C(o.c).name + ' · срок был ' + fmtD(o.deadline), go:function () { self.openOrder(o.id); }});
  });
  s.threads.forEach(function (t) { if (!t.answered && t.cat !== 'spam') notifs.push({id:'t' + t.id + t.msgs.length, dt:t.dt, text:'Сообщение · ' + self.C(t.c).name, sub:t.channel + ' · ' + t.msgs[t.msgs.length - 1].text.slice(0, 60), go:function () { self.go('inbox', {tid:t.id}); }}); });
  mineOpen.forEach(function (t) { if (t.due < NOW) notifs.push({id:'k' + t.id + t.due, dt:t.due, text:'Просрочена задача · ' + (self.C(t.c) || {name:''}).name, sub:t.title, go:function () { self.go('tasks', {tfilter:'over'}); }}); });
  s.tgreq.forEach(function (r) { notifs.push({id:'r' + r.id, dt:r.dt, text:'Заявка в канал без оплаты · ' + r.nick, sub:r.channel, go:function () { self.go('today'); }}); });
  notifs.sort(function (a, b) { return a.dt < b.dt ? 1 : -1; });
  var unread = notifs.filter(function (n) { return !s.read[n.id]; }).length;
  var notifList = notifs.slice(0, 12).map(function (n) { return {text:n.text, sub:n.sub, when:fmtD(n.dt), dot:!s.read[n.id], go:function () { var r = Object.assign({}, s.read); r[n.id] = true; self.setState({read:r}); n.go(); }}; });

  // ---------- глобальный поиск
  var gq = s.gq.trim().toLowerCase(), gd = gq.replace(/\D/g, ''), gres = [];
  if (gq.length >= 2) {
   live.forEach(function (c) {
    if (gres.length >= 6) return;
    var hay = (c.name + ' ' + c.gk + ' ' + c.app + ' ' + c.tg).toLowerCase();
    if (hay.indexOf(gq) >= 0 || (gd.length >= 3 && c.phone.replace(/\D/g, '').indexOf(gd) >= 0)) gres.push({title:c.name, sub:(c.gk || c.app) + (c.tg ? ' · ' + c.tg : ''), kind:'Клиент', open:function () { self.openClient(c.id); }});
   });
   if (gd.length >= 3) s.orders.forEach(function (o) { if (gres.length < 9 && String(o.id).indexOf(gd) === 0) gres.push({title:'Заказ #' + o.id, sub:self.C(o.c).name + ' · ' + self.Pr(o.p).name, kind:'Заказ', open:function () { self.openOrder(o.id); }}); });
  }

  var navItem = function (key, count, show) {
   var on = s.screen === key;
   return {show:show, count:count, hasCount:count > 0, go:function () { self.go(key, key === 'clients' ? {cf:'all', cq:'', cpage:1} : null); },
    style:'font:inherit;font-size:14px;font-weight:' + (on ? 600 : 500) + ';display:flex;gap:10px;align-items:center;width:100%;text-align:left;border:0;border-radius:8px;padding:8px 10px;min-height:38px;cursor:pointer;white-space:nowrap;background:' + (on ? '#272B35' : 'transparent') + ';color:' + (on ? '#FFFFFF' : '#C3C8D1'),
    countStyle:'margin-left:auto;font-size:12px;font-weight:600;min-width:20px;text-align:center;padding:1px 7px;border-radius:999px;background:' + (on ? '#2453A6' : '#2F333D') + ';color:#FFFFFF'};
  };
  var nav = {
   today:navItem('today', 0, true), tasks:navItem('tasks', counts.tasks, true), sales:navItem('sales', counts.plan, this.can('sales')), inbox:navItem('inbox', counts.inbox, this.can('inbox')),
   clients:navItem('clients', 0, true), orders:navItem('orders', counts.unpaid, true), products:navItem('products', 0, true),
   mail:navItem('mail', 0, this.can('mail')), stats:navItem('stats', 0, this.can('stats')), import:navItem('import', 0, this.can('import')), settings:navItem('settings', 0, this.can('settings'))
  };
  nav.work = nav.sales.show || nav.inbox.show; nav.fin = nav.stats.show || nav.import.show || nav.settings.show;

  // ---------- сегодня
  var T = {
   kpis:[
    {v:counts.unpaid, l:'Неоплаченных счетов', tone:'#8A5A0B', go:function () { self.go('orders', {otab:'unpaid', opage:1}); }},
    {v:unlinkedOrders.length, l:'Оплат без привязки к приложению', tone:'#8A2E1C', go:function () { self.go('clients', {cf:'unlinked', cq:'', cpage:1}); }},
    {v:counts.pend, l:'Переводов ждут подтверждения Анны', tone:'#1F3F86', hide:!s.requireConfirm && !counts.pend, go:function () { self.go('orders', {otab:'unpaid', opage:1}); }},
    {v:counts.tg, l:'Заявок в каналы без оплаты', tone:'#171A21', go:function () { self.setState({notifOpen:true, userOpen:false}); }},
    {v:counts.inbox, l:'Сообщений без ответа', tone:'#2453A6', go:function () { self.go('inbox', {ifilter:'wait'}); }}
   ].filter(function (k) { return !k.hide; }).map(function (k) { k.numStyle = 'font-size:28px;font-weight:700;line-height:1;color:' + k.tone; return k; }),
   unpaid: s.orders.filter(function (o) { var t = status(o); return t === 'new' || t === 'overdue' || t === 'partial'; }).sort(function (a, b) { return (a.deadline || '9') < (b.deadline || '9') ? -1 : 1; }).slice(0, 6).map(function (o) {
    var r = ord(o), t = status(o);
    r.deadline = t === 'partial' ? 'Осталось ' + money(total(o) - paidAmt(o), o.cur) + ' · до ' + fmtD(o.deadline) : (t === 'overdue' ? 'Срок был ' + fmtD(o.deadline) : 'Оплатить до ' + fmtD(o.deadline)) + (o.reminded ? ' · напоминание отправлено' : ' · напоминание уйдёт автоматически');
    r.deadlineStyle = 'font-size:13px;color:' + (t === 'overdue' ? '#8A2E1C' : '#5B6170');
    r.copy = function () { self.copyLink(o.id); }; r.fake = function () { self.markFake(o.id); }; r.canPay = self.can('orders');
    return r;
   }),
   unlinked: unlinkedOrders.slice(0, 5).map(function (o) {
    var c = self.C(o.c);
    return {name:c.name, product:self.Pr(o.p).name, gk:c.gk, status: c.codeSent ? 'Код отправлен' : 'Не связана', statusStyle:pill(c.codeSent ? 'wait' : 'warn'), open:function () { self.openClient(c.id); }, code:function () { self.sendCode(c.id); }, codeLabel: c.codeSent ? 'Отправить код ещё раз' : 'Отправить код активации'};
   }),
   tg: s.tgreq.map(function (r) {
    var c = r.c ? self.C(r.c) : null;
    return {nick:r.nick, channel:r.channel, why:r.why, when:fmtD(r.dt), hasClient:!!c, client: c ? c.name : '', open:function () { if (c) self.openClient(c.id); },
     find:function () { self.setState({gq:r.nick}); },
     approve:function () { var prev = {tgreq:s.tgreq}; self.setState({tgreq:s.tgreq.filter(function (x) { return x.id !== r.id; })}); self.flash('Заявка ' + r.nick + ' одобрена.', prev); },
     decline:function () { var prev = {tgreq:s.tgreq}; self.setState({tgreq:s.tgreq.filter(function (x) { return x.id !== r.id; })}); self.flash('Заявка ' + r.nick + ' отклонена, бот отправит ссылку на оплату.', prev); }};
   }),
   pend: s.orders.filter(function (o) { return pendAmt(o) > 0 && status(o) !== 'fake' && status(o) !== 'refund'; }).map(function (o) {
    var r = ord(o), i = o.payments.findIndex(function (p) { return p.pending; }), pm = o.payments[i];
    r.pay = money(pm.amt, o.cur) + ' · ' + pm.method + ' · ' + fmtD(pm.dt); r.canConfirm = self.can('confirm'); r.waiting = !self.can('confirm');
    r.confirm = function () { self.confirmPay(o.id, i); }; return r;
   }),
   tgAuto:s.tgAuto,
   recent: s.orders.filter(function (o) { return status(o) === 'paid' || status(o) === 'free'; }).sort(function (a, b) { return payDate(a) < payDate(b) ? 1 : -1; }).slice(0, 7).map(ord)
  };
  T.tasks = s.tasks.filter(function (t) { return !t.done && t.who === meName && t.due.slice(0, 10) <= TODAY; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; }).map(taskRow); T.tasksEmpty = !T.tasks.length; T.tasksAll = function () { self.go('tasks', {tfilter:'today'}); };
  T.showPend = s.requireConfirm || T.pend.length > 0; T.pendEmpty = !T.pend.length; T.unpaidEmpty = !T.unpaid.length; T.unlinkedEmpty = !T.unlinked.length; T.tgEmpty = !T.tg.length;

  // ---------- клиентки
  var cq = s.cq.trim().toLowerCase(), cqd = cq.replace(/\D/g, '');
  function cMatch(c) { if (!cq) return true; var hay = (c.name + ' ' + c.gk + ' ' + c.app + ' ' + c.tg + ' ' + c.city + ' ' + c.tags.join(' ')).toLowerCase(); return hay.indexOf(cq) >= 0 || (cqd.length >= 3 && c.phone.replace(/\D/g, '').indexOf(cqd) >= 0); }
  var cdir = s.csort.dir === 'asc' ? 1 : -1;
  var cfiltered = live.filter(function (c) { return cMatch(c) && self.segPass(D[c.id], s.cf); }).sort(function (a, b) {
   var da = D[a.id], db = D[b.id], k = s.csort.key;
   if (k === 'until') return (da.lastM - db.lastM) * cdir || a.name.localeCompare(b.name, 'ru');
   if (k === 'ltv') return (da.ltv - db.ltv) * cdir;
   if (k === 'last') return ((da.last || '0') < (db.last || '0') ? -1 : (da.last === db.last ? 0 : 1)) * cdir || a.name.localeCompare(b.name, 'ru');
   return a.name.localeCompare(b.name, 'ru') * cdir;
  });
  var cp = pager(cfiltered.length, s.cpage, 'cpage', 15);
  var cvis = CCOLS.filter(function (x) { return s.ccols[x[0]]; });
  var cTemplate = 'minmax(200px,1.3fr) minmax(160px,1fr) ' + cvis.map(function (x) { return x[2]; }).join(' ');
  var cMin = 44 + 200 + 160 + cvis.reduce(function (t, x) { return t + x[3]; }, 0) + (cvis.length + 1) * 12 + 16;
  var pageRows = cfiltered.slice((cp.page - 1) * 15, cp.page * 15);
  var nSel = Object.keys(s.csel).filter(function (k) { return s.csel[k]; }).length;
  var CL = {
   q:s.cq, onQ:function (e) { self.setState({cq:e.target.value, cpage:1}); },
   chips:chips('cf', SEGS.concat(s.segments.map(function (g) { return ['seg:' + g.id, '★ ' + g.name]; })), function (k) { return live.filter(function (c) { return cMatch(c) && self.segPass(D[c.id], k); }).length; }),
   newSegment:function () { self.openSegment(); },
   heads:heads('csort', [['Клиент','name']].concat([['Почта','']]).concat(cvis.map(function (x) { return [x[1], x[0] === 'until' ? 'until' : x[0] === 'ltv' ? 'ltv' : x[0] === 'last' ? 'last' : '', 'desc']; }))),
   outer:'display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;min-width:' + cMin + 'px',
   inner:'display:grid;grid-template-columns:' + cTemplate + ';gap:12px;align-items:center',
   cols:s.ccols, colsOpen:s.colsOpen, toggleCols:function () { self.setState({colsOpen:!s.colsOpen}); },
   colOpts: CCOLS.map(function (x) { return {label:x[1], on:!!s.ccols[x[0]], toggle:function () { var cc = Object.assign({}, s.ccols); cc[x[0]] = !cc[x[0]]; self.setState({ccols:cc}); }}; }),
   rows: pageRows.map(function (c) {
    var d = D[c.id];
    return {name:c.name, initials:initials(c.name), avStyle:avStyle(c.name, 28), city:c.city, gk:c.gk || '—', app: c.linked ? c.app : (c.codeSent ? 'код отправлен' : 'не связана'), appStyle:pill(c.linked ? 'ok' : (c.codeSent ? 'wait' : 'mute')),
     phone:c.phone || '—', tg:c.tg || '—', until: d.lastM >= 0 ? mLabel(d.lastM) : '—', untilStyle: 'font-weight:500;color:' + (d.lastM >= CUR ? '#171A21' : '#8A909C'), ltv: d.ltv ? moneyR(d.ltv) : '—', last: d.last ? fmtD(d.last) : '—',
     tags:c.tags.slice(0, 2), sel:!!s.csel[c.id], toggle:function () { var x = Object.assign({}, s.csel); x[c.id] = !x[c.id]; self.setState({csel:x}); }, open:function () { self.openClient(c.id); }};
   }),
   allSel: pageRows.length > 0 && pageRows.every(function (c) { return s.csel[c.id]; }),
   toggleAll:function () { var x = Object.assign({}, s.csel), all = pageRows.every(function (c) { return s.csel[c.id]; }); pageRows.forEach(function (c) { x[c.id] = !all; }); self.setState({csel:x}); },
   nSel:nSel, hasSel:nSel > 0, selText:'Выбрано: ' + nSel,
   clearSel:function () { self.setState({csel:{}}); },
   bulkPlan:function () { var p = Object.assign({}, s.plan), n = 0; Object.keys(s.csel).forEach(function (k) { if (s.csel[k] && !p[k]) { p[k] = 'todo'; n++; } }); self.setState({plan:p, csel:{}}); self.flash('В план продаж добавлено: ' + n + '.'); },
   bulkTag:function () { var ids = Object.keys(s.csel).filter(function (k) { return s.csel[k]; }), prev = {clients:s.clients, csel:s.csel}; self.setState({clients:s.clients.map(function (c) { if (ids.indexOf(c.id) < 0 || c.tags.indexOf('Акция') >= 0) return c; var x = clone(c); x.tags.push('Акция'); return x; }), csel:{}}); self.flash('Тег «Акция» добавлен: ' + ids.length + '.', prev); },
   bulkExport:function () { self.flash('Выгружено в Excel: ' + nSel + ' ' + plural(nSel, 'строка', 'строки', 'строк') + '.'); },
   exportAll:function () { self.flash('Выгружено в Excel: ' + cfiltered.length + ' ' + plural(cfiltered.length, 'строка', 'строки', 'строк') + ' по текущему фильтру.'); },
   pager:cp, empty:!cfiltered.length, total:cfiltered.length
  };

  // ---------- заказы
  var oq = s.oq.trim().toLowerCase();
  function inTab(o, t) { var st = status(o); if (t === 'all') return true; if (t === 'unpaid') return st === 'new' || st === 'overdue' || st === 'partial' || st === 'confirm'; if (t === 'paid') return st === 'paid'; if (t === 'free') return st === 'free'; if (t === 'closed') return st === 'fake' || st === 'refund'; return true; }
  function oPass(o) {
   if (s.osrc !== 'all' && srcLabel(o).indexOf(s.osrc) < 0) return false;
   if (s.omgr !== 'all' && (o.manager || '—') !== s.omgr) return false;
   if (s.operiod !== 'all') { var days = {today:0, week:6, month:30}[s.operiod]; if (o.dt.slice(0, 10) < addDays(TODAY, -days)) return false; }
   if (!oq) return true;
   var c = self.C(o.c); return (String(o.id) + ' ' + c.name + ' ' + c.gk + ' ' + c.app + ' ' + self.Pr(o.p).name + ' ' + o.tags.join(' ')).toLowerCase().indexOf(oq) >= 0;
  }
  var odir = s.osort.dir === 'asc' ? 1 : -1;
  var ofiltered = s.orders.filter(function (o) { return inTab(o, s.otab) && oPass(o); }).sort(function (a, b) {
   var k = s.osort.key;
   if (k === 'client') return self.C(a.c).name.localeCompare(self.C(b.c).name, 'ru') * odir || b.id - a.id;
   if (k === 'amount') return (self.toBYN(total(a), a.cur) - self.toBYN(total(b), b.cur)) * odir || b.id - a.id;
   if (k === 'status') return (ST_RANK[status(a)] - ST_RANK[status(b)]) * odir || b.id - a.id;
   return (a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : 0) * odir;
  });
  var op = pager(ofiltered.length, s.opage, 'opage', 15);
  var opageRows = ofiltered.slice((op.page - 1) * 15, op.page * 15);
  var oSum = ofiltered.reduce(function (t, o) { return t + o.payments.reduce(function (u, pm) { return u + (pm.method === 'Баланс' ? 0 : self.toBYN(pm.amt, o.cur)); }, 0); }, 0);
  var oSel = Object.keys(s.osel).filter(function (k) { return s.osel[k]; }).length;
  var OR = {
   q:s.oq, onQ:function (e) { self.setState({oq:e.target.value, opage:1}); },
   tabs:chips('otab', [['all','Все'],['unpaid','Ждут оплаты'],['paid','Оплачены'],['free','Без оплаты'],['closed','Ложные и возвраты']], function (k) { return s.orders.filter(function (o) { return inTab(o, k) && oPass(o); }).length; }),
   src:s.osrc, srcOpts:[['all','Все способы оплаты'],['bePaid','bePaid'],['lava.top','lava.top'],['Перевод на карту','Перевод на карту'],['Баланс','Баланс'],['App Store','App Store'],['Без оплаты','Без оплаты']].map(function (x) { return {v:x[0], label:x[1]}; }),
   onSrc:function (e) { self.setState({osrc:e.target.value, opage:1}); },
   mgr:s.omgr, mgrOpts:[{v:'all', label:'Все менеджеры'}, {v:'Тамуна', label:'Тамуна'}, {v:'Гульнара', label:'Гульнара'}, {v:'—', label:'Без менеджера (сайт)'}], onMgr:function (e) { self.setState({omgr:e.target.value, opage:1}); },
   period:s.operiod, periodOpts:[{v:'all', label:'За всё время'}, {v:'today', label:'Сегодня'}, {v:'week', label:'7 дней'}, {v:'month', label:'30 дней'}], onPeriod:function (e) { self.setState({operiod:e.target.value, opage:1}); },
   reset:function () { self.setState({oq:'', otab:'all', osrc:'all', omgr:'all', operiod:'all', opage:1}); },
   strip:(function () {
    var paidN = s.orders.filter(function (o) { return status(o) === 'paid'; }).length, all = s.orders.filter(function (o) { var t = status(o); return t !== 'fake'; }).length;
    var part = s.orders.filter(function (o) { return status(o) === 'partial'; }), partLeft = part.reduce(function (t, o) { return t + self.toBYN(total(o) - paidAmt(o), o.cur); }, 0);
    var wait = s.orders.filter(function (o) { var t = status(o); return t === 'new' || t === 'overdue'; }), waitSum = wait.reduce(function (t, o) { return t + self.toBYN(total(o), o.cur); }, 0);
    var conf = s.orders.filter(function (o) { return status(o) === 'confirm'; });
    return [{v:all, l:'заказов без ложных'}, {v:(all ? Math.round(paidN / all * 100) : 0) + '%', l:'оплачено полностью'}, {v:wait.length + ' · ' + moneyR(waitSum), l:'ждут оплаты'}, {v:part.length + ' · осталось ' + moneyR(partLeft), l:'частично оплачены (предоплаты)'}, {v:conf.length, l:'переводов ждут подтверждения'}];
   })(),
   heads:heads('osort', [['Заказ','date','desc'],['Клиент','client'],['Позиция',''],['Сумма','amount','desc'],['Статус','status'],['Оплата',''],['Менеджер',''],['Приложение','']]),
   outer:'display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;min-width:1090px',
   inner:'display:grid;grid-template-columns:104px minmax(130px,1fr) minmax(170px,1.4fr) 96px 118px 120px 84px 150px;gap:12px;align-items:center',
   rows: opageRows.map(function (o) { var r = ord(o); r.sel = !!s.osel[o.id]; r.toggle = function () { var x = Object.assign({}, s.osel); x[o.id] = !x[o.id]; self.setState({osel:x}); }; return r; }),
   allSel: opageRows.length > 0 && opageRows.every(function (o) { return s.osel[o.id]; }),
   toggleAll:function () { var x = Object.assign({}, s.osel), all = opageRows.every(function (o) { return s.osel[o.id]; }); opageRows.forEach(function (o) { x[o.id] = !all; }); self.setState({osel:x}); },
   hasSel:oSel > 0, selText:'Выбрано: ' + oSel, clearSel:function () { self.setState({osel:{}}); },
   bulkExport:function () { self.flash('Выгружено в Excel: ' + oSel + ' ' + plural(oSel, 'заказ', 'заказа', 'заказов') + '.'); },
   bulkRemind:function () { var n = 0, ids = Object.keys(s.osel).filter(function (k) { return s.osel[k]; }).map(Number); var orders = s.orders.map(function (o) { var st = status(o); if (ids.indexOf(o.id) < 0 || (st !== 'new' && st !== 'overdue' && st !== 'partial')) return o; n++; var x = clone(o); x.reminded = true; x.hist.push({dt:self.now(), who:me.name, text:'Отправлено напоминание об оплате'}); return x; }); self.setState({orders:orders, osel:{}}); self.flash(n ? 'Напоминание отправлено: ' + n + '.' : 'Среди выбранных нет неоплаченных заказов.'); },
   exportAll:function () { self.flash('Выгружено в Excel: ' + ofiltered.length + ' ' + plural(ofiltered.length, 'заказ', 'заказа', 'заказов') + ' по текущему фильтру.'); },
   pager:op, empty:!ofiltered.length,
   total:ofiltered.length + ' ' + plural(ofiltered.length, 'заказ', 'заказа', 'заказов') + ' · получено ' + moneyR(oSum) + ' в пересчёте',
   canCreate:this.can('orders')
  };

  // ---------- входящие
  function tPass(t, k) { if (k === 'spam') return t.cat === 'spam'; if (t.cat === 'spam') return false; return k === 'all' || (k === 'wait' && !t.answered) || (k === 'mine' && t.assign === me.name); }
  var threadsF = s.threads.filter(function (t) { return tPass(t, s.ifilter); });
  var th = byId(s.threads, s.tid) || s.threads[0], tc = this.C(th.c), td = D[tc.id];
  var tpl = {
   'Срок доступа': tc.name.split(' ')[0] + ', добрый день! ' + (td.lastM >= CUR ? 'Клуб у вас оплачен по ' + mFull(td.lastM) + ' включительно.' : 'Сейчас активного доступа к клубу нет. Могу прислать ссылку на текущий месяц или сезон.'),
   'Баланс': tc.name.split(' ')[0] + ', на вашем балансе ' + money(td.bal) + '. Можно потратить на любые продукты клуба.',
   'Как войти в приложение': 'Скачайте приложение ЧИТАТЕЛЬ и войдите под той же почтой, что указывали при оплате. Если почта другая — напишите её сюда, мы откроем доступ.',
   'Не пришло письмо': tc.name.split(' ')[0] + ', отправила письмо ещё раз на ' + (tc.gk || tc.app) + '. Проверьте, пожалуйста, папки «Промоакции» и «Спам». Если почта другая — напишите, перешлю.',
   'Ссылка на канал': tc.name.split(' ')[0] + ', отправила ссылки на ваши каналы ещё раз — в этот чат и на почту. Если заявка не проходит, напишите, приму вручную.',
   'Ссылка на оплату': 'Отправляю ссылку на оплату: pay.chitatel.app/' + (td.orders[0] ? 'o/' + td.orders[0].id : 'winter-2026') + '. Если карта не проходит, можно оплатить переводом — подскажу реквизиты.'
  };
  var IN = {
   chips:chips('ifilter', [['all','Все'],['wait','Ждут ответа'],['mine','Мои'],['spam','Спам']], function (k) { return s.threads.filter(function (t) { return tPass(t, k); }).length; }),
   isSpam: th.cat === 'spam', spamLabel: th.cat === 'spam' ? 'Не спам' : 'В спам',
   toggleSpam:function () { var to = th.cat === 'spam' ? '' : 'spam'; var prev = {threads:s.threads}; self.setState({threads:s.threads.map(function (t) { return t.id === th.id ? Object.assign({}, t, {cat:to, answered: to === 'spam' ? true : t.answered}) : t; })}); self.flash(to ? 'Перенесено в спам.' : 'Возвращено во входящие.', prev); },
   list: threadsF.map(function (t) {
    var on = t.id === th.id, last = t.msgs[t.msgs.length - 1], c = self.C(t.c);
    return {name:c.name, initials:initials(c.name), avStyle:avStyle(c.name), when:fmtD(t.dt), preview: !last ? 'Новый диалог — напишите первое сообщение' : (last.text.length > 72 ? last.text.slice(0, 72) + '…' : last.text), channel:t.channel, chStyle:pill('mute'),
     status: t.answered ? 'Отвечено' : 'Ждёт ответа', stStyle:pill(t.answered ? 'ok' : 'wait'), assign:t.assign || 'не назначено',
     pick:function () { self.setState({tid:t.id, reply:''}); },
     style:'font:inherit;color:#171A21;cursor:pointer;display:flex;gap:12px;align-items:flex-start;text-align:left;padding:14px 16px;border:0;border-bottom:1px solid #ECEEF2;border-left:3px solid ' + (on ? '#2453A6' : 'transparent') + ';background:' + (on ? '#F2F6FD' : '#FFFFFF') + ';width:100%'};
   }),
   empty:!threadsF.length,
   th:{name:tc.name, initials:initials(tc.name), avStyle:avStyle(tc.name), local:'У неё сейчас ' + localTime(tc.city).text + (localTime(tc.city).night ? ' — ночь, лучше ответить утром' : ''), localStyle:'font-size:12px;color:' + (localTime(tc.city).night ? '#8A2E1C' : '#5B6170'), channel:th.channel, until: td.lastM >= 0 ? 'клуб по ' + mFull(td.lastM) : 'нет доступа к клубу', bal: td.bal ? ' · на карте ' + money(td.bal) : '',
    appState: tc.linked ? 'Приложение: связан' : 'Приложение: не связан', appStyle:pill(tc.linked ? 'ok' : 'warn'),
    canLink: !tc.linked && !!th.hint, hint:th.hint || '', link:function () { self.link(tc.id, th.hint); }, open:function () { self.openClient(tc.id); },
    assign:th.assign, onAssign:function (e) { var v = e.target.value; self.setState({threads:s.threads.map(function (t) { return t.id === th.id ? Object.assign({}, t, {assign:v}) : t; })}); },
    msgs: th.msgs.map(function (m) { return {who:m.who, when:fmtD(m.dt), text:m.text, style:'max-width:78%;display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:10px;' + (m.me ? 'align-self:flex-end;background:#EAF0FB' : 'align-self:flex-start;background:#F3F4F6')}; })},
   assignOpts:[{v:'', label:'Не назначено'}].concat(s.members.filter(function (m) { return m.role !== 'marketing'; }).map(function (m) { return {v:m.name, label:m.name}; })),
   templates:Object.keys(tpl).map(function (k) { return {label:k, use:function () { self.setState({reply:tpl[k]}); }}; }),
   reply:s.reply, onReply:function (e) { self.setState({reply:e.target.value}); },
   send:function () {
    var txt = s.reply.trim(); if (!txt) { self.flash('Напишите ответ.'); return; }
    var dt = self.now();
    self.setState({threads:s.threads.map(function (t) { return t.id === th.id ? Object.assign({}, t, {answered:true, assign:t.assign || me.name, msgs:t.msgs.concat([{me:true, who:me.name, dt:dt, text:txt}])}) : t; }), reply:''});
    self.flash('Ответ отправлен в канал «' + th.channel + '».');
   }
  };

  // ---------- продукты
  function pPass(p, k) { if (k === 'club') return p.cat === 'club'; if (k === 'content') return p.cat === 'content'; if (k === 'other') return p.cat === 'other' || p.cat === 'card'; if (k === 'ask') return !!p.ask; if (k === 'off') return !p.active; return true; }
  var canP = this.can('products'), canPromo = this.can('promo');
  var pageBase = this.Pr(s.pageSel) || s.products[0], pgPrice = String(s.pg.price).trim() === '' ? null : (parseFloat(String(s.pg.price).replace(',', '.')) || 0);
  var pageP = Object.assign({}, pageBase, {name:s.pg.name || pageBase.name, desc:s.pg.desc, price:pgPrice}), ck = s.ck, ckPrice = pageP.price || 0, ckTotal = Math.max(0, ckPrice - (ck.disc || 0));
  var PR = {
   tabs:tabs('ptab', [['products','Продукты'],['promos','Промокоды и акции'],['pages','Страницы оплаты']]),
   isProducts:s.ptab === 'products', isPromos:s.ptab === 'promos', isPages:s.ptab === 'pages',
   chips:chips('pf', [['all','Все'],['club','Клуб'],['content','Разборы и пакеты'],['other','Вне клуба'],['ask','Нужно уточнить'],['off','Архив']], function (k) { return s.products.filter(function (p) { return pPass(p, k); }).length; }),
   rows: s.products.filter(function (p) { return pPass(p, s.pf); }).map(function (p) {
    return {name:p.name, price: p.price === null ? (p.grant === 'none' ? 'по договорённости' : '[ЦЕНА]') : money(p.price, p.cur), term:termText(p) + (p.accessOnFirst ? ' · рассрочка' : ''), grant:grantText(p), grantStyle:pill(p.grant === 'none' ? 'mute' : (p.grant === 'ask' ? 'ask' : 'ok')),
     stores: (p.asc ? 'App Store' : '') + (p.asc && p.gp ? ' · ' : '') + (p.gp ? 'Google Play' : '') || '—', ask:p.ask, hasAsk:!!p.ask, active:p.active ? 'Продаётся' : 'Архив', activeStyle:pill(p.active ? 'ok' : 'mute'),
     sold: s.orders.filter(function (o) { return o.p === p.id && isActive(o); }).length, open:function () { self.openProduct(p.id); }};
   }),
   canEdit:canP, newProduct:function () { self.newProduct(); },
   promos: s.promos.map(function (x) {
    var expired = x.until < TODAY, full = x.limit && x.used >= x.limit;
    return {code:x.code, disc: x.type === '%' ? '−' + x.val + '%' : '−' + money(x.val), scope:SCOPE[x.scope], used: x.used + (x.limit ? ' из ' + x.limit : ''), until:fmtD(x.until),
     st: !x.on ? 'Выключен' : expired ? 'Истёк' : full ? 'Исчерпан' : 'Действует', stStyle:pill(!x.on || expired || full ? 'mute' : 'ok'), on:x.on,
     toggle:function () { if (!canPromo) return; self.setState({promos:s.promos.map(function (y) { return y.code === x.code ? Object.assign({}, y, {on:!y.on}) : y; })}); }};
   }),
   canPromo:canPromo, np:s.np,
   onNp:['code','type','val','scope','limit','until'].reduce(function (acc, k) { acc[k] = function (e) { var n = Object.assign({}, s.np); n[k] = e.target.value; self.setState({np:n}); }; return acc; }, {}),
   createPromo:function () { self.createPromo(); },
   pages: s.products.filter(function (p) { return p.active && p.grant !== 'none' || p.id === 'p12'; }).map(function (p) {
    var on = p.id === pageP.id;
    return {name:p.name, url:'pay.chitatel.app/' + p.slug, pick:function () { self.pickPage(p.id); }, copy:function () { self.flash('Ссылка pay.chitatel.app/' + p.slug + ' скопирована. Её ставят на кнопку «Купить» в Тильде.'); },
     style:'font:inherit;color:#171A21;cursor:pointer;display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;padding:12px 16px;border:0;border-bottom:1px solid #ECEEF2;border-left:3px solid ' + (on ? '#2453A6' : 'transparent') + ';background:' + (on ? '#F2F6FD' : '#FFFFFF') + ';width:100%'};
   }),
   pg:s.pg, pgUrl:'pay.chitatel.app/' + (s.pg.slug || '…'), pgDisabled:!canP,
   onPg:['name','desc','price','slug'].reduce(function (acc, k) { acc[k] = function (e) { var g = Object.assign({}, s.pg); g[k] = e.target.value; self.setState({pg:g}); }; return acc; }, {}),
   savePage:function () { if (canP) self.savePage(); }, duplicatePage:function () { if (canP) self.duplicatePage(); },
   clubMonths: CLUB_MONTHS.map(function (x) {
    var prod = s.products.filter(function (p) { return p.cat === 'content' && p.grant === 'book' && p.books.length === 1 && p.books[0] === x.book; })[0];
    return {month:MONF[x.m % 12] + ' ' + Math.floor(x.m / 12), book:'«' + x.book + '»', selling:!!prod, canSell:!prod && x.m < CUR && canP, current:!prod && x.m >= CUR,
     sellLabel:'Продавать отдельно · 140 BYN', open:function () { if (prod) self.openProduct(prod.id); }, sell:function () { self.sellMonth(x.book); }, price: prod ? (prod.price === null ? '[ЦЕНА]' : money(prod.price, prod.cur)) : ''};
   }),
   cb:(function () { var em = (s.ck.email || '').trim().toLowerCase(), who = em ? live.filter(function (c) { return (c.gk || '').toLowerCase() === em || (c.app || '').toLowerCase() === em; })[0] : null; return {isTopup:pageP.grant === 'deposit' && pageP.price === null, amount:s.ck.amount || '', onAmount:function (e) { self.setState({ck:Object.assign({}, s.ck, {amount:e.target.value})}); }, balKnown:!!who, balText: who ? 'На балансе: ' + money(D[who.id].bal) + (pageP.grant !== 'deposit' && D[who.id].bal >= ckTotal && ckTotal > 0 ? ' — хватает, можно оплатить с баланса' : '') : ''}; })(),
   ck:{desc:pageP.desc || '', hasDesc:!!(pageP.desc || '').trim(), name:pageP.name, price: pageP.price === null ? '[ЦЕНА]' : money(ckPrice, pageP.cur), total: pageP.price === null ? '[ЦЕНА]' : money(ckTotal, pageP.cur), hasDisc:ck.disc > 0, disc:'−' + money(ck.disc || 0, pageP.cur), grant:grantText(pageP),
    promo:ck.promo, promoMsg:ck.promoMsg, hasPromoMsg:!!ck.promoMsg, gift:ck.gift, email:ck.email, giftEmail:ck.giftEmail,
    onPromo:function (e) { self.setState({ck:Object.assign({}, s.ck, {promo:e.target.value})}); },
    onEmail:function (e) { self.setState({ck:Object.assign({}, s.ck, {email:e.target.value})}); },
    onGiftEmail:function (e) { self.setState({ck:Object.assign({}, s.ck, {giftEmail:e.target.value})}); },
    toggleGift:function () { self.setState({ck:Object.assign({}, s.ck, {gift:!s.ck.gift})}); },
    applyPromo:function () { var code = s.ck.promo.trim().toUpperCase(), pr = byId(s.promos.map(function (x) { return Object.assign({id:x.code}, x); }), code), chk = promoCheck(pr, pageP); if (!chk.ok) { self.setState({ck:Object.assign({}, s.ck, {disc:0, promoMsg:chk.why})}); return; } self.setState({ck:Object.assign({}, s.ck, {promo:code, disc:promoDisc(pr, ckPrice), promoMsg:'Промокод применён'})}); },
    methods:[['bepaid','Карта Беларуси или России','bePaid'],['foreign','Перевод на грузинскую карту (USD)','Реквизиты придут на почту, доступ — после подтверждения'],['lava','Оплата в рублях','lava.top']].concat(pageP.grant === 'deposit' ? [] : [['balance','С внутреннего баланса','Если на балансе достаточно средств']]).map(function (m) { var on = s.ck.method === m[0]; return {label:m[1], via:m[2], pick:function () { self.setState({ck:Object.assign({}, s.ck, {method:m[0]})}); }, style:'font:inherit;color:#171A21;cursor:pointer;display:flex;flex-direction:column;gap:1px;align-items:flex-start;text-align:left;padding:10px 12px;border-radius:8px;border:1px solid ' + (on ? '#2453A6' : '#D5D9E0') + ';background:' + (on ? '#F2F6FD' : '#FFFFFF') + ';width:100%'}; }),
    pay:function () { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.ck.email.trim())) { self.flash('На странице оплаты: укажите почту.'); return; } if (s.ck.gift && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.ck.giftEmail.trim())) { self.flash('Укажите почту получательницы подарка.'); return; } self.flash('Это превью: в рабочей версии здесь откроется оплата, а заказ появится в CRM со статусом «Оплачен».'); }}
  };

  // ---------- рассылки
  var canMail = this.can('mail');
  function segCount(k) { return live.filter(function (c) { return self.segPass(D[c.id], k); }).length; }
  var MA = {
   autos: s.autos.map(function (a) { return {name:a.name, trigger:a.trigger, ch:a.ch, sent:a.sent, on:a.on, st:a.on ? 'Включено' : 'Выключено', stStyle:pill(a.on ? 'ok' : 'mute'), toggle:function () { if (!canMail) return; self.setState({autos:s.autos.map(function (x) { return x.id === a.id ? Object.assign({}, x, {on:!x.on}) : x; })}); }, label:a.on ? 'Выключить' : 'Включить'}; }),
   camps: s.camps.map(function (c) { return {name:c.name, seg:c.seg, ch:c.ch, st:c.status, stStyle:pill(c.status === 'Отправлена' ? 'ok' : 'wait'), when:fmtD(c.dt) + ' ' + c.dt.slice(11, 16), sent:c.sent ? c.sent.toLocaleString('ru-RU') : '—', open:c.open}; }),
   create:function () { self.openCampaign(); }, can:canMail
  };

  // ---------- статистика
  var months = range(CUR - s.period + 1, CUR), byM = {}, bySrc = {}, byProd = {}, paidCnt = 0, newClients = {};
  var cntM = {}; months.forEach(function (m) { byM[m] = 0; cntM[m] = 0; });
  s.orders.forEach(function (o) {
   var st = status(o); if (st === 'fake' || st === 'refund') return;
   var counted = false;
   o.payments.forEach(function (pm) {
    if (pm.method === 'Баланс') return;
    var m = mOf(pm.dt); if (byM[m] === undefined) return;
    var v = self.toBYN(pm.amt, o.cur); byM[m] += v; counted = true;
    var src = pm.method; if (!bySrc[src]) bySrc[src] = {n:0, v:0}; bySrc[src].v += v; bySrc[src].n++;
    var pn = self.Pr(o.p).name; byProd[pn] = (byProd[pn] || 0) + v;
   });
   if (counted && st === 'paid') { paidCnt++; var pmM = mOf(payDate(o)); if (cntM[pmM] !== undefined) cntM[pmM]++; }
  });
  var maxM = Math.max.apply(null, months.map(function (m) { return byM[m]; }).concat([1]));
  var revenue = months.reduce(function (t, m) { return t + byM[m]; }, 0);
  var storeFee = Object.keys(bySrc).reduce(function (t, k) { return t + (k === 'App Store' || k === 'Google Play' ? bySrc[k].v * 0.15 : 0); }, 0);
  var cardsList = live.filter(function (c) { return c.cardOps.length; }).map(function (c) {
   var inn = c.cardOps.filter(function (x) { return x.amt > 0; }).reduce(function (t, x) { return t + x.amt; }, 0), out = -c.cardOps.filter(function (x) { return x.amt < 0; }).reduce(function (t, x) { return t + x.amt; }, 0);
   return {name:c.name, inn:money(inn), out:money(out), bal:money(inn - out), last:fmtD(c.cardOps[c.cardOps.length - 1].dt), open:function () { self.openClient(c.id); }};
  });
  var created = s.orders.filter(function (o) { return months.indexOf(mOf(o.dt)) >= 0 && status(o) !== 'fake'; });
  function grp(o) { var l = srcLabel(o); if (l.indexOf('Баланс') >= 0) return 'С баланса'; if (o.manager && l.indexOf('Перевод') >= 0) return 'Перевод (менеджер)'; return l.split(' + ')[0]; }
  var bySrc2 = {}; created.forEach(function (o) { var k = grp(o); if (!bySrc2[k]) bySrc2[k] = {n:0, paid:0, v:0}; bySrc2[k].n++; if (status(o) === 'paid') { bySrc2[k].paid++; bySrc2[k].v += self.toBYN(paidAmt(o), o.cur); } });
  var firstSrc = {}, newCnt = 0;
  live.forEach(function (c) { var os = D[c.id].orders.filter(function (o) { return o.payments.length; }).sort(function (a, b) { return a.dt < b.dt ? -1 : 1; }); if (os.length && months.indexOf(mOf(os[0].dt)) >= 0) { newCnt++; var k = grp(os[0]); firstSrc[k] = (firstSrc[k] || 0) + 1; } });
  var byMgr = {}; created.forEach(function (o) { var k = o.manager || 'Сайт и приложение (сами)'; if (!byMgr[k]) byMgr[k] = {n:0, paid:0, v:0}; byMgr[k].n++; if (status(o) === 'paid') { byMgr[k].paid++; byMgr[k].v += self.toBYN(paidAmt(o), o.cur); } });
  var stageCnt = {}; PLAN_COLS.forEach(function (x) { stageCnt[x[0]] = 0; }); cards.forEach(function (x) { stageCnt[x.stage]++; });
  var worked = cards.length - stageCnt.todo, lossCnt = {};
  cards.forEach(function (x) { if (x.stage === 'lost') { var r = s.planReason[x.c.id] || 'Не указана'; lossCnt[r] = (lossCnt[r] || 0) + 1; } });
  var maxLoss = Math.max.apply(null, Object.keys(lossCnt).map(function (k) { return lossCnt[k]; }).concat([1]));
  var pct = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; };
  var SALES = {
   kpis:[{v:created.length, l:'Заказов создано'}, {v:pct(created.filter(function (o) { return status(o) === 'paid'; }).length, created.length), l:'Конверсия счёт → оплата'}, {v:newCnt, l:'Новых покупательниц (первая оплата)'}, {v:pct(stageCnt.won, worked), l:'План продаж: из взятых в работу оплатили'}],
   src: Object.keys(bySrc2).sort(function (a, b) { return bySrc2[b].n - bySrc2[a].n; }).map(function (k) { var x = bySrc2[k]; return {name:k, n:x.n, paid:x.paid, conv:pct(x.paid, x.n), v:moneyR(x.v), first:firstSrc[k] || 0}; }),
   funnel: PLAN_COLS.map(function (x) { var n = stageCnt[x[0]]; return {label:x[1], n:n, style:'height:10px;border-radius:5px;background:' + (x[0] === 'lost' ? '#E7A08F' : x[0] === 'won' ? '#1D5A35' : '#2453A6') + ';width:' + Math.max(2, Math.round(n / Math.max(1, cards.length) * 100)) + '%'}; }),
   funnelNote:'Взяли в работу: ' + worked + ' из ' + cards.length + ' · оплатили: ' + stageCnt.won + ' (' + pct(stageCnt.won, worked) + ') · отказ: ' + stageCnt.lost,
   mgrs: Object.keys(byMgr).map(function (k) { var x = byMgr[k], tk = s.tasks.filter(function (t) { return t.who === k; }); return {name:k, n:x.n, paid:x.paid, conv:pct(x.paid, x.n), v:moneyR(x.v), done:tk.length ? tk.filter(function (t) { return t.done; }).length + ' / ' + tk.length : '—', over:tk.filter(function (t) { return !t.done && t.due < NOW; }).length || '—'}; }),
   loss: Object.keys(lossCnt).sort(function (a, b) { return lossCnt[b] - lossCnt[a]; }).map(function (k) { return {name:k, n:lossCnt[k], style:'height:8px;border-radius:4px;background:#E7A08F;width:' + Math.round(lossCnt[k] / maxLoss * 100) + '%'}; })
  };
  SALES.lossEmpty = !SALES.loss.length;
  var SS = {
   isSales:s.ftab === 'sales', SALES:SALES,
   tabs:tabs('ftab', [['revenue','Выручка'],['sales','Продажи и менеджеры'],['cards','Балансы']]), isRevenue:s.ftab === 'revenue', isCards:s.ftab === 'cards',
   periods:[[1,'Этот месяц'],[3,'3 месяца'],[6,'6 месяцев']].map(function (p) { var on = s.period === p[0]; return {text:p[1], style:chipStyle(on), pick:function () { self.setState({period:p[0]}); }}; }),
   kpis:[
    {v:moneyR(revenue), l:'Выручка за период, в пересчёте в BYN'},
    {v:moneyR(revenue - storeFee), l:'Чистыми, за вычетом комиссии сторов 15%'},
    {v:paidCnt, l:'Оплаченных заказов'},
    {v: paidCnt ? moneyR(revenue / paidCnt) : '—', l:'Средний чек'},
    {v:live.filter(function (c) { return D[c.id].inClub; }).length, l:'Сейчас в клубе'}
   ],
   bars: months.map(function (m) { var h = Math.round(byM[m] / maxM * 180); return {label:mLabel(m), n:cntM[m] + ' ' + plural(cntM[m], 'заказ', 'заказа', 'заказов'), v:moneyR(byM[m]), style:'width:100%;max-width:56px;border-radius:6px 6px 0 0;background:' + (m === CUR ? '#2453A6' : '#9DB3DD') + ';height:' + Math.max(h, 2) + 'px'}; }),
   src: Object.keys(bySrc).sort(function (a, b) { return bySrc[b].v - bySrc[a].v; }).map(function (k) { var fee = k === 'App Store' || k === 'Google Play' ? bySrc[k].v * 0.15 : 0; return {name:k, n:bySrc[k].n, gross:moneyR(bySrc[k].v), fee: fee ? '−' + moneyR(fee) : '—', net:moneyR(bySrc[k].v - fee)}; }),
   prod: Object.keys(byProd).sort(function (a, b) { return byProd[b] - byProd[a]; }).slice(0, 8).map(function (k) { return {name:k, v:moneyR(byProd[k]), style:'height:8px;border-radius:4px;background:#2453A6;width:' + Math.max(2, Math.round(byProd[k] / (byProd[Object.keys(byProd).sort(function (a, b) { return byProd[b] - byProd[a]; })[0]] || 1) * 100)) + '%'}; }),
   rateNote:'Курсы для пересчёта: 1 USD = ' + s.rates.USD + ', 1 RUB = ' + s.rates.RUB + ', 1 EUR = ' + s.rates.EUR + ', 1 GEL = ' + s.rates.GEL + ' BYN — меняются в настройках',
   cards:cardsList, cardsEmpty:!cardsList.length,
   exportAll:function () { self.flash('Отчёт за период выгружен в Excel.'); }
  };

  // ---------- настройки
  var isOwner = role === 'owner';
  var journal = [];
  s.orders.forEach(function (o) { o.hist.forEach(function (h) { if (h.dt.slice(0, 10) >= addDays(TODAY, -1)) journal.push({dt:h.dt, who:h.who, text:'Заказ #' + o.id + ': ' + h.text, open:function () { self.openOrder(o.id); }}); }); });
  s.clients.forEach(function (c) { c.hist.forEach(function (h) { if (h.dt.slice(0, 10) >= addDays(TODAY, -1)) journal.push({dt:h.dt, who:h.who, text:c.name + ': ' + h.text, open:function () { self.openClient(c.id); }}); }); });
  journal.sort(function (a, b) { return a.dt < b.dt ? 1 : -1; });
  var SE = {
   tabs:tabs('stab', [['pay','Оплаты и почта'],['auto','Автоматизация'],['team','Команда'],['perms','Права доступа'],['integr','Интеграции'],['rates','Курсы валют'],['journal','Журнал действий']]),
   isAuto:s.stab === 'auto', rules:s.rules.map(function (r) { return {name:r.name, how:r.how, n:r.n, on:r.on, st:r.on ? 'Включено' : 'Выключено', stStyle:pill(r.on ? 'ok' : 'mute'), label:r.on ? 'Выключить' : 'Включить', toggle:function () { self.setState({rules:s.rules.map(function (x) { return x.id === r.id ? Object.assign({}, x, {on:!x.on}) : x; })}); }}; }), toMail:function () { self.go('mail'); },
   isPay:s.stab === 'pay', requireConfirm:s.requireConfirm, toggleConfirm:function () { self.setState({requireConfirm:!s.requireConfirm}); self.flash(!s.requireConfirm ? 'Переводы на карту теперь подтверждает Анна в CRM.' : 'Переводы проводит менеджер, с пометкой, куда пришли деньги.'); }, accounts:ACCOUNTS, isTeam:s.stab === 'team', isPerms:s.stab === 'perms', isIntegr:s.stab === 'integr', isRates:s.stab === 'rates', isJournal:s.stab === 'journal',
   canTeam:isOwner,
   members: s.members.map(function (m) { return {name:m.name, initials:initials(m.name), avStyle:avStyle(m.name), role:m.role, roleLabel:ROLES[m.role], tfa:m.tfa ? 'Включена' : 'Выключена', tfaStyle:pill(m.tfa ? 'ok' : 'warn'), last:m.last, isOwnerRow:m.role === 'owner', noOwner:m.role !== 'owner', showRoleText:m.role !== 'owner' && !isOwner,
    onRole:function (e) { var v = e.target.value; self.setState({members:s.members.map(function (x) { return x.id === m.id ? Object.assign({}, x, {role:v}) : x; })}); self.flash(m.name + ': роль «' + ROLES[v] + '».'); },
    remind2fa:function () { self.flash(m.name + ': отправлено напоминание включить двухфакторную защиту.'); }, noTfa:!m.tfa}; }),
   roleOpts:Object.keys(ROLES).filter(function (k) { return k !== 'owner'; }).map(function (k) { return {v:k, label:ROLES[k]}; }),
   invite:function () { self.flash('Приглашение: сотрудник задаёт пароль и включает двухфакторную защиту при первом входе.'); },
   perms: PERMS.map(function (p) { return {label:p[0], cells:['owner','admin','marketing','manager'].map(function (r) { var ok = p[1] === 'orders_view' ? true : CAN[p[1]].indexOf(r) >= 0; var view = !ok && p[1] === 'products' && r === 'manager'; return {text: ok ? '✓' : (view ? 'просмотр' : '—'), style:'text-align:center;font-weight:600;color:' + (ok ? '#1D5A35' : '#8A909C')}; })}; }),
   integr: INTEGRATIONS.map(function (x) { return {name:x.name, what:x.what, st:x.st, stStyle:pill(x.tone)}; }),
   rates:s.rates, onRate:['USD','RUB','EUR','GEL'].reduce(function (acc, k) { acc[k] = function (e) { var r = Object.assign({}, s.rates); r[k] = e.target.value; self.setState({rates:r}); }; return acc; }, {}),
   journal: journal.slice(0, 40).map(function (j) { return {when:fmtD(j.dt), who:j.who, text:j.text, open:j.open}; }), journalEmpty:!journal.length
  };

  // ---------- задачи
  function taskPass(t, k) {
   if (s.tscope === 'mine' && t.who !== meName) return false;
   if (k === 'today') return !t.done && t.due.slice(0, 10) <= TODAY;
   if (k === 'over') return !t.done && t.due < NOW;
   if (k === 'week') return !t.done && t.due.slice(0, 10) <= addDays(TODAY, 7);
   if (k === 'done') return t.done;
   return !t.done;
  }
  var TK = {
   chips:chips('tfilter', [['today','На сегодня'],['over','Просроченные'],['week','Неделя'],['open','Все открытые'],['done','Выполненные']], function (k) { return s.tasks.filter(function (t) { return taskPass(t, k); }).length; }),
   scope:s.tscope, onScope:function (e) { self.setState({tscope:e.target.value}); },
   rows: s.tasks.filter(function (t) { return taskPass(t, s.tfilter); }).sort(function (a, b) { return a.due < b.due ? -1 : 1; }).map(taskRow),
   add:function () { self.openTask({}); }
  };
  TK.empty = !TK.rows.length;

  // ---------- импорт
  var IM = {
   steps:['1. Файлы','2. Колонки','3. Проверка'].map(function (l, i) { var on = s.imp === i + 1, past = s.imp > i + 1; return {label:l, style:'font-size:13px;font-weight:600;padding:5px 12px;border-radius:999px;' + (on ? 'background:#2453A6;color:#FFFFFF' : (past ? 'background:#DFF0E5;color:#1D5A35' : 'background:#EEF0F4;color:#3A4050'))}; }),
   s1:s.imp === 1, s2:s.imp === 2, s3:s.imp === 3,
   map:[['Имя, Фамилия','Имя','ok','распознано'],['Email','Почта (ГК / сайт)','ok','распознано'],['Телефон','Телефон','ok','распознано'],['Telegram','Ник в Telegram','ok','распознано'],['Город, Страна','Страна, город','ok','распознано'],['Доп. поле «почта в приложении»','Почта в приложении','wait','проверьте'],['Дата создания','Клиентка с','ok','распознано'],['Заказы: предложение','Продукт — по таблице соответствия','ask','нужна таблица'],['Заказы: платежи','Платежи и способ оплаты','ok','распознано'],['Абонементы КК: оплачено до','Месяцы клуба','ok','распознано'],['utm_source, utm_medium','Не импортировать','mute','пропуск']].map(function (m) { return {col:m[0], to:m[1], style:pill(m[2]), st:m[3]}; }),
   stats:[['11 955','клиенток'],['7 201','заказ'],['312','дублей склеено по почте и телефону'],['50','длительных абонементов → месяцы клуба'],['1 840','связаны с приложением по почте'],['27','строк с ошибками']].map(function (x) { return {v:x[0], k:x[1]}; }),
   next:function () { self.setState({imp:Math.min(3, s.imp + 1)}); }, back:function () { self.setState({imp:Math.max(1, s.imp - 1)}); },
   done:function () { self.setState({imp:1}); self.flash('Импорт выполнен: 11 955 клиенток, 7 201 заказ. 27 строк отложено — файл с ними в журнале.'); },
   errors:function () { self.flash('Файл с 27 строками и причинами ошибок скачан.'); }
  };

  // ---------- боковые панели
  var dr = s.drawer, f = s.f, DR = {open:!!dr, client:false, order:false, product:false, newo:false, camp:false, seg:false, task:false, close:function () { self.setState({drawer:null}); }};
  var onF = function (k) { return function (e) { var x = Object.assign({}, s.f); x[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; self.setState({f:x}); }; };
  var DC = null, DO = null, DP = null, DN = null, DM = null;
  if (dr && dr.type === 'client') {
   DR.client = true;
   var c = this.C(dr.id), d = D[c.id], dup = this.dupOf(c);
   var hist = c.hist.map(function (h) { return h; });
   d.orders.forEach(function (o) { o.hist.forEach(function (h) { hist.push({dt:h.dt, who:h.who, text:'#' + o.id + ' · ' + h.text}); }); });
   hist.sort(function (a, b) { return a.dt < b.dt ? 1 : -1; });
   var win = range(CUR - 3, CUR + 8);
   DC = {
    name:c.name, initials:initials(c.name), avStyle:avStyle(c.name, 44), city:c.city, since:'клиентка с ' + c.since, tags:c.tags.map(function (t) { return {t:t, remove:function () { self.removeTag(c.id, t); }}; }),
    tabs:[['overview','Обзор'],['orders','Заказы · ' + d.orders.length],['hist','История'],['comments','Комментарии · ' + c.comments.length]].map(function (t) { var on = s.dtab === t[0]; return {label:t[1], pick:function () { self.setState({dtab:t[0]}); }, style:'font:inherit;font-size:14px;font-weight:600;background:none;border:0;border-bottom:2px solid ' + (on ? '#2453A6' : 'transparent') + ';color:' + (on ? '#171A21' : '#5B6170') + ';padding:10px 2px;cursor:pointer;white-space:nowrap'}; }),
    isOverview:s.dtab === 'overview', isOrders:s.dtab === 'orders', isHist:s.dtab === 'hist', isComments:s.dtab === 'comments',
    gk:c.gk || '—', phone:c.phone || '—', tg:c.tg || '—', wa: c.wa ? 'есть, ' + c.phone : 'нет', hasWa:!!c.wa, bot: c.bot ? 'подписана — можно писать через бота' : 'не подписана', botStyle:'color:' + (c.bot ? '#1D5A35' : '#5B6170'), whatsapp:function () { self.flash('Откроется WhatsApp: wa.me/' + c.phone.replace(/\D/g, '') + '.'); },
    local:'Сейчас у неё ' + localTime(c.city).text + (localTime(c.city).night ? ' · ночь' : ''), localStyle:'font-size:13px;color:' + (localTime(c.city).night ? '#8A2E1C' : '#5B6170'),
    resendChannel:function () { self.resendChannel(c.id); },
    channels:(function () {
     var list = [{name:'Канал месяца · октябрь', auto:d.inClub}, {name:'Канал Зимнего сезона', auto:d.ent.indexOf(mk(2026,12)) >= 0}];
     d.orders.forEach(function (o) { var p = self.Pr(o.p); if (p.tgLink && p.grant !== 'month' && p.grant !== 'months' && !list.some(function (x) { return x.name === p.name; })) list.push({name:p.name, auto:grants(o, p)}); });
     return list.map(function (x) {
      var m = (c.chan || {})[x.name], inCh = m ? m === 'in' : x.auto;
      return {name:x.name, st: inCh ? (m === 'in' ? 'В канале · добавлена вручную' : 'В канале · по оплате') : (m === 'out' ? 'Убрана вручную' : 'Нет доступа'), stStyle:pill(inCh ? 'ok' : (m === 'out' ? 'warn' : 'mute')),
       btn: m ? 'Вернуть как по оплате' : (x.auto ? 'Убрать из канала' : 'Добавить вручную'), toggle:function () { self.toggleChannel(c.id, x.name, x.auto); }};
     });
    })(),
    linked:c.linked, notLinked:!c.linked, app:c.app, seen:c.seen || 'сегодня', appState:c.linked ? 'Связан' : (c.codeSent ? 'Код отправлен' : 'Не связан'), appStyle:pill(c.linked ? 'ok' : (c.codeSent ? 'wait' : 'warn')),
    codeLabel: c.codeSent ? 'Отправить код ещё раз' : 'Отправить код активации',
    until: d.lastM >= CUR ? 'Оплачено по ' + mFull(d.lastM) + ' включительно' + (d.auto ? ' · автопродление App Store' : '') : (d.lastM >= 0 ? 'Доступ закончился: ' + mFull(d.lastM) : 'Доступа к клубу не было'),
    legacy:c.legacyNote, hasLegacy:!!c.legacyNote,
    months: win.map(function (m) { var on = d.ent.indexOf(m) >= 0, cur = m === CUR; return {label:mLabel(m), style:'text-align:center;font-size:12px;font-weight:600;padding:6px 0;border-radius:6px;' + (on ? 'background:#2453A6;color:#FFFFFF;' : 'background:#F1F3F6;color:#8A909C;') + (cur ? 'box-shadow:inset 0 0 0 2px #171A21' : '')}; }),
    books: d.books.length ? d.books.join(', ') : '—', packs: d.packs.length ? d.packs.join(', ') : '—',
    tgCh: d.inClub ? 'Чат месяца открыт до ' + lastDay(CUR) + ', потом закрывается.' : 'Чат месяца закрыт.',
    matText: d.matForever ? 'Материалы оплаченных месяцев остаются навсегда (Тариф 3).' : 'Материалы месяца — на время доступа. Навсегда — покупкой разбора или Тарифом 3.',
    tier2: d.tier2 ? 'Тариф 2: зум-встречи в этом месяце' : '', hasTier2:d.tier2,
    bal:money(d.bal), hasCard:c.cardOps.length > 0, ops:c.cardOps.slice().reverse().map(function (x) { return {when:fmtD(x.dt), text:x.text, amt:(x.amt > 0 ? '+' : '−') + money(Math.abs(x.amt)), style:'font-weight:600;white-space:nowrap;color:' + (x.amt > 0 ? '#1D5A35' : '#171A21')}; }),
    dup:!!dup, dupText: dup ? 'Возможный дубль: ' + dup.name + ' · ' + (dup.gk || dup.app) + ' — тот же телефон' : '', merge:function () { if (dup) self.merge(dup.id, c.id); }, openDup:function () { if (dup) self.openClient(dup.id); },
    orders: d.orders.slice().sort(function (a, b) { return a.dt < b.dt ? 1 : -1; }).map(ord), noOrders:!d.orders.length,
    hist: hist.slice(0, 40).map(function (h) { return {when:fmtD(h.dt), who:h.who, text:h.text}; }),
    comments: c.comments.slice().reverse().map(function (x) { return {who:x.who, when:fmtD(x.dt), text:x.text}; }), noComments:!c.comments.length,
    canOrders:this.can('orders'),
    addTask:function () { self.openTask({c:c.id}); }, ctasks:s.tasks.filter(function (t) { return t.c === c.id && !t.done; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; }).map(taskRow), noTasks:!s.tasks.some(function (t) { return t.c === c.id && !t.done; }),
    newOrder:function () { self.openNew({c:c.id}); }, giveFree:function () { self.openNew({c:c.id, method:'free'}); },
    writeOpen:!!f.writeOpen, toggleWrite:function () { self.setState({f:Object.assign({}, s.f, {writeOpen:!s.f.writeOpen})}); },
    writeOpts:[
     {label:'Telegram-бот клуба', sub: c.bot ? (c.tg || 'подписана') : 'не подписана на бота — бот не может написать первым', ok:!!c.bot, go:function () { if (c.bot) self.startThread(c.id, 'Telegram-бот'); }},
     {label:'Почта · club@annabusel.org', sub: c.gk || c.app || 'почты нет', ok:!!(c.gk || c.app), go:function () { if (c.gk || c.app) self.startThread(c.id, 'Почта'); }},
     {label:'WhatsApp', sub: c.wa ? c.phone : 'нет WhatsApp', ok:!!c.wa, go:function () { if (c.wa) self.flash('Откроется WhatsApp: wa.me/' + c.phone.replace(/\D/g, '') + '.'); }}
    ].map(function (o) { o.style = 'font:inherit;color:' + (o.ok ? '#171A21' : '#9AA0AB') + ';width:100%;text-align:left;border:0;background:#FFFFFF;padding:9px 10px;border-radius:6px;cursor:' + (o.ok ? 'pointer' : 'not-allowed') + ';display:flex;flex-direction:column;gap:2px'; o.dis = !o.ok; return o; }),
    toPlan:function () { var p = Object.assign({}, s.plan); p[c.id] = 'todo'; self.setState({plan:p}); self.flash(c.name + ' в плане продаж.'); },
    sendCode:function () { self.sendCode(c.id); }, link:function () { self.link(c.id, f.linkEmail); },
    linkEmail:f.linkEmail || '', onLinkEmail:onF('linkEmail'), tag:f.tag || '', onTag:onF('tag'), addTag:function () { self.addTag(c.id, f.tag); },
    comment:f.comment || '', onComment:onF('comment'), addComment:function () { self.addComment(c.id); }, onCommentKey:function (e) { if (e.key === 'Enter') { e.preventDefault(); self.addComment(c.id); } },
    cardAmt:f.cardAmt || '', cardText:f.cardText || '', onCardAmt:onF('cardAmt'), onCardText:onF('cardText'), topup:function () { self.cardOp(c.id, 1); }, spend:function () { self.cardOp(c.id, -1); }
   };
  }
  if (dr && dr.type === 'order') {
   DR.order = true;
   var o = byId(s.orders, dr.id), oc = this.C(o.c), opr = this.Pr(o.p), ost = status(o), locked = (paidAmt(o) > 0 || o.st !== '') && !f.edit, canO = this.can('orders'), a = appState(o);
   DO = {
    id:o.id, st:ST[ost][0], stStyle:pill(ST[ost][1]), created:fmtD(o.dt), client:oc.name, openClient:function () { self.openClient(oc.id); },
    gift:!!o.gift, giftText: o.gift ? (o.gift.name ? o.gift.name + ' · ' : '') + o.gift.email : '', src:o.src, method:srcLabel(o),
    manager:o.manager, mgrOpts:[{v:'', label:'Не назначен'}].concat(s.members.filter(function (m) { return m.role !== 'marketing'; }).map(function (m) { return {v:m.name, label:m.name}; })),
    onManager:function (e) { self.orderField(o.id, 'manager', e.target.value, 'Менеджер: ' + (e.target.value || 'не назначен')); },
    tags:o.tags.join(', ') || '—', deadline: o.deadline ? fmtD(o.deadline) : '—', reminder: ost === 'new' || ost === 'overdue' || ost === 'partial' ? (o.reminded ? 'Напоминание отправлено' : 'Напоминание уйдёт автоматически') : '',
    locked:locked, editable:!locked && canO, product:o.p, productOpts:s.products.filter(function (p) { return p.active || p.id === o.p; }).map(function (p) { return {v:p.id, label:p.name}; }),
    onProduct:function (e) { self.changeProduct(o.id, e.target.value); },
    price:f.price, onPrice:onF('price'), savePrice:function () { self.changePrice(o.id); },
    promo:f.promo, onPromo:onF('promo'), applyPromo:function () { self.applyPromoOrder(o.id); },
    sum:money(o.price, o.cur), hasDisc:o.disc > 0, disc:'−' + money(o.disc, o.cur) + (o.promo ? ' · ' + o.promo : ''), total:money(total(o), o.cur), paid:money(paidAmt(o), o.cur), left:money(Math.max(0, total(o) - paidAmt(o)), o.cur), hasLeft: total(o) - paidAmt(o) > 0.001 && (ost === 'new' || ost === 'overdue' || ost === 'partial'),
    editing:!!f.edit, canEdit: canO && !f.edit && (ost === 'paid' || ost === 'partial' || ost === 'free' || ost === 'confirm'), startEdit:function () { self.setEdit(o.id, true); }, endEdit:function () { self.setEdit(o.id, false); },
    canRestore: canO && ost === 'fake', restore:function () { self.restore(o.id); },
    fakeAsk:!!f.fakeAsk, askFake:function () { self.setState({f:Object.assign({}, s.f, {fakeAsk:true})}); }, cancelFake:function () { self.setState({f:Object.assign({}, s.f, {fakeAsk:false})}); },
    pays:o.payments.map(function (pm, i) { return {canRemove:!!f.edit && canO, remove:function () { self.removePay(o.id, i); }, extra:(pm.acc ? ' → ' + pm.acc : '') + (pm.note ? ' · ' + pm.note : ''), amt:money(pm.amt, pm.method === 'Баланс' ? 'BYN' : o.cur), method:pm.method, when:fmtD(pm.dt), pending:!!pm.pending, canConfirm:!!pm.pending && self.can('confirm'), waiting:!!pm.pending && !self.can('confirm'), confirm:function () { self.confirmPay(o.id, i); }}; }), noPays:!o.payments.length,
    canPay:canO && (ost === 'new' || ost === 'overdue' || ost === 'partial'), payAmt:f.payAmt, onPayAmt:onF('payAmt'), payMethod:f.payMethod, onPayMethod:onF('payMethod'),
    isTransfer:f.payMethod === 'Перевод на карту', payAcc:f.payAcc, onPayAcc:onF('payAcc'), accOpts:ACCOUNTS.map(function (x) { return {v:x, label:x}; }), payNote:f.payNote || '', onPayNote:onF('payNote'),
    confirmNote: s.requireConfirm ? 'Перевод на карту подтверждает Анна в CRM — доступ откроется после подтверждения.' : 'Укажите, куда пришли деньги. Подтверждение Анны можно записать в примечание.',
    payMethods:METHODS.map(function (m) { return {v:m, label:m === 'Баланс' ? 'С баланса · ' + money(D[oc.id].bal) : m}; }), addPay:function () { self.addPayment(o.id); },
    unpaid: ost === 'new' || ost === 'overdue' || ost === 'partial', copy:function () { self.copyLink(o.id); }, mail:function () { self.mailLink(o.id); }, fake:function () { self.markFake(o.id); self.setState({f:Object.assign({}, self.state.f, {fakeAsk:false})}); }, canFake: canO && (ost === 'new' || ost === 'overdue') && !f.fakeAsk,
    canRefund: ost === 'paid' && paidAmt(o) > 0, refundAllowed:this.can('refund'), noRefundRight:!this.can('refund'),
    refModes:[['money','Вернуть деньги'],['card','Перезачесть на баланс']].map(function (m) { var on = f.refMode === m[0]; return {label:m[1], pick:function () { self.setState({f:Object.assign({}, s.f, {refMode:m[0]})}); }, style:chipStyle(on)}; }),
    refAmt:f.refAmt, onRefAmt:onF('refAmt'), refReason:f.refReason, onRefReason:onF('refReason'), doRefund:function () { self.refund(o.id); },
    isRefund: ost === 'refund', refundText: o.refund ? (o.refund.mode === 'card' ? 'Перезачтено на баланс ' : 'Возвращено ') + money(o.refund.amt, o.cur) + ' · ' + o.refund.reason : '',
    note:o.note, hasNote:!!o.note, app:a.text, appStyle:pill(a.tone), grant:grantText(opr),
    canResend: ost === 'paid' || ost === 'free', resend:function () { self.resendLetter(o.id); },
    comments:o.comments.slice().reverse().map(function (x) { return {who:x.who, when:fmtD(x.dt), text:x.text}; }), noComments:!o.comments.length, ocomment:f.ocomment || '', onOcomment:onF('ocomment'), addComment:function () { self.addOrderComment(o.id); }, onOcommentKey:function (e) { if (e.key === 'Enter') { e.preventDefault(); self.addOrderComment(o.id); } },
    pendAmt: pendAmt(o) > 0 ? money(pendAmt(o), o.cur) : '', hasPend:pendAmt(o) > 0,
    hist:o.hist.slice().reverse().map(function (h) { return {when:fmtD(h.dt), who:h.who, text:h.text}; })
   };
  }
  if (dr && dr.type === 'new') {
   DR.newo = true;
   var nc = f.c ? this.C(f.c) : null, np = this.Pr(f.p), price = parseFloat(String(f.price).replace(',', '.')) || 0, disc = f.method === 'free' ? 0 : (f.disc || 0), tot = f.method === 'free' ? 0 : Math.max(0, price - disc), nbal = nc ? D[nc.id].bal : 0;
   var ncq = (f.cq || '').trim().toLowerCase();
   DN = {
    hasClient:!!nc, noClient:!nc, clientName: nc ? nc.name : '', clientSub: nc ? (nc.gk || nc.app) + (nc.linked ? ' · приложение связано' : ' · приложение не связано') : '', clearClient:function () { self.setState({f:Object.assign({}, s.f, {c:''})}); },
    cq:f.cq || '', onCq:onF('cq'),
    found: ncq.length >= 2 ? live.filter(function (c) { return (c.name + ' ' + c.gk + ' ' + c.app + ' ' + c.tg + ' ' + c.phone.replace(/\D/g, '')).toLowerCase().indexOf(ncq) >= 0; }).slice(0, 6).map(function (c) { return {name:c.name, sub:c.gk || c.app, pick:function () { self.setState({f:Object.assign({}, s.f, {c:c.id, cq:''})}); }}; }) : [],
    gift:!!f.gift, toggleGift:function () { self.setState({f:Object.assign({}, s.f, {gift:!s.f.gift})}); }, giftName:f.giftName, giftEmail:f.giftEmail, onGiftName:onF('giftName'), onGiftEmail:onF('giftEmail'),
    p:f.p, productOpts:s.products.filter(function (p) { return p.active; }).map(function (p) { return {v:p.id, label:p.name + (p.price !== null ? ' — ' + money(p.price, p.cur) : '')}; }),
    onProduct:function (e) { var p = self.Pr(e.target.value); self.setState({f:Object.assign({}, s.f, {p:p.id, price:p.price === null ? '' : String(p.price), cur:p.cur, disc:0, promoMsg:'', promo:''})}); },
    grant:grantText(np), hasAsk:!!np.ask, ask:np.ask,
    price:f.price, onPrice:function (e) { self.setState({f:Object.assign({}, s.f, {price:e.target.value, disc:0, promoMsg:s.f.promo ? 'Цена изменена — примените промокод заново' : ''})}); }, cur:f.cur, onCur:onF('cur'), curOpts:['BYN','RUB','USD','EUR','GEL'].map(function (x) { return {v:x, label:x}; }),
    promo:f.promo, onPromo:onF('promo'), applyPromo:function () { self.newPromo(); }, promoMsg:f.promoMsg, hasPromoMsg:!!f.promoMsg,
    methods:[['link','Ссылка на оплату','Клиентка оплатит сама, напоминание уйдёт автоматически'],['manual','Оплата уже пришла','Перевод на карту, lava.top — проводим сразу'],['card','С баланса','Списать с внутреннего баланса клиентки'],['free','Без оплаты','Подарок, розыгрыш, перезачёт — с причиной']].map(function (m) { var on = f.method === m[0]; return {label:m[1], hint:m[2], pick:function () { self.setState({f:Object.assign({}, s.f, {method:m[0]})}); }, style:'font:inherit;color:#171A21;cursor:pointer;display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;padding:10px 12px;border-radius:8px;border:1px solid ' + (on ? '#2453A6' : '#D5D9E0') + ';background:' + (on ? '#F2F6FD' : '#FFFFFF') + ';box-shadow:' + (on ? 'inset 0 0 0 1px #2453A6' : 'none')}; }),
    isLink:f.method === 'link', isManual:f.method === 'manual', isCard:f.method === 'card', isFree:f.method === 'free', notFree:f.method !== 'free',
    payMethod:f.payMethod, onPayMethod:onF('payMethod'), payOpts:['Перевод на карту','lava.top','bePaid'].map(function (x) { return {v:x, label:x}; }),
    isTransfer:f.payMethod === 'Перевод на карту', payAcc:f.payAcc, onPayAcc:onF('payAcc'), accOpts:ACCOUNTS.map(function (x) { return {v:x, label:x}; }), payNote:f.payNote || '', onPayNote:onF('payNote'),
    cardInfo: nc ? 'На карте ' + money(nbal) + (tot > nbal ? ' — не хватает ' + money(tot - nbal) : '') : 'Выберите клиентку',
    cardInfoStyle:'font-size:13px;color:' + (nc && tot > nbal ? '#8A2E1C' : '#5B6170'),
    reason:f.reason, onReason:onF('reason'), days:f.days, onDays:onF('days'), dayOpts:[['1','1 день'],['3','3 дня'],['7','7 дней']].map(function (x) { return {v:x[0], label:x[1]}; }),
    manager:f.manager, onManager:onF('manager'), mgrOpts:s.members.filter(function (m) { return m.role !== 'marketing'; }).map(function (m) { return {v:m.name, label:m.name}; }),
    sum:[{k:'Клиент', v: nc ? nc.name : '—'}, {k:'Позиция', v:np.name}, {k:'Сумма', v: f.method === 'free' ? '0 BYN' : money(price, f.cur)}].concat(disc ? [{k:'Скидка', v:'−' + money(disc, f.cur)}] : []).concat([{k:'К оплате', v: money(tot, f.cur)}, {k:'В приложении', v: np.grant === 'none' ? 'Не связано' : grantText(np) + (f.gift ? ' — у получательницы' : (nc && !nc.linked ? ' — после привязки' : ''))}]),
    create:function () { self.createOrder(); }, createLabel: f.method === 'link' ? 'Создать и скопировать ссылку' : (f.method === 'free' ? 'Выдать доступ' : 'Провести оплату'),
    canCreate:this.can('orders')
   };
  }
  if (dr && dr.type === 'product') {
   DR.product = true;
   var canE = this.can('products');
   DP = {
    isNew:dr.id === 'new', title: dr.id === 'new' ? 'Новый продукт' : 'Продукт', canEdit:canE, readOnly:!canE, disabled:!canE,
    name:f.name, onName:onF('name'), price:f.price, onPrice:onF('price'), cur:f.cur, onCur:onF('cur'), curOpts:['BYN','RUB','USD','EUR','GEL'].map(function (x) { return {v:x, label:x}; }),
    term:f.term, onTerm:onF('term'), cat:f.cat, onCat:onF('cat'), catOpts:[['club','Клуб'],['content','Разбор или пакет'],['card','Баланс'],['other','Вне клуба']].map(function (x) { return {v:x[0], label:x[1]}; }),
    grant:f.grant, onGrant:onF('grant'), grantOpts:[['month','Клуб: месяц оплаты'],['months','Клуб: фиксированные месяцы (сезон)'],['year','Клуб: 12 месяцев'],['book','Разборы (один или несколько)'],['pack','Пакет разборов'],['tier2','Тариф 2: зум этого месяца'],['deposit','Пополнение баланса'],['ask','Нужно уточнить'],['none','Не связан с приложением']].map(function (x) { return {v:x[0], label:x[1]}; }),
    isBook:f.grant === 'book', isPack:f.grant === 'pack', isDeposit:f.grant === 'deposit', isMonths:f.grant === 'months',
    monthsText:(f.months || []).map(mLabel).join(', ') || 'Задаются при создании сезона',
    bookOpts: APP_BOOKS.concat((f.books || []).filter(function (b) { return APP_BOOKS.indexOf(b) < 0; })).map(function (b) { var on = (f.books || []).indexOf(b) >= 0; return {label:b, on:on, toggle:function () { var bs = (s.f.books || []).slice(), i = bs.indexOf(b); if (i >= 0) bs.splice(i, 1); else bs.push(b); self.setState({f:Object.assign({}, s.f, {books:bs})}); }}; }),
    isClubGrant: f.grant === 'month' || f.grant === 'months' || f.grant === 'year', showTerm: f.grant === 'book' || f.grant === 'pack' || f.grant === 'none',
    termMode:f.termMode, onTermMode:onF('termMode'), termOpts:[['forever','Навсегда'],['date','До конкретной даты'],['months','N месяцев с даты оплаты']].map(function (x) { return {v:x[0], label:x[1]}; }),
    isTermDate:f.termMode === 'date', isTermMonths:f.termMode === 'months', termN:f.termN, onTermN:onF('termN'), termDate:f.termDate, onTermDate:onF('termDate'),
    accessOnFirst:!!f.accessOnFirst, onAccessOnFirst:onF('accessOnFirst'),
    mat: f.matForever ? 'yes' : 'no', onMat:function (e) { self.setState({f:Object.assign({}, s.f, {matForever:e.target.value === 'yes'})}); },
    chat: f.chatForever ? 'yes' : 'no', onChat:function (e) { self.setState({f:Object.assign({}, s.f, {chatForever:e.target.value === 'yes'})}); }, pack:f.pack, onPack:onF('pack'), deposit:f.deposit, onDeposit:onF('deposit'),
    tgLink:f.tgLink || '', onTgLink:onF('tgLink'), asc:f.asc, onAsc:onF('asc'), gp:f.gp, onGp:onF('gp'), slug:f.slug, onSlug:onF('slug'), url:'pay.chitatel.app/' + (f.slug || '…'),
    letter:f.letter, onLetter:onF('letter'), active:!!f.active, onActive:onF('active'), ask:f.ask, onAsk:onF('ask'),
    save:function () { self.saveProduct(); }
   };
  }
  var SB = {};
  if (dr && (dr.type === 'camp' || dr.type === 'seg')) {
   var FIELDS = [['club','В клубе в месяце'],['nopay','Не покупала N месяцев'],['boughtCat','Покупала из раздела'],['bought','Покупала продукт'],['tag','Есть тег'],['country','Страна'],['linked','Приложение'],['bot','Telegram-бот'],['tier2','Тариф 2 (зум) в этом месяце']];
   var CATS = [['club','Книжный клуб'],['content','Разборы и пакеты'],['card','Баланс'],['other','Вне клуба']];
   var tagsAll = [], countries = [];
   live.forEach(function (c) { c.tags.forEach(function (t) { if (tagsAll.indexOf(t) < 0) tagsAll.push(t); }); var co = c.city.split(',')[0]; if (countries.indexOf(co) < 0) countries.push(co); });
   var valOpts = function (field) {
    if (field === 'club') return range(CUR - 2, CUR + 4).map(function (m) { return {v:String(m), label:mLabel(m)}; });
    if (field === 'nopay') return [['1','1 месяц'],['2','2 месяца'],['3','3 месяца'],['6','6 месяцев'],['12','12 месяцев']].map(function (x) { return {v:x[0], label:x[1]}; });
    if (field === 'boughtCat') return CATS.map(function (x) { return {v:x[0], label:x[1]}; });
    if (field === 'bought') return s.products.map(function (p) { return {v:p.id, label:p.name}; });
    if (field === 'tag') return tagsAll.map(function (t) { return {v:t, label:t}; });
    if (field === 'country') return countries.sort().map(function (t) { return {v:t, label:t}; });
    if (field === 'linked') return [{v:'yes', label:'Связана'}, {v:'no', label:'Не связана'}];
    if (field === 'bot') return [{v:'yes', label:'Подписана'}, {v:'no', label:'Не подписана'}];
    return [{v:'yes', label:'Да'}];
   };
   var conds = f.conds || [];
   var matched = live.filter(function (c) { return self.matchConds(c, D[c.id], conds); });
   var describe = function (list) { return list.length ? list.map(function (k, i) { var fl = FIELDS.filter(function (x) { return x[0] === k.field; })[0][1], vo = valOpts(k.field).filter(function (x) { return x.v === k.val; })[0]; return (i ? (k.join === 'or' ? ' ИЛИ ' : ' И ') : '') + (k.not ? 'НЕ ' : '') + (k.field === 'tier2' ? fl : fl + ': ' + (vo ? vo.label : k.val)); }).join('') : 'Вся база'; };
   this._segLabel = describe(conds);
   var setConds = function (list) { self.setState({f:Object.assign({}, s.f, {conds:list})}); };
   var joinStyle = function (on) { return 'font:inherit;font-size:12px;font-weight:700;border-radius:6px;padding:3px 10px;cursor:pointer;border:1px solid ' + (on ? '#2453A6' : '#D5D9E0') + ';background:' + (on ? '#2453A6' : '#FFFFFF') + ';color:' + (on ? '#FFFFFF' : '#5B6170'); };
   SB = {
    conds: conds.map(function (k, i) {
     var upd = function (patch) { var list = clone(s.f.conds); Object.assign(list[i], patch); setConds(list); };
     return {field:k.field, val:k.val, fieldOpts:FIELDS.map(function (x) { return {v:x[0], label:x[1]}; }), valOpts:valOpts(k.field), hasVal:k.field !== 'tier2', noVal:k.field === 'tier2',
      notFirst:i > 0, andStyle:joinStyle(k.join !== 'or'), orStyle:joinStyle(k.join === 'or'), setAnd:function () { upd({join:'and'}); }, setOr:function () { upd({join:'or'}); },
      not:!!k.not, notStyle:'font:inherit;font-size:12px;font-weight:700;border-radius:6px;padding:0 10px;height:38px;cursor:pointer;border:1px solid ' + (k.not ? '#8A2E1C' : '#D5D9E0') + ';background:' + (k.not ? '#FBE1DA' : '#FFFFFF') + ';color:' + (k.not ? '#8A2E1C' : '#5B6170'), toggleNot:function () { upd({not:!k.not}); },
      onField:function (e) { upd({field:e.target.value, val:(valOpts(e.target.value)[0] || {v:''}).v}); },
      onVal:function (e) { upd({val:e.target.value}); },
      remove:function () { var list = clone(s.f.conds); list.splice(i, 1); setConds(list); }};
    }),
    noConds:!conds.length, addCond:function () { setConds(clone(s.f.conds || []).concat([{field:'boughtCat', val:'content', join:'and'}])); },
    presets:[['В клубе в октябре', [{field:'club', val:String(CUR)}]], ['Зимний сезон', [{field:'club', val:String(mk(2026,12))}]], ['Тариф 2 / зум', [{field:'tier2', val:'yes'}]], ['Не покупали 3 месяца', [{field:'nopay', val:'3'}]], ['Не покупали разборы', [{field:'boughtCat', val:'content', not:true}]], ['Не покупали клуб', [{field:'boughtCat', val:'club', not:true}]], ['Вся база', []]]
     .concat(s.segments.map(function (g) { return ['★ ' + g.name, g.conds]; })).map(function (x) { return {label:x[0], pick:function () { setConds(clone(x[1])); }}; }),
    summary:describe(conds), count:matched.length, countText:'Подходят: ' + matched.length + ' ' + plural(matched.length, 'клиентка', 'клиентки', 'клиенток')
   };
  }
  var DT = {};
  if (dr && dr.type === 'task') {
   DR.task = true;
   var tc2 = f.c ? this.C(f.c) : null, tq = (f.cq || '').trim().toLowerCase();
   DT = {
    isNew:f.tid === 'new', title:f.title, onTitle:onF('title'), type:f.type, onType:onF('type'), typeOpts:Object.keys(TTYPES).map(function (k) { return {v:k, label:TTYPES[k]}; }),
    hasClient:!!tc2, noClient:!tc2, clientName: tc2 ? tc2.name : '', clientSub: tc2 ? (tc2.tg || tc2.phone || tc2.gk) : '', clearClient:function () { self.setState({f:Object.assign({}, s.f, {c:''})}); },
    cq:f.cq || '', onCq:onF('cq'), found: tq.length >= 2 ? live.filter(function (c) { return (c.name + ' ' + c.gk + ' ' + c.tg + ' ' + c.phone.replace(/\D/g, '')).toLowerCase().indexOf(tq) >= 0; }).slice(0, 6).map(function (c) { return {name:c.name, sub:c.gk || c.app, pick:function () { self.setState({f:Object.assign({}, s.f, {c:c.id, cq:''})}); }}; }) : [],
    date:f.date, onDate:onF('date'), time:f.time, onTime:onF('time'), pri:f.pri, onPri:onF('pri'), priOpts:Object.keys(PRI).map(function (k) { return {v:k, label:PRI[k][0]}; }),
    who:f.who, onWho:onF('who'), whoOpts:s.members.map(function (m) { return {v:m.name, label:m.name}; }),
    quick:[['Сегодня', TODAY], ['Завтра', addDays(TODAY, 1)], ['Через 3 дня', addDays(TODAY, 3)], ['Через неделю', addDays(TODAY, 7)]].map(function (x) { return {label:x[0], pick:function () { self.setState({f:Object.assign({}, s.f, {date:x[1]})}); }}; }),
    save:function () { self.saveTask(); }
   };
  }
  var DS = {};
  if (dr && dr.type === 'seg') {
   DR.seg = true;
   DS = {name:f.segName || '', onName:onF('segName'), save:function () { var sg = self.saveSegment(s.f.segName, s.f.conds); if (sg) self.go('clients', {cf:'seg:' + sg.id, cq:'', cpage:1}); }};
  }
  if (dr && dr.type === 'camp') {
   DR.camp = true;
   var reach = matched.filter(function (c) { if (f.ch === 'Telegram-бот') return c.bot; if (f.ch === 'Email') return !!(c.gk || c.app); return c.bot || !!(c.gk || c.app); });
   var cnt = reach.length;
   DM = {
    name:f.name, onName:onF('name'),
    segName:f.segName || '', onSegName:onF('segName'), saveSeg:function () { self.saveSegment(s.f.segName, s.f.conds); self.setState({f:Object.assign({}, self.state.f, {segName:''})}); },
    matchedText:'Подходят: ' + matched.length + ' · получат: ' + cnt + (f.ch === 'Telegram-бот' && matched.length > cnt ? ' (бот пишет только тем, кто его запускал)' : (f.ch === 'Email' && matched.length > cnt ? ' (у остальных нет почты)' : '')),
    fmts:[['text','Текст'],['html','HTML из Тильды']].map(function (w) { var on = (f.fmt || 'text') === w[0]; return {label:w[1], pick:function () { self.setState({f:Object.assign({}, s.f, {fmt:w[0]})}); }, style:chipStyle(on)}; }),
    isHtml:f.fmt === 'html', isText:f.fmt !== 'html', html:f.html || '', onHtml:onF('html'),
    test:function () { self.flash('Тестовое письмо отправлено вам на почту — проверьте вёрстку перед рассылкой.'); },
    ch:f.ch, onCh:onF('ch'), chOpts:['Email','Telegram-бот','Email + Telegram-бот'].map(function (x) { return {v:x, label:x}; }), needSubject:f.ch !== 'Telegram-бот',
    subject:f.subject, onSubject:onF('subject'), text:f.text, onText:onF('text'), when:f.when, at:f.at, onAt:onF('at'),
    whens:[['now','Отправить сейчас'],['later','Запланировать']].map(function (w) { var on = f.when === w[0]; return {label:w[1], pick:function () { self.setState({f:Object.assign({}, s.f, {when:w[0]})}); }, style:chipStyle(on)}; }),
    isLater:f.when === 'later', count:cnt + ' ' + plural(cnt, 'получатель', 'получателя', 'получателей'),
    create:function () { self.createCampaign(cnt); }, createLabel: f.when === 'now' ? 'Отправить' : 'Запланировать'
   };
  }

  return {
   sc:{tasks:s.screen === 'tasks', today:s.screen === 'today', sales:s.screen === 'sales', inbox:s.screen === 'inbox', clients:s.screen === 'clients', orders:s.screen === 'orders', products:s.screen === 'products', mail:s.screen === 'mail', stats:s.screen === 'stats', import:s.screen === 'import', settings:s.screen === 'settings'},
   nav:nav, me:{name:me.name, role:ROLES[role], initials:initials(me.name), avStyle:avStyle(me.name, 30)},
   searchRef:this._searchRef, drawerRef:this._drawerRef, undo:!!s.undo, doUndo:function () { if (!s.undo) return; self.setState(Object.assign({}, s.undo, {undo:null})); self.flash('Отменено.'); },
   onKey:function (e) {
    var k = e.key || '';
    if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'K' || k === 'л' || k === 'Л')) { e.preventDefault(); if (self._searchEl) self._searchEl.focus(); return; }
    if (k === 'Escape') { if (s.gq) self.setState({gq:''}); else if (s.notifOpen || s.userOpen || s.colsOpen) self.setState({notifOpen:false, userOpen:false, colsOpen:false}); else if (s.drawer) self.setState({drawer:null}); }
   },
   userOpen:s.userOpen, toggleUser:function () { self.setState({userOpen:!s.userOpen, notifOpen:false}); },
   notifOpen:s.notifOpen, toggleNotif:function () { self.setState({notifOpen:!s.notifOpen, userOpen:false}); },
   unread:unread, hasUnread:unread > 0, notifs:notifList, notifEmpty:!notifList.length, readAll:function () { var r = Object.assign({}, s.read); notifs.forEach(function (n) { r[n.id] = true; }); self.setState({read:r}); },
   roleOpts:['owner','admin','marketing','manager'].map(function (r) { var on = r === role; return {label:ROLES[r] + ' — ' + byId(MEMBERS0, r === 'owner' ? 'anna' : r === 'admin' ? 'gulnara' : r === 'marketing' ? 'veronika' : 'tamuna').name, pick:function () { self.setState({role:r, userOpen:false, screen: CAN[s.screen] && CAN[s.screen].indexOf(r) < 0 ? 'today' : (s.screen === 'stats' && CAN.stats.indexOf(r) < 0 ? 'today' : s.screen), drawer:null}); self.flash('Вид: ' + ROLES[r] + '.'); }, style:'font:inherit;font-size:14px;text-align:left;width:100%;border:0;background:' + (on ? '#F2F6FD' : '#FFFFFF') + ';padding:9px 12px;border-radius:6px;cursor:pointer;color:#171A21;font-weight:' + (on ? 600 : 400)}; }),
   logout:function () { self.flash('Выход. При следующем входе — пароль и код из приложения-аутентификатора.'); },
   gq:s.gq, onGq:function (e) { self.setState({gq:e.target.value, notifOpen:false, userOpen:false}); }, gOpen:gq.length >= 2, gres:gres, gEmpty:gq.length >= 2 && !gres.length, gClear:function () { self.setState({gq:''}); },
   newOrder:function () { self.openNew({}); }, canOrders:this.can('orders'),
   T:T, PL:{chips:sChips, cols:planCols, note:'Карточки появляются сами по правилам: неоплаченный счёт, доступ до 31.10, не продлила за 3 месяца, покупала разборы без клуба. Вручную — из списка клиенток.'},
   IN:IN, CL:CL, OR:OR, PR:PR, MA:MA, SS:SS, SE:SE, IM:IM,
   DR:DR, DC:DC || {}, DO:DO || {}, DN:DN || {}, DP:DP || {}, DM:DM || {}, SB:SB, DS:DS, DT:DT, TK:TK,
   toast:s.toast, hasToast:!!s.toast
  };
 }
}
