// Browser regression against synthetic API fixtures. Does not write to Azure or Cloudflare.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import assert from "node:assert/strict";

const profileDirectory = await mkdtemp(join(tmpdir(), "kuska-browser-"));
const browserPath = process.env.KUSKA_QA_BROWSER || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const child = spawn(browserPath, ["--headless=new", "--no-first-run", "--disable-extensions", "--remote-debugging-port=0", `--user-data-dir=${profileDirectory}`], { windowsHide: true, stdio: "ignore" });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const results = [], requests = [], errors = [];
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = (await readFile(join(profileDirectory, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { await pause(100); }
  }
  assert(port, "Browser did not start");
  const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0, sessionId;
  const pending = new Map();
  function cdp(method, params = {}, browser = false) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(!browser && sessionId ? { sessionId } : {}) }));
    });
  }
  const user = { id: "qa-owner", username: "Vecina QA", phone: "900000000", address: "PRIVATE PROFILE ADDRESS", districtId: 1, district: "Bellavista", province: "Callao", departmentId: 7, department: "Callao", about: "" };
  const service = id => ({ id, ownerId: user.id, owner: user.username, phone: user.phone, districtId: 1, district: "Bellavista", categoryId: 1, category: "Electricidad", title: `Servicio QA ${id}`, description: "Instalación eléctrica", priceMin: 30, priceMax: 40, publishedAt: "2026-11-08T12:00:00", location: "Plaza pública", latitude: -12.06, longitude: -77.12, images: [], reviews: [] });
  let services = [service("a"), service("b"), service("c")];
  let posts = ["p1", "p2"].map(id => ({ id, ownerId: user.id, owner: user.username, districtId: 1, district: "Bellavista", typeId: 1, type: "Necesito", title: `Publicación QA ${id}`, description: "Apoyo", publishedAt: "2026-11-08T12:00:00", location: "Plaza", latitude: -12.06, longitude: -77.12, images: [], replies: [] }));
  const token = `header.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.synthetic`;
  const serve = async event => {
    const { requestId, request } = event;
    const path = new URL(request.url).pathname, method = request.method;
    requests.push({ path, method });
    let body = [], status = 200;
    const payload = request.postData ? JSON.parse(request.postData) : {};
    if (method === "OPTIONS") status = 204;
    else if (path === "/api/auth/login") body = { accessToken: token, tokenType: "Bearer", expiresIn: 900, user };
    else if (path === "/api/usuarios/me") body = user;
    else if (path === "/api/catalogos/categorias-servicio") body = [{ id: 1, nombre: "Electricidad", descripcion: "" }, { id: 2, nombre: "Tecnologia", descripcion: "" }];
    else if (path === "/api/catalogos/tipos-publicacion") body = [{ id: 1, nombre: "Necesito" }, { id: 2, nombre: "Solidaridad" }, { id: 3, nombre: "Emergencia" }];
    else if (path === "/api/servicios" && method === "POST") { body = { ...service(payload.id), ...payload, publishedAt: new Date().toISOString() }; services.unshift(body); }
    else if (path.startsWith("/api/servicios/") && method === "PUT") { const id = decodeURIComponent(path.split("/")[3]); services = services.map(row => row.id === id ? { ...row, ...payload } : row); body = services.find(row => row.id === id); }
    else if (path.startsWith("/api/servicios/") && method === "DELETE") { services = services.filter(row => row.id !== decodeURIComponent(path.split("/")[3])); status = 204; }
    else if (path === "/buscar") body = { usoIA: true, filtros: { categoria: "electricidad", distrito: "Bellavista" }, resultados: [] };
    else if (path === "/api/servicios") body = services;
    else if (path === "/api/publicaciones") body = posts;
    await cdp("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [
      { name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" },
      { name: "Access-Control-Allow-Headers", value: "authorization,content-type,x-operation-id" }, { name: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
    ], body: status === 204 ? "" : Buffer.from(JSON.stringify(body)).toString("base64") });
  };
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const call = pending.get(message.id); if (!call) return;
      pending.delete(message.id); clearTimeout(call.timeout);
      if (message.error) call.reject(new Error(message.error.message)); else call.resolve(message.result);
    } else if (message.method === "Fetch.requestPaused") void serve(message.params).catch(error => errors.push(error.message));
    else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  };
  const { targetId } = await cdp("Target.createTarget", { url: "about:blank" }, true);
  ({ sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true }, true));
  await cdp("Runtime.enable"); await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*localhost:8080/*" }, { urlPattern: "*kuska-agente-api.kuska-app.workers.dev/*" }] });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error(`UI timeout: ${expression}`);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const textButton = text => evaluate(`[...document.querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(text)}).click()`);
  const fill = (selector, value) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});const proto=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:node.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const check = name => { results.push(name); console.log(`PASS ${name}`); };
  await cdp("Page.navigate", { url: process.env.KUSKA_QA_URL || "http://127.0.0.1:8443" });
  await waitFor("!!document.querySelector('input[name=user]')");
  const compressedPhoto = await evaluate(`(async()=>{
    const {compressImage}=await import('/src/services/imageCompression.ts');
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;
    const context=canvas.getContext('2d'), pixels=context.createImageData(1600,1200);
    for(let offset=0;offset<pixels.data.length;offset+=65536) crypto.getRandomValues(pixels.data.subarray(offset,Math.min(offset+65536,pixels.data.length)));
    for(let offset=3;offset<pixels.data.length;offset+=4) pixels.data[offset]=255;
    context.putImageData(pixels,0,0);
    const original=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const compressed=await compressImage(original), bitmap=await createImageBitmap(compressed);
    const result={originalBytes:original.size,compressedBytes:compressed.size,width:bitmap.width,height:bitmap.height,type:compressed.type};bitmap.close();return result;
  })()`);
  assert(compressedPhoto.originalBytes>1024*1024);
  assert(compressedPhoto.compressedBytes<compressedPhoto.originalBytes);
  assert.equal(compressedPhoto.width,1280);assert.equal(compressedPhoto.height,960);
  assert.equal(compressedPhoto.type,'image/webp');
  console.log('COMPRESSION',JSON.stringify(compressedPhoto));
  check("large phone-sized image compresses with the real browser decoder and encoder");
  await fill("input[name=user]", "Vecina QA"); await fill("input[name=password]", "synthetic-password");
  await click("form .primary-button"); await waitFor("!!document.querySelector('.home-screen')"); check("login and existing home navigation");
  await click(".shortcut:first-child"); await waitFor("!!document.querySelector('.publish-cta')");
  await click(".publish-cta"); await waitFor("!!document.querySelector('.modal-sheet select[name=category] option[value=\"1\"]')");
  assert.equal(await evaluate("[...document.querySelectorAll('.modal-sheet button')].some(node=>node.textContent.trim()==='Buscar')"), false);
  assert.equal(await evaluate("[...document.querySelectorAll('.modal-sheet button')].some(node=>node.textContent.trim()==='Usar mi ubicación')"), true);
  await fill("input[name=location]", "Frente al mercado"); await pause(150);
  assert.equal(requests.some(request => /ubicaciones/.test(request.path)), false);
  assert.equal(requests.filter(request => request.method === "POST" && request.path === "/api/servicios").length, 0);
  assert.equal(await evaluate("document.querySelector('input[name=location]').value.includes('PRIVATE')"), false);
  check("free location text, no search, GPS preserved and no premature writes");
  await fill("input[name=title]", "Servicio recién publicado"); await fill("textarea[name=description]", "Prueba local"); await fill("select[name=category]", "1");
  await evaluate("document.querySelector('.modal-sheet form').requestSubmit()");
  await waitFor("!document.querySelector('.modal-sheet') && document.body.textContent.includes('Servicio recién publicado')");
  assert.equal(requests.filter(request => request.method === "POST" && request.path === "/api/servicios").length, 1); check("publication immediately visible without duplicate writes");
  await click(".service-card"); await waitFor("document.body.textContent.includes('Editar servicio')"); await textButton("Editar servicio");
  await waitFor("!!document.querySelector('.modal-sheet select[name=category] option[value=\"1\"]')"); await fill("input[name=title]", "Servicio editado");
  await evaluate("document.querySelector('.modal-sheet form').requestSubmit()"); await waitFor("!document.querySelector('.modal-sheet') && document.body.textContent.includes('Servicio editado')"); check("edit immediately reflected");
  await evaluate("window.confirm=()=>true"); await textButton("Eliminar servicio"); await waitFor("!document.body.textContent.includes('Servicio editado')"); check("delete immediately reflected");
  await textButton("Mapa"); await waitFor("document.querySelectorAll('.leaflet-marker-icon').length===1");
  await click(".leaflet-marker-icon"); await waitFor("document.querySelectorAll('.map-point-options button').length===3");
  await click(".map-point-options button:nth-of-type(2)"); await waitFor("document.querySelector('.map-preview h3')?.textContent==='Servicio QA b'");
  await textButton("Ver detalle"); await waitFor("document.querySelector('.detail-content h1')?.textContent==='Servicio QA b'"); check("three coincident markers and correct individual service");
  await textButton("Mapa"); await waitFor("!!document.querySelector('.map-filters')"); await textButton("Comunidad");
  await waitFor("document.querySelectorAll('.leaflet-marker-icon').length===1"); await click(".leaflet-marker-icon");
  await waitFor("document.querySelectorAll('.map-point-options button').length===2"); check("community filter preserves both coincident publications");
  await textButton("Inicio"); await waitFor("!!document.querySelector('.home-screen')");
  await evaluate("window.scrollTo({top:0,behavior:'instant'})"); await pause(100);
  const countReads = () => requests.filter(request => request.method === "GET" && request.path === "/api/servicios").length;
  let before = countReads();
  for (const [type, y] of [["touchStart",150],["touchMove",100],["touchEnd",100]]) await cdp("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 200, y }] });
  await pause(200); assert.equal(countReads(), before); check("ordinary upward scrolling does not refresh");
  await pause(700);
  await evaluate("window.scrollTo({top:0,behavior:'instant'})"); await waitFor("scrollY===0"); await pause(150); before = countReads();
  for (const [type, y] of [["touchStart",70],["touchMove",150],["touchMove",250],["touchEnd",250]]) {
    await cdp("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 200, y }] });
  }
  await waitFor("document.querySelector('.refresh-controls')?.textContent.includes('Lista actualizada')");
  assert(countReads() > before); check("intentional pull refreshes data");
  await click(".shortcut:last-child"); await waitFor("!!document.querySelector('.agent-kuska-button')"); await click(".agent-kuska-button");
  await waitFor("!!document.querySelector('.chat-composer input:not(:disabled)')");
  await fill(".chat-composer input", "Hola, hijito"); await click(".chat-composer button");
  await waitFor("document.querySelectorAll('.chat-message').length>=3 || document.body.textContent.includes('¿Qué necesitas hoy?')");
  assert.equal(requests.filter(request => /buscar/.test(request.path)).length, 0); check("colloquial greeting stays conversational");
  await cdp("Network.enable");
  await cdp("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitFor("navigator.onLine===false");
  await fill(".chat-composer input", "Necesito un electricista en Bellavista hasta 50 soles"); await click(".chat-composer button");
  await waitFor("document.querySelectorAll('.kuska-chat-result').length===3");
  assert.equal(requests.filter(request => /buscar/.test(request.path)).length, 0); check("offline keyword search returns cached real records and price ranges");
  await cdp("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitFor("navigator.onLine===true && !document.querySelector('.chat-composer input').disabled");
  await fill(".chat-composer input", "Busco un electricista en Bellavista hasta 50 soles"); await click(".chat-composer button");
  await waitFor("document.querySelectorAll('.kuska-chat-result').length===6");
  assert.equal(requests.filter(request => /buscar/.test(request.path) && request.method === "POST").length, 1); check("next search returns online without restarting or duplicating messages");
  await fill(".chat-composer input", "Abre Servicios"); await click(".chat-composer button"); await waitFor("!!document.querySelector('.publish-cta')"); check("assistant opens the existing services screen");
  const sendChat = async text => { await waitFor("!!document.querySelector('.chat-composer input:not(:disabled)')"); await fill(".chat-composer input", text); await click(".chat-composer button"); };
  const lastReply = "[...document.querySelectorAll('.chat-message.agent')].at(-1)?.querySelector('p')?.textContent";
  await click(".screen-header button"); await waitFor("!!document.querySelector('.chat-composer')");
  await sendChat("¿Qué pantalla visité?"); await waitFor(`${lastReply}?.includes('Servicios')`);
  check("assistant remembers the actual screen visited after returning");
  await sendChat("Sí"); await waitFor(`${lastReply}?.includes('Mostrar todos')`);
  assert(await evaluate("!!document.querySelector('.chat-composer')"));
  await sendChat("¿Y luego?"); await waitFor(`${lastReply}?.includes('Ya avanzamos')`);
  check("acknowledgments continue the current step without reopening a navigation loop");
  await sendChat("¿Cómo publicar un servicio?"); await waitFor(`${lastReply}?.includes('rango de precio')`);
  const openingWrites = requests.filter(request => request.method === "POST" && request.path === "/api/servicios").length;
  await sendChat("Sí"); await waitFor("!!document.querySelector('.modal-sheet select[name=category] option[value=\"1\"]')");
  assert.equal(requests.filter(request => request.method === "POST" && request.path === "/api/servicios").length, openingWrites);
  check("assistant opens the existing publication form without submitting it");
  await fill("input[name=title]", "Servicio guiado IA"); await fill("textarea[name=description]", "Servicio creado en una prueba guiada local"); await fill("select[name=category]", "1");
  await evaluate("document.querySelector('.modal-sheet form').requestSubmit()");
  await waitFor("!document.querySelector('.modal-sheet') && document.body.textContent.includes('Servicio guiado IA')");
  await click(".screen-header button"); await waitFor("!!document.querySelector('.chat-composer')");
  await sendChat("Ya publiqué"); await waitFor(`${lastReply}?.includes('Guardaste «Servicio guiado IA»')`);
  const completion = await evaluate(lastReply);
  await sendChat("¿Y ahora?"); await waitFor(`${lastReply}!==${JSON.stringify(completion)}`);
  assert(!(await evaluate(lastReply)).includes("abre Servicios"));
  check("assistant answers from a confirmed save and continues instead of repeating the first instructions");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: results.length, mockedApi: true, realAzureWrites: false, checks: results }, null, 2));
  await cdp("Browser.close", {}, true).catch(() => {});
} catch (error) {
  console.error(JSON.stringify({ passed: results, error: error.message, browserErrors: errors }, null, 2)); process.exitCode = 1;
} finally {
  socket?.close(); child.kill();
  await pause(500);
  // The generated profile is always inside the directory created above in the OS temp directory.
  assert.equal(dirname(resolve(profileDirectory)), resolve(tmpdir()));
  assert(basename(profileDirectory).startsWith("kuska-browser-"));
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
