const crypto = require('crypto');
const OAK = 'a78b923440df20ce';
const SALT = 'a31cfccd172003e00f5ac59c95387a3b';
const LONG = 'STORENEWMIICeAIBADANBgkqhkiG9w0BAQEFAASCAmIwggJeAgEAAoGBANYFY/UJGSzhIhpx6YM5KJ9yRHc7YeURxzb9tDvJvMfENHlnP3DtVkOIjERbpsSd76fjtZnMWY60TpGLGyrNkvuV40L15JQhHAo9yURpPQoI0eg3SLFmTEI/MUiPRCwfwYf2deqKKlsmMSysYYHX9JiGzQuWiYZaawxprSuiqDGvAgMBAAECgYEAtQ0QV00gGABISljNMy5aeDBBTSBWG2OjxJhxLRbndZM81OsMFysgC7dq+bUS6ke1YrDWgsoFhRxxTtx/2gDYciGp/c/h0Td5pGw7T9W6zo2xWI5oh1WyTnn0Xj17O9CmOk4fFDpJ6bapL+fyDy7gkEUChJ9+p66WSAlsfUhJ2TECQQD5sFWMGE2IiEuz4fIPaDrNSTHeFQQr/ZpZ7VzB2tcG7GyZRx5YORbZmX1jR7l3H4F98MgqCGs88w6FKnCpxDK3AkEA225CphAcfyiH0ShlZxEXBgIYt3V8nQuc/g2KJtiV6eeFkxmOMHbVTPGkARvt5VoPYEjwPTg43oqTDJVtlWagyQJBAOvEeJLno9aHNExvznyD4/pR4hec6qqLNgMyIYMfHCl6d3UodVvC1HO1/nMPl+4GvuRnxuoBtxj/PTe7AlUbYPMCQQDOkf4sVv58tqslO+I6JNyHy3F5RCELtuMUR6rG5x46FLqqwGQbO8ORq+m5IZHTV/Uhr4h6GXNwDQRh1EpVW0gBAkAp/v3tPI1riz6UuG0I6uf5er26yl5evPyPrjrD299L4Qy/1EIunayC7JYcSGlR01+EDYYgwUkec+QgrRC/NstV';
const UA_TEXT = 'OPPO/PGFM10/33/android/V13.1.0/6100206/1001/0';
const javaEncode = v => [...String(v)].map(ch => /[A-Za-z0-9.*_-]/.test(ch) ? ch : ch === ' ' ? '+' : '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join('');
function headers(url, t = Date.now()) {
  const ua = javaEncode(UA_TEXT), ocs = javaEncode(UA_TEXT + '/ColorOS/0'), id = '11#';
  const u = new URL(url), path = u.pathname, query = decodeURIComponent(u.search.slice(1));
  const base = OAK + SALT + ocs + String(t) + id + path + query;
  const material = base + String(base.length) + LONG;
  return {'Content-Type':'application/json; charset=UTF-8','Accept':'application/json','User-Agent':ua,
    t:String(t),id,ocs,oak:OAK,pid:'1001',sdkversion:'6100206','sign':crypto.createHash('md5').update(material).digest('hex')};
}
(async () => {
  const u1 = 'https://isdk.heytapmobi.com/gamesdk/v2/user/login?adId=&pkgName=com.sgs10th.nearme.gamecenter&token=TEST_TOKEN';
  const r1 = await fetch(u1, {headers: headers(u1)});
  console.log('USER_LOGIN', r1.status, (await r1.text()).slice(0, 500));
  const u2 = 'https://10th-sdk-login.sanguosha.com/oppo/app/login?ticket=TEST_TICKET&is_adult=1';
  const r2 = await fetch(u2, {headers: {'User-Agent':'Mozilla/5.0'}});
  console.log('SGS_GRANT', r2.status, (await r2.text()).slice(0, 500));
  const body = {appid:'485',channel:'',package_id:'78',platform_id:'10030',platform_name:'oppo',
    base:{group_id:'205',device_id:'TESTDEVICE',version_code:'344',version_name:'1.0.344',device_mobile:'',device_network:'',device_os:'android',device_os_version:'',device_pixel:'',device_type:'1',device_version_code:''},
    ext:JSON.stringify({session_type:'st_dummy'}),
    data:{thirdparty:'oppo',pid:'10030',gid:'485',uid:'TEST_UID',username:'',session:'TEST_TOKEN',thirdAdult:'0',thirdRealNameStatus:'0',thirdAge:'0'}};
  const r3 = await fetch('https://anysdk.dobest.cn/v1/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  console.log('ANYS_OPPO', r3.status, (await r3.text()).slice(0, 500));
})().catch(e => { console.error(e.stack); process.exit(1); });
