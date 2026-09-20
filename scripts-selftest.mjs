import assert from 'node:assert/strict';
import { getSettings, login, saveSettings } from './lib/handlers.mjs';
import { parsePancakeSalesSummary } from './lib/core.mjs';

const original = {
  key: process.env.PANCAKE_POS_API_KEY_1,
  shops: process.env.PANCAKE_SHOP_IDS_1,
  label: process.env.PANCAKE_LABEL_1,
  user: process.env.APP_USER,
  password: process.env.APP_PASSWORD,
  secret: process.env.APP_SECRET
};
process.env.APP_USER = 'Owner';
process.env.APP_PASSWORD = 'selftest-password';
process.env.APP_SECRET = 'selftest-secret-that-is-long-enough-for-tests';

const captured = parsePancakeSalesSummary({
  success: true,
  summary: {
    price: 22729100,
    price_data: 22729100,
    order_count: 1421,
    total_order_count: 1431,
    product_count: 2227,
    cod: 26022500,
    shipping_fee: 3330400,
    discount: 20000,
    prepaid: 17000
  }
});
assert.deepEqual(captured, {
  revenue: 227291,
  orders: 1421,
  products: 2227,
  cod: 260225,
  shippingFee: 33304,
  discount: 200,
  prepaid: 170
}, 'captured Pancake statistics summary must parse from satang to baht');
delete process.env.PANCAKE_POS_API_KEY_1;
delete process.env.PANCAKE_SHOP_IDS_1;
delete process.env.PANCAKE_LABEL_1;

const good = await login({ body: { username: 'Owner', password: 'selftest-password' } });
assert.equal(good.status, 200, 'default Owner login should succeed');
const sessionCookie = good.headers['set-cookie'].split(';')[0];
const bad = await login({ body: { username: 'Owner', password: '__wrong__' } });
assert.equal(bad.status, 401, 'wrong password must fail');

const saved = await saveSettings({ headers: { cookie: sessionCookie }, body: { connections: [{ id:'c1', label:'Main', apiKey:'secret-test-key', shopIds:['101','102'] }] } });
assert.equal(saved.status, 200, 'cookie settings save should succeed when shared env is absent');
const settingsCookie = saved.headers['set-cookie'].split(';')[0];
const got = await getSettings({ headers: { cookie: `${sessionCookie}; ${settingsCookie}` } });
assert.equal(got.status, 200, 'settings read should succeed');
assert.match(got.body, /hasApiKey/);
assert.ok(!got.body.includes('secret-test-key'), 'full API key must never be returned');

process.env.PANCAKE_POS_API_KEY_1 = 'env-secret-key';
process.env.PANCAKE_SHOP_IDS_1 = 'ALL';
process.env.PANCAKE_LABEL_1 = 'Shared Main';
const shared = await getSettings({ headers: { cookie: sessionCookie } });
assert.equal(shared.status, 200);
const sharedBody = JSON.parse(shared.body);
assert.equal(sharedBody.shared, true, 'env settings should be marked shared');
assert.equal(sharedBody.source, 'env');
assert.equal(sharedBody.connections[0].autoAllShops, true);
assert.ok(!shared.body.includes('env-secret-key'), 'shared API key must remain masked');
const blocked = await saveSettings({ headers: { cookie: sessionCookie }, body: { connections: [] } });
assert.equal(blocked.status, 409, 'shared env config must not be overwritten by browser settings');

if (original.key === undefined) delete process.env.PANCAKE_POS_API_KEY_1; else process.env.PANCAKE_POS_API_KEY_1 = original.key;
if (original.shops === undefined) delete process.env.PANCAKE_SHOP_IDS_1; else process.env.PANCAKE_SHOP_IDS_1 = original.shops;
if (original.label === undefined) delete process.env.PANCAKE_LABEL_1; else process.env.PANCAKE_LABEL_1 = original.label;
if (original.user === undefined) delete process.env.APP_USER; else process.env.APP_USER = original.user;
if (original.password === undefined) delete process.env.APP_PASSWORD; else process.env.APP_PASSWORD = original.password;
if (original.secret === undefined) delete process.env.APP_SECRET; else process.env.APP_SECRET = original.secret;

console.log('Self-test: PASS');
