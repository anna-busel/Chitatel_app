var TODAY = '2026-10-18';
function mk(y, m) { return y * 12 + m - 1; }
var CUR = mk(2026, 10);
var MON = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
var MONF = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
var MONG = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function mLabel(k) { return MON[k % 12] + ' ' + String(Math.floor(k / 12)).slice(2); }
function mFull(k) { return MONF[k % 12] + ' ' + Math.floor(k / 12); }
function mOf(iso) { return mk(+iso.slice(0, 4), +iso.slice(5, 7)); }
function lastDay(k) { var y = Math.floor(k / 12), m = k % 12 + 1; var d = new Date(Date.UTC(y, m, 0)).getUTCDate(); return d + '.' + (m < 10 ? '0' : '') + m + '.' + y; }
function addDays(iso, n) { return new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
function fmtD(iso) {
 if (!iso) return '—';
 var d = iso.slice(0, 10), t = iso.length > 10 ? ' ' + iso.slice(11, 16) : '';
 if (d === TODAY) return 'сегодня' + t;
 if (d === addDays(TODAY, -1)) return 'вчера' + t;
 if (d === addDays(TODAY, 1)) return 'завтра';
 var y = +d.slice(0, 4), m = +d.slice(5, 7), dd = +d.slice(8, 10);
 return dd + ' ' + MONG[m - 1].slice(0, 3) + (y !== 2026 ? ' ' + y : '');
}
function num(n) { return (Math.round(n * 100) / 100).toLocaleString('ru-RU', {maximumFractionDigits: 2}); }
function money(n, cur) { return num(n) + ' ' + (cur || 'BYN'); }
function moneyR(n) { return Math.round(n).toLocaleString('ru-RU') + ' BYN'; }
function byId(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; } return null; }
function plural(n, one, few, many) { var a = n % 10, b = n % 100; if (a === 1 && b !== 11) return one; if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few; return many; }
var TONES = {ok:['#DFF0E5','#1D5A35'], wait:['#FDF0D8','#7A4A0B'], warn:['#FBE1DA','#8A2E1C'], mute:['#EEF0F4','#3A4050'], ask:['#E2EAFB','#1F3F86']};
function pill(t) { var x = TONES[t] || TONES.mute; return 'display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;background:' + x[0] + ';color:' + x[1]; }
var AVC = [['#E2EAFB','#1F3F86'],['#DFF0E5','#1D5A35'],['#FDF0D8','#7A4A0B'],['#FBE1DA','#8A2E1C'],['#EDE4F8','#4B2A7B'],['#DDF1F3','#155563'],['#F6E1EC','#7A2453'],['#E9EDD8','#47531A']];
function avStyle(n, size) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 9973; var c = AVC[h % AVC.length]; return 'background:' + c[0] + ';color:' + c[1] + (size ? ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.36) + 'px' : ''); }
function initials(n) { var p = n.split(' '); return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase(); }

function P(o) { return Object.assign({cat:'club', price:null, cur:'BYN', term:'—', grant:'none', months:[], book:'', books:[], pack:'', deposit:0, asc:'', gp:'', slug:'', active:true, ask:'', letter:'', tgLink:'', desc:'', termMode:'forever', termN:'3', termDate:'2026-12-31', accessOnFirst:false, matForever:false, chatForever:false, tier2:false}, o); }
var WINTER = [mk(2026,12), mk(2027,1), mk(2027,2)], AUTUMN = [mk(2026,9), mk(2026,10), mk(2026,11)];
var PRODUCTS0 = [
 P({id:'p1', name:'Клуб · Тариф 1 «В окружении своих» · 1 месяц', price:100, term:'31 день', grant:'month', desc:'Книга месяца в приложении ЧИТАТЕЛЬ\nРазбор и материалы клуба\nЗакрытый чат участниц на время клуба', asc:'club.basic.monthly', gp:'club.basic.monthly', slug:'club-month', tgLink:'t.me/+chitatel_club_october', letter:'Добро пожаловать в клуб! Войдите в приложение ЧИТАТЕЛЬ под этой почтой — книга месяца уже ждёт.'}),
 P({id:'p2', name:'Клуб · Тариф 2 «Терапевтическая глубина» · 1 месяц', price:200, term:'31 день', grant:'month', tier2:true, slug:'club-month-deep', desc:'Всё из Тарифа 1\nЗум-встречи с Анной (ссылка в Telegram)'}),
 P({id:'p3', name:'Зимний сезон 2026 · Тариф 1', price:220, term:'дек–фев', grant:'months', months:WINTER, desc:'3 месяца клуба: декабрь, январь, февраль\nКнига каждого месяца и разборы в приложении\nЧаты месяцев и бонусы сезона', asc:'club.basic.season', gp:'club.basic.season', slug:'winter-2026', tgLink:'t.me/+chitatel_winter_2026', letter:'Спасибо! Зимний сезон откроется в приложении 1 декабря.'}),
 P({id:'p4', name:'Зимний сезон 2026 · Тариф 2 с зум-встречами', price:360, term:'дек–фев', grant:'months', months:WINTER, tier2:true, slug:'winter-2026-zoom', desc:'Всё из Тарифа 1 на 3 месяца\nЗум-встречи с Анной каждый месяц (ссылка в Telegram)'}),
 P({id:'p5', name:'Клуб · Тариф 3.1 · 12 месяцев', price:2200, term:'12 месяцев', grant:'year', matForever:true, slug:'club-year', desc:'12 месяцев клуба\nМатериалы оплаченных месяцев остаются навсегда\nЧат каждого месяца — на время клуба'}),
 P({id:'p20', name:'Доплата до Тарифа 2 · зум-встречи этого месяца', price:100, term:'текущий месяц', grant:'tier2', slug:'upgrade-tier2', desc:'Для участниц Тарифа 1\nЗум-встречи с Анной в этом месяце (ссылка в Telegram)'}),
 P({id:'p6', name:'Подарок · Клуб Тариф 1 · 1 месяц', price:100, term:'31 день', grant:'month', slug:'gift-month'}),
 P({id:'p7', cat:'content', name:'Факультатив «Зарубежная классика»', price:140, term:'навсегда', grant:'pack', pack:'Факультатив «Зарубежная классика»', asc:'package.facultativ_foreign', gp:'package.facultativ_foreign', slug:'facultativ-foreign', tgLink:'t.me/+facultativ_foreign', letter:'Спасибо! Факультатив открыт в приложении ЧИТАТЕЛЬ и в Telegram-канале по ссылке ниже.'}),
 P({id:'p8', cat:'content', name:'Факультатив «Атлант расправил плечи»', price:null, term:'с 28.11', grant:'book', book:'Атлант расправил плечи', slug:'atlant', ask:'Цена и продукты в App Store и Google Play — завести'}),
 P({id:'p9', cat:'content', name:'Разбор «Тело помнит всё»', price:120, term:'навсегда', grant:'book', book:'Тело помнит всё', asc:'book.telo_pomnit_vse', gp:'book.telo_pomnit_vse', slug:'telo-pomnit', tgLink:'t.me/+razbor_telo_pomnit'}),
 P({id:'p15', cat:'content', name:'Разбор «Игрок»', price:90, term:'навсегда', grant:'book', book:'Игрок', asc:'book.igrok', gp:'book.igrok', slug:'igrok'}),
 P({id:'p16', cat:'content', name:'Разбор «Бегство от свободы»', price:120, term:'навсегда', grant:'book', book:'Бегство от свободы', asc:'book.begstvo', gp:'book.begstvo', slug:'begstvo'}),
 P({id:'p10', name:'Доплата за доступ к каналу месяца навсегда', price:80, term:'навсегда', grant:'ask', slug:'archive-forever', active:false}),
 P({id:'p21', cat:'card', name:'Пополнение баланса', price:null, term:'—', grant:'deposit', deposit:0, slug:'balance', desc:'Пополните внутренний счёт любой суммой\nОплачивайте с него разборы, клуб и другие продукты'}),
 P({id:'p11', cat:'card', name:'Клубная карта · 200 BYN → 280 BYN на баланс (акция)', price:200, term:'до 31.12.2026', grant:'deposit', deposit:280, slug:'club-card'}),
 P({id:'p12', cat:'other', name:'Практикум «Эксперт. 60 дней» · Тариф 1', price:700, term:'60 дней', grant:'none', slug:'expert-60'}),
 P({id:'p13', cat:'other', name:'Консультация с Анной', price:null, term:'—', grant:'none', slug:'consult'}),
 P({id:'p17', cat:'other', name:'Книжный клуб офлайн · Тбилиси · встреча', price:60, cur:'GEL', term:'1 встреча', grant:'none', slug:'offline-tbilisi'}),
 P({id:'p18', cat:'other', name:'Менторство с Анной', price:null, term:'по договорённости', grant:'none', accessOnFirst:true, tgLink:'t.me/+mentoring_anna', slug:'mentoring', desc:'Индивидуальная программа\nМатериалы в закрытом Telegram-канале\nМожно в рассрочку: доступ после первого платежа'}),
 P({id:'p19', cat:'other', name:'Маркетинговая программа для экспертов', price:null, term:'по программе', grant:'none', accessOnFirst:true, tgLink:'t.me/+experts_program', slug:'experts'}),
 P({id:'p14', name:'Осенний сезон 2026 · Тариф 1', price:220, term:'сен–ноя', grant:'months', months:AUTUMN, asc:'club.basic.season', slug:'autumn-2026', active:false})
];
PRODUCTS0.forEach(function (p) { if (p.book && !p.books.length) p.books = [p.book]; });
var APP_BOOKS = ['Тело помнит всё', 'Игрок', 'Бегство от свободы', 'Атлант расправил плечи', 'Анна Каренина', 'Мастер и Маргарита', 'Идиот'];
var CLUB_MONTHS = [{m:mk(2026,8), book:'Анна Каренина'}, {m:mk(2026,9), book:'Мастер и Маргарита'}, {m:mk(2026,10), book:'Идиот'}];
var ACCOUNTS = ['Карта Анны · BYN', 'Грузинская карта · USD'];
function termText(p) { if (p.grant === 'month' || p.grant === 'months' || p.grant === 'year' || p.grant === 'tier2') return p.term; if (p.termMode === 'months') return p.termN + ' мес. с оплаты'; if (p.termMode === 'date') return 'до ' + fmtD(p.termDate); return p.grant === 'none' && p.term && p.term !== 'навсегда' ? p.term : 'навсегда'; }
function grantText(p) {
 if (p.grant === 'month') return 'Клуб: месяц оплаты';
 if (p.grant === 'months') return 'Клуб: ' + p.months.map(mLabel).join(', ');
 if (p.grant === 'year') return 'Клуб: 12 месяцев с месяца оплаты';
 if (p.grant === 'book') return (p.books.length > 1 ? 'Разборы: ' : 'Разбор ') + p.books.map(function (b) { return '«' + b + '»'; }).join(', ');
 if (p.grant === 'tier2') return 'Тариф 2: зум в месяце оплаты (вне приложения)';
 if (p.grant === 'pack') return 'Пакет: ' + p.pack;
 if (p.grant === 'deposit') return p.deposit ? 'Пополнение баланса на ' + p.deposit + ' BYN' : 'Пополнение баланса на сумму оплаты';
 if (p.grant === 'ask') return 'Нужно уточнить';
 return 'Не связан с приложением';
}
function shortGrant(p, o) {
 if (p.grant === 'month') return 'клуб, ' + MONF[mOf(payDate(o)) % 12];
 if (p.grant === 'months') return 'клуб ' + mLabel(p.months[0]) + '–' + mLabel(p.months[p.months.length - 1]);
 if (p.grant === 'year') return 'клуб на 12 месяцев';
 if (p.grant === 'book') return p.books.length > 1 ? 'разборы' : 'разбор';
 if (p.grant === 'tier2') return 'зум этого месяца';
 if (p.grant === 'pack') return 'пакет';
 if (p.grant === 'deposit') return 'депозит';
 return '';
}

function C(o) { return Object.assign({gk:'', app:'', linked:false, phone:'', tg:'', wa:false, bot:false, since:'', tags:[], legacy:[], legacyNote:'', seen:'', cardOps:[], comments:[], hist:[], codeSent:false, merged:false}, o); }
function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
var CLIENTS0 = [
 C({id:'c1', name:'Анастасия Ковалёва', city:'Франция, Париж', gk:'a.kovaleva@mail.ru', app:'nastya.kov@icloud.com', linked:true, phone:'+33 6 12 40 77 48', tg:'@nastya_kov', wa:true, bot:true, since:'2024', tags:['Баланс'], seen:'сегодня',
  hist:[{dt:'2026-08-08 22:27', who:'Система', text:'Зарегистрировалась на вебинар 11.08 «Почему умные женщины часто живут не так, как хотят»'}, {dt:'2024-03-01 12:00', who:'Импорт', text:'Перенесена из ГетКурса'}],
  cardOps:[{dt:'2026-08-05', amt:280, text:'Пополнение · клубная карта (акция), заказ #8614'}, {dt:'2026-10-18', amt:-200, text:'Списание · Зимний сезон, заказ #8925'}],
  comments:[{who:'Тамуна', dt:'2026-08-05 09:00', text:'Клубная карта 280 BYN, оплата переводом, Анна подтвердила.'}]}),
 C({id:'c2', name:'Ирина Полякова', city:'Беларусь, Минск', gk:'irina.pol@gmail.com', phone:'+375 29 614 14 07', tg:'@irina_p', since:'2025'}),
 C({id:'c3', name:'Ольга Миронова', city:'Россия, Москва', app:'olga.mironova@gmail.com', linked:true, since:'2026', tags:['Из приложения'], seen:'вчера'}),
 C({id:'c4', name:'Наталья Шевцова', city:'Беларусь, Брест', gk:'n.shevtsova@yandex.ru', app:'n.shevtsova@yandex.ru', linked:true, phone:'+375 33 702 55 19', tg:'@nata_shev', since:'2023', tags:['Длительный абонемент'], seen:'3 дня назад',
  legacy:range(mk(2026,10), mk(2027,8)), legacyNote:'Тариф 3.1 · 12 мес — перенесено из таблицы абонементов',
  comments:[{who:'Гульнара', dt:'2026-09-12 18:20', text:'Абонемент на 12 мес из Excel. Оплачено по август 2027 включительно.'}]}),
 C({id:'c5', name:'Юлия Каган', city:'Израиль, Хайфа', gk:'yulia.kagan@gmail.com', phone:'+972 54 318 81 20', tg:'@yulia_kg', wa:true, bot:true, since:'2026', tags:['Иностранная карта'],
  comments:[{who:'Тамуна', dt:'2026-10-17 12:10', text:'Не проходит оплата с израильской карты. Предложила перевод, жду подтверждения от Анны.'}]}),
 C({id:'c6', name:'Дарья Лебедева', city:'Россия, Казань', gk:'daria.leb@mail.ru', app:'daria.leb@mail.ru', linked:true, phone:'+7 917 260 33 04', tg:'@dasha_leb', since:'2025', seen:'сегодня'}),
 C({id:'c7', name:'Мария Власова', city:'Грузия, Тбилиси', gk:'maria.vlasova@gmail.com', app:'maria.vlasova@gmail.com', linked:true, phone:'+995 599 41 27 80', tg:'@masha_vl', since:'2026', tags:['Розыгрыш'], seen:'вчера'}),
 C({id:'c8', name:'Елена Сорокина', city:'Беларусь, Гомель', gk:'elena.sor@mail.ru', phone:'+375 44 509 12 66', tg:'@lena_sorokina', since:'2026', tags:['Практикум']}),
 C({id:'c9', name:'Яна Руденко', city:'Канада, Торонто', gk:'yana.rud@gmail.com', phone:'+1 416 555 01 23', tg:'@yana_r', wa:true, since:'2026', tags:['Иностранная карта']}),
 C({id:'c10', name:'Лейла Гасанова', city:'Азербайджан, Баку', gk:'leyla.g@mail.ru', app:'leyla.g@mail.ru', linked:true, phone:'+994 50 211 74 09', tg:'@leyla_gs', since:'2024', tags:['Рассрочка'], seen:'неделю назад'}),
 C({id:'c11', name:'Екатерина Белова', city:'Россия, Санкт-Петербург', gk:'kate.belova@gmail.com', app:'kate.belova@gmail.com', linked:true, phone:'+7 921 455 80 12', tg:'@katebelova', since:'2025', seen:'сегодня'}),
 C({id:'c12', name:'Татьяна Орлова', city:'Беларусь, Минск', gk:'t.orlova@tut.by', app:'t.orlova@tut.by', linked:true, phone:'+375 29 118 46 70', tg:'@tanya_orl', since:'2023', tags:['Длительный абонемент'], seen:'вчера',
  legacy:range(mk(2025,11), mk(2026,10)), legacyNote:'Тариф 2 · 12 мес — перенесено из таблицы абонементов'}),
 C({id:'c13', name:'Наталья Шевцова', city:'Беларусь, Брест', gk:'natalia.shev@gmail.com', phone:'+375 33 702 55 19', since:'2026'})
];

function O(o) { return Object.assign({comments:[], price:0, cur:'BYN', disc:0, promo:'', payments:[], st:'', src:'Сайт', manager:'', tags:[], deadline:'', gift:null, note:'', reminded:false, refund:null, hist:[]}, o); }
function pay(amt, dt, method) { return {amt:amt, dt:dt, method:method}; }
var ORDERS0 = [
 O({id:8925, dt:'2026-10-18 11:09', c:'c1', p:'p3', price:220, payments:[pay(200,'2026-10-18 11:09','Баланс'), pay(20,'2026-10-18 11:15','bePaid')]}),
 O({id:8924, dt:'2026-10-18 10:12', c:'c2', p:'p3', price:220, payments:[pay(220,'2026-10-18 10:14','bePaid')]}),
 O({id:8923, dt:'2026-10-18 09:41', c:'c6', p:'p10', price:80, deadline:'2026-10-21'}),
 O({id:8922, dt:'2026-10-17 23:52', c:'c3', p:'p1', price:9.99, cur:'USD', src:'App Store', payments:[pay(9.99,'2026-10-17 23:52','App Store')]}),
 O({id:8921, dt:'2026-10-17 16:27', c:'c9', p:'p3', price:220, deadline:'2026-10-20', reminded:true}),
 O({id:8920, dt:'2026-10-17 15:50', c:'c11', p:'p1', price:100, payments:[pay(100,'2026-10-17 15:52','bePaid')]}),
 O({id:8919, dt:'2026-10-17 15:27', c:'c4', p:'p7', price:140, payments:[pay(140,'2026-10-17 15:31','bePaid')]}),
 O({id:8918, dt:'2026-10-17 10:13', c:'c10', p:'p5', price:2200, src:'Ручной заказ', manager:'Тамуна', deadline:'2026-11-17', note:'Рассрочка: 3 платежа до 17.11', tags:['Рассрочка'], payments:[pay(733,'2026-10-17 10:15','Перевод на карту')]}),
 O({id:8917, dt:'2026-10-17 10:11', c:'c8', p:'p12', price:21000, cur:'RUB', payments:[pay(21000,'2026-10-17 10:11','lava.top')]}),
 O({id:8916, dt:'2026-10-13 12:00', c:'c7', p:'p6', price:100, st:'free', src:'Ручной заказ', manager:'Тамуна', note:'выиграла в челлендже', tags:['Розыгрыш']}),
 O({id:8915, dt:'2026-10-12 18:30', c:'c5', p:'p3', price:220, deadline:'2026-10-15', reminded:true, src:'Ручной заказ', manager:'Тамуна', note:'израильская карта — форма не принимает', comments:[{who:'Тамуна', dt:'2026-10-18 12:06', text:'Юлия прислала скрин перевода на грузинскую карту, жду подтверждения Анны в чате.'}]}),
 O({id:8926, dt:'2026-10-10 12:00', c:'g2', p:'p18', price:2400, src:'Ручной заказ', manager:'Тамуна', deadline:'2026-12-10', note:'Рассрочка: 3 платежа по 800', tags:['Рассрочка'], payments:[{amt:800, dt:'2026-10-10 12:05', method:'Перевод на карту', acc:'Карта Анны · BYN', note:'Анна подтвердила в чате'}]}),
 O({id:8790, dt:'2026-09-02 14:20', c:'c1', p:'p9', price:120, payments:[pay(120,'2026-09-02 14:22','bePaid')]}),
 O({id:8702, dt:'2026-08-21 19:02', c:'c13', p:'p16', price:120, payments:[pay(120,'2026-08-21 19:03','bePaid')]}),
 O({id:8611, dt:'2026-08-25 10:40', c:'c1', p:'p14', price:220, payments:[pay(220,'2026-08-25 10:41','bePaid')]}),
 O({id:8614, dt:'2026-08-05 08:53', c:'c1', p:'p11', price:200, src:'Ручной заказ', manager:'Тамуна', payments:[pay(200,'2026-08-05 08:53','Перевод на карту')]}),
 O({id:8501, dt:'2026-10-02 09:30', c:'c6', p:'p1', price:100, payments:[pay(100,'2026-10-02 09:31','bePaid')]}),
 O({id:8433, dt:'2026-10-01 11:00', c:'c10', p:'p1', price:100, payments:[pay(100,'2026-10-01 11:01','bePaid')]}),
 O({id:8402, dt:'2026-07-14 20:10', c:'c6', p:'p15', price:90, payments:[pay(90,'2026-07-14 20:11','bePaid')]})
];

var FN = ['Алина','Виктория','Ксения','Полина','Ольга','Татьяна','Евгения','Надежда','Людмила','Вера','Оксана','Инна','Кристина','Анна','Елизавета','Софья','Галина','Марина','Ирина','Светлана'];
var LN = ['Иванова','Смирнова','Кузнецова','Попова','Васильева','Новикова','Морозова','Волкова','Зайцева','Павлова','Семёнова','Голубева','Виноградова','Козлова','Лебедева','Соколова','Михайлова','Фёдорова'];
var CITIES = ['Беларусь, Минск','Беларусь, Гродно','Беларусь, Витебск','Беларусь, Могилёв','Россия, Москва','Россия, Екатеринбург','Германия, Берлин','Литва, Вильнюс','Грузия, Тбилиси','Казахстан, Алматы','Польша, Варшава','Израиль, Тель-Авив'];
var TR = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
function tr(s) { return s.toLowerCase().split('').map(function (ch) { return TR[ch] !== undefined ? TR[ch] : ch; }).join(''); }
function rng(seed) { var s = seed; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
function rdate(r, a, b) { var t = Date.parse(a + 'T00:00:00Z'), u = Date.parse(b + 'T00:00:00Z'); return new Date(t + Math.floor(r() * ((u - t) / 86400000 + 1)) * 86400000).toISOString().slice(0, 10); }
function hhmm(r) { var h = 8 + Math.floor(r() * 14), m = Math.floor(r() * 60); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
function generate() {
 var r = rng(20261018), clients = [], orders = [], id = 8000;
 for (var i = 0; i < 38; i++) {
  var fn = FN[Math.floor(r() * FN.length)], ln = LN[Math.floor(r() * LN.length)], cid = 'g' + i, linked = r() < 0.62;
  var em = tr(fn).slice(0, 1) + '.' + tr(ln) + (i + 10) + '@' + ['mail.ru','gmail.com','yandex.ru','tut.by'][Math.floor(r() * 4)];
  var city = CITIES[Math.floor(r() * CITIES.length)];
  var phone = (city.indexOf('Беларусь') === 0 ? '+375 29 ' : city.indexOf('Россия') === 0 ? '+7 9' + Math.floor(10 + r() * 89) + ' ' : '+48 5') + (100 + Math.floor(r() * 899)) + ' ' + (10 + Math.floor(r() * 89)) + ' ' + (10 + Math.floor(r() * 89));
  clients.push(C({id:cid, name:fn + ' ' + ln, city:city, gk:em, app: linked ? em : '', linked:linked, phone:phone, tg: r() < 0.7 ? '@' + tr(fn) + '_' + tr(ln).slice(0, 4) : '', wa: r() < 0.5, bot: r() < 0.55, since: String(2023 + Math.floor(r() * 4)), seen: linked ? ['сегодня','вчера','3 дня назад','неделю назад'][Math.floor(r() * 4)] : ''}));
  var n = 1 + Math.floor(r() * 3);
  for (var j = 0; j < n; j++) {
   var x = r(), p, dt;
   if (x < 0.42) { p = 'p1'; dt = rdate(r, '2026-05-01', '2026-10-16'); }
   else if (x < 0.6) { p = 'p14'; dt = rdate(r, '2026-08-15', '2026-09-10'); }
   else if (x < 0.8) { p = ['p9','p15','p16'][Math.floor(r() * 3)]; dt = rdate(r, '2026-05-01', '2026-10-16'); }
   else if (x < 0.88) { p = 'p7'; dt = rdate(r, '2026-06-01', '2026-10-16'); }
   else { p = 'p3'; dt = rdate(r, '2026-10-01', '2026-10-16'); }
   var prod = byId(PRODUCTS0, p), y = r(), method = 'bePaid', cur = 'BYN', price = prod.price, src = 'Сайт', mgr = '';
   if (p === 'p1' && y < 0.18) { method = 'App Store'; cur = 'USD'; price = 9.99; src = 'App Store'; }
   else if (y < 0.32) { method = 'lava.top'; cur = 'RUB'; price = Math.round(prod.price / 0.036 / 100) * 100; }
   else if (y < 0.42) { method = 'Перевод на карту'; src = 'Ручной заказ'; mgr = 'Тамуна'; }
   var t = dt + ' ' + hhmm(r), dead = r() < 0.07;
   orders.push(O({id:id, dt:t, c:cid, p:p, price:price, cur:cur, src:src, manager:mgr, deadline:addDays(dt, 3), st: dead ? 'fake' : '', payments: dead ? [] : [pay(price, t, method)]}));
   id += 3 + Math.floor(r() * 9);
  }
 }
 return {clients:clients, orders:orders};
}
function seedHist(o) {
 var h = [{dt:o.dt, who: o.src === 'Сайт' ? 'Сайт' : (o.src === 'App Store' ? 'App Store' : (o.manager || 'Система')), text: o.src === 'Сайт' ? 'Заказ оформлен на странице оплаты' : (o.src === 'App Store' ? 'Покупка в приложении' : 'Заказ создан вручную')}];
 o.payments.forEach(function (p) { h.push({dt:p.dt, who: p.method === 'Перевод на карту' || p.method === 'Баланс' ? (o.manager || 'Тамуна') : p.method, text:(p.pending ? 'Перевод ' : 'Платёж ') + money(p.amt, p.method === 'Баланс' ? 'BYN' : o.cur) + ' · ' + p.method + (p.pending ? ' — ждёт подтверждения Анны' : '')}); });
 if (o.st === 'free') h.push({dt:o.dt, who:o.manager || 'Тамуна', text:'Выдано без оплаты: ' + o.note});
 if (o.st === 'fake') h.push({dt:addDays(o.dt, 4) + ' 09:00', who:'Тамуна', text:'Помечен как ложный: не оплачен в срок'});
 if (o.reminded) h.push({dt:addDays(o.dt, 1) + ' 10:00', who:'Система', text:'Отправлено напоминание об оплате'});
 return h;
}

var THREADS0 = [
 {id:'t1', c:'c5', channel:'Telegram-бот', dt:'2026-10-18 08:15', answered:false, assign:'Тамуна', msgs:[{me:false, who:'Юлия Каган', dt:'2026-10-18 08:15', text:'Здравствуйте! Оплата снова не прошла, карта израильская. Можно как-то по-другому?'}]},
 {id:'t2', c:'c2', channel:'Форма на сайте', dt:'2026-10-18 10:20', answered:false, assign:'Тамуна', hint:'irina.minsk@gmail.com', msgs:[{me:false, who:'Ирина Полякова', dt:'2026-10-18 10:20', text:'Оплатила зимний сезон, а в приложении клуб просит оплату. В приложении у меня почта irina.minsk@gmail.com'}]},
 {id:'t3', c:'c1', channel:'Почта', dt:'2026-10-18 11:30', answered:false, assign:'', msgs:[{me:false, who:'Анастасия Ковалёва', dt:'2026-10-18 11:30', text:'Сколько у меня осталось на клубной карте после оплаты сезона?'}]},
 {id:'t4', c:'c8', channel:'Почта', dt:'2026-10-18 09:02', answered:true, assign:'Тамуна', msgs:[{me:false, who:'Елена Сорокина', dt:'2026-10-18 09:02', text:'Здравствуйте, не нашла письмо со ссылкой на практикум.'}, {me:true, who:'Тамуна', dt:'2026-10-18 09:10', text:'Елена, добрый день! Отправила ещё раз. Проверьте, пожалуйста, папку «Промоакции».'}]},
 {id:'t6', c:'g7', channel:'Форма на сайте', dt:'2026-10-18 07:02', answered:false, assign:'', cat:'spam', msgs:[{me:false, who:'g7', dt:'2026-10-18 07:02', text:'Продвижение вашего канала, 10 000 подписчиков за неделю. Пишите в личку.'}]},
 {id:'t5', c:'c4', channel:'Telegram-бот', dt:'2026-10-17 18:40', answered:true, assign:'Гульнара', msgs:[{me:false, who:'Наталья Шевцова', dt:'2026-10-17 18:40', text:'Подскажите, до какого месяца у меня оплачен клуб?'}, {me:true, who:'Гульнара', dt:'2026-10-17 19:05', text:'Наталья, у вас оплачено по август 2027 включительно.'}]}
];
var TGREQ0 = [
 {id:'r1', nick:'@olga_reads', channel:'Канал месяца · октябрь, «Идиот»', dt:'2026-10-18 09:12', c:'', why:'Оплата по нику не найдена'},
 {id:'r2', nick:'@irina_p', channel:'Канал месяца · октябрь, «Идиот»', dt:'2026-10-18 10:30', c:'c2', why:'Оплачен зимний сезон — доступ с декабря, октябрь не оплачен'},
 {id:'r3', nick:'@yana_r', channel:'Канал разбора «Тело помнит всё»', dt:'2026-10-17 17:02', c:'c9', why:'Счёт #8921 ещё не оплачен'}
];
var PROMOS0 = [
 {code:'AUTUMN30', type:'%', val:30, scope:'content', used:42, limit:100, until:'2026-10-31', on:true},
 {code:'WELCOME10', type:'%', val:10, scope:'club', used:7, limit:0, until:'2026-12-31', on:true},
 {code:'VEBINAR20', type:'BYN', val:20, scope:'all', used:60, limit:60, until:'2026-08-31', on:false}
];
var SCOPE = {all:'Все продукты', club:'Клуб', content:'Разборы и пакеты'};
var AUTOS0 = [
 {id:'a1', name:'Письмо после оплаты', trigger:'Сразу после оплаты — текст из карточки продукта', ch:'Email', on:true, sent:184},
 {id:'a2', name:'Код активации приложения', trigger:'После оплаты, если аккаунт в приложении не связан', ch:'Email', on:true, sent:27},
 {id:'a3', name:'Неоплаченный счёт', trigger:'Через 24 часа и в день крайнего срока', ch:'Email + Telegram-бот', on:true, sent:41},
 {id:'a4', name:'Доступ заканчивается', trigger:'За 7 дней до конца последнего оплаченного месяца', ch:'Email + Telegram-бот', on:true, sent:96},
 {id:'a5', name:'Возвращение', trigger:'Через 30 дней после окончания доступа', ch:'Email', on:false, sent:0}
];
var CAMPS0 = [
 {id:'m1', name:'Зимний сезон — старт продаж', seg:'В клубе сейчас', ch:'Email + Telegram-бот', status:'Отправлена', dt:'2026-10-01 10:00', sent:1240, open:'48%'},
 {id:'m2', name:'Акция на разборы −30%', seg:'Покупали разборы, не в клубе', ch:'Email', status:'Запланирована', dt:'2026-10-25 10:00', sent:0, open:'—'},
 {id:'m3', name:'Вебинар «Почему умные женщины…»', seg:'Вся база', ch:'Telegram-бот', status:'Отправлена', dt:'2026-08-08 12:00', sent:3105, open:'—'}
];
var MEMBERS0 = [
 {id:'anna', name:'Анна Бусел', role:'owner', tfa:true, last:'сегодня 10:02'},
 {id:'gulnara', name:'Гульнара Бухтина', role:'admin', tfa:true, last:'вчера 23:41'},
 {id:'veronika', name:'Вероника Логиновских', role:'marketing', tfa:false, last:'вчера 13:01'},
 {id:'tamuna', name:'Тамуна', role:'manager', tfa:true, last:'сейчас'}
];
var ROLES = {owner:'Владелец', admin:'Администратор', marketing:'Маркетинг', manager:'Менеджер'};
var CAN = {
 orders:['owner','admin','manager'], refund:['owner','admin'], products:['owner','admin','marketing'], promo:['owner','admin','marketing'],
 confirm:['owner'], mail:['owner','admin','marketing'], stats:['owner','admin','marketing'], import:['owner','admin'], settings:['owner','admin'], team:['owner'],
 sales:['owner','admin','manager'], inbox:['owner','admin','manager']
};
var PERMS = [
 ['Клиентки и заказы: смотреть', 'orders_view'], ['Создавать заказы, проводить оплату, выдавать без оплаты', 'orders'], ['Подтверждать переводы на карту', 'confirm'], ['Возвраты и перезачёт', 'refund'],
 ['Продукты и цены', 'products'], ['Промокоды и страницы оплаты', 'promo'], ['Рассылки', 'mail'], ['Статистика и выручка', 'stats'],
 ['Импорт из ГетКурса', 'import'], ['Интеграции, курсы валют, журнал', 'settings'], ['Команда и доступы', 'team']
];
var INTEGRATIONS = [
 {name:'bePaid', what:'Карты Беларуси и России на страницах оплаты', st:'Подключено', tone:'ok'},
 {name:'lava.top', what:'Оплата в рублях', st:'Подключено', tone:'ok'},
 {name:'[ПРОВАЙДЕР ДЛЯ ИНОСТРАННЫХ КАРТ]', what:'США, Канада, Европа, Израиль', st:'Не выбран', tone:'warn'},
 {name:'App Store', what:'Покупки в приложении на iPhone, уведомления о продлениях и возвратах', st:'Подключено', tone:'ok'},
 {name:'Google Play', what:'Покупки в приложении на Android', st:'В работе', tone:'wait'},
 {name:'Приложение ЧИТАТЕЛЬ', what:'Доступы к клубу, разборам и пакетам, коды активации', st:'Подключено', tone:'ok'},
 {name:'Telegram-бот клуба', what:'Входящие, рассылки, автопринятие заявок в каналы', st:'Подключено', tone:'ok'},
 {name:'Почта club@annabusel.org', what:'Письма после оплаты, напоминания и рассылки с домена Анны. Нужен доступ к DNS домена', st:'Настроить', tone:'wait'},
 {name:'Тильда', what:'Кнопки «Купить» ведут на страницы оплаты CRM', st:'Нужно заменить ссылки', tone:'wait'}
];
var METHODS = ['bePaid', 'lava.top', 'Перевод на карту', 'Баланс'];

function total(o) { return o.st === 'free' ? 0 : Math.max(0, o.price - (o.disc || 0)); }
function paidAmt(o) { return o.payments.reduce(function (t, p) { return t + (p.pending || (p.method === 'Баланс' && o.cur !== 'BYN') ? 0 : p.amt); }, 0); }
function pendAmt(o) { return o.payments.reduce(function (t, p) { return t + (p.pending ? p.amt : 0); }, 0); }
function payDate(o) { var c = o.payments.filter(function (p) { return !p.pending; }); return c.length ? c[c.length - 1].dt : o.dt; }
function status(o) {
 if (o.st === 'fake') return 'fake';
 if (o.st === 'refund') return 'refund';
 if (o.st === 'free') return 'free';
 var t = total(o), pd = paidAmt(o);
 if (t > 0 && pd >= t - 0.001) return 'paid';
 if (pendAmt(o) > 0 && pd + pendAmt(o) >= t - 0.001) return 'confirm';
 if (pd > 0) return 'partial';
 if (o.deadline && o.deadline < TODAY) return 'overdue';
 return 'new';
}
var ST = {confirm:['Ждёт подтверждения','ask'], new:['Не оплачен','wait'], overdue:['Просрочен','warn'], partial:['Частично','ask'], paid:['Оплачен','ok'], free:['Выдан · 0','mute'], fake:['Ложный','mute'], refund:['Возврат','warn']};
var ST_RANK = {overdue:0, new:1, confirm:2, partial:2, paid:3, free:4, refund:5, fake:6};
function isActive(o) { var s = status(o); return s === 'paid' || s === 'free'; }
function grants(o, p) { var s = status(o); return s === 'paid' || s === 'free' || (s === 'partial' && !!p.accessOnFirst); }
function monthsOf(o, p) {
 if (p.grant === 'month') return [mOf(payDate(o))];
 if (p.grant === 'months') return p.months.slice();
 if (p.grant === 'year') { var a = mOf(payDate(o)); return range(a, a + 11); }
 return [];
}
function srcLabel(o) {
 if (o.src === 'App Store' || o.src === 'Google Play') return o.src;
 var m = [];
 o.payments.forEach(function (p) { if (m.indexOf(p.method) < 0) m.push(p.method); });
 if (o.st === 'free') return 'Без оплаты';
 return m.length ? m.join(' + ') : o.src;
}
function promoCheck(promo, p) {
 if (!promo) return {ok:false, why:'Промокод не найден'};
 if (!promo.on) return {ok:false, why:'Промокод выключен'};
 if (promo.until < TODAY) return {ok:false, why:'Срок промокода истёк'};
 if (promo.limit && promo.used >= promo.limit) return {ok:false, why:'Лимит использований исчерпан'};
 if (promo.scope !== 'all' && promo.scope !== p.cat) return {ok:false, why:'Не действует на этот продукт'};
 return {ok:true, why:''};
}
function promoDisc(promo, price) { return promo.type === '%' ? Math.round(price * promo.val) / 100 : Math.min(price, promo.val); }

var TZ = [['Франция',2],['Германия',2],['Польша',2],['Литва',3],['Беларусь',3],['Израиль',3],['Россия, Екатеринбург',5],['Россия',3],['Грузия',4],['Азербайджан',4],['Казахстан',5],['Канада',-4]];
function localTime(city) {
 var off = 3; for (var i = 0; i < TZ.length; i++) { if (city.indexOf(TZ[i][0]) === 0) { off = TZ[i][1]; break; } }
 var m = ((9 * 60 + 20 + off * 60) % 1440 + 1440) % 1440, h = Math.floor(m / 60), mm = m % 60;
 return {text:(h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm, night: h >= 22 || h < 8};
}
var NOW = TODAY + ' 13:00';
var TTYPES = {call:'Звонок', msg:'Сообщение', offer:'Предложение', meet:'Встреча'};
var PRI = {high:['Высокий','warn'], mid:['Средний','wait'], low:['Низкий','mute']};
var TASKS0 = [
 {id:'k1', type:'call', c:'c9', title:'Позвонить: не оплачен Зимний сезон (#8921)', due:'2026-10-17 18:00', pri:'high', who:'Тамуна', done:false, auto:'Счёт не оплачен 24 часа'},
 {id:'k2', type:'msg', c:'c5', title:'Отправить реквизиты грузинской карты для перевода', due:'2026-10-18 10:00', pri:'high', who:'Тамуна', done:false, auto:''},
 {id:'k3', type:'msg', c:'c1', title:'Ответить про остаток на балансе', due:'2026-10-18 13:30', pri:'mid', who:'Тамуна', done:false, auto:'Новое обращение'},
 {id:'k4', type:'offer', c:'c12', title:'Предложить Зимний сезон Тариф 2 — абонемент до 31.10', due:'2026-10-18 15:00', pri:'mid', who:'Тамуна', done:false, auto:'Абонемент заканчивается'},
 {id:'k5', type:'call', c:'c6', title:'Узнать, будет ли продлевать на ноябрь', due:'2026-10-19 11:00', pri:'low', who:'Тамуна', done:false, auto:''},
 {id:'k6', type:'meet', c:'c10', title:'Созвон по рассрочке: второй платёж', due:'2026-10-20 12:00', pri:'mid', who:'Тамуна', done:false, auto:''},
 {id:'k7', type:'offer', c:'c4', title:'Предложить факультатив «Атлант расправил плечи»', due:'2026-10-25 12:00', pri:'low', who:'Гульнара', done:false, auto:''},
 {id:'k8', type:'call', c:'c11', title:'Напомнить про Зимний сезон', due:'2026-10-16 12:00', pri:'mid', who:'Тамуна', done:true, auto:''}
];
var RULES0 = [
 {id:'r1', name:'Новое обращение → назначить ответственного', how:'По очереди между менеджерами, или всегда Тамуне', on:true, n:23},
 {id:'r2', name:'Новое обращение → задача «ответить» на 2 часа', how:'Задача ответственному, уведомление при просрочке', on:true, n:23},
 {id:'r3', name:'Счёт не оплачен 24 часа → задача «позвонить»', how:'Плюс автоматическое письмо-напоминание клиентке', on:true, n:9},
 {id:'r4', name:'Новый счёт по ссылке → задача «проверить оплату» к сроку', how:'Задача менеджеру, создавшему счёт', on:true, n:14},
 {id:'r5', name:'Карточка в плане продаж без движения 5 дней → уведомление', how:'Ответственному и Гульнаре', on:true, n:4},
 {id:'r6', name:'Оплата → карточка плана в «Оплатила», открытые задачи по счёту закрываются', how:'Автоматически', on:true, n:31},
 {id:'r7', name:'Абонемент заканчивается через 7 дней → задача «предложить продление»', how:'Для доступа от 3 месяцев; помесячным — только письмо', on:true, n:6},
 {id:'r8', name:'Отказ → вернуть в план продаж через 30 дней', how:'С пометкой причины прошлого отказа', on:false, n:0}
];
var LOSS = ['Дорого', 'Нет времени', 'Не интересна книга месяца', 'Не отвечает', 'Купила в приложении', 'Другое'];
