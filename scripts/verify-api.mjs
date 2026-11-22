/**
 * End-to-end smoke verification for a running WMS API.
 * Run with: node scripts/verify-api.mjs   (API must be listening on BASE)
 * Override target with: BASE=http://host:3000 node scripts/verify-api.mjs
 *
 * Exercises login, guarded stock adjustments, the full receive -> pick -> ship
 * lifecycle with stock assertions, over-quantity guards, deletion guards,
 * product barcodes/images, dashboard endpoints, RBAC, and DTO validation.
 * Exits non-zero on any failure.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail); }
}
async function req(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  let body; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
}
const J = (method, token, data) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  body: data ? JSON.stringify(data) : undefined,
});
const MP = (token, form) => ({
  method: 'POST',
  headers: token ? { Authorization: 'Bearer ' + token } : {},
  body: form,
});
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9cJfEAAAAASUVORK5CYII=',
  'base64',
);
const onHand = (rows) => rows.reduce((sum, x) => sum + x.quantityOnHand, 0);

(async () => {
  let r = await req('/api/auth/login', J('POST', null, { email: 'admin@warehouse.io', password: 'Admin@123' }));
  ok('login returns 200', r.status === 200, String(r.status));
  const T = r.body?.access_token;
  if (!T) { console.log('ABORT - no token'); process.exit(1); }

  r = await req('/api/inventory/adjust', J('POST', T, { productId: 1, locationId: 1, quantity: -5, type: 'PICK' }));
  ok('negative PICK rejected 400', r.status === 400, String(r.status) + ' ' + JSON.stringify(r.body));
  r = await req('/api/inventory/adjust', J('POST', T, { productId: 1, locationId: 1, quantity: 2, type: 'ADJUSTMENT' }));
  ok('signed ADJUSTMENT works 201', r.status === 201, String(r.status) + ' ' + JSON.stringify(r.body).slice(0, 100));

  const sku = 'QA-' + Date.now();
  r = await req('/api/products', J('POST', T, { sku, name: 'QA Test Product', unitCost: 10, reorderLevel: 5 }));
  ok('create product 201', r.status === 201, String(r.status));
  const pid = r.body.id;

  // Product detail fields: automatic barcode and optional image.
  ok('barcode generated on create', typeof r.body.barcode === 'string' && r.body.barcode.startsWith('WMS'), String(r.body.barcode));
  r = await req('/api/products', J('GET', T));
  ok('all products have barcodes', Array.isArray(r.body) && r.body.length > 0 && r.body.every((p) => !!p.barcode), String(r.body?.length));
  r = await req(`/api/products/${pid}`, J('GET', T));
  ok('product detail includes stock relations', r.status === 200 && Array.isArray(r.body.inventory), String(r.status));
  r = await req(`/api/products/${pid}`, J('PATCH', T, { isActive: false }));
  ok('partial PATCH with only isActive 200', r.status === 200 && r.body.isActive === false, String(r.status) + ' ' + JSON.stringify(r.body).slice(0, 120));
  r = await req(`/api/products/${pid}`, J('PATCH', T, { isActive: true }));
  ok('product can be reactivated 200', r.status === 200 && r.body.isActive === true, String(r.status));

  const imageForm = new FormData();
  imageForm.append('image', new Blob([tinyPng], { type: 'image/png' }), 'qa.png');
  r = await req(`/api/products/${pid}/image`, MP(T, imageForm));
  ok('image upload returns path', r.status === 201 && typeof r.body?.imagePath === 'string', String(r.status) + ' ' + JSON.stringify(r.body));
  const imagePath = r.body?.imagePath;
  ok('image path under /uploads', typeof imagePath === 'string' && imagePath.startsWith('/uploads/'), String(imagePath));
  if (imagePath) {
    const imageResponse = await fetch(BASE + imagePath);
    const contentType = imageResponse.headers.get('content-type') || '';
    ok(
      'uploaded image is served as image',
      imageResponse.status === 200 && contentType.startsWith('image/'),
      imageResponse.status + ' ' + contentType,
    );
  }
  const badForm = new FormData();
  badForm.append('image', new Blob(['not an image'], { type: 'text/plain' }), 'bad.txt');
  r = await req(`/api/products/${pid}/image`, MP(T, badForm));
  ok('non-image upload rejected 400', r.status === 400, String(r.status));
  const spoofForm = new FormData();
  spoofForm.append('image', new Blob(['not really a png'], { type: 'image/png' }), 'spoof.png');
  r = await req(`/api/products/${pid}/image`, MP(T, spoofForm));
  ok('spoofed image bytes rejected 400', r.status === 400, String(r.status));
  r = await req(`/api/products/${pid}/image`, J('DELETE', T));
  ok('image removal clears path', r.status === 200 && r.body.imagePath === null, String(r.status) + ' ' + JSON.stringify(r.body));

  r = await req('/api/receiving', J('POST', T, { supplier: 'QA Supplier', items: [{ productId: pid, quantityExpected: 100, locationId: 1 }] }));
  ok('create receiving order 201', r.status === 201, String(r.status));
  const rid = r.body.id, itemId = r.body.items[0].id;

  r = await req(`/api/receiving/${rid}/receive`, J('POST', T, { items: [{ itemId, quantityReceived: 40, locationId: 1 }] }));
  ok('partial receive 200', r.status === 200, String(r.status) + ' ' + JSON.stringify(r.body).slice(0, 120));
  ok('order still PENDING after partial', r.body.status === 'PENDING', JSON.stringify(r.body.status));
  ok('quantityReceived=40', r.body.items[0].quantityReceived === 40, String(r.body.items[0].quantityReceived));

  r = await req(`/api/receiving/${rid}/receive`, J('POST', T, { items: [{ itemId, quantityReceived: 61 }] }));
  ok('over-receive blocked 400', r.status === 400, String(r.status) + ' ' + JSON.stringify(r.body).slice(0, 100));

  r = await req(`/api/receiving/${rid}/receive`, J('POST', T, { items: [{ itemId, quantityReceived: 60 }] }));
  ok('final receive completed 200', r.status === 200 && r.body.status === 'COMPLETED', String(r.status));
  ok('quantityReceived=100 accumulative', r.body.items[0].quantityReceived === 100, String(r.body.items[0].quantityReceived));

  r = await req(`/api/inventory/product/${pid}`, J('GET', T));
  ok('stock after receiving = 100', onHand(r.body) === 100, String(onHand(r.body)));

  r = await req('/api/picking', J('POST', T, { reference: 'QA-REF', items: [{ productId: pid, quantity: 30, locationId: 1 }] }));
  ok('create pick order 201', r.status === 201, String(r.status));
  const pickId = r.body.id, pickItem = r.body.items[0].id;

  r = await req(`/api/picking/${pickId}/assign`, J('POST', T, { assigneeId: 3 }));
  ok('assign 200', r.status === 200, String(r.status));
  ok('assigneeId persisted 3', r.body.assigneeId === 3, JSON.stringify(r.body.assigneeId));
  ok('status ASSIGNED', r.body.status === 'ASSIGNED', String(r.body.status));

  r = await req(`/api/picking/${pickId}/complete`, J('POST', T, { items: [{ itemId: pickItem, quantityPicked: 10, locationId: 1 }] }));
  ok('partial pick 200', r.status === 200, String(r.status));
  ok('picked qty accumulative 10', r.body.items[0].quantityPicked === 10, String(r.body.items[0].quantityPicked));
  ok('status ASSIGNED after partial', r.body.status === 'ASSIGNED', String(r.body.status));

  r = await req(`/api/picking/${pickId}/complete`, J('POST', T, { items: [{ itemId: pickItem, quantityPicked: 25, locationId: 1 }] }));
  ok('over-pick blocked 400', r.status === 400, String(r.status));

  r = await req(`/api/picking/${pickId}/complete`, J('POST', T, { items: [{ itemId: pickItem, quantityPicked: 20, locationId: 1 }] }));
  ok('final pick completed 200', r.status === 200 && r.body.status === 'COMPLETED', String(r.status));
  ok('picked qty 30', r.body.items[0].quantityPicked === 30, String(r.body.items[0].quantityPicked));

  r = await req(`/api/inventory/product/${pid}`, J('GET', T));
  ok('stock after picking = 70', onHand(r.body) === 70, String(onHand(r.body)));

  r = await req('/api/shipping', J('POST', T, { carrier: 'QA Carrier', destination: 'QA Destination', items: [{ productId: pid, quantity: 20 }] }));
  ok('create shipment 201', r.status === 201, String(r.status));
  const sid = r.body.id;
  r = await req(`/api/shipping/${sid}/ship`, J('POST', T));
  ok('ship 200', r.status === 200, String(r.status));
  ok('shipment SHIPPED', r.body.status === 'SHIPPED', String(r.body.status));
  r = await req(`/api/shipping/${sid}/ship`, J('POST', T));
  ok('double ship blocked 400', r.status === 400, String(r.status));

  r = await req(`/api/inventory/product/${pid}`, J('GET', T));
  ok('stock after shipping = 50', onHand(r.body) === 50, String(onHand(r.body)));

  r = await req(`/api/products/${pid}`, J('DELETE', T));
  ok('delete product with history blocked 400', r.status === 400, String(r.status));
  r = await req(`/api/movements?productId=${pid}`, J('GET', T));
  ok('movement history 3+ entries', Array.isArray(r.body) && r.body.length >= 3, String(r.body?.length));

  // Dashboard endpoints, including the drill-down/feed data used by the enhanced UI.
  for (const path of ['/stats', '/movement-chart', '/recent-movements', '/top-products', '/insights', '/activity']) {
    r = await req('/api/dashboard' + path, J('GET', T));
    ok('GET /dashboard' + path + ' 200', r.status === 200, String(r.status));
  }
  r = await req('/api/dashboard/insights', J('GET', T));
  ok(
    'insights shape has four arrays',
    Array.isArray(r.body?.byCategory) && Array.isArray(r.body?.byLocation) &&
      Array.isArray(r.body?.productStock) && Array.isArray(r.body?.topProducts),
    JSON.stringify(Object.keys(r.body || {})),
  );
  ok(
    'insights statuses are valid',
    (r.body?.productStock || []).length > 0 &&
      r.body.productStock.every((item) =>
        ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(item.status)),
    JSON.stringify((r.body?.productStock || []).map((item) => item.status).slice(0, 5)),
  );
  r = await req('/api/dashboard/activity', J('GET', T));
  ok(
    'activity feed items are well formed',
    Array.isArray(r.body) && r.body.length > 0 && r.body.every((item) =>
      item.id && item.kind && typeof item.title === 'string' &&
      typeof item.detail === 'string' && item.status && item.at),
    JSON.stringify(r.body?.[0] || null),
  );

  r = await req('/api/auth/login', J('POST', null, { email: 'picker@warehouse.io', password: 'Picker@123' }));
  const PT = r.body?.access_token;
  ok('picker login 200', r.status === 200 && !!PT, String(r.status));
  if (PT) {
    r = await req('/api/users', J('GET', PT)); ok('PICKER GET /users 403', r.status === 403, String(r.status));
    r = await req('/api/products', J('POST', PT, { sku: 'X-1', name: 'X' })); ok('PICKER POST /products 403', r.status === 403, String(r.status));
    r = await req('/api/picking', J('GET', PT)); ok('PICKER GET /picking 200', r.status === 200, String(r.status));
    r = await req('/api/products', J('GET', PT)); ok('PICKER can read product detail data 200', r.status === 200, String(r.status));
    const pickerForm = new FormData();
    pickerForm.append('image', new Blob([tinyPng], { type: 'image/png' }), 'qa.png');
    r = await req(`/api/products/${pid}/image`, MP(PT, pickerForm));
    ok('PICKER image upload 403', r.status === 403, String(r.status));
  }
  r = await req('/api/products/abc', J('GET', T));
  ok('GET /products/abc 400', r.status === 400, String(r.status));

  console.log('\nTOTAL PASS=' + pass + ' FAIL=' + fail);
  if (fail > 0) process.exit(1);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
