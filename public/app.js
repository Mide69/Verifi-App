import { BrowserMultiFormatReader } from '@zxing/browser';

const $ = selector => document.querySelector(selector);
const node = (tag, content, className) => {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  if (className) element.className = className;
  return element;
};

async function api(path, data) {
  const response = await fetch('/api/' + path, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function onForm(form, status, action) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter ?? form.querySelector('button[type=submit],button:not([type])');
    if (button) button.disabled = true;
    status.textContent = 'Working…';
    try {
      status.textContent = await action(Object.fromEntries(new FormData(form))) ?? '';
    } catch (error) {
      status.textContent = error.message || 'Something went wrong.';
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function history() {
  try {
    return JSON.parse(localStorage.getItem('verifi-checks') ?? '[]');
  } catch {
    return [];
  }
}

function showHistory() {
  const recent = $('#recent');
  recent.replaceChildren();
  for (const item of history()) {
    recent.append(node('div', item.value + ' · ' + item.result, 'record'));
  }
  if (!recent.childElementCount) recent.append(node('p', 'Your checks on this device will appear here.'));
}

function registryLine(record) {
  return record.agency + ' ' + record.number + ' · ' + record.status + ' · ' + record.source + ' · checked ' + record.checked;
}

async function check(value) {
  const result = $('#result');
  result.hidden = true;
  const data = await api('check', { value });
  result.replaceChildren(node('p', 'CHECK RESULT', 'eyebrow'), node('h2', data.value));
  result.append(node('p', 'Item verification', 'result-label'), node('strong', data.item));
  if (data.item.startsWith('Serial')) {
    result.append(node('p', 'A recognised serial is evidence about the code. Codes can be copied.'));
  }
  result.append(node('p', 'Regulatory registration', 'result-label'));
  for (const product of data.matches) {
    const item = node('div', undefined, 'record');
    item.append(node('h3', product.name), node('small', product.maker));
    for (const record of product.registry) item.append(node('small', registryLine(record)));
    if (!product.registry.length) item.append(node('small', 'No matching registry record in Verifi.'));
    result.append(item);
  }
  if (!data.matches.length) result.append(node('p', 'No product matched this search in Verifi.'));
  const report = node('a', 'Report a concern ↗');
  report.href = '#report';
  report.addEventListener('click', () => { $('#report-form').elements.product.value = data.value; });
  result.append(report);
  result.hidden = false;
  result.scrollIntoView({ block: 'nearest' });
  try {
    localStorage.setItem('verifi-checks', JSON.stringify([{ value: data.value, result: data.item }, ...history()].slice(0, 12)));
  } catch {
    // The check remains available if browser storage is disabled.
  }
  showHistory();
}

onForm($('#check-form'), $('#check-status'), data => check(data.value));
showHistory();

let stream;
let cameraRun = 0;
const camera = $('#camera');
const scan = $('#scan');
function closeCamera() {
  cameraRun += 1;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  camera.srcObject = null;
  camera.hidden = true;
  $('.scan-illustration').hidden = false;
  scan.textContent = 'Open camera ↗';
}

scan.addEventListener('click', async () => {
  if (stream) return closeCamera();
  const status = $('#check-status');
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Camera scanning is unavailable in this browser. Enter the code below.';
    return $('#query').focus();
  }
  const run = ++cameraRun;
  scan.disabled = true;
  try {
    let detector;
    try {
      if ('BarcodeDetector' in window) detector = new BarcodeDetector();
    } catch {
      // Some browsers expose the API without a working implementation.
    }
    const reader = new BrowserMultiFormatReader();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const feed = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    if (run !== cameraRun) return feed.getTracks().forEach(track => track.stop());
    stream = feed;
    camera.srcObject = stream;
    camera.hidden = false;
    $('.scan-illustration').hidden = true;
    await camera.play();
    scan.textContent = 'Close camera';
    scan.disabled = false;
    status.textContent = 'Point the camera at the code.';
    const detect = async () => {
      if (run !== cameraRun) return;
      try {
        let value;
        if (detector) {
          try {
            const [code] = await detector.detect(camera);
            value = code?.rawValue;
          } catch {
            detector = null;
          }
        }
        if (!value && context && camera.videoWidth) {
          const scale = Math.min(1, 960 / camera.videoWidth);
          canvas.width = Math.round(camera.videoWidth * scale);
          canvas.height = Math.round(camera.videoHeight * scale);
          context.drawImage(camera, 0, 0, canvas.width, canvas.height);
          try {
            value = reader.decodeFromCanvas(canvas).getText();
          } catch {
            // A frame without a readable barcode is expected while aiming.
          }
        }
        if (run !== cameraRun) return;
        if (!value) return window.setTimeout(detect, 220);
        closeCamera();
        $('#query').value = value;
        status.textContent = 'Checking…';
        await check(value);
        status.textContent = '';
      } catch {
        closeCamera();
        status.textContent = 'Could not read or check that code. Try entering it manually.';
      }
    };
    await detect();
  } catch {
    closeCamera();
    status.textContent = 'Camera access failed. You can still enter the code manually.';
  } finally {
    scan.disabled = false;
  }
});
window.addEventListener('pagehide', closeCamera);

let coordinates = null;
const locationButton = $('#location');
const reportStatus = $('#report-status');
locationButton.addEventListener('click', () => {
  if (coordinates) {
    coordinates = null;
    locationButton.textContent = 'Add current location (optional)';
    reportStatus.textContent = 'Location removed.';
    return;
  }
  if (!navigator.geolocation) {
    reportStatus.textContent = 'Location is unavailable on this device.';
    return;
  }
  locationButton.disabled = true;
  navigator.geolocation.getCurrentPosition(position => {
    coordinates = [position.coords.latitude, position.coords.longitude].map(value => Number(value.toFixed(4)));
    locationButton.textContent = 'Remove location';
    reportStatus.textContent = 'Location will be shared with the report review team when submitted.';
    locationButton.disabled = false;
  }, () => {
    reportStatus.textContent = 'Could not get your location. You can still submit the report.';
    locationButton.disabled = false;
  }, { timeout: 8000 });
});

onForm($('#report-form'), reportStatus, async data => {
  const result = await api('reports', { ...data, location: coordinates });
  $('#report-form').reset();
  coordinates = null;
  locationButton.textContent = 'Add current location (optional)';
  return 'Report VF-' + result.id + ' received for review.';
});

async function showCatalogue() {
  const catalogue = $('#catalogue');
  try {
    const products = await api('products');
    catalogue.replaceChildren();
    for (const product of products) {
      const article = node('article', undefined, 'record');
      article.append(node('h3', product.name), node('small', product.maker));
      const details = node('details');
      details.append(node('summary', product.reviews.length + ' recent reviews · read or write a review'));
      for (const review of product.reviews) details.append(node('p', review.rating + '/5 · ' + review.detail));
      const form = node('form');
      form.innerHTML = '<label>Rating out of 5<input name="rating" type="number" min="1" max="5" required></label><label>Comment<textarea name="detail" maxlength="600" required></textarea></label><button>Post review</button>';
      const status = node('p');
      status.setAttribute('role', 'status');
      form.append(status);
      details.append(form);
      onForm(form, status, async data => {
        await api('reviews', { product: product.id, rating: Number(data.rating), detail: data.detail });
        details.insertBefore(node('p', data.rating + '/5 · ' + data.detail), form);
        details.querySelector('summary').textContent = (details.querySelectorAll(':scope > p').length) + ' recent reviews · read or write a review';
        form.reset();
        return 'Review posted.';
      });
      article.append(details);
      catalogue.append(article);
    }
  } catch (error) {
    catalogue.textContent = error.message;
  }
}

const workspace = $('#workspace-content');
const workspaceStatus = $('#workspace-status');
function workspaceForm(title, markup, action, parent = workspace) {
  const form = node('form', undefined, 'record');
  form.append(node('h3', title));
  const template = document.createElement('template');
  template.innerHTML = markup;
  form.append(template.content);
  const status = node('p');
  status.setAttribute('role', 'status');
  form.append(status);
  parent.append(form);
  onForm(form, status, action);
  return form;
}

async function showWorkspace() {
  try {
    const { role } = await api('session');
    workspace.replaceChildren();
    if (!role) {
      workspace.append(node('p', 'Sign in with a workspace access key.'));
      workspaceForm('Workspace access', '<label>Role<select name="role"><option value="business">Manufacturer</option><option value="admin">Administrator</option></select></label><label>Access key<input name="key" type="password" required></label><button class="primary">Sign in</button>', async data => {
        await api('session', data);
        await showWorkspace();
      });
      return;
    }
    const data = await api('workspace');
    workspace.append(node('p', role === 'admin' ? 'Administrator · Report review and registry imports' : 'Manufacturer · Catalogue and item codes'));
    const logout = node('button', 'Sign out');
    logout.addEventListener('click', async () => {
      try {
        await api('signout', {});
        await showWorkspace();
      } catch (error) {
        workspaceStatus.textContent = error.message;
      }
    });
    workspace.append(logout);
    if (role === 'business') {
      workspaceForm('Register a product', '<label>Product name<input name="name" maxlength="160" required></label><label>Manufacturer<input name="maker" maxlength="160" required></label><label>Existing barcode<input name="barcode" inputmode="numeric" maxlength="14"></label><button>Save product</button>', async input => {
        await api('products', input);
        await showCatalogue();
        await showWorkspace();
        workspaceStatus.textContent = 'Product saved.';
      });
      const form = workspaceForm('Issue an item code', '<label>Product<select name="product" required></select></label><button>Issue serial</button>', async input => {
        const result = await api('codes', input);
        await showWorkspace();
        workspaceStatus.textContent = 'New serial: ' + result.code;
      });
      for (const product of data.products) {
        const option = node('option', product.name);
        option.value = product.id;
        form.elements.product.append(option);
      }
      for (const code of data.codes) {
        const row = node('div', undefined, 'record');
        const download = node('a', 'Download QR label');
        download.href = '/api/code-image?code=' + encodeURIComponent(code.code);
        download.download = code.code + '.png';
        row.append(node('p', code.name + ' · ' + code.code + ' · ' + code.scans + ' scans'), download);
        workspace.append(row);
      }
    } else {
      const inventory = node('details');
      inventory.append(node('summary', 'Product IDs for registry imports'));
      for (const product of data.products) inventory.append(node('p', product.id + ' · ' + product.name));
      workspace.append(inventory);
      workspaceForm('Import registry records', '<label>JSON records<textarea name="records" required placeholder=\'[{ "agency": "NAFDAC", "number": "…", "product": 1, "status": "Listed", "source": "…", "checked": "2026-10-01" }]\'></textarea></label><button>Import records</button>', async input => {
        const result = await api('registry', { records: JSON.parse(input.records) });
        return result.imported + ' records imported.';
      });
      workspace.append(node('h3', 'Counterfeit reports'));
      if (!data.reports.length) workspace.append(node('p', 'No reports received.'));
      for (const report of data.reports) {
        const caseFile = node('article', undefined, 'record');
        caseFile.append(node('h3', 'VF-' + report.id + ' · ' + report.product), node('p', report.detail), node('small', report.location ?? 'Location not provided'));
        const exportLink = node('a', 'Download report record');
        exportLink.href = '/api/report-export?id=' + report.id;
        caseFile.append(exportLink);
        const form = workspaceForm('Review status', '<label>Status<select name="state"><option>Received</option><option>Under review</option><option>Ready for referral</option><option>Closed</option></select></label><button>Save status</button>', async input => {
          await api('report-state', { id: report.id, state: input.state });
          return 'Status saved.';
        }, caseFile);
        form.elements.state.value = report.state;
        workspace.append(caseFile);
      }
    }
  } catch (error) {
    workspaceStatus.textContent = error.message;
  }
}

await Promise.all([showCatalogue(), showWorkspace()]);
